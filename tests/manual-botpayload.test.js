/**
 * 7.6.0 — Regression test: manual `relayMessage` payload (botForwardedMessage chain)
 *
 * Ensures a hand-crafted AI rich-response payload — the exact shape users paste
 * into `sock.relayMessage(jid, payload, {})`:
 *
 *   messageContextInfo { deviceListMetadata, deviceListMetadataVersion: 2, botMetadata {
 *     messageDisclaimerText, botResponseId, verificationMetadata { proofs: [{
 *       version, useCase, signature, certificateChain[2] }] } } }
 *   botForwardedMessage.message.richResponseMessage {
 *     messageType: 1, submessages, unifiedResponse { data: base64(JSON) },
 *     contextInfo { forwardedAiBotMessageInfo { botJid }, forwardOrigin: 4 } }
 *
 * survives the REAL send pipeline untouched:
 *   generateWAMessageFromContent() -> encodeWAMessage() (with random pad)
 *   -> unpadRandomMax16() -> proto.Message.decode()
 *
 * Guards against proto field-number drift: if any wire tag changes, protobufjs
 * silently drops the field and the receiving WhatsApp client renders nothing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    proto,
    generateWAMessageFromContent,
    encodeWAMessage,
    unpadRandomMax16
} from '../lib/index.js';

const BOT_JID = '867051314767696@bot';

const nixelSignature =
    'TklYRUwuTWVzc2FnZUJ1aWxkZXJWNC43LVZlcmlmaWNhdGlvblNpZ25hdHVyZS5NZXRhZGF0YY28GDo8OXSlgg==';
const nixelCertificates = [
    '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'
];

const RESPONSE_ID = '183d0aee-fb35-4349-8bc5-7793b11859db';
const BOT_RESPONSE_ID = 'f090cd0f-bad1-4a4a-b0c3-b8f8e852c197';

/** The exact manual payload users relay by hand (HTML trimmed for brevity). */
const manualPayload = () => ({
    messageContextInfo: {
        deviceListMetadata: {},
        deviceListMetadataVersion: 2,
        botMetadata: {
            messageDisclaimerText: '',
            botResponseId: BOT_RESPONSE_ID,
            verificationMetadata: {
                proofs: [
                    {
                        version: 1,
                        useCase: 1,
                        signature: nixelSignature,
                        certificateChain: nixelCertificates
                    }
                ]
            }
        }
    },
    botForwardedMessage: {
        message: {
            richResponseMessage: {
                messageType: 1,
                submessages: [
                    {
                        messageType: 2,
                        messageText: '> popioo'
                    }
                ],
                unifiedResponse: {
                    data: Buffer.from(
                        JSON.stringify({
                            response_id: RESPONSE_ID,
                            sections: [
                                {
                                    view_model: {
                                        primitive: {
                                            text: '> popioo',
                                            __typename: 'GenAIMarkdownTextUXPrimitive'
                                        },
                                        __typename: 'GenAISingleLayoutViewModel'
                                    }
                                }
                            ],
                            embedded_screens: [
                                {
                                    title: 'Preview',
                                    content: [
                                        {
                                            __typename: 'FOAIDNixelButtonSheets',
                                            tabs: [
                                                {
                                                    id: 'tab_0',
                                                    tab_header: 'WS Tester',
                                                    sections: [
                                                        {
                                                            __typename: 'GenAIUnifiedResponseSection',
                                                            view_model: {
                                                                __typename: 'GenAISingleLayoutViewModel',
                                                                primitive: {
                                                                    __typename: 'GenAIaeacdsnwHtmlPrimitive',
                                                                    payload:
                                                                        '<body><div id="status">Belum terhubung</div></body>',
                                                                    url: 'https://nixel.dev',
                                                                    trusted_sources: ['nixel.dev']
                                                                }
                                                            }
                                                        }
                                                    ],
                                                    step_entries: []
                                                }
                                            ],
                                            step_entries: []
                                        }
                                    ]
                                }
                            ]
                        })
                    ).toString('base64')
                },
                contextInfo: {
                    forwardingScore: 1,
                    isForwarded: true,
                    forwardedAiBotMessageInfo: {
                        botJid: BOT_JID
                    },
                    forwardOrigin: 4
                }
            }
        }
    }
});

