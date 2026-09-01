/**
 * Yudzxml@Changes 02-09-26
 * AI Rich Response / Unified Response native support.
 *
 * Provides:
 *  - RichBuilder            -> ergonomic builders for rich response sections
 *  - prepareUnifiedResponseMessage() -> builds the final content object
 *      { messageContextInfo, botForwardedMessage: { message: { richResponseMessage } } }
 *    with unifiedResponse.data serialized as bytes (per WAProto)
 *  - decodeUnifiedResponse() / captureUnifiedResponse() -> decode real incoming
 *    AI rich responses from WhatsApp (never throws on malformed data)
 *
 * Evidence for the wire format:
 *  - WAProto: Message.richResponseMessage(97), Message.botForwardedMessage(104),
 *    AIRichResponseMessage { messageType=1, submessages=2, unifiedResponse=3, contextInfo=4 },
 *    AIRichResponseUnifiedResponse { data: bytes = 1 },
 *    ContextInfo.forwardedAiBotMessageInfo(56) { botName, botJid, creatorName },
 *    BotMetadata.botResponseId(26)
 *  - whatsmeow WAWebProtobufsE2E.proto / WAWebProtobufsAICommon.proto (same structure)
 *  - Decompiled WhatsApp Web modules (getPlainTextFromUnifiedResponse,
 *    cometComposedTextV2GenAiUxPrimitiveParser): unifiedResponse.data is a JSON payload
 *    { response_id, sections: [ { view_model: { primitive | primitives } } ] }
 *
 * VERIFIED primitives (safe to use):
 *  - GenAIMarkdownTextUXPrimitive, GenAICodeUXPrimitive, GenATableUXPrimitive,
 *    GenAILatexUXPrimitive, GenAIInlineImageUXPrimitive, GenAIContentItemsUXPrimitive
 *    (proto submessages + unified JSON)
 *  - GenAIImagePrimitive, GenAIDividerPrimitive, GenAISpacerPrimitive,
 *    GenAIFooterActionPrimitive (unified JSON only)
 *  - Layouts: GenAISingleLayoutViewModel, GenAIGridLayoutViewModel, GenAIHScrollLayoutViewModel
 *
 * NOT VERIFIED (do not fabricate):
 *  - GenAIGameUXPrimitive, GenAIInteractiveGamePrimitive, or any game/board schema.
 *    UNIFIED_RESPONSE_EMBEDDED_SCREENS is only a capability enum value (BotCapabilityType = 60)
 *    with no known message schema. To build a real game card, capture a real payload first
 *    (see decodeUnifiedResponse) and feed it via RichBuilder.raw().
 */
import { randomUUID } from 'crypto';
import { proto } from '../../WAProto/index.js';
import { CodeHighlightType, RichSubMessageType } from '../Types/RichType.js';
import { submessageToSection, tokenizeCode, wrapToBotForwardedMessage } from './rich-message-utils.js';
// Lia@Note 09-04-26 --- same bot JID used by rich-message-utils.js prepareRichResponseMessage
const DEFAULT_BOT_JID = '867051314767696@bot';
const DEFAULT_FOOTER_CTA_TYPE = 'OPEN_URL';
// ------------------------------------------------------------------
// RichBuilder
// ------------------------------------------------------------------
/**
 * Builders that produce proto-backed submessages (mirrored into unified JSON):
 *  - markdown / code / table / inlineImage / latex / items
 * Builders that produce JSON-only unified sections (no proto submessage):
 *  - image / divider / spacer / footerAction / raw
 */
