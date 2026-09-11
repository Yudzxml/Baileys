/**
 * 7.6.0 — Tests for the integrated MessageBuilder (Elaina 4.7 engine):
 * AIRich, Button, Carousel, Toolkit + htmlSection/sendHtmlApp extras.
 *
 * Run with: npm test
 *
 * Covers:
 *  1. htmlSection() raw unified section (exact primitive name + payload integrity)
 *  2. AIRich.build() -> botForwardedMessage -> richResponseMessage -> unifiedResponse
 *  3. WAProto encode -> decode roundtrip: unified JSON + sections survive intact
 *  4. AIRich.loadFrom() recovers sections from a decoded message
 *  5. send() with a fake sock: relay captured; bypassDownload triggers the
 *     protocolMessage(MESSAGE_EDIT) follow-up
 *  6. Button native-flow payload shape
 *  7. Carousel cards + AIRich.newLayout('HScroll', ...)
 *  8. checkHtmlApp byte budget flags oversized documents
 *  9. Export surface (MessageBuilder/MB, errors, layout catalog)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    proto,
    AIRich,
    Button,
    Carousel,
    AIRichError,
    MessageBuilder,
    MB,
    htmlSection,
    sendHtmlApp,
    checkHtmlApp,
    AI_RICH_HTML_PRIMITIVE,
    AI_RICH_LAYOUTS
} from '../lib/index.js';

/** Fake socket: captures relayed messages like a real connection would. */
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

const parseUnified = (msg) => {
    const data = msg.message?.botForwardedMessage?.message?.richResponseMessage?.unifiedResponse?.data;
    assert.ok(data, 'unifiedResponse.data missing');
    return JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
};

test('htmlSection keeps HTML verbatim under the HTML primitive', () => {
    const html = '<div style="color:red">HAI</div>';
    const section = htmlSection(html, { trustedSources: ['example.com'], height: 300 });
    const primitive = section?.view_model?.primitive;
    assert.equal(primitive?.__typename, AI_RICH_HTML_PRIMITIVE);
    assert.ok(primitive?.payload?.includes('HAI'));
    assert.deepEqual(primitive?.trusted_sources, ['example.com']);
    assert.equal(section.view_model.__typename, 'GenAISingleLayoutViewModel');
});

test('AIRich.build() composes the full botForwardedMessage chain', async () => {
    const sock = makeFakeSock();
    const rich = new AIRich(sock)
        .setTitle('TEST DISCLAIMER')
        .addText('halo dunia')
        .addCode('javascript', 'const x = 1;')
        .addTable([['A', 'B'], ['1', '2']]);

    const msg = await rich.build('1234@s.whatsapp.net', { messageId: 'TESTID0' });
    const chain = msg.message?.botForwardedMessage?.message?.richResponseMessage;
    assert.ok(chain, 'richResponseMessage chain missing');
    assert.equal(chain.messageType, 1);

    const meta = msg.message?.messageContextInfo?.botMetadata;
    assert.ok(meta?.botResponseId, 'botResponseId missing');
    assert.ok(meta?.verificationMetadata, 'verificationMetadata missing');
    assert.equal(meta?.messageDisclaimerText, 'TEST DISCLAIMER');

    const unified = parseUnified(msg);
    assert.ok(unified.response_id);
    assert.ok(Array.isArray(unified.sections) && unified.sections.length === 3);
    assert.ok(JSON.stringify(unified.sections).includes('halo dunia'));
});

test('WAProto encode/decode roundtrip + loadFrom recovery', async () => {
    const sock = makeFakeSock();
    const rich = new AIRich(sock).addText('ROUNDTRIP_OK');
    const msg = await rich.build('1234@s.whatsapp.net');

    const bytes = proto.WebMessageInfo.encode(msg).finish();
    const restored = proto.WebMessageInfo.decode(bytes);

    const reloaded = new AIRich(sock).loadFrom(restored.message);
    const rebuilt = await reloaded.build('1234@s.whatsapp.net');
    const unified = parseUnified(rebuilt);
    assert.ok(JSON.stringify(unified.sections).includes('ROUNDTRIP_OK'), 'payload lost in roundtrip');
});

