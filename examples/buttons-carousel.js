/**
 * Button & Carousel — pesan interaktif native (7.6.0, MessageBuilder 4.7)
 *
 * Button  : quick reply, URL, copy code, list/selection.
 * Carousel: kartu horizontal, tiap kartu wajib punya media di header.
 *
 * Jalankan:
 *   node examples/buttons-carousel.js
 */
import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, Button, Carousel } from '../lib/index.js'

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
    sock.ev.on('connection.update', ({ connection, qr }) => {
        if (qr) console.log('Scan QR ini di WhatsApp:', qr.slice(0, 40) + '...')
        if (connection === 'open') demo().catch(console.error)
    })

    async function demo() {
        // 1) Tombol cepat + URL + copy
        const buttons = new Button(sock)
            .setTitle('MENU UTAMA')
            .setBody('Pilih salah satu tombol di bawah.')
            .setFooter('@yudzxml/baileys 7.6.0')
            .addReply('Info Bot', 'info')
            .addReply('Ping', 'ping')
            .addUrl('Website', 'https://example.com')
            .addCopy('Copy Kode', 'YUDZ-2026')

        await buttons.send(DEMO_JID)
        console.log('button message terkirim')

        // 2) List / selection
        const list = new Button(sock)
            .setTitle('DAFTAR MENU')
            .setBody('Pilih satu menu dari daftar.')
            .addSelection('Buka Menu')
            .makeSection('Umum')
            .makeRow('', 'Menu 1', 'Deskripsi menu 1', 'menu1')
            .makeRow('', 'Menu 2', 'Deskripsi menu 2', 'menu2')
            .makeSection('Lainnya')
            .makeRow('', 'Bantuan', 'Cara pakai bot', 'help')

        await list.send(DEMO_JID)
        console.log('list message terkirim')

        // 3) Carousel — setiap kartu harus punya gambar/video di header
        const card1 = await new Button(sock)
            .setImage('https://example.com/card1.jpg') // ganti URL gambar asli
            .setBody('Kartu pertama')
            .addReply('Pilih', 'card_1')
            .toCard()

        const card2 = await new Button(sock)
            .setImage('https://example.com/card2.jpg')
            .setBody('Kartu kedua')
            .addUrl('Buka', 'https://example.com')
            .toCard()

        const carousel = new Carousel(sock)
            .setBody('Pilih salah satu kartu.')
            .setFooter('Carousel 7.6.0')
            .addCard([card1, card2])

        await carousel.send(DEMO_JID)
        console.log('carousel terkirim')
    }
}

main().catch(console.error)