export const RichBuilder = {
    /** GenAIMarkdownTextUXPrimitive — markdown text, supports inline entities */
    markdown: (text, inlineEntities) => ({ kind: 'text', text, inlineEntities }),
    /** GenAICodeUXPrimitive — highlighted code block */
    code: (code, language = 'javascript') => ({ kind: 'code', code, language }),
    /** GenATableUXPrimitive — rows: string[][], first row is header unless noHeading */
    table: (rows, title, noHeading = false) => ({ kind: 'table', rows, title, noHeading }),
    /** GenAIInlineImageUXPrimitive — inline image with optional caption/link */
    inlineImage: (options = {}) => ({ kind: 'inlineImage', ...options }),
    /** GenAILatexUXPrimitive — LaTeX expressions */
    latex: (text, expressions) => ({ kind: 'latex', text, expressions }),
    /** GenAIContentItemsUXPrimitive — carousel of items */
    items: (items) => ({ kind: 'items', items }),
    /** GenAIImagePrimitive — image section (unified JSON only) */
    image: (url, mimeType = 'image/jpeg') => ({ kind: 'image', url, mimeType }),
    /** GenAIDividerPrimitive — horizontal divider (unified JSON only) */
    divider: () => ({ kind: 'divider' }),
    /** GenAISpacerPrimitive — vertical spacer (unified JSON only) */
    spacer: () => ({ kind: 'spacer' }),
    /** GenAIFooterActionPrimitive — footer CTA button (unified JSON only) */
    footerAction: (ctaText, ctaUrl, ctaType = DEFAULT_FOOTER_CTA_TYPE) => ({ kind: 'footerAction', ctaText, ctaUrl, ctaType }),
    /** Pass-through for a real captured unified section (e.g. from decodeUnifiedResponse) */
    raw: (section) => ({ kind: 'raw', section }),
};
// ------------------------------------------------------------------
// Unified response content
// ------------------------------------------------------------------
const isRawUnifiedSection = (value) => {
    return value != null &&
        typeof value === 'object' &&
        !('kind' in value) &&
        'view_model' in value;
};
// Yudzxml@Changes --- Proto submessage builders (mirror prepareRichResponseMessage mapping)
const buildProtoSubmessage = (block) => {
    switch (block.kind) {
        case 'text':
            return {
                messageType: RichSubMessageType.TEXT,
                messageText: block.text,
                inlineEntities: block.inlineEntities || []
            };
        case 'code': {
            const language = block.language || 'javascript';
            return {
                messageType: RichSubMessageType.CODE,
                codeMetadata: {
                    codeLanguage: language,
                    codeBlocks: tokenizeCode(block.code, language)
                }
            };
        }
        case 'table':
            return {
                messageType: RichSubMessageType.TABLE,
                tableMetadata: {
                    title: block.title,
                    rows: (block.rows || []).map((items, index) => ({
                        isHeading: !block.noHeading && index === 0,
                        items
                    }))
                }
            };
        case 'inlineImage':
            return {
                messageType: RichSubMessageType.INLINE_IMAGE,
                imageMetadata: {
                    imageUrl: block.imageUrl,
                    imageText: block.imageText,
                    alignment: block.alignment,
                    tapLinkUrl: block.tapLinkUrl
                }
            };
        case 'latex':
            return {
                messageType: RichSubMessageType.LATEX,
                latexMetadata: {
                    text: block.text,
                    expressions: block.expressions || []
                }
            };
        case 'items':
            return {
                messageType: RichSubMessageType.CONTENT_ITEMS,
                contentItemsMetadata: {
                    itemsMetadata: block.items || [],
                    contentType: proto.AIRichResponseContentItemsMetadata.ContentType.CAROUSEL
                }
            };
    }
    return null;
};
// Yudzxml@Changes --- JSON-only unified sections (evidence: decompiled WhatsApp Web + community captures)
const buildJsonOnlySection = (block) => {
    switch (block.kind) {
        case 'image': {
            const mediaItem = {
                __typename: 'GenAIMediaItem',
                mime_type: block.mimeType || 'image/jpeg',
                url: block.url
            };
            return {
                view_model: {
                    primitive: {
                        preview_image: mediaItem,
                        full_image: mediaItem,
                        __typename: 'GenAIImagePrimitive'
                    },
                    __typename: 'GenAISingleLayoutViewModel'
                }
            };
        }
        case 'divider':
            return {
                view_model: {
                    primitive: { __typename: 'GenAIDividerPrimitive' },
                    __typename: 'GenAISingleLayoutViewModel'
                }
            };
        case 'spacer':
            return {
                view_model: {
                    primitive: { __typename: 'GenAISpacerPrimitive' },
                    __typename: 'GenAISingleLayoutViewModel'
                }
            };
        case 'footerAction':
            return {
                view_model: {
                    primitive: {
                        cta_text: block.ctaText,
                        cta_type: block.ctaType || DEFAULT_FOOTER_CTA_TYPE,
                        cta_url: block.ctaUrl,
                        __typename: 'GenAIFooterActionPrimitive'
                    },
                    __typename: 'GenAISingleLayoutViewModel'
                }
            };
    }
    return null;
};
/**
 * Build the rich response content object for a Unified Response.
 *
 * Accepted content:
 *  - text?: string                    -> markdown text section
 *  - sections?: RichPrimitive[]       -> RichBuilder outputs or raw unified sections
 *  - responseId?: string              -> default randomUUID()
 *  - disclaimerText?: string          -> botMetadata.messageDisclaimerText
 *  - botJid?: string                  -> contextInfo.forwardedAiBotMessageInfo.botJid
 *  - botName?: string                 -> contextInfo.forwardedAiBotMessageInfo.botName
 *
 * Returns a content object usable with generateWAMessageFromContent() /
 * relayMessage() / sock.sendMessage(jid, { unifiedResponse: content }).
 */
