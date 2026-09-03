/**
 * examples/html-rich.js
 * Yudzxml@Changes 03-09-26
 *
 * HTML Rich Message / HTML Mini App demo (GenAIaeacdsnwHtmlPrimitive).
 *
 * Demonstrates:
 *   1. sock.sendUnifiedResponse(jid, { text, sections: [RichBuilder.html(html)] })
 *   2. sock.sendHtmlApp(jid, html, options)  — one-shot helper with the
 *      bypassDownload MESSAGE_EDIT follow-up (recommended for mini apps)
 *   3. decodeHtmlRich() capture of incoming HTML rich responses
 *
 * The HTML below covers: static layout, CSS, JavaScript, button, counter
 * and an animated canvas — all inside the primitive payload (never markdown,
 * never a code block, never the plain text field).
 *
 * Run: DEMO_JID=628xxxxxxxxxx@s.whatsapp.net node examples/html-rich.js
 */
import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, RichBuilder, decodeHtmlRich } from '../lib/index.js';
import pino from 'pino';

const DEMO_JID = process.env.DEMO_JID; // any chat JID you want to send the demos to

// ------------------------------------------------------------------
// Simple HTML mini app: static + CSS + JS + button + counter + canvas animation
// ------------------------------------------------------------------
const html = `
<!DOCTYPE html>
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

<canvas id="fx" width="240" height="120"></canvas>

<script>
let count = 0

function add() {
  count++

  document.getElementById('count')
    .textContent = count
}

const canvas = document.getElementById('fx')
const ctx = canvas.getContext('2d')
let t = 0

function loop() {
  t += 0.05
  ctx.fillStyle = '#111'
  ctx.fillRect(0, 0, 240, 120)

  ctx.fillStyle = '#25D366'
  for (let i = 0; i < 5; i++) {
    const x = 20 + i * 50
    const y = 60 + Math.sin(t + i) * 30
    ctx.beginPath()
    ctx.arc(x, y, 8, 0, Math.PI * 2)
    ctx.fill()
  }
  requestAnimationFrame(loop)
}
loop()
</script>

</body>
</html>
`;

const run = async () => {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_html_rich');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ['HTML Rich Example', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    // Capture / decode — every incoming HTML mini app is extracted back to plain HTML
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const msg of messages) {
            const decoded = decodeHtmlRich(msg); // never throws
            if (decoded.found) {
                console.log('=== HTML MINI APP CAPTURED (GenAIaeacdsnwHtmlPrimitive) ===');
                console.log('responseId:', decoded.responseId);
                console.log('trustedSources:', decoded.trustedSources);
                console.log('html length:', decoded.html?.length, 'chars');
                console.log(decoded.html);
            }
        }
    });

    await new Promise((resolve, reject) => {
        sock.ev.on('connection.update', function listener({ connection, lastDisconnect }) {
            if (connection === 'open') {
                sock.ev.off('connection.update', listener);
                resolve();
            } else if (connection === 'close' && lastDisconnect?.error?.output?.statusCode !== 401) {
                reject(lastDisconnect?.error);
            }
        });
    });

    if (!DEMO_JID) {
        console.log('Set DEMO_JID to send the demos, e.g. DEMO_JID=62812xxxx@s.whatsapp.net');
        sock.end(undefined);
        return;
    }

    // 1. sendUnifiedResponse + RichBuilder.html
    await sock.sendUnifiedResponse(DEMO_JID, {
        text: 'YUDZXML HTML RICH',
        sections: [RichBuilder.html(html)]
    });
    console.log('[1] sendUnifiedResponse + RichBuilder.html sent');

    await new Promise(r => setTimeout(r, 2000));

    // 2. sendHtmlApp — one-shot helper (relay + bypassDownload MESSAGE_EDIT follow-up)
    await sock.sendHtmlApp(DEMO_JID, html, {
        title: 'YUDZXML HTML APP',
        text: 'Demo counter + canvas animation',
        height: 420 // optional: lock the app to a fixed height with a scroll shim
    });
    console.log('[2] sendHtmlApp sent');

    console.log('Done. Open WhatsApp on Android — the HTML should render as an interactive mini app.');
    await new Promise(r => setTimeout(r, 3000));
    sock.end(undefined);
};

run().catch(err => {
    console.error(err);
    process.exit(1);
});
