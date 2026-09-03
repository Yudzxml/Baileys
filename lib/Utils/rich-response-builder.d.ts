/**
 * Yudzxml@Changes 02-09-26
 * Type definitions for AI Rich Response / Unified Response native support.
 * All wire-level types intentionally build on top of the generated WAProto
 * (proto.IAIRichResponseSubMessage / proto.IAIRichResponseUnifiedResponse) and
 * never conflict with them.
 */
import { proto } from '../../WAProto/index.js';
/** GenAIMarkdownTextUXPrimitive (proto submessage: AI_RICH_RESPONSE_TEXT) */
export interface RichMarkdownPrimitive {
    kind: 'text';
    text: string;
    inlineEntities?: proto.IAIRichResponseSubMessage['inlineEntities'];
}
/** GenAICodeUXPrimitive (proto submessage: AI_RICH_RESPONSE_CODE) */
export interface RichCodePrimitive {
    kind: 'code';
    code: string;
    language?: string;
}
/** GenATableUXPrimitive (proto submessage: AI_RICH_RESPONSE_TABLE) */
export interface RichTablePrimitive {
    kind: 'table';
    rows: string[][];
    title?: string;
    noHeading?: boolean;
}
/** GenAIInlineImageUXPrimitive (proto submessage: AI_RICH_RESPONSE_INLINE_IMAGE) */
export interface RichInlineImagePrimitive {
    kind: 'inlineImage';
    imageUrl?: string;
    imageText?: string;
    alignment?: string;
    tapLinkUrl?: string;
}
/** GenAILatexUXPrimitive (proto submessage: AI_RICH_RESPONSE_LATEX) */
export interface RichLatexPrimitive {
    kind: 'latex';
    text?: string;
    expressions?: string[];
}
/** GenAIContentItemsUXPrimitive (proto submessage: AI_RICH_RESPONSE_CONTENT_ITEMS) */
export interface RichItemsPrimitive {
    kind: 'items';
    items: Record<string, any>[];
}
/** GenAIImagePrimitive (unified JSON only, no proto submessage) */
export interface RichImageSection {
    kind: 'image';
    url: string;
    mimeType?: string;
}
/** GenAIDividerPrimitive (unified JSON only) */
export interface RichDividerSection {
    kind: 'divider';
}
/** GenAISpacerPrimitive (unified JSON only) */
export interface RichSpacerSection {
    kind: 'spacer';
}
/** GenAIFooterActionPrimitive (unified JSON only) */
export interface RichFooterActionSection {
    kind: 'footerAction';
    ctaText: string;
    ctaUrl: string;
    ctaType?: string;
}
/** GenAIaeacdsnwHtmlPrimitive — HTML Mini App (unified JSON only, android-only primitive) */
export interface RichHtmlPrimitive {
    kind: 'html';
    /** Full HTML document (doctype + <style> + <script>) sent verbatim inside primitive.payload */
    html: string;
    /** primitive.trusted_sources — default [] */
    trustedSources?: string[];
    /** Lock the mini app to a fixed pixel height with a scrollable shim */
    height?: number;
}
/** Pass-through for a real captured unified response section */
export interface RichRawSection {
    kind: 'raw';
    section: UnifiedResponseSection;
}
/** Union of all builder primitives */
export type RichPrimitive = RichMarkdownPrimitive | RichCodePrimitive | RichTablePrimitive | RichInlineImagePrimitive | RichLatexPrimitive | RichItemsPrimitive | RichImageSection | RichDividerSection | RichSpacerSection | RichFooterActionSection | RichHtmlPrimitive | RichRawSection;
/** A single section of the unified response JSON payload */
export interface UnifiedResponseSection {
    view_model?: {
        __typename?: string;
        primitive?: Record<string, any>;
        primitives?: Record<string, any>[];
    };
    [key: string]: any;
}
/** Options accepted by sock.sendUnifiedResponse() / prepareUnifiedResponseMessage() */
export interface UnifiedResponseOptions {
    /** Markdown text used as the first (main) section */
    text?: string;
    /** Sections built with RichBuilder (or raw captured unified sections) */
    sections?: (RichPrimitive | UnifiedResponseSection)[];
    /** Custom response id — default: randomUUID() */
    responseId?: string;
    /** Disclaimer text rendered under the message (botMetadata.messageDisclaimerText) */
    disclaimerText?: string;
    /** Bot JID for contextInfo.forwardedAiBotMessageInfo — default: '867051314767696@bot' */
    botJid?: string;
    /** Bot display name for contextInfo.forwardedAiBotMessageInfo */
    botName?: string;
}
/** Alias of UnifiedResponseOptions */
export type RichResponseOptions = UnifiedResponseOptions;
/** Content object produced by prepareUnifiedResponseMessage() */
export interface RichResponseContent {
    messageContextInfo: {
        botMetadata: proto.IBotMetadata;
    };
    botForwardedMessage: {
        message: {
            richResponseMessage: proto.IAIRichResponseMessage;
        };
    };
}
/** Decoded unified response payload */
export interface DecodedUnifiedPayload {
    response_id?: string;
    sections?: UnifiedResponseSection[];
    [key: string]: any;
}
/** Raw byte-level fallbacks, always populated when unifiedResponse.data exists */
export interface DecodedUnifiedRaw {
    present: boolean;
    length: number;
    utf8: string | null;
    base64: string | null;
    hex: string | null;
    json: boolean;
    jsonError: string | null;
}
/** Result of decodeUnifiedResponse() / captureUnifiedResponse() — never throws */
export interface DecodedUnifiedResponse {
    found: boolean;
    source: 'richResponseMessage' | 'botForwardedMessage' | null;
    responseId: string | null;
    botResponseIdFromMetadata: string | null;
    messageType: string | null;
    submessageTypes: string[];
    forwardedAiBotMessageInfo: proto.IForwardedAIBotMessageInfo | null;
    unified: DecodedUnifiedPayload | null;
    primitives: Record<string, any>[];
    raw: DecodedUnifiedRaw;
    error: string | null;
}
export declare const RichBuilder: {
    markdown: (text: string, inlineEntities?: Record<string, any>[]) => RichMarkdownPrimitive;
    code: (code: string, language?: string) => RichCodePrimitive;
    table: (rows: string[][], title?: string, noHeading?: boolean) => RichTablePrimitive;
    inlineImage: (options?: Omit<RichInlineImagePrimitive, 'kind'>) => RichInlineImagePrimitive;
    latex: (text?: string, expressions?: string[]) => RichLatexPrimitive;
    items: (items: Record<string, any>[]) => RichItemsPrimitive;
    image: (url: string, mimeType?: string) => RichImageSection;
    divider: () => RichDividerSection;
    spacer: () => RichSpacerSection;
    footerAction: (ctaText: string, ctaUrl: string, ctaType?: string) => RichFooterActionSection;
    html: (html: string, options?: Omit<RichHtmlPrimitive, 'kind' | 'html'>) => RichHtmlPrimitive;
    raw: (section: UnifiedResponseSection) => RichRawSection;
};
/** Exact primitive typename used on the wire for HTML Mini Apps — do not rename */
export declare const AI_RICH_HTML_PRIMITIVE: 'GenAIaeacdsnwHtmlPrimitive';
/** Height-lock shim prepended to the HTML payload when `height` is given */
export declare function lockHeight(height: number): string;
/** Options for htmlSection() / RichBuilder.html() */
export interface HtmlRichSectionOptions {
    trustedSources?: string[];
    height?: number;
}
/**
 * Build a raw GenAIaeacdsnwHtmlPrimitive unified section
 * ({ view_model: { primitive: { payload, trusted_sources, __typename }, __typename } }).
 * Pass-through compatible with sendUnifiedResponse sections and RichBuilder.raw().
 */