export const prepareUnifiedResponseMessage = (content) => {
    const { text, sections, responseId, disclaimerText, botJid, botName } = content || {};
    const blocks = [];
    if (text != null && text !== '') {
        blocks.push(RichBuilder.markdown(text));
    }
    if (Array.isArray(sections)) {
        blocks.push(...sections);
    }
    const submessages = [];
    const unifiedSections = [];
    for (const block of blocks) {
        // Real captured section or hand-built unified section -> pass through untouched
        if (isRawUnifiedSection(block)) {
            unifiedSections.push(block);
            continue;
        }
        if (block.kind === 'raw') {
            if (!block.section || typeof block.section !== 'object') {
                throw new TypeError('RichBuilder.raw() requires a unified response section object');
            }
            unifiedSections.push(block.section);
            continue;
        }
        const submessage = buildProtoSubmessage(block);
        if (submessage) {
            submessages.push(submessage);
            // Yudzxml@Note --- keep the unified JSON in sync with the proto submessages (1:1 mapping, same order)
            unifiedSections.push(submessageToSection(submessage));
            continue;
        }
        const jsonOnlySection = buildJsonOnlySection(block);
        if (jsonOnlySection) {
            unifiedSections.push(jsonOnlySection);
            continue;
        }
        throw new TypeError(`Unknown rich response block: ${JSON.stringify(block)}`);
    }
    const response_id = responseId || randomUUID();
    const unified = { response_id, sections: unifiedSections };
    const richResponseMessage = proto.AIRichResponseMessage.create({
        messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
        submessages,
        unifiedResponse: {
            // Lia@Note 25-04-26 --- Expects "ArrayBufferLike"; serialize the unified JSON to bytes (not a JSON string field)
            data: Buffer.from(JSON.stringify(unified))
        },
        contextInfo: {
            isForwarded: true,
            forwardingScore: 1,
            forwardedAiBotMessageInfo: {
                botJid: botJid || DEFAULT_BOT_JID,
                botName: botName || undefined
            },
            forwardOrigin: 4
        }
    });
    const message = wrapToBotForwardedMessage(richResponseMessage);
    const botMetadata = message.messageContextInfo.botMetadata;
    // Lia@Note 13-05-26 --- Add disclaimer text on richResponseMessage
    if (disclaimerText) {
        botMetadata.messageDisclaimerText = disclaimerText;
    }
    // Lia@Note 15-05-26 --- Add responseId from unified directly to botMetadata
    botMetadata.botResponseId = response_id;
    return message;
};
// ------------------------------------------------------------------
// Capture / decode tool
// ------------------------------------------------------------------
const extractUnifiedPrimitives = (unified) => {
    const primitives = [];
    const sections = Array.isArray(unified?.sections) ? unified.sections : [];
    for (const section of sections) {
        const viewModel = section?.view_model;
        if (!viewModel || typeof viewModel !== 'object') {
            continue;
        }
        const layout = viewModel.__typename || null;
        if (viewModel.primitive) {
            primitives.push({ layout, ...viewModel.primitive });
        }
        if (Array.isArray(viewModel.primitives)) {
            for (const primitive of viewModel.primitives) {
                primitives.push({ layout, ...primitive });
            }
        }
    }
    return primitives;
};
const extractRichResponseMessage = (message) => {
    let content = message;
    // WebMessageInfo -> message content
    if (content && typeof content === 'object' && content.message && typeof content.message === 'object') {
        content = content.message;
    }
    let outerBotMetadata = content?.messageContextInfo?.botMetadata || null;
    // Unwrap botForwardedMessage (and similar future-proof wrappers) looking for richResponseMessage
    let source = null;
    for (let i = 0; i < 5 && content && typeof content === 'object'; i++) {
        if (content.richResponseMessage) {
            source = i === 0 ? 'richResponseMessage' : 'botForwardedMessage';
            return { richResponseMessage: content.richResponseMessage, outerBotMetadata, source };
        }
        // A bare richResponseMessage was passed directly (has unifiedResponse/submessages fields)
        if ('unifiedResponse' in content || 'submessages' in content) {
            source = 'richResponseMessage';
            return { richResponseMessage: content, outerBotMetadata, source };
        }
        const next = content.botForwardedMessage?.message;
        if (next) {
            content = next;
            continue;
        }
        break;
    }
    return { richResponseMessage: null, outerBotMetadata, source: null };
};
/**
 * Decode the AI Rich Response / Unified Response from an incoming WAMessage.
 *
 * Accepts:
 *  - a WebMessageInfo (from `messages.upsert` event)
 *  - a message content object ({ botForwardedMessage, ... })
 *  - a richResponseMessage object directly
 *
 * Returns a structured result and NEVER throws — malformed data is reported
 * in `error` / `raw.jsonError`, with hex/base64/utf8 fallbacks always available.
 */
