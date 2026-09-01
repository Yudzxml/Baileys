/**
 * Smoke test: verify sendUnifiedResponse exists on a real socket instance
 * and that all legacy entry points still load/work.
 */
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'fs';
import pino from 'pino';
import makeWASocket, {
    useMultiFileAuthState,
    proto,
    RichBuilder,
    prepareUnifiedResponseMessage,
    decodeUnifiedResponse,
    generateWAMessage,
    toUnified,
    prepareRichResponseMessage,
    wrapToBotForwardedMessage,
    tokenizeCode,
    CodeHighlightType,
    RichSubMessageType
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

assert.equal(typeof sock.sendMessage, 'function', 'legacy sendMessage still present');
assert.equal(typeof sock.relayMessage, 'function', 'legacy relayMessage still present');
assert.equal(typeof sock.sendUnifiedResponse, 'function', 'sendUnifiedResponse added');
console.log('socket API surface OK:', ['sendMessage', 'relayMessage', 'sendUnifiedResponse'].join(', '));

// Legacy helpers still exported & functional
assert.equal(toUnified([{ messageType: RichSubMessageType.TEXT, messageText: 'x' }], 'id1').response_id, 'id1');
assert.ok(tokenizeCode('const a = 1;').length > 0);
assert.ok(wrapToBotForwardedMessage({ messageType: 1 }).botForwardedMessage);
console.log('legacy rich-message-utils exports OK');

// sendMessage content path still routes correctly for every legacy key
const legacyChecks = [
    [{ text: 'hi' }, 'extendedTextMessage'],
    [{ code: 'x=1' }, 'botForwardedMessage'],
    [{ table: [['a']] }, 'botForwardedMessage'],
    [{ richResponse: [{ text: 'x' }] }, 'botForwardedMessage'],
    [{ unifiedResponse: { text: 'x' } }, 'botForwardedMessage']
];
for (const [content, expectedKey] of legacyChecks) {
    const m = await generateWAMessage('123456@s.whatsapp.net', content, { userJid: '923456@s.whatsapp.net' });
    const got = expectedKey === 'extendedTextMessage'
        ? (m.message?.extendedTextMessage ? 'extendedTextMessage' : Object.keys(m.message || {})[0])
        : (m.message?.botForwardedMessage ? 'botForwardedMessage' : Object.keys(m.message || {})[0]);
    assert.equal(got, expectedKey, `content ${JSON.stringify(content).slice(0, 40)} routes to ${expectedKey}`);
}
console.log('content routing OK (text/code/table/richResponse/unifiedResponse)');

// Full encode roundtrip through WebMessageInfo like a real send
const full = await generateWAMessage('123456@s.whatsapp.net', {
    unifiedResponse: { text: 'roundtrip', sections: [RichBuilder.divider()] }
}, { userJid: '923456@s.whatsapp.net' });
const bytes = proto.WebMessageInfo.encode(full).finish();
const restored = proto.WebMessageInfo.decode(bytes);
const decoded = decodeUnifiedResponse(restored);
assert.equal(decoded.found, true);
assert.equal(decoded.primitives[0].text, 'roundtrip');
assert.equal(decoded.primitives[1].__typename, 'GenAIDividerPrimitive');
console.log('WebMessageInfo encode/decode roundtrip OK, responseId =', decoded.responseId);

sock.end(undefined);
rmSync(dir, { recursive: true, force: true });
console.log('SMOKE TEST PASSED');
