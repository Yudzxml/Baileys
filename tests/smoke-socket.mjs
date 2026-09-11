/**
 * Smoke test (7.6.0): verify the integrated MessageBuilder (Elaina 4.7 engine)
 * is wired into the socket and that all entry points load/work offline.
 */
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'fs';
import pino from 'pino';
import makeWASocket, {
    useMultiFileAuthState,
    proto,
    AIRich,
    Button,
    ButtonV2,
    Carousel,
    Toolkit,
    htmlSection,
    sendHtmlApp,
    MessageBuilder,
    prepareRichResponseMessage,
    tokenizeCode,
    CodeHighlightType,
    RichSubMessageType,
    generateWAMessage
} from '../lib/index.js';

const dir = '/tmp/rich-smoke-auth-' + Date.now();
mkdirSync(dir, { recursive: true });
const { state } = await useMultiFileAuthState(dir);

// Build socket offline (no connect) to inspect API surface
const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false
});

assert.equal(typeof sock.sendMessage, 'function', 'sendMessage still present');
assert.equal(typeof sock.relayMessage, 'function', 'relayMessage still present');
assert.equal(typeof sock.sendUnifiedResponse, 'function', 'sendUnifiedResponse shim present');
assert.equal(typeof sock.sendHtmlApp, 'function', 'sendHtmlApp shim present');
console.log('socket API surface OK:', ['sendMessage', 'relayMessage', 'sendUnifiedResponse', 'sendHtmlApp'].join(', '));

// MessageBuilder exports
assert.equal(MessageBuilder.VERSION, '4.7');
for (const k of ['AIRich', 'Button', 'ButtonV2', 'Carousel', 'Toolkit']) {
    assert.equal(typeof MessageBuilder[k], 'function', `MessageBuilder.${k} exported`);
}
assert.equal(typeof htmlSection, 'function');
assert.equal(typeof sendHtmlApp, 'function');
assert.ok(typeof Toolkit.stringifyEscaped === 'function');
console.log('MessageBuilder exports OK (AIRich/Button/ButtonV2/Carousel/Toolkit/htmlSection/sendHtmlApp)');

// Legacy rich-message-utils exports still functional
assert.ok(tokenizeCode('const a = 1;').length > 0);
console.log('legacy rich-message-utils exports OK');

// sendMessage content path still routes correctly for legacy keys
// (the removed "unifiedResponse" shortcut is intentionally absent)
const legacyChecks = [
    [{ text: 'hi' }, 'extendedTextMessage'],
    [{ code: 'x=1' }, 'botForwardedMessage'],
    [{ table: [['a']] }, 'botForwardedMessage'],
    [{ richResponse: [{ text: 'x' }] }, 'botForwardedMessage']
];
for (const [content, expectedKey] of legacyChecks) {
    const m = await generateWAMessage('123456@s.whatsapp.net', content, { userJid: '923456@s.whatsapp.net' });
    const got = expectedKey === 'extendedTextMessage'
        ? (m.message?.extendedTextMessage ? 'extendedTextMessage' : Object.keys(m.message || {})[0])
        : (m.message?.botForwardedMessage ? 'botForwardedMessage' : Object.keys(m.message || {})[0]);
    assert.equal(got, expectedKey, `content ${JSON.stringify(content).slice(0, 40)} routes to ${expectedKey}`);
}
console.log('content routing OK (text/code/table/richResponse)');

// AIRich full roundtrip through WebMessageInfo like a real send
const fakeSock = { relayMessage: async () => {}, waUploadToServer: async (s) => s };
const rich = new AIRich(fakeSock).addText('smoke-ok').addSection(AIRich.newLayout('Single', htmlSection('<b>hi</b>')));
const full = await rich.build('123456@s.whatsapp.net');
const bytes = proto.WebMessageInfo.encode(full).finish();
const restored = proto.WebMessageInfo.decode(bytes);
const data = restored.message.botForwardedMessage.message.richResponseMessage.unifiedResponse.data;
const unified = JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
assert.ok(unified.response_id);
assert.ok(JSON.stringify(unified.sections).includes('smoke-ok'));
assert.ok(JSON.stringify(unified.sections).includes('GenAIaeacdsnwHtmlPrimitive'));
console.log('AIRich + htmlSection WebMessageInfo encode/decode roundtrip OK, response_id =', unified.response_id);

// WA Web protocol version must be the fresh Elaina 1.3.9 one
const { version } = await import('../lib/Defaults/index.js');
assert.deepEqual(version, [2, 3000, 1046909856], 'WA protocol version must be [2,3000,1046909856]');
console.log('WA protocol version OK:', version.join('.'));

sock.end(undefined);
rmSync(dir, { recursive: true, force: true });
console.log('SMOKE TEST PASSED');
