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
 *  - GenAIaeacdsnwHtmlPrimitive (unified JSON only) -> HTML Mini App / HTML Rich Message.
 *    Wire format reverse-engineered from @rexxhayanasi/elaina-baileys 1.3.8
 *    (lib/MessageBuilder/extras.js htmlSection + AIRich.build/send/decodeAIRich):
 *      HTML -> section { view_model: { primitive: { payload, trusted_sources,
 *              __typename: 'GenAIaeacdsnwHtmlPrimitive' },
 *              __typename: 'GenAISingleLayoutViewModel' } }
 *      -> unified JSON { response_id, sections }
 *      -> stringifyEscaped (ASCII-safe JSON) -> Buffer -> unifiedResponse.data
 *      -> AIRichResponseMessage (messageType=1, submessages=2, unifiedResponse=3,
 *         contextInfo=4) -> Message.botForwardedMessage(834).message.richResponseMessage
 *      -> relayMessage + protocolMessage(type 14 MESSAGE_EDIT) carrying editedMessage
 *         (bypassDownload flow, default ON).
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
// Yudzxml@Changes 03-09-26 --- used by sendHtmlApp() for the MESSAGE_EDIT stanza id (no import cycle: generics is a leaf util)
import { generateMessageIDV2 } from './generics.js';
// Lia@Note 09-04-26 --- same bot JID used by rich-message-utils.js prepareRichResponseMessage
const DEFAULT_BOT_JID = '867051314767696@bot';
const DEFAULT_FOOTER_CTA_TYPE = 'OPEN_URL';
// Yudzxml@Changes 03-09-26 --- HTML Mini App primitive name. EXACT name as shipped by
// WhatsApp Android for GenAI rich HTML sections (android-only primitive). Do NOT rename.
const AI_RICH_HTML_PRIMITIVE = 'GenAIaeacdsnwHtmlPrimitive';
export { AI_RICH_HTML_PRIMITIVE };
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
    /**
     * GenAIaeacdsnwHtmlPrimitive — HTML Mini App / HTML Rich Message (unified JSON only).
     * Full HTML (doctype + <style> + <script>) travels verbatim inside primitive.payload.
     * Rendered as an interactive WebView by WhatsApp Android.
     */
    html: (html, options = {}) => {
        if (typeof html !== 'string' || html.trim() === '') {
            throw new TypeError('RichBuilder.html() requires a non-empty HTML string');
        }
        if (options.trustedSources !== undefined && !Array.isArray(options.trustedSources)) {
            throw new TypeError('RichBuilder.html() trustedSources must be an array of strings');
        }
        return { kind: 'html', html, trustedSources: options.trustedSources, height: options.height };
    },
    /** Pass-through for a real captured unified section (e.g. from decodeUnifiedResponse) */
    raw: (section) => ({ kind: 'raw', section }),
};
// ------------------------------------------------------------------
// HTML Mini App (GenAIaeacdsnwHtmlPrimitive)
// ------------------------------------------------------------------
/**
 * Height-lock helper ported from the reference implementation.
 * Prepends a <style>/<script> shim that constrains the mini app to a fixed pixel
 * height with a touch-scrollable inner wrapper (#__wrap).
 */
export const lockHeight = (height) => {
    const px = Number(height);
    if (!Number.isFinite(px) || px <= 0) {
        throw new TypeError('height must be a positive number of pixels');
    }
    return '<style>html,body{margin:0;padding:0;height:' + px + 'px;max-height:' + px + 'px;overflow:hidden}'
        + '#__wrap{height:' + px + 'px;overflow-y:auto;-webkit-overflow-scrolling:touch;touch-action:pan-y}</style>'
        + '<script>document.addEventListener("DOMContentLoaded",function(){'
        + 'var w=document.createElement("div");w.id="__wrap";'
        + 'while(document.body.firstChild)w.appendChild(document.body.firstChild);'
        + 'document.body.appendChild(w)});<' + '/script>';
};
/**
 * Build a GenAIaeacdsnwHtmlPrimitive unified section.
 *
 * Returns the RAW unified section shape ({ view_model: ... }), so it can be used:
 *  - inside sock.sendUnifiedResponse(jid, { sections: [htmlSection(html)] })
 *  - as a pass-through raw section (isRawUnifiedSection accepts it)
 *  - fed back through RichBuilder.raw(htmlSection(html))
 */