test('send() relays message + MESSAGE_EDIT (bypassDownload default ON)', async () => {
    const sock = makeFakeSock();
    const rich = new AIRich(sock).addText('edit-me');
    await rich.send('1234@s.whatsapp.net');
    assert.equal(sock.relays.length, 2, 'expected message relay + edit relay');
    const protocol = sock.relays[1].message?.botForwardedMessage?.message?.protocolMessage;
    assert.equal(protocol?.type, proto.Message.ProtocolMessage.Type.MESSAGE_EDIT);
    assert.ok(protocol?.editedMessage, 'editedMessage missing');
});

test('sendHtmlApp carries the HTML document verbatim (single relay default)', async () => {
    const sock = makeFakeSock();
    const html = '<!DOCTYPE html><html><body><h1>DINO</h1><script>let x=1;</script></body></html>';
    await sendHtmlApp(sock, '1234@s.whatsapp.net', html, { title: 'MINI APP', label: 'Dino', height: 250 });
    assert.equal(sock.relays.length, 1, 'sendHtmlApp defaults to a single relay');

    const relayed = sock.relays[0].message?.botForwardedMessage?.message?.richResponseMessage;
    const data = relayed?.unifiedResponse?.data;
    const unified = JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
    const primitive = unified.sections?.[0]?.view_model?.primitive;
    assert.equal(primitive?.__typename, AI_RICH_HTML_PRIMITIVE);
    assert.ok(primitive?.payload?.includes('<script>let x=1;</script>'), 'HTML must travel verbatim');
    // label travels as a submessage (text fallback for WA Web/Desktop), not inside the unified JSON
    const sub = relayed?.submessages?.[0];
    assert.equal(sub?.messageType, 2);
    assert.equal(sub?.messageText, 'Dino');
});

test('Button builds a native-flow payload with quick_reply buttons', async () => {
    const sock = makeFakeSock();
    const btn = new Button(sock)
        .setTitle('PILIH SALAH')
        .setBody('dua pilihan')
        .setFooter('tes')
        .addReply('Satu', 'satu')
        .addReply('Dua', 'dua');
    const msg = await btn.build('1234@s.whatsapp.net');
    const iM = msg.message?.interactiveMessage;
    assert.ok(iM, 'interactiveMessage missing');
    assert.equal(iM.nativeFlowMessage?.buttons?.length, 2);
    assert.ok(JSON.stringify(iM.nativeFlowMessage.buttons).includes('Satu'));
});

test('Carousel accepts media cards and renders native carousel', async () => {
    const sock = makeFakeSock();
    // minimal card that satisfies the header-media requirement (offline-safe)
    const card = { header: { hasMediaAttachment: true }, body: { text: 'kartu 1' } };
    const carousel = new Carousel(sock).setBody('pilih kartu').addCard([card, card]);
    const msg = await carousel.build('1234@s.whatsapp.net');
    const cards = msg.message?.interactiveMessage?.carouselMessage?.cards;
    assert.equal(cards?.length, 2);
    // and it relays through the fake socket with the native_flow node
    await carousel.send('1234@s.whatsapp.net');
    assert.equal(sock.relays.length, 1);
});

test("AIRich.newLayout('HScroll', ...) wraps sections in a layout", async () => {
    const sock = makeFakeSock();
    const rich = new AIRich(sock).addSection(AIRich.newLayout('HScroll', [{ __typename: 'GenAIDividerPrimitive' }]));
    const msg = await rich.build('1234@s.whatsapp.net');
    const unified = parseUnified(msg);
    assert.ok(JSON.stringify(unified.sections).includes('HScroll'));
});

test('checkHtmlApp flags oversized documents instead of throwing', () => {
    const big = '<div>' + 'x'.repeat(970 * 1024) + '</div>';
    const report = checkHtmlApp(big);
    assert.equal(report.ok, false);
    assert.ok(report.problems.length > 0);
});

test('AIRichError hierarchy + MessageBuilder export surface', () => {
    assert.ok(new AIRichError('x', 'TEST') instanceof Error);
    assert.equal(typeof MessageBuilder.VERSION, 'string');
    assert.equal(MB, MessageBuilder);
    for (const k of ['Button', 'ButtonV2', 'Carousel', 'AIRich', 'Toolkit']) {
        assert.ok(MessageBuilder[k], `MessageBuilder.${k} missing`);
    }
    assert.ok(AI_RICH_LAYOUTS.includes('HScroll'));
});
