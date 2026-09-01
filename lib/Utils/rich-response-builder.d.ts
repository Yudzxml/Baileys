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
/** Pass-through for a real captured unified response section */
export interface RichRawSection {
    kind: 'raw';
    section: UnifiedResponseSection;
}
/** Union of all builder primitives */
export type RichPrimitive = RichMarkdownPrimitive | RichCodePrimitive | RichTablePrimitive | RichInlineImagePrimitive | RichLatexPrimitive | RichItemsPrimitive | RichImageSection | RichDividerSection | RichSpacerSection | RichFooterActionSection | RichRawSection;
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
    raw: (section: UnifiedResponseSection) => RichRawSection;
};
export declare function prepareUnifiedResponseMessage(content: UnifiedResponseOptions): RichResponseContent;
export declare function decodeUnifiedResponse(message: any): DecodedUnifiedResponse;
export declare const captureUnifiedResponse: typeof decodeUnifiedResponse;
//# sourceMappingURL=rich-response-builder.d.ts.map
