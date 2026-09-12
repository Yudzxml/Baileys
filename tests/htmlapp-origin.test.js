/**
 * WebView origin tests — why `new WebSocket()` was blocked inside sendHtmlApp
 * mini apps while hand-relayed payloads could connect.
 *
 * Root cause: without a `url` on the GenAIaeacdsnwHtmlPrimitive the WhatsApp
 * Android WebView renders the document on an opaque/null origin, where
 * `new WebSocket()` (and fetch) throw SecurityError. Hand-crafted payloads that
 * carry `url: 'https://host'` (+ trusted_sources) get a real https base origin
 * and sockets connect fine.
 *
 * These tests pin the `url` option and the `embedded` wire shape (the exact
 * embedded_screens/FOAIDNixelButtonSheets structure of proven payloads).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendHtmlApp, htmlSection } from '../lib/index.js';

const HTML = '<body><div id="status">Belum terhubung</div><script>let ws=null</script></body>';

/** Fake socket capturing every relay like tests/messagebuilder.test.js does. */
const makeFakeSock = () => {
    const relays = [];
    return {
        relays,
        relayMessage: async (jid, message, opts = {}) => {
            relays.push({ jid, message, opts });
        },
        waUploadToServer: async (stream) => stream
    };
};

const firstRichRelay = (sock) => sock.relays.find((r) => r.message?.botForwardedMessage).message;

const parseUnified = (msg) => {
    const data = msg.botForwardedMessage.message.richResponseMessage.unifiedResponse.data;
    const raw = typeof data === 'string' ? data : Buffer.from(data).toString('base64');
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
};

test('htmlSection forwards url to the primitive (WebView base origin)', () => {
    const section = htmlSection(HTML, { url: 'https://nixel.dev', trustedSources: ['nixel.dev'] });
    // proven wire shape wraps the layout in GenAIUnifiedResponseSection
    assert.equal(section?.__typename, 'GenAIUnifiedResponseSection');
    const primitive = section?.view_model?.primitive;
    assert.equal(primitive?.url, 'https://nixel.dev');
    assert.deepEqual(primitive?.trusted_sources, ['nixel.dev']);
    // backward compatible: no url -> no url key (old opaque-origin behaviour)
    const bare = htmlSection(HTML, { sectionTypename: null });
    assert.equal(bare?.__typename, undefined);
    assert.equal(bare?.view_model?.primitive?.url, undefined);
    assert.throws(() => htmlSection(HTML, { url: '   ' }), TypeError);
});

test('sendHtmlApp keeps url + trusted_sources on the section primitive', async () => {
    const sock = makeFakeSock();
    await sendHtmlApp(sock, '6281234567890@s.whatsapp.net', HTML, {
        url: 'https://nixel.dev',
        trustedSources: ['nixel.dev']
    });
    const unified = parseUnified(firstRichRelay(sock));
    const section = unified.sections?.[0];
    assert.equal(section?.__typename, 'GenAIUnifiedResponseSection');
    const primitive = section?.view_model?.primitive;
    assert.equal(primitive?.url, 'https://nixel.dev');
    assert.deepEqual(primitive?.trusted_sources, ['nixel.dev']);
});

test('sendHtmlApp embedded mode reproduces the proven manual payload shape', async () => {
    const sock = makeFakeSock();
    await sendHtmlApp(sock, '6281234567890@s.whatsapp.net', HTML, {
        label: '> popioo',
        url: 'https://nixel.dev',
        trustedSources: ['nixel.dev'],
        screenTitle: 'Preview',
        tabHeader: 'WS Tester',
        embedded: true
    });

    const msg = firstRichRelay(sock);
    const rich = msg.botForwardedMessage.message.richResponseMessage;
    const unified = parseUnified(msg);

    // body text + submessage like the hand-relayed payload
    assert.equal(unified.sections?.[0]?.view_model?.primitive?.text, '> popioo');
    assert.equal(unified.sections?.[0]?.view_model?.primitive?.__typename, 'GenAIMarkdownTextUXPrimitive');
    assert.equal(rich.submessages?.[0]?.messageType, 2);
    assert.equal(rich.submessages?.[0]?.messageText, '> popioo');

    // the HTML app travels inside embedded_screens -> sheets -> tabs
    const screen = unified.embedded_screens?.[0];
    assert.equal(screen?.title, 'Preview');
    const sheet = screen?.content?.[0];
    assert.equal(sheet?.__typename, 'FOAIDNixelButtonSheets');
    const tab = sheet?.tabs?.[0];
    assert.equal(tab?.id, 'tab_0');
    assert.equal(tab?.tab_header, 'WS Tester');
    const primitive = tab?.sections?.[0]?.view_model?.primitive;
    assert.equal(tab?.sections?.[0]?.__typename, 'GenAIUnifiedResponseSection');
    assert.equal(primitive?.__typename, 'GenAIaeacdsnwHtmlPrimitive');
    assert.equal(primitive?.payload, HTML);
    assert.equal(primitive?.url, 'https://nixel.dev');
    assert.deepEqual(primitive?.trusted_sources, ['nixel.dev']);

    // bot attribution identical to the manual payload
    assert.equal(rich.contextInfo?.forwardedAiBotMessageInfo?.botJid, '867051314767696@bot');
    assert.equal(rich.contextInfo?.forwardOrigin, 4);
    assert.ok(msg.messageContextInfo?.botMetadata?.botResponseId);
});

test('sendHtmlApp rejects invalid url values', async () => {
    const sock = makeFakeSock();
    await assert.rejects(
        sendHtmlApp(sock, '6281234567890@s.whatsapp.net', HTML, { url: ' ' }),
        TypeError
    );
});