export const decodeUnifiedResponse = (message) => {
    const result = {
        found: false,
        source: null,
        responseId: null,
        botResponseIdFromMetadata: null,
        messageType: null,
        submessageTypes: [],
        forwardedAiBotMessageInfo: null,
        unified: null,
        primitives: [],
        raw: {
            present: false,
            length: 0,
            utf8: null,
            base64: null,
            hex: null,
            json: false,
            jsonError: null
        },
        error: null
    };
    try {
        const { richResponseMessage, outerBotMetadata, source } = extractRichResponseMessage(message);
        if (!richResponseMessage) {
            return result;
        }
        result.found = true;
        result.source = source;
        const messageType = richResponseMessage.messageType;
        result.messageType = messageType != null
            ? `${proto.AIRichResponseMessageType[messageType] || 'UNKNOWN'} (${messageType})`
            : null;
        result.submessageTypes = (richResponseMessage.submessages || []).map((submessage) => proto.AIRichResponseSubMessageType[submessage.messageType] || `UNKNOWN (${submessage.messageType})`);
        result.forwardedAiBotMessageInfo = richResponseMessage.contextInfo?.forwardedAiBotMessageInfo || null;
        const botMetadata = outerBotMetadata || richResponseMessage.messageContextInfo?.botMetadata;
        result.botResponseIdFromMetadata = botMetadata?.botResponseId || null;
        result.responseId = result.botResponseIdFromMetadata;
        const data = richResponseMessage.unifiedResponse?.data;
        if (data != null) {
            result.raw.present = true;
            // data can be bytes (decoded proto) or a base64 string (fromObject path)
            const bytes = typeof data === 'string' ? Buffer.from(data, 'base64') : Buffer.from(data);
            result.raw.length = bytes.length;
            result.raw.base64 = bytes.toString('base64');
            result.raw.hex = bytes.toString('hex');
            const utf8 = bytes.toString('utf8');
            result.raw.utf8 = utf8;
            try {
                const json = JSON.parse(utf8);
                result.raw.json = true;
                result.unified = json;
                if (!result.responseId && typeof json?.response_id === 'string') {
                    result.responseId = json.response_id;
                }
                result.primitives = extractUnifiedPrimitives(json);
            }
            catch (error) {
                // Not valid JSON — keep the raw fallbacks (hex/base64/utf8) so the payload can still be analyzed
                result.raw.jsonError = `${error?.name || 'Error'}: ${error?.message || String(error)}`;
            }
        }
    }
    catch (error) {
        result.error = `${error?.name || 'Error'}: ${error?.message || String(error)}`;
    }
    return result;
};
// Alias requested for capture workflows — identical behavior, never throws
export const captureUnifiedResponse = decodeUnifiedResponse;
//# sourceMappingURL=rich-response-builder.js.map
