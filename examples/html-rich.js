/**
 * HTML Mini App — kirim halaman HTML interaktif (7.6.0, engine Elaina 1.3.9)
 *
 * Halaman HTML+CSS+JS utuh dikirim verbatim lewat GenAIaeacdsnwHtmlPrimitive
 * dan dirender sebagai WebView native oleh WhatsApp ANDROID.
 * Catatan: WA Web/Desktop/iOS hanya menampilkan label teksnya saja.
 *
 * Jalankan:
 *   node examples/html-rich.js
 */
import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, sendHtmlApp, checkHtmlApp } from '../lib/index.js'

const DEMO_JID = '628xxxxxxx@s.whatsapp.net' // ganti dengan nomor tujuan

const html = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: sans-serif; background: #0f172a; color: #e2e8f0;
         display: flex; flex-direction: column; align-items: center; justify-content: center;
         height: 240px; margin: 0; }
  h2 { margin: 0 0 8px; color: #38bdf8; }
  button { margin-top: 12px; padding: 8px 18px; border: 0; border-radius: 8px;
           background: #38bdf8; color: #0f172a; font-weight: 700; }
  span { font-size: 40px; font-weight: 800; }
</style>
</head>
<body>
  <h2>COUNTER MINI APP</h2>
  <span id="n">0</span>
  <button onclick="bump()">+1</button>
  <script>
    let x = 0
    function bump() { document.getElementById('n').textContent = ++x }
  </script>
</body>
</html>`

async function main() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info')
    const { version } = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false
    })

    sock.ev.on('creds.update', saveCreds)
    sock.ev.on('connection.update', async ({ connection, qr }) => {
        if (qr) console.log('Scan QR ini di WhatsApp:', qr.slice(0, 40) + '...')
        if (connection !== 'open') return

        // Opsional: pre-flight check (ukuran wire, remote resource, dsb.)
        const report = checkHtmlApp(html, { height: 260 })
        console.log('checkHtmlApp:', report.ok ? 'OK' : report.problems, report.warnings)

        // Kirim mini app — default 1x relay (tanpa edit ulang).
        // bypassDownload: true kalau kartu tidak muncul tanpa edit (2x relay).
        const sent = await sendHtmlApp(sock, DEMO_JID, html, {
            title: 'DEMO MINI APP 7.6.0',   // baris disclaimer di atas kartu
            label: 'Counter',               // fallback teks untuk WA Web/Desktop
            trustedSources: ['example.com'],
            height: 260                     // piksel — cegah card "shudder"
        })
        console.log('HTML mini app terkirim:', sent.key.id)

        // Dua cara lain:
        // await sock.sendHtmlApp(DEMO_JID, html, { label: 'Counter' })  // shim socket
        // import { htmlSection, AIRich } ...                            // gabung ke builder
        // const rich = new AIRich(sock).addText('Menemani mini app:')
        //                        .addSection(htmlSection(html, { height: 260 }))
        // await rich.send(DEMO_JID)
    })
}

main().catch(console.error)