test('manual relayMessage payload survives the full send pipeline (botForwardedMessage chain)', () => {
    const jid = '6281234567890@s.whatsapp.net';

    // 1) same entry point sendMessage/builder uses
    const wam = generateWAMessageFromContent(jid, manualPayload(), { messageId: 'MANUALTEST1' });

    // 2) same encoder relayMessage uses (padded plaintext, as encrypted on the wire)
    const wire = encodeWAMessage(wam.message);

    // 3) receiving-side decoder
    const decoded = proto.Message.decode(unpadRandomMax16(wire));

    const rich = decoded.botForwardedMessage?.message?.richResponseMessage;
    assert.ok(decoded.botForwardedMessage, 'botForwardedMessage dropped');
    assert.ok(rich, 'richResponseMessage dropped');
    assert.equal(rich.messageType, 1, 'richResponseMessage.messageType dropped');
    assert.equal(
        rich.submessages?.[0]?.messageText,
        '> popioo',
        'submessages[].messageText dropped'
    );

    const unified = JSON.parse(Buffer.from(rich.unifiedResponse.data).toString('utf8'));
    assert.equal(unified.response_id, RESPONSE_ID, 'unifiedResponse.data JSON corrupted');
    assert.equal(
        unified.embedded_screens?.[0]?.content?.[0]?.tabs?.[0]?.sections?.[0]?.view_model
            ?.primitive?.__typename,
        'GenAIaeacdsnwHtmlPrimitive',
        'embedded_screens HTML primitive corrupted'
    );
    assert.equal(
        rich.contextInfo?.forwardedAiBotMessageInfo?.botJid,
        BOT_JID,
        'contextInfo.forwardedAiBotMessageInfo dropped'
    );
    assert.equal(rich.contextInfo?.forwardOrigin, 4, 'contextInfo.forwardOrigin dropped');

    const botMeta = decoded.messageContextInfo?.botMetadata;
    assert.ok(botMeta, 'messageContextInfo.botMetadata dropped');
    assert.equal(botMeta.botResponseId, BOT_RESPONSE_ID, 'botMetadata.botResponseId dropped');
    const proof = botMeta.verificationMetadata?.proofs?.[0];
    assert.ok(proof, 'verificationMetadata.proofs dropped');
    assert.equal(proof.version, 1, 'proof.version dropped');
    assert.equal(proof.useCase, 1, 'proof.useCase dropped');
    assert.ok(proof.signature?.length, 'proof.signature dropped');
    assert.equal(proof.certificateChain?.length, 2, 'proof.certificateChain dropped');
    assert.equal(
        decoded.messageContextInfo?.deviceListMetadataVersion,
        2,
        'deviceListMetadataVersion dropped'
    );
});

test('manual payload wire bytes are stable against the raw proto encoder', () => {
    // relayMessage encodes the plain object directly; ensure the wrapped
    // pipeline produces byte-identical content for the same input
    const jid = '6281234567890@s.whatsapp.net';
    const wam = generateWAMessageFromContent(jid, manualPayload(), { messageId: 'MANUALTEST2' });
    const direct = proto.Message.encode(manualPayload()).finish();
    const unwrapped = unpadRandomMax16(encodeWAMessage(wam.message));

    assert.ok(direct.length > 0);
    assert.equal(unwrapped.length, direct.length, 'padded length mismatch after unpad');
    assert.equal(
        Buffer.compare(Buffer.from(unwrapped), Buffer.from(direct)),
        0,
        'wire bytes differ between pipelines'
    );
});