export declare function htmlSection(html: string, options?: HtmlRichSectionOptions): UnifiedResponseSection;
/** One GenAIaeacdsnwHtmlPrimitive found by decodeHtmlRich() */
export interface DecodedHtmlRichSection {
    html: string | null;
    trustedSources: string[];
    section: UnifiedResponseSection;
    primitive: Record<string, any>;
}
/** Result of decodeHtmlRich() — never throws */
export interface DecodedHtmlRich {
    found: boolean;
    responseId: string | null;
    html: string | null;
    trustedSources: string[];
    section: UnifiedResponseSection | null;
    htmlSections: DecodedHtmlRichSection[];
    sections: UnifiedResponseSection[];
    /** raw wire-level payload info (utf8/base64/hex/json fallbacks) from decodeUnifiedResponse */
    raw: DecodedUnifiedRaw;
    /** full decodeUnifiedResponse() result */
    decoded: DecodedUnifiedResponse;
}
/** Find + extract GenAIaeacdsnwHtmlPrimitive payloads from any message shape */
export declare function decodeHtmlRich(message: any): DecodedHtmlRich;
/** Options for sendHtmlApp() */
export interface SendHtmlAppOptions extends HtmlRichSectionOptions {
    /** botMetadata.messageDisclaimerText */
    title?: string;
    /** markdown text shown above the app (alias of text) */
    label?: string;
    /** markdown text shown above the app */
    text?: string;
    responseId?: string;
    botJid?: string;
    botName?: string;
    /** send the protocolMessage(type 14) MESSAGE_EDIT follow-up — default true */
    bypassDownload?: boolean;
    additionalNodes?: any[];
    [key: string]: any;
}
/** Send a standalone HTML Mini App in one call (sock-first signature, reference-compatible) */
export declare function sendHtmlApp(sock: any, jid: string, html: string, options?: SendHtmlAppOptions): Promise<any>;
export declare function prepareUnifiedResponseMessage(content: UnifiedResponseOptions): RichResponseContent;
export declare function decodeUnifiedResponse(message: any): DecodedUnifiedResponse;
export declare const captureUnifiedResponse: typeof decodeUnifiedResponse;
//# sourceMappingURL=rich-response-builder.d.ts.map