export const htmlSection = (html, { trustedSources = [], height } = {}) => {
    if (typeof html !== 'string' || html.trim() === '') {
        throw new TypeError('htmlSection requires a non-empty HTML string');
    }
    if (!Array.isArray(trustedSources)) {
        throw new TypeError('htmlSection trustedSources must be an array of strings');
    }
    return {
        view_model: {
            primitive: {
                payload: height === undefined || height === null ? html : lockHeight(height) + html,
                trusted_sources: trustedSources.map(String),
                __typename: AI_RICH_HTML_PRIMITIVE
            },
            __typename: 'GenAISingleLayoutViewModel'
        }
    };
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
        case 'html': {
            // Yudzxml@Changes 03-09-26 --- GenAIaeacdsnwHtmlPrimitive (HTML Mini App).
            // JSON-only section — the full HTML travels verbatim inside primitive.payload
            // (never markdown, never a code block, never the plain text field).
            return htmlSection(block.html, { trustedSources: block.trustedSources, height: block.height });
        }
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
// ------------------------------------------------------------------
// HTML Mini App decode (GenAIaeacdsnwHtmlPrimitive)
// ------------------------------------------------------------------
/**
 * Find every GenAIaeacdsnwHtmlPrimitive inside a WAMessage / richResponseMessage /
 * unified response and extract the original HTML payload without corruption.
 *
 * Accepts the same inputs as decodeUnifiedResponse() (never throws):
 *  - a WebMessageInfo (from `messages.upsert`)
 *  - a message content object ({ botForwardedMessage, ... })
 *  - a richResponseMessage object directly
 *
 * Returns:
 *  {
 *    found,                         // true when at least one HTML primitive was found
 *    responseId,                    // unified response id
 *    html,                          // first HTML payload (string | null)
 *    trustedSources,                // first primitive trusted_sources
 *    section,                       // first raw unified section containing the primitive
 *    htmlSections,                  // every HTML primitive found [{ html, trustedSources, section, primitive }]
 *    sections,                      // all unified sections
 *    raw                            // full decodeUnifiedResponse() result (hex/base64/utf8 fallbacks)
 *  }
 */
export const decodeHtmlRich = (message) => {
    const decoded = decodeUnifiedResponse(message);
    const sections = Array.isArray(decoded?.unified?.sections) ? decoded.unified.sections : [];
    const htmlSections = [];
    for (const section of sections) {
        const viewModel = section?.view_model;
        if (!viewModel || typeof viewModel !== 'object') {
            continue;
        }
        const primitives = Array.isArray(viewModel.primitives)
            ? viewModel.primitives
            : (viewModel.primitive ? [viewModel.primitive] : []);
        for (const primitive of primitives) {
            if (primitive?.__typename !== AI_RICH_HTML_PRIMITIVE) {
                continue;
            }
            htmlSections.push({
                html: typeof primitive.payload === 'string' ? primitive.payload : null,
                trustedSources: Array.isArray(primitive.trusted_sources) ? primitive.trusted_sources : [],
                section,
                primitive
            });
        }
    }
    const first = htmlSections[0] || null;
    return {
        found: htmlSections.length > 0,
        responseId: decoded.responseId,
        html: first?.html ?? null,
        trustedSources: first?.trustedSources ?? [],
        section: first?.section ?? null,
        htmlSections,
        sections,
        // raw wire-level payload info (utf8/base64/hex/json fallbacks) from decodeUnifiedResponse
        raw: decoded.raw,
        // full decodeUnifiedResponse() result (primitives, submessageTypes, forwardedAiBotMessageInfo, ...)
        decoded
    };
};
// ------------------------------------------------------------------
// HTML Mini App sender (reference-compatible one-shot helper)
// ------------------------------------------------------------------
/**
 * Send a standalone HTML Mini App (GenAIaeacdsnwHtmlPrimitive) in one call.
 *
 * Mirrors the reference implementation flow (elaina-baileys sendHtmlApp + AIRich.send):
 *  1. build + relay the rich response through the existing sendUnifiedResponse()
 *     pipeline (generateWAMessage -> relayMessage),
 *  2. when bypassDownload is true (default) follow up with the proven
 *     protocolMessage(type 14 MESSAGE_EDIT) edit carrying editedMessage, which is
 *     what makes WhatsApp Android actually render the HTML Mini App.
 *
 * Options:
 *  - html               (2nd arg) full HTML document string
 *  - title              botMetadata.messageDisclaimerText
 *  - label / text       markdown text section shown above the app
 *  - trustedSources     primitive.trusted_sources (string[])
 *  - height             lock the app to a fixed pixel height (scrollable shim)
 *  - responseId         custom unified response id (default randomUUID())
 *  - botJid / botName   contextInfo.forwardedAiBotMessageInfo overrides
 *  - bypassDownload     send the MESSAGE_EDIT follow-up (default true)
 *  - ...rest            forwarded to generateWAMessage options
 */
export const sendHtmlApp = async (sock, jid, html, options = {}) => {
    if (!sock) {
        throw new TypeError('sendHtmlApp requires a socket as the first argument');
    }
    if (!jid) {
        throw new TypeError('sendHtmlApp requires a target jid');
    }
    if (typeof html !== 'string' || html.trim() === '') {
        throw new TypeError('sendHtmlApp requires a non-empty HTML string');
    }
    const { title, label, text, trustedSources, height, responseId, botJid, botName, disclaimerText, bypassDownload = true, additionalNodes, ...sendOptions } = options;
    const sent = await sock.sendUnifiedResponse(jid, {
        text: text ?? (label ? String(label) : undefined),
        sections: [htmlSection(html, { trustedSources, height })],
        responseId,
        disclaimerText: disclaimerText ?? title,
        botJid,
        botName
    }, sendOptions);
    if (bypassDownload && sent?.key?.id && sent?.message) {
        // Reference bypassDownload flow: re-deliver the full content as a MESSAGE_EDIT.
        const editContent = {
            botForwardedMessage: {
                message: {
                    protocolMessage: {
                        key: {
                            remoteJid: jid,
                            fromMe: true,
                            id: sent.key.id
                        },
                        type: 14,
                        editedMessage: sent.message
                    }
                }
            }
        };
        await sock.relayMessage(jid, editContent, {
            messageId: generateMessageIDV2(sock.user?.id),
            additionalNodes
        });
    }
    return sent;
};
//# sourceMappingURL=rich-response-builder.js.map
