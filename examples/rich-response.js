/**
 * examples/rich-response.js
 * Yudzxml@Changes 02-09-26
 *
 * Demonstrates the native AI Rich Response / Unified Response support:
 *   1. Rich Markdown (GenAIMarkdownTextUXPrimitive)
 *   2. Rich Table   (GenATableUXPrimitive)
 *   3. Rich Code    (GenAICodeUXPrimitive)
 *   4. Unified Response with mixed sections (text/image/divider/footer action)
 *   5. decode/capture of incoming Unified Responses
 *
 * Run: node examples/rich-response.js
 *
 * NOTE ON GAMES: the WhatsApp game card UI ("jogo da velha" style boards) uses a
 * schema that is NOT yet publicly documented/verified (no GenAIGameUXPrimitive exists).
 * Until you capture a real payload, the closest verified approximation is the
 * markdown/table/image sections shown below. See README "AI Rich Response".
 */
import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, RichBuilder, decodeUnifiedResponse, captureUnifiedResponse } from '../lib/index.js';
import pino from 'pino';

const DEMO_JID = process.env.DEMO_JID; // any chat JID you want to send the demos to

const run = async () => {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_rich_response');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ['Rich Response Example', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    // ------------------------------------------------------------------
    // 5. CAPTURE / DECODE — log any incoming AI rich response in full detail
    // ------------------------------------------------------------------
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const msg of messages) {
            // decodeUnifiedResponse never throws — malformed payloads are reported, not raised
            const decoded = captureUnifiedResponse(msg);
            if (decoded.found) {
                console.log('=== AI RICH RESPONSE CAPTURED ===');
                console.log(JSON.stringify(decoded, (key, value) => (key === 'base64' || key === 'hex' ? `[${value.length} chars]` : value), 2));
            }
        }
    });

    // ------------------------------------------------------------------
    // Demo runner — waits for connection, then sends every primitive kind
    // ------------------------------------------------------------------
    await new Promise((resolve, reject) => {
        sock.ev.on('connection.update', function listener({ connection }) {
            if (connection === 'open') {
                sock.ev.off('connection.update', listener);
                resolve();
            }
            else if (connection === 'close') {
                reject(new Error('connection closed'));
            }
        });
    });

    if (!DEMO_JID) {
        console.log('Set DEMO_JID env var to send the demos to a chat. Only capture/decode mode is active.');
        return;
    }

    // ------------------------------------------------------------------
    // 1. Rich Markdown — a single markdown text primitive
    // ------------------------------------------------------------------
    await sock.sendUnifiedResponse(DEMO_JID, {
        text: '*MEGUMIN ARCADE*\nSelamat datang di arcade _rich response_!'
    });

    // ------------------------------------------------------------------
    // 2. Rich Table — GenATableUXPrimitive (first row = header)
    // ------------------------------------------------------------------
    await sock.sendUnifiedResponse(DEMO_JID, {
        text: 'MEGUMIN RICH XO — scoreboard',
        sections: [
            RichBuilder.table([
                ['Jogador', 'Vitórias'],
                ['Megumin', '10'],
                ['Explosion', '42']
            ], 'PLACAR')
        ]
    });

    // ------------------------------------------------------------------
    // 3. Rich Code — GenAICodeUXPrimitive with syntax highlighting
    // ------------------------------------------------------------------
    await sock.sendUnifiedResponse(DEMO_JID, {
        text: 'The board renderer:',
        sections: [
            RichBuilder.code([
                'function render(board) {',
                '  return board.map(cell => cell ?? "·").join(" ");',
                '}',
                '// X O X',
                '// O X O'
            ].join('\n'), 'javascript')
        ]
    });

    // ------------------------------------------------------------------
    // 4. Unified Response — mixed sections (image/divider/footer are
    //    JSON-only primitives; text/table/code are proto-backed too)
    // ------------------------------------------------------------------
    await sock.sendUnifiedResponse(DEMO_JID, {
        text: '*MEGUMIN ARCADE*\nJOGO DA VELHA',
        sections: [
            RichBuilder.image('https://example.com/xo-board.png', 'image/png'),
            RichBuilder.table([
                ['X', 'O', 'X'],
                ['O', 'X', 'O'],
                [' ', 'X', ' ']
            ], '3x3 BOARD', true),
            RichBuilder.divider(),
            RichBuilder.markdown('CONTRA IA  •  2 JOGADORES'),
            RichBuilder.footerAction('NOVA RODADA', 'https://example.com/new-round')
        ],
        disclaimerText: 'Rich response demo'
    });

    // Advanced API forms also available:
    //   await sock.sendUnifiedResponse(DEMO_JID, 'MEGUMIN RICH XO', [RichBuilder.markdown('...')]);
    //   await sock.sendMessage(DEMO_JID, { unifiedResponse: { text: 'hello', sections: [...] } });

    console.log('Rich response demos sent. Now trigger an AI rich response in any chat to see it captured.');
};

run().catch(console.error);
