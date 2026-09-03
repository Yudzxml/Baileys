/**
 * Yudzxml@Changes 03-09-26
 * Tests for the HTML Rich Message / HTML Mini App support
 * (GenAIaeacdsnwHtmlPrimitive).
 *
 * Run with: npm test
 *
 * Covers:
 *  1. RichBuilder.html() descriptor
 *  2. htmlSection() raw unified section (exact primitive name + payload integrity)
 *  3. prepareUnifiedResponseMessage() -> unified JSON contains GenAIaeacdsnwHtmlPrimitive
 *  4. WAProto encode -> decode roundtrip: HTML payload survives without corruption
 *  5. decodeHtmlRich() -> { html, trustedSources, section, raw }
 *  6. height option (lockHeight shim) + trusted_sources mapping
 *  7. malformed data must not crash the HTML decoder
 *  8. backward compatibility of existing RichBuilder primitives
 *  9. sendHtmlApp() validation + MESSAGE_EDIT (bypassDownload) content shape
 * 10. generateWAMessage path (sock.sendUnifiedResponse / sock.sendHtmlApp transport)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    proto,
    RichBuilder,
    AI_RICH_HTML_PRIMITIVE,
    htmlSection,
    lockHeight,
    prepareUnifiedResponseMessage,
    decodeUnifiedResponse,
    decodeHtmlRich,
    sendHtmlApp,
    generateWAMessage
} from '../lib/index.js';

const JID = '1234567890@s.whatsapp.net';
const USER_JID = '9876543210@s.whatsapp.net';

// Full-featured HTML document — same shape as the requested test payload
// (static HTML + CSS + JS + button + counter) plus non-ASCII to verify escaping safety
const HTML_APP = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body {
  background: #111;
  color: white;
  font-family: sans-serif;
  text-align: center;
}

button {
  padding: 12px;
  border-radius: 10px;
}
</style>
</head>

<body>

<h2>YUDZXML HTML RICH</h2>

<div id="count">0</div>

<button onclick="add()">
  +1
</button>

<script>
let count = 0

function add() {
  count++

  document.getElementById('count')
    .textContent = count
}
</script>

</body>
</html>
`;

const getRich = (content) => content.botForwardedMessage?.message?.richResponseMessage;

// ------------------------------------------------------------------
// 1. RichBuilder.html
// ------------------------------------------------------------------
test('RichBuilder.html produces the html descriptor and validates input', () => {
    const block = RichBuilder.html(HTML_APP);
    assert.equal(block.kind, 'html');
    assert.equal(block.html, HTML_APP);
    assert.equal(block.trustedSources, undefined);
    assert.equal(block.height, undefined);

    // options pass-through
    assert.deepEqual(RichBuilder.html(HTML_APP, { trustedSources: ['https://example.com'], height: 400 }), {
        kind: 'html', html: HTML_APP, trustedSources: ['https://example.com'], height: 400
    });

    // validation
    assert.throws(() => RichBuilder.html(''), TypeError);
    assert.throws(() => RichBuilder.html('   '), TypeError);
    assert.throws(() => RichBuilder.html(HTML_APP, { trustedSources: 'nope' }), TypeError);
});

// ------------------------------------------------------------------
// 2. htmlSection
// ------------------------------------------------------------------
test('htmlSection builds the exact GenAIaeacdsnwHtmlPrimitive unified section', () => {
    const section = htmlSection(HTML_APP, { trustedSources: ['https://a.example'] });
    const primitive = section.view_model.primitive;

    // EXACT primitive name — must never be renamed
    assert.equal(AI_RICH_HTML_PRIMITIVE, 'GenAIaeacdsnwHtmlPrimitive');
    assert.equal(primitive.__typename, 'GenAIaeacdsnwHtmlPrimitive');

    // payload keeps the full HTML verbatim (doctype + style + script)
    assert.equal(primitive.payload, HTML_APP);
    assert.ok(primitive.payload.includes('<!DOCTYPE html>'));
    assert.ok(primitive.payload.includes('<style>'));
    assert.ok(primitive.payload.includes('<script>'));
    assert.deepEqual(primitive.trusted_sources, ['https://a.example']);

    // layout view model
    assert.equal(section.view_model.__typename, 'GenAISingleLayoutViewModel');

    // default trustedSources = []
    assert.deepEqual(htmlSection(HTML_APP).view_model.primitive.trusted_sources, []);

    // raw section is pass-through compatible with sendUnifiedResponse/RichBuilder.raw
    assert.deepEqual(RichBuilder.raw(section).section, section);

    // validation
    assert.throws(() => htmlSection(''), TypeError);
    assert.throws(() => htmlSection(HTML_APP, { trustedSources: 'x' }), TypeError);
});

test('lockHeight prepends the height-lock shim and validates input', () => {
    const shim = lockHeight(320);
    assert.ok(shim.startsWith('<style>'));
    assert.ok(shim.includes('320px'));
    assert.ok(shim.includes('#__wrap'));

    const section = htmlSection(HTML_APP, { height: 320 });
    const payload = section.view_model.primitive.payload;
    assert.ok(payload.startsWith(shim), 'payload starts with the height shim');
    assert.ok(payload.endsWith(HTML_APP), 'original html preserved after the shim');

    assert.throws(() => lockHeight(0), TypeError);
    assert.throws(() => lockHeight(-5), TypeError);
    assert.throws(() => lockHeight('abc'), TypeError);
});

// ------------------------------------------------------------------
// 3. prepareUnifiedResponseMessage with html sections
// ------------------------------------------------------------------
test('prepareUnifiedResponseMessage embeds GenAIaeacdsnwHtmlPrimitive in unified JSON', () => {
    const content = prepareUnifiedResponseMessage({
        text: 'YUDZXML HTML APP',
        sections: [RichBuilder.html(HTML_APP)],
        responseId: 'html-response-0001',
        disclaimerText: 'AI generated'
    });
    const rich = getRich(content);
    assert.ok(rich, 'botForwardedMessage.message.richResponseMessage exists');

    // html is JSON-only: no proto submessage is created for it
    assert.deepEqual(rich.submessages.map(s => s.messageType), [proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_TEXT]);

    const unified = JSON.parse(rich.unifiedResponse.data.toString('utf8'));
    assert.equal(unified.response_id, 'html-response-0001');
    assert.equal(unified.sections.length, 2);

    const htmlPrimitive = unified.sections[1].view_model.primitive;
    assert.equal(htmlPrimitive.__typename, 'GenAIaeacdsnwHtmlPrimitive');
    assert.equal(htmlPrimitive.payload, HTML_APP, 'HTML payload intact');
    assert.deepEqual(htmlPrimitive.trusted_sources, []);
    assert.equal(unified.sections[1].view_model.__typename, 'GenAISingleLayoutViewModel');

    // botMetadata mirrors
    assert.equal(content.messageContextInfo.botMetadata.botResponseId, 'html-response-0001');
    assert.equal(content.messageContextInfo.botMetadata.messageDisclaimerText, 'AI generated');
});

test('prepareUnifiedResponseMessage accepts htmlSection raw output directly', () => {
    const content = prepareUnifiedResponseMessage({
        sections: [htmlSection(HTML_APP, { trustedSources: ['https://x.example'] })]
    });
    const unified = JSON.parse(getRich(content).unifiedResponse.data.toString('utf8'));
    const primitive = unified.sections[0].view_model.primitive;
    assert.equal(primitive.__typename, 'GenAIaeacdsnwHtmlPrimitive');
    assert.deepEqual(primitive.trusted_sources, ['https://x.example']);
    assert.equal(primitive.payload, HTML_APP);
});

// ------------------------------------------------------------------
// 4. Proto roundtrip — HTML must survive encode/decode without corruption
// ------------------------------------------------------------------
test('proto roundtrip: HTML payload survives Message encode/decode byte-exact', () => {
    const content = prepareUnifiedResponseMessage({
        sections: [RichBuilder.html(HTML_APP, { trustedSources: ['https://s.example'] })]
    });

    const fullMessage = proto.Message.create({ ...content });
    const bytes = proto.Message.encode(fullMessage).finish();
    const decodedMessage = proto.Message.decode(bytes);

    const decoded = decodeHtmlRich({ message: decodedMessage });
    assert.equal(decoded.found, true);
    assert.equal(decoded.html, HTML_APP, 'HTML byte-exact after protobuf roundtrip');
    assert.deepEqual(decoded.trustedSources, ['https://s.example']);
    assert.ok(decoded.section, 'section is returned');
});

test('proto roundtrip: HTML with unicode/emoji/newlines stays intact', () => {
    const unicodeHtml = '<!DOCTYPE html><html><body><h1>Halo 🇮🇩 — café naïve 中文</h1><script>const x = "emoji 🐍";</script></body></html>';
    const content = prepareUnifiedResponseMessage({ sections: [RichBuilder.html(unicodeHtml)] });
    const bytes = proto.Message.encode(proto.Message.create({ ...content })).finish();
    const decoded = decodeHtmlRich(proto.Message.decode(bytes));
    assert.equal(decoded.found, true);
    assert.equal(decoded.html, unicodeHtml);
});

// ------------------------------------------------------------------
// 5. decodeHtmlRich result shape
// ------------------------------------------------------------------
test('decodeHtmlRich returns { html, trustedSources, section, raw } from a full WAMessage', async () => {
    const fullMsg = await generateWAMessage(JID, {
        unifiedResponse: {
            text: 'YUDZXML HTML RICH',
            sections: [RichBuilder.html(HTML_APP)]
        }
    }, { userJid: USER_JID });

    assert.ok(fullMsg.message.botForwardedMessage, 'content routed through generateWAMessageContent');

    const decoded = decodeHtmlRich(fullMsg);
    assert.equal(decoded.found, true);
    assert.equal(decoded.html, HTML_APP);
    assert.deepEqual(decoded.trustedSources, []);
    assert.equal(decoded.section.view_model.primitive.__typename, 'GenAIaeacdsnwHtmlPrimitive');
    assert.equal(decoded.responseId, decoded.decoded.responseId);
    assert.ok(decoded.decoded.found, 'full decodeUnifiedResponse result attached');
    assert.equal(decoded.raw.json, true, 'raw payload parsed as JSON');
    assert.ok(decoded.raw.base64, 'base64 fallback available');
    assert.equal(decoded.sections.length, 2);
    assert.equal(decoded.htmlSections.length, 1);
});

test('decodeHtmlRich handles multiple html primitives', () => {
    const a = htmlSection('<html><body>A</body></html>');
    const b = htmlSection('<html><body>B</body></html>', { trustedSources: ['https://b.example'] });
    const content = prepareUnifiedResponseMessage({ sections: [a, b] });
    const decoded = decodeHtmlRich(content);
    assert.equal(decoded.found, true);
    assert.equal(decoded.htmlSections.length, 2);
    assert.equal(decoded.html, '<html><body>A</body></html>');
    assert.deepEqual(decoded.htmlSections[1].trustedSources, ['https://b.example']);
});

test('decodeHtmlRich never crashes on non-html payloads', () => {
    assert.equal(decodeHtmlRich(null).found, false);
    assert.equal(decodeHtmlRich(undefined).found, false);
    assert.equal(decodeHtmlRich({}).found, false);
    assert.equal(decodeHtmlRich({ text: 'plain' }).found, false);

    // markdown-only rich response -> found=false, no throw
    const content = prepareUnifiedResponseMessage({ text: 'just text' });
    const decoded = decodeHtmlRich(content);
    assert.equal(decoded.found, false);
    assert.equal(decoded.html, null);
    assert.deepEqual(decoded.trustedSources, []);
    assert.equal(decoded.section, null);
    assert.ok(decoded.decoded.found);
});

// ------------------------------------------------------------------
// 8. Backward compatibility
// ------------------------------------------------------------------
test('backward compat: markdown/code/table/raw builders unchanged by html support', () => {
    const content = prepareUnifiedResponseMessage({
        text: 'MEGUMIN RICH XO',
        sections: [
            RichBuilder.markdown('JOGO DA VELHA'),
            RichBuilder.code('const a = 1;', 'javascript'),
            RichBuilder.table([['H1', 'H2'], ['a', 'b']], 'T'),
            RichBuilder.raw(htmlSection(HTML_APP))
        ]
    });
    const rich = getRich(content);
    const unified = JSON.parse(rich.unifiedResponse.data.toString('utf8'));
    const typenames = unified.sections.map(s => s.view_model.primitive.__typename);
    assert.deepEqual(typenames, [
        'GenAIMarkdownTextUXPrimitive',
        'GenAIMarkdownTextUXPrimitive',
        'GenAICodeUXPrimitive',
        'GenATableUXPrimitive',
        'GenAIaeacdsnwHtmlPrimitive'
    ]);
    assert.equal(unified.sections[4].view_model.primitive.payload, HTML_APP);

    // decodeUnifiedResponse still sees all primitives (raw path)
    const decoded = decodeUnifiedResponse(content);
    assert.equal(decoded.primitives.length, 5);
});

// ------------------------------------------------------------------
// 9. sendHtmlApp
// ------------------------------------------------------------------
test('sendHtmlApp validates required arguments', async () => {
    await assert.rejects(() => sendHtmlApp(null, JID, HTML_APP), TypeError);
    await assert.rejects(() => sendHtmlApp({}, null, HTML_APP), TypeError);
    await assert.rejects(() => sendHtmlApp({}, JID, ''), TypeError);
});

test('sendHtmlApp build path: unified response content is wire-correct (socket-less build)', async () => {
    // Build the exact content the sendUnifiedResponse pipeline builds for sendHtmlApp
    // (same prepareUnifiedResponseMessage path used by sock.sendUnifiedResponse).
    const fullMsg = await generateWAMessage(JID, {
        unifiedResponse: {
            text: 'YUDZXML HTML APP',
            sections: [htmlSection(HTML_APP)],
            disclaimerText: 'HTML Mini App'
        }
    }, { userJid: USER_JID });

    assert.equal(fullMsg.key.remoteJid, JID);
    const rich = fullMsg.message.botForwardedMessage.message.richResponseMessage;
    assert.ok(rich, 'richResponseMessage present');
    assert.equal(rich.messageType, proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD);

    const unified = JSON.parse(rich.unifiedResponse.data.toString('utf8'));
    assert.equal(unified.sections[0].view_model.primitive.text, 'YUDZXML HTML APP');
    assert.equal(unified.sections[1].view_model.primitive.__typename, 'GenAIaeacdsnwHtmlPrimitive');
    assert.equal(unified.sections[1].view_model.primitive.payload, HTML_APP);

    // decodeHtmlRich extracts it again from the full WAMessage
    const decoded = decodeHtmlRich(fullMsg);
    assert.equal(decoded.found, true);
    assert.equal(decoded.html, HTML_APP);

    // bypassDownload edit content shape (protocolMessage type 14 MESSAGE_EDIT)
    const editContent = {
        botForwardedMessage: {
            message: {
                protocolMessage: {
                    key: { remoteJid: JID, fromMe: true, id: fullMsg.key.id },
                    type: proto.Message.ProtocolMessage.Type.MESSAGE_EDIT,
                    editedMessage: fullMsg.message
                }
            }
        }
    };
    assert.equal(editContent.botForwardedMessage.message.protocolMessage.type, 14);
    const editBytes = proto.Message.encode(proto.Message.create({ ...editContent })).finish();
    const editDecoded = proto.Message.decode(editBytes);
    assert.ok(editDecoded.botForwardedMessage?.message?.protocolMessage?.editedMessage?.botForwardedMessage?.message?.richResponseMessage, 'editedMessage carries the rich response');
    const fromEdit = decodeHtmlRich(editDecoded.botForwardedMessage.message.protocolMessage.editedMessage);
    assert.equal(fromEdit.found, true);
    assert.equal(fromEdit.html, HTML_APP, 'HTML survives inside the MESSAGE_EDIT payload');
});
