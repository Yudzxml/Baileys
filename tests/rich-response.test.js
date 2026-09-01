/**
 * Yudzxml@Changes 02-09-26
 * Tests for the AI Rich Response / Unified Response native support.
 *
 * Run with: npm test
 *
 * Covers:
 *  1. Building a Unified Response (RichBuilder + prepareUnifiedResponseMessage)
 *  2. Serialization to bytes (WAProto encode)
 *  3. Deserialization back (WAProto decode)
 *  4. response_id verification
 *  5. sections verification
 *  6. primitive verification
 *  7. malformed data must not crash the decoder
 *  8. backward compatibility of existing content paths
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    proto,
    RichBuilder,
    prepareUnifiedResponseMessage,
    prepareRichResponseMessage,
    decodeUnifiedResponse,
    captureUnifiedResponse,
    generateWAMessage,
    generateWAMessageContent
} from '../lib/index.js';

const JID = '1234567890@s.whatsapp.net';
const USER_JID = '9876543210@s.whatsapp.net';

const typenameOf = (decoded, index = 0) => decoded.primitives[index]?.__typename;

// ------------------------------------------------------------------
// 1. Builder
// ------------------------------------------------------------------
test('RichBuilder produces predictable descriptors', () => {
    assert.deepEqual(RichBuilder.markdown('hello'), { kind: 'text', text: 'hello', inlineEntities: undefined });
    assert.equal(RichBuilder.code('const x = 1', 'typescript').language, 'typescript');
    assert.deepEqual(RichBuilder.table([['A', 'B'], ['1', '2']], 'T').rows, [['A', 'B'], ['1', '2']]);
    assert.equal(RichBuilder.divider().kind, 'divider');
    assert.equal(RichBuilder.spacer().kind, 'spacer');
    assert.deepEqual(RichBuilder.footerAction('Open', 'https://example.com'), {
        kind: 'footerAction', ctaText: 'Open', ctaUrl: 'https://example.com', ctaType: 'OPEN_URL'
    });
    assert.equal(RichBuilder.image('https://example.com/i.jpg').kind, 'image');
});

test('prepareUnifiedResponseMessage rejects unknown blocks', () => {
    assert.throws(() => prepareUnifiedResponseMessage({ sections: [{ nope: true }] }), TypeError);
    assert.throws(() => prepareUnifiedResponseMessage({ sections: [RichBuilder.raw(null)] }), TypeError);
});

// ------------------------------------------------------------------
// 2. Build + 4. response_id + 5. sections + 6. primitives
// ------------------------------------------------------------------
test('build unified response: structure, response_id and sections', async () => {
    const responseId = 'test-response-id-0001';
    const content = prepareUnifiedResponseMessage({
        text: 'MEGUMIN RICH XO',
        sections: [
            RichBuilder.markdown('JOGO DA VELHA'),
            RichBuilder.image('https://example.com/board.png', 'image/png'),
            RichBuilder.divider(),
            RichBuilder.footerAction('NOVA RODADA', 'https://example.com/new')
        ],
        responseId,
        disclaimerText: 'AI generated'
    });

    // wrapper structure: messageContextInfo + botForwardedMessage -> message -> richResponseMessage
    const rich = content.botForwardedMessage?.message?.richResponseMessage;
    assert.ok(rich, 'botForwardedMessage.message.richResponseMessage exists');
    assert.equal(rich.messageType, proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD);

    // unifiedResponse.data must be bytes (Buffer), not a plain JSON string field
    assert.ok(Buffer.isBuffer(rich.unifiedResponse.data), 'unifiedResponse.data is a Buffer');

    // unified JSON payload (text + 4 sections = 5)
    const unified = JSON.parse(rich.unifiedResponse.data.toString('utf8'));
    assert.equal(unified.response_id, responseId, 'response_id matches');
    assert.equal(unified.sections.length, 5, 'five sections (1 text + 4)');
    assert.equal(unified.sections[0].view_model.primitive.__typename, 'GenAIMarkdownTextUXPrimitive');
    assert.equal(unified.sections[0].view_model.primitive.text, 'MEGUMIN RICH XO');
    assert.equal(unified.sections[0].view_model.__typename, 'GenAISingleLayoutViewModel');
    assert.equal(unified.sections[1].view_model.primitive.__typename, 'GenAIMarkdownTextUXPrimitive');
    assert.equal(unified.sections[1].view_model.primitive.text, 'JOGO DA VELHA');
    assert.equal(unified.sections[2].view_model.primitive.__typename, 'GenAIImagePrimitive');
    assert.equal(unified.sections[2].view_model.primitive.full_image.url, 'https://example.com/board.png');
    assert.equal(unified.sections[3].view_model.primitive.__typename, 'GenAIDividerPrimitive');
    assert.equal(unified.sections[4].view_model.primitive.__typename, 'GenAIFooterActionPrimitive');
    assert.equal(unified.sections[4].view_model.primitive.cta_url, 'https://example.com/new');

    // botMetadata mirrors the response id + disclaimer
    assert.equal(content.messageContextInfo.botMetadata.botResponseId, responseId);
    assert.equal(content.messageContextInfo.botMetadata.messageDisclaimerText, 'AI generated');

    // proto contextInfo forwarding metadata
    assert.equal(rich.contextInfo.isForwarded, true);
    assert.equal(rich.contextInfo.forwardedAiBotMessageInfo.botJid, '867051314767696@bot');
});

test('build unified response: string signature (text, sections)', () => {
    const content = prepareUnifiedResponseMessage({
        text: 'hello',
        sections: [RichBuilder.markdown('world')]
    });
    const unified = JSON.parse(content.botForwardedMessage.message.richResponseMessage.unifiedResponse.data.toString('utf8'));
    assert.equal(unified.sections.length, 2);
    assert.match(unified.response_id, /^[0-9a-f-]{36}$/i, 'random UUID response_id');
});

test('build unified response: all proto-backed primitives map correctly', () => {
    const content = prepareUnifiedResponseMessage({
        sections: [
            RichBuilder.markdown('text section'),
            RichBuilder.code('const a = 1;\n// done', 'javascript'),
            RichBuilder.table([['H1', 'H2'], ['a', 'b']], 'TABLE TITLE'),
            RichBuilder.latex('E = mc^2', ['E = mc^2']),
            RichBuilder.inlineImage({ imageUrl: 'https://example.com/x.png', imageText: 'caption' }),
            RichBuilder.items([{ title: 'Item 1' }, { title: 'Item 2' }])
        ]
    });
    const rich = content.botForwardedMessage.message.richResponseMessage;
    const types = rich.submessages.map(s => s.messageType);
    assert.deepEqual(types, [
        proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_TEXT,
        proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_CODE,
        proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_TABLE,
        proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_LATEX,
        proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_INLINE_IMAGE,
        proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_CONTENT_ITEMS
    ]);

    const unified = JSON.parse(rich.unifiedResponse.data.toString('utf8'));
    const typenames = unified.sections.map(s => s.view_model.primitive.__typename);
    assert.deepEqual(typenames, [
        'GenAIMarkdownTextUXPrimitive',
        'GenAICodeUXPrimitive',
        'GenATableUXPrimitive',
        'GenAILatexUXPrimitive',
        'GenAIInlineImageUXPrimitive',
        'GenAIContentItemsUXPrimitive'
    ]);

    // spot-check mapped fields
    const code = unified.sections[1].view_model.primitive;
    assert.equal(code.language, 'javascript');
    assert.ok(Array.isArray(code.code_blocks) && code.code_blocks.length > 0);
    const table = unified.sections[2].view_model.primitive;
    assert.equal(table.title, 'TABLE TITLE');
    assert.equal(table.rows[0].is_header, true);
    assert.deepEqual(table.rows[1].cells, ['a', 'b']);
});

// ------------------------------------------------------------------
// 2/3. Serialize -> Buffer -> deserialize
// ------------------------------------------------------------------
test('serialize to Buffer and deserialize back (proto roundtrip)', async () => {
    const content = prepareUnifiedResponseMessage({
        text: 'MEGUMIN ARCADE',
        sections: [RichBuilder.code('print("hi")', 'python'), RichBuilder.table([['X', 'O'], ['O', 'X']])]
    });

    // 2. serialize: wrap into a full proto.Message and encode to bytes
    const fullMessage = proto.Message.create({ ...content });
    const bytes = proto.Message.encode(fullMessage).finish();
    assert.ok(bytes instanceof Uint8Array && bytes.length > 0, 'encoded bytes');

    // 3. deserialize
    const decodedMessage = proto.Message.decode(bytes);
    assert.ok(decodedMessage.botForwardedMessage?.message?.richResponseMessage, 'decoded wrapper');

    // verify response_id, sections and primitive survive the roundtrip
    const decoded = decodeUnifiedResponse({ message: decodedMessage });
    assert.equal(decoded.found, true);
    assert.equal(decoded.source, 'botForwardedMessage');
    assert.ok(decoded.responseId, 'response id present');
    assert.equal(decoded.unified.response_id, decoded.responseId, 'response_id matches botMetadata.botResponseId');
    assert.equal(decoded.messageType, 'AI_RICH_RESPONSE_TYPE_STANDARD (1)');
    assert.equal(decoded.unified.sections.length, 3);
    assert.equal(typenameOf(decoded, 0), 'GenAIMarkdownTextUXPrimitive');
    assert.equal(typenameOf(decoded, 1), 'GenAICodeUXPrimitive');
    assert.equal(decoded.primitives[1].language, 'python');
    assert.equal(typenameOf(decoded, 2), 'GenATableUXPrimitive');
    assert.deepEqual(decoded.submessageTypes, ['AI_RICH_RESPONSE_TEXT', 'AI_RICH_RESPONSE_CODE', 'AI_RICH_RESPONSE_TABLE']);
    assert.equal(decoded.forwardedAiBotMessageInfo.botJid, '867051314767696@bot');
});

test('decode works from a full WAMessage built by generateWAMessage (sendMessage path)', async () => {
    const fullMsg = await generateWAMessage(JID, {
        unifiedResponse: {
            text: 'MEGUMIN RICH XO',
            sections: [RichBuilder.markdown('JOGO DA VELHA')]
        }
    }, { userJid: USER_JID });

    assert.equal(fullMsg.key.remoteJid, JID);
    assert.ok(fullMsg.message.botForwardedMessage, 'content routed through generateWAMessageContent');

    const decoded = decodeUnifiedResponse(fullMsg);
    assert.equal(decoded.found, true);
    assert.equal(decoded.unified.response_id, decoded.responseId);
    assert.equal(decoded.primitives.length, 2);
    assert.equal(decoded.primitives[0].text, 'MEGUMIN RICH XO');
    assert.equal(decoded.primitives[1].text, 'JOGO DA VELHA');
});

// ------------------------------------------------------------------
// 7. Malformed data must not crash
// ------------------------------------------------------------------
test('decodeUnifiedResponse never crashes on malformed payloads', () => {
    // null / undefined / garbage objects
    assert.equal(decodeUnifiedResponse(null).found, false);
    assert.equal(decodeUnifiedResponse(undefined).found, false);
    assert.equal(decodeUnifiedResponse({}).found, false);
    assert.equal(decodeUnifiedResponse({ text: 'plain message' }).found, false);

    // garbage unifiedResponse.data (random bytes, not JSON)
    const garbage = proto.AIRichResponseMessage.create({
        messageType: 1,
        unifiedResponse: { data: Buffer.from([0x00, 0xff, 0x13, 0x37, 0xbe, 0xef]) }
    });
    const decoded = decodeUnifiedResponse({ richResponseMessage: garbage });
    assert.equal(decoded.found, true);
    assert.equal(decoded.raw.json, false);
    assert.ok(decoded.raw.jsonError, 'jsonError reported');
    assert.ok(decoded.raw.hex.length > 0, 'hex fallback available');
    assert.ok(decoded.raw.base64.length > 0, 'base64 fallback available');
    assert.ok('utf8' in decoded.raw, 'utf8 fallback available');

    // JSON that is valid but has no sections
    const weird = proto.AIRichResponseMessage.create({
        messageType: 1,
        unifiedResponse: { data: Buffer.from(JSON.stringify({ hello: true })) }
    });
    const decodedWeird = decodeUnifiedResponse({ richResponseMessage: weird });
    assert.equal(decodedWeird.raw.json, true);
    assert.deepEqual(decodedWeird.primitives, []);
    assert.equal(decodedWeird.unified.hello, true);
});

test('captureUnifiedResponse is an alias of decodeUnifiedResponse', () => {
    assert.equal(captureUnifiedResponse, decodeUnifiedResponse);
});

test('base64 string data (fromObject path) decodes correctly', () => {
    const payload = Buffer.from(JSON.stringify({ response_id: 'abc-123', sections: [] })).toString('base64');
    const rich = proto.AIRichResponseMessage.fromObject({
        messageType: 1,
        unifiedResponse: { data: payload }
    });
    const decoded = decodeUnifiedResponse(rich);
    assert.equal(decoded.found, true);
    assert.equal(decoded.responseId, 'abc-123');
    assert.equal(decoded.raw.json, true);
});

// ------------------------------------------------------------------
// 8. Backward compatibility
// ------------------------------------------------------------------
test('backward compat: { text } still produces extendedTextMessage', async () => {
    const content = await generateWAMessageContent({ text: 'hello' }, { userJid: USER_JID });
    assert.ok(content.extendedTextMessage, 'extendedTextMessage path');
    assert.equal(content.extendedTextMessage.text, 'hello');
    assert.ok(content.botForwardedMessage == null, 'no botForwardedMessage on plain text (proto null)');
});

test('backward compat: { richResponse } legacy path still works', () => {
    const content = prepareRichResponseMessage({
        headerText: 'HEADER',
        table: [['A', 'B'], ['1', '2']],
        title: 'T'
    });
    const rich = content.botForwardedMessage.message.richResponseMessage;
    assert.ok(rich, 'legacy prepareRichResponseMessage unchanged');
    assert.equal(rich.messageType, proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD);
    const unified = JSON.parse(rich.unifiedResponse.data.toString('utf8'));
    assert.ok(unified.response_id);
    assert.equal(unified.sections[0].view_model.primitive.__typename, 'GenAIMarkdownTextUXPrimitive');
    assert.equal(content.messageContextInfo.botMetadata.botResponseId, unified.response_id);
});

test('backward compat: toUnified output shape unchanged', async () => {
    const { toUnified } = await import('../lib/Utils/rich-message-utils.js');
    const unified = toUnified([{ messageType: 2, messageText: 'x', inlineEntities: [] }], 'fixed-id');
    assert.equal(unified.response_id, 'fixed-id');
    assert.equal(unified.sections[0].view_model.primitive.__typename, 'GenAIMarkdownTextUXPrimitive');
    assert.equal(unified.sections[0].view_model.primitive.text, 'x');
});
