/**
 * E2E mock check: sendHtmlApp (standalone helper) full wire flow.
 * The sock.sendUnifiedResponse mock runs the REAL generateWAMessage pipeline
 * (identical to the internal sendUnifiedResponse minus the live network hop),
 * so the resulting relays are byte-identical to a real send.
 * Verifies: initial relay carries GenAIaeacdsnwHtmlPrimitive, follow-up edit
 * carries protocolMessage type 14 with editedMessage containing the same HTML.
 * Run: node scripts/check-send-html-app.mjs
 */
import assert from 'node:assert/strict';
import { makeWASocket, useMultiFileAuthState, generateWAMessage, generateMessageIDV2, sendHtmlApp as standaloneSend, decodeHtmlRich, RichBuilder, htmlSection } from '../lib/index.js';
import { mkdirSync, rmSync } from 'fs';
import pino from 'pino';

const HTML = '<!DOCTYPE html><html><body><h2>YUDZXML HTML RICH</h2><button onclick="add()">+1</button><script>let count=0;function add(){count++;document.body.title=count}</script></body></html>';
const JID = '1234567890@s.whatsapp.net';
const USER_JID = '628000000001:11@s.whatsapp.net';

const dir = '/tmp/rich-html-e2e-' + Date.now();
mkdirSync(dir, { recursive: true });
const { state } = await useMultiFileAuthState(dir);

// Inspect API surface on an offline socket instance
const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false
});
assert.equal(typeof sock.sendHtmlApp, 'function', 'sendHtmlApp added to socket API');
console.log('socket API surface OK: sendHtmlApp present');
sock.end(undefined);
rmSync(dir, { recursive: true, force: true });

// Mock sock whose sendUnifiedResponse runs the REAL generateWAMessage pipeline
// and relayMessage records the wire payload (no network).
const relays = [];
const mockSock = {
    user: { id: USER_JID },
    sendUnifiedResponse: async (jid, content) => {
        const fullMsg = await generateWAMessage(jid, { unifiedResponse: content }, { userJid: USER_JID });
        relays.push(fullMsg);
        return fullMsg;
    },
    relayMessage: async (jid, message, opts) => {
        relays.push({ key: { id: opts?.messageId, remoteJid: jid }, message });
    }
};

// 1) standalone helper, bypassDownload default true -> initial relay + type-14 edit
relays.length = 0;
const sent = await standaloneSend(mockSock, JID, HTML, { title: 'T', text: 'Hello' });
assert.equal(relays.length, 2, `expected 2 relays (send + edit), got ${relays.length}`);
assert.ok(sent.key.id, 'sent message has a key.id');

const initial = decodeHtmlRich({ message: relays[0].message });
assert.equal(initial.found, true, 'initial relay carries the HTML primitive');
assert.equal(initial.html, HTML, 'initial relay HTML byte-exact');
assert.equal(initial.decoded.unified.sections[0].view_model.primitive.text, 'Hello', 'markdown text section present');

const protoMsg = relays[1].message?.botForwardedMessage?.message?.protocolMessage;
assert.ok(protoMsg, 'second relay is a protocolMessage edit');
assert.equal(protoMsg.type, 14, 'edit type is MESSAGE_EDIT (14)');
assert.equal(protoMsg.key.remoteJid, JID, 'edit key.remoteJid');
assert.equal(protoMsg.key.fromMe, true, 'edit key.fromMe');
assert.equal(protoMsg.key.id, sent.key.id, 'edit targets the original message id');
const fromEdit = decodeHtmlRich({ message: protoMsg.editedMessage });
assert.equal(fromEdit.found, true, 'editedMessage carries the HTML primitive');
assert.equal(fromEdit.html, HTML, 'editedMessage HTML byte-exact');
console.log('[1] standalone sendHtmlApp: initial relay + type-14 MESSAGE_EDIT OK, HTML byte-exact');

// 2) bypassDownload false -> single relay, no edit
relays.length = 0;
await standaloneSend(mockSock, JID, HTML, { bypassDownload: false });
assert.equal(relays.length, 1, 'bypassDownload:false sends exactly one relay');
const s1 = decodeHtmlRich({ message: relays[0].message });
assert.equal(s1.found && s1.html === HTML, true, 'bypassDownload:false payload intact');
console.log('[2] standalone bypassDownload:false: single relay OK');

// 3) sendUnifiedResponse + RichBuilder.html (same wire path as the socket method build)
relays.length = 0;
const uSent = await mockSock.sendUnifiedResponse(JID, {
    text: 'YUDZXML HTML APP',
    sections: [RichBuilder.html(HTML, { trustedSources: ['https://example.com'] })]
});
assert.equal(relays.length, 1, 'sendUnifiedResponse builds one message');
const u1 = decodeHtmlRich(uSent);
assert.equal(u1.found && u1.html === HTML, true, 'RichBuilder.html payload intact through the wire');
assert.deepEqual(u1.trustedSources, ['https://example.com'], 'trusted_sources survive the wire');
console.log('[3] sendUnifiedResponse + RichBuilder.html: OK');

// 4) height option prepends the lock shim on the wire
const tall = htmlSection('<html><body>x</body></html>', { height: 300 }).view_model.primitive.payload;
assert.ok(tall.startsWith('<style>'), 'lockHeight shim prepended');
console.log('[4] height lock shim OK');

console.log('SEND HTML APP E2E CHECK PASSED');
process.exit(0);
