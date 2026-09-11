/**
 * AI Rich Response — full MessageBuilder demo (7.6.0, Elaina 4.7 engine)
 *
 * Menampilkan kemampuan AIRich: text, code, table, layout, live-edit
 * via sendEdit(), dan pembacaan pesan rich masuk (decodeAIRich).
 *
 * Jalankan:
 *   node examples/ai-rich.js
 */
import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, AIRich, decodeAIRich } from '../lib/index.js'

const DEMO_JID = '628xxxxxxx@s.whatsapp.net' // ganti dengan nomor tujuan

async function main() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info')
    const { version } = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false
    })

    sock.ev.on('creds.update', saveCreds)
    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
        if (qr) console.log('Scan QR ini di WhatsApp (Perangkat Tertaut):', qr.slice(0, 40) + '...')
        if (connection === 'open') demo().catch(console.error)
        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode
            console.log('connection closed, statusCode =', code)
        }
    })

    async function demo() {
        // 1) Rich response dasar: teks + kode + tabel
        const rich = new AIRich(sock)
            .setTitle('DEMO RICH 7.6.0') // disclaimer di atas kartu
            .setFooter('Dibuat dengan @yudzxml/baileys')
            .addText('Halo! Ini *AI Rich Response* bawaan.')
            .addCode('javascript', 'console.log("hello dari rich message")')
            .addTable([
                ['Fitur', 'Status'],
                ['AIRich', 'OK'],
                ['HTML Mini App', 'OK']
            ])

        const sent = await rich.send(DEMO_JID)
        console.log('rich message terkirim:', sent.key.id)

        // 2) Live edit — kartu yang sama diubah setelah terkirim.
        //    sendEdit() memakai key pesan terakhir, tidak perlu argumen.
        const live = new AIRich(sock)
            .setTitle('PROGRESS')
            .addText('Memproses...', { id: 'status' })
        await live.send(DEMO_JID)

        live.addText('Selesai! (baris ini hasil edit)', { insertAt: 'status', id: 'done' })
        await live.sendEdit()

        live.delete('status')
        await live.sendEdit()
        console.log('pesan di-edit dua kali secara live (sendEdit)')

        // 3) Baca pesan rich yang masuk
        sock.ev.on('messages.upsert', ({ messages }) => {
            for (const m of messages) {
                const decoded = decodeAIRich(m)
                if (decoded) {
                    console.log('rich message masuk:',
                        'layout =', decoded.layouts.join(','),
                        '| primitif =', decoded.typenames.join(','))
                }
            }
        })
    }
}

main().catch(console.error)
