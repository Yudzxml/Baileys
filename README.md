<div align="center">

# 🚀 Yudzxml — Advanced WhatsApp Web API

<!-- TULISAN ANIMASI (Typewriter Effect) -->
<p>
  <img src="https://readme-typing-svg.demolab.com/?font=Fira+Code&weight=600&size=28&duration=3000&pause=1000&color=58A6FF&center=true&vCenter=true&width=800&lines=Advanced+WhatsApp+Web+API;Native+AI+Rich+Response+%26+HTML+Mini+Apps;Built+with+TypeScript+%26+Baileys;Lightweight+%7C+Efficient+%7C+Stable" alt="Typing Animation" />
</p>

<!-- BADGES -->
<img src="https://img.shields.io/npm/dw/%40yudzxml%2Fbaileys?label=NPM&color=%23CB3837" alt="NPM Downloads"/>
<img src="https://img.shields.io/github/v/release/Yudzxml/baileys?include_prereleases&sort=semver" alt="Latest Release"/>
<img src="https://img.shields.io/github/languages/code-size/Yudzxml/baileys" alt="Code Size"/>
<img src="https://img.shields.io/github/license/Yudzxml/baileys" alt="License"/>
<img src="https://img.shields.io/github/stars/Yudzxml/baileys" alt="Stars"/>
<img src="https://img.shields.io/github/forks/Yudzxml/baileys" alt="Forks"/>
<img src="https://img.shields.io/node/v/%40yudzxml%2Fbaileys?label=Node.js&color=%23339933" alt="Node Version"/>
<img src="https://img.shields.io/badge/TypeScript-Ready-3178C6?logo=typescript&logoColor=white" alt="TypeScript"/>

<br/>
<br/>

<!-- FOTO / VISUAL SHOWCASE -->
### 📸 Project Showcase

<img src="https://cdn.dyxzy.my.id/files/944f6b8d.png" alt="WhatsApp Interface" width="800" />
<br/>
<small><i>Native WhatsApp Experience integrated into your project</i></small>

<br/>

**Yudzxml** (`@yudzxml/baileys`) is a powerful, lightweight, and efficient library for interacting with the **WhatsApp Web multi-device API** — no Selenium, no Chromium, no headless browser. It connects over a raw WebSocket, speaks WhatsApp's native binary + protobuf protocol, and exposes a fully typed, event-driven JavaScript/TypeScript API.

On top of the Baileys ecosystem, this fork introduces its own enhancements:

- 🤖 **Native AI Rich Response / Unified Response** (`sendUnifiedResponse` + `RichBuilder`) — the styled *Meta AI* message format.
- 🌐 **HTML Mini Apps** (`sendHtmlApp`) — full interactive HTML/CSS/JS rendered as a native WebView inside WhatsApp Android.
- 🧩 **Dugong engine** — automatic handling of Albums, Carousels, Events, Payments, Products, Poll Results, and Group Stories.
- 🏘️ **Complete Communities, Newsletter, Business & Privacy APIs**.
- 🔐 **Three auth-state backends** — multi-file, single-file JSON, and SQLite.
- 🎫 **Custom 8-character pairing codes**.

</div>

---

## ⚠️ Disclaimer & Liability

This library is a community-driven project and is **in no way affiliated with, endorsed by, or sponsored by WhatsApp Inc. or Meta**. It is an unofficial, reverse-engineered API. Use at your own discretion.

**Important Guidelines:**

- Do **not** use this library for spamming, bulk messaging, stalkerware, or any activity that violates WhatsApp's [Terms of Service](https://www.whatsapp.com/legal/terms-of-service).
- The developers are **not liable** for any misuse of this software, including account bans. Please refer to the [MIT License](LICENSE) for details.
- Users are fully responsible for ensuring their usage complies with applicable laws and WhatsApp's policies.

---

## 📋 Table of Contents

- [Features](#-features)
- [Installation](#-installation)
- [Quick Start](#-quick-start)
- [Authentication](#-authentication)
    - [QR Code](#1-using-qr-code)
    - [Pairing Code](#2-using-pairing-code)
    - [Custom Pairing Code](#3-custom-pairing-code)
    - [Auth State Options](#auth-state-options)
- [Configuration](#-configuration)
- [Handling Events](#-handling-events)
- [Sending Messages](#-sending-messages)
    - [Text, Media & Basic Types](#text--mentions)
    - [Buttons, Lists & Interactive Flows](#interactive-buttons)
    - [Album, Event, Poll & Group Status](#album-messages)
    - [Business Messages](#shop--collection-messages)
- [Communities](#-communities--newsletters)
- [Newsletters](#newsletter--channel-management)
- [Groups & Privacy](#-groups--privacy)
- [AI Rich Response](#-ai-rich-response)
    - [Unified Response & RichBuilder](#sending-a-unified-response)
    - [HTML Mini App](#html-mini-app--html-rich-message-genaiaeacdsnwhtmlprimitive)
    - [Decoding & Capture](#capture--decode-incoming-responses)
- [Project Structure](#%EF%B8%8F-project-structure)
- [Examples & Tests](#-examples--tests)
- [Troubleshooting & FAQ](#-troubleshooting--faq)
- [Contributing](#-contributing)
- [License](#-license)

---

## ✨ Features

### Core
| Feature | Description |
|---|---|
| ⚡ **Lightweight** | Direct WebSocket connection — no Selenium, no Chromium, no headless browser. |
| 🧠 **Efficient** | Drastically lower RAM usage compared to browser-based automation. |
| 📱 **Multi-Device** | Full support for WhatsApp Multi-Device (MD) protocols. |
| 🔒 **End-to-End Encrypted** | Complete Signal protocol implementation (1:1, groups, sender-key). |
| 🛡️ **Type-Safe** | Written in TypeScript with full IntelliSense / `index.d.ts` support. |
| 🔄 **Auto Reconnect** | Built-in reconnect, session recreation, and message retry logic. |

### Messaging
| Feature | Description |
|---|---|
| 💬 **All Message Types** | Text, media, audio, voice notes, stickers, documents, contacts, locations, reactions. |
| 🔘 **Interactive UI** | Buttons, list sections, native flows (CTA URL/Copy/Call/Catalog), carousels. |
| 🖼️ **Albums** | Native multi-image/video album messages (minimum 2 media). |
| 📊 **Polls & Events** | Create polls with aggregate vote decryption, send calendar events. |
| 👥 **Group Status** | Post stories to groups (text, image, video). |
| 🛍️ **Business** | Products, catalogs, collections, shop messages, orders, invoices. |
| 📌 **Message Ops** | Pin/unpin, keep, delete-for-everyone, forward, disappearing messages. |

### Exclusive Enhancements
| Feature | Description |
|---|---|
| 🤖 **AI Rich Response** | Native `sendUnifiedResponse` + `RichBuilder` for Meta AI style unified responses (markdown, code, tables, LaTeX, inline images, carousels). |
| 🌐 **HTML Mini App** | `sendHtmlApp` — full interactive HTML/CSS/JS rendered as a native WebView mini app on WhatsApp Android (`GenAIaeacdsnwHtmlPrimitive`). |
| 🧩 **Dugong Engine** | Auto-detects & relays special types: `PAYMENT`, `PRODUCT`, `GROUP_INVITE`, `INTERACTIVE_BUTTONS`, `CAROUSEL`, `INTERACTIVE`, `ALBUM`, `EVENT`, `POLL_RESULT`, `GROUP_STORY`. |
| 🏘️ **Communities API** | Create, link/unlink groups, approval modes, participant requests, invite codes. |
| 📢 **Newsletter API** | Create channels, follow/unfollow, react, fetch messages, mute, admin info. |
| 🔐 **Flexible Auth States** | Multi-file folder, single JSON file, or SQLite storage. |
| 🎫 **Custom Pairing Code** | Request your own 8-character alphanumeric pairing code. |
| 📡 **WMex Queries** | Direct access to WhatsApp Metadata Exchange API (`executeWMexQuery`). |

---

## 📦 Installation

> **Requirement:** Node.js **>= 20.0.0** (enforced on `preinstall` via `engine-requirements.js`)

### Stable Version (NPM)

```bash
yarn add @yudzxml/baileys
# or
npm install @yudzxml/baileys
```

### Edge Version (Latest Features)

```bash
yarn add github:Yudzxml/baileys
# or pin to a release tag
yarn add github:Yudzxml/baileys#v7.5.0
```

### Optional Peer Dependencies

These are **optional** — install only the ones you need:

| Package | Purpose |
|---|---|
| `sharp` | Fast media thumbnail generation (recommended for bots). |
| `jimp` | Pure-JS image processing (fallback for sharp). |
| `@napi-rs/image` | Native image resize/compression. |
| `audio-decode` | Audio decoding for waveform generation. |
| `link-preview-js` | Automatic link previews for URLs. |
| `better-sqlite3` | Required only if you use `useSqliteAuthState`. |

```bash
npm install sharp link-preview-js   # example: the common duo for bots
```

### Basic Import

```ts
import makeWASocket from '@yudzxml/baileys'

// or CommonJS
const makeWASocket = require('@yudzxml/baileys').default
```

---

## 🚀 Quick Start

Clone, install, and try the bundled examples:

```bash
git clone https://github.com/Yudzxml/baileys.git
cd baileys
yarn install

npm test                        # run the test suite
node examples/rich-response.js  # AI Rich Response demo
node examples/html-rich.js      # HTML Rich Message demo
```

All HTML mini app examples accept a `DEMO_JID` environment variable as the target chat:

```bash
DEMO_JID=628xxxxxxxxxx@s.whatsapp.net node examples/html-snake.js
```

### Minimal Connection Example

```ts
import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} from '@yudzxml/baileys'
import { Boom } from '@hapi/boom'

async function startConnection() {
    // 1. Load (or create) the saved credentials
    const { state, saveCreds } = await useMultiFileAuthState('auth_info')

    // 2. Fetch the latest WhatsApp Web version
    const { version } = await fetchLatestBaileysVersion()

    // 3. Open the socket
    const sock = makeWASocket({
        version,
        auth: state
    })

    // 4. Handle connection lifecycle
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update

        if (qr) {
            // Render the QR string yourself (qrcode-terminal, qrcode, ...)
            console.log('Scan this QR:', qr)
        }

        if (connection === 'close') {
            const shouldReconnect =
                (lastDisconnect.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut
            console.log('Connection closed. Reconnecting:', shouldReconnect)
            if (shouldReconnect) startConnection()
        } else if (connection === 'open') {
            console.log('✅ Connected as', sock.user?.id)
        }
    })

    // 5. Persist credential updates
    sock.ev.on('creds.update', saveCreds)
}

startConnection()
```

> ⚠️ The legacy `printQRInTerminal` config option is **deprecated** in this version. Listen to the `qr` field of the `connection.update` event and render the QR yourself.

## 🔐 Authentication

### 1. Using QR Code

```ts
import makeWASocket, { Browsers } from '@yudzxml/baileys'

const sock = makeWASocket({
    browser: Browsers.ubuntu('Yudzxml Bot'),
    // handle the QR via connection.update (see Minimal Connection Example)
})
```

Available browser presets: `Browsers.windows()`, `Browsers.macOS()`, `Browsers.ubuntu()`, `Browsers.baileys()`, `Browsers.appropriate()` — pass a custom app name string if needed.

### 2. Using Pairing Code

No QR scanner needed — link the device by phone number:

```ts
const sock = makeWASocket({})

if (!sock.authState.creds.registered) {
    const phoneNumber = '6281234567890' // Format: CountryCode + Number (no +, no spaces)
    const code = await sock.requestPairingCode(phoneNumber)
    console.log('Pairing Code:', code) // enter this on the phone: Linked Devices → Link with phone number
}
```

### 3. Custom Pairing Code

Request your **own** 8-character pairing code — must be exactly 8 alphanumeric characters, otherwise the library throws:

```ts
const code = await sock.requestPairingCode('6281234567890', 'YUDZXML1')
console.log('Custom Pairing Code:', code)
```

### Auth State Options

Choose how credentials (identity keys, session keys, registration data) are persisted:

```ts
// 1) Multi-file auth state (default) — a folder of session files
//    Pros: atomic writes, widely battle-tested
import { useMultiFileAuthState } from '@yudzxml/baileys'
const { state, saveCreds } = await useMultiFileAuthState('auth_info')

// 2) Single-file auth state — everything in one JSON file
//    Pros: trivial to back up / copy between machines
import { useSingleFileAuthState } from '@yudzxml/baileys'
const { state, saveCreds } = await useSingleFileAuthState('auth.json')

// 3) SQLite auth state — keys stored in a SQLite database
//    Pros: fast for large sessions; requires better-sqlite3 (optional peer dep)
import { useSqliteAuthState } from '@yudzxml/baileys'
const { state, saveCreds } = await useSqliteAuthState({ /* sqlite options */ })
```

> 💡 Always wire `sock.ev.on('creds.update', saveCreds)` — otherwise the session cannot be restored after restart and you will have to scan the QR again.

---

## ⚙️ Configuration

`makeWASocket(config)` accepts the following options (defaults shown from `lib/Defaults`):

| Option | Type | Default | Description |
|---|---|---|---|
| `auth` | `AuthenticationState` | — | Creds + keys from an auth-state helper (**required**). |
| `version` | `[number, number, number]` | latest WA Web | WA Web protocol version. Use `fetchLatestBaileysVersion()`. |
| `browser` | `WABrowserDescription` | `Browsers.macOS('Chrome')` | Browser identity sent during handshake. |
| `waWebSocketUrl` | `string \| URL` | `wss://web.whatsapp.com/ws/chat` | WebSocket endpoint. Supports proxy via `ws` URL. |
| `connectTimeoutMs` | `number` | `20000` | Timeout for the initial WS connection. |
| `keepAliveIntervalMs` | `number` | `15000` | Interval for keep-alive pings. |
| `defaultQueryTimeoutMs` | `number` | `60000` | Timeout for generic queries (`query`, `sendMessage`...). |
| `logger` | `Logger` | pino child | Logger instance (pino-compatible). |
| `emitOwnEvents` | `boolean` | `true` | Whether messages sent by this account emit events. |
| `markOnlineOnConnect` | `boolean` | `true` | Set `false` to not broadcast presence (phone shows original status). |
| `syncFullHistory` | `boolean` | `true` | Request full message history sync. |
| `fireInitQueries` | `boolean` | `true` | Run initial app-state & account queries on connect. |
| `maxMsgRetryCount` | `number` | `3` | Retries per message on failure. |
| `retryRequestDelayMs` | `number` | `250` | Base delay between retry requests. |
| `getMessage` | `async (key) => msg` | `async () => undefined` | **Important:** hook to your store — used for retries & poll decryption. |
| `cachedGroupMetadata` | `async (jid) => metadata` | — | Group metadata cache hook (recommended, see below). |
| `shouldIgnoreJid` | `(jid) => boolean` | `() => false` | Skip processing of matching JIDs (spam/announcement filtering). |
| `shouldSyncHistoryMessage` | `(msg) => boolean` | skips `FULL` | Which history-sync payloads to process. |
| `patchMessageBeforeSending` | `(msg) => msg` | identity | Patch outgoing messages (required for some interactive types on certain clients). |
| `generateHighQualityLinkPreview` | `boolean` | `true` | Higher-resolution link preview thumbnails. |
| `linkPreviewImageThumbnailWidth` | `number` | `480` | Link preview thumbnail width. |
| `enableAutoSessionRecreation` | `boolean` | `true` | Auto-rebuild Signal sessions on `BadMAC` errors. |
| `enableRecentMessageCache` | `boolean` | `true` | Cache recent messages for retry handling. |
| `eventBufferTimeoutMs` | `number` | `30000` | Buffer window for coalescing app-state events (raise for heavy bots). |
| `statusBroadcastDelayMs` | `number` | `1500` | Delay between status broadcasts. |
| `albumDelayMs` | `number` | `1500` | Delay between album media uploads. |
| `phashRetryEnabled` | `boolean` | `false` | Perceptual-hash retry on message ack (⚠️ can loop if misused). |
| `customUploadHosts` | `MediaHostInfo[]` | `[]` | Custom media upload hosts. |
| `transactionOpts` | `object` | `{maxCommitRetries: 10, delayBetweenTriesMs: 3000}` | App-state transaction tuning. |
| `appStateMacVerification` | `object` | `{patch: false, snapshot: false}` | Enable MAC verification for app-state patches/snapshots. |
| `countryCode` | `string` | `'US'` | Region hint used for phone-number queries. |
| `makeSignalRepository` | `() => repository` | libsignal impl | Custom Signal storage backend. |
| `qrTimeout` | `number` | — | Timeout for QR generation. |
| `printQRInTerminal` | — | ⚠️ **deprecated** | No longer prints QR automatically — handle `connection.update` yourself. |

### Recommended Production Config

```ts
import { NodeCache } from '@cacheable/node-cache'
import makeWASocket, { fetchLatestBaileysVersion, useMultiFileAuthState } from '@yudzxml/baileys'

const groupCache = new NodeCache({ stdTTL: 5 * 60, useClones: false })
const store = makeInMemoryStore({ /* ... */ })

const { state, saveCreds } = await useMultiFileAuthState('auth_info')
const { version } = await fetchLatestBaileysVersion()

const sock = makeWASocket({
    version,
    auth: state,
    cachedGroupMetadata: async (jid) => groupCache.get(jid),
    getMessage: async (key) => store?.loadMessage(key.remoteJid, key.id)?.message,
    markOnlineOnConnect: false,       // don't broadcast online presence
    syncFullHistory: false,           // lighter startup for bots
    patchMessageBeforeSending: (msg) => {
        // required for some interactive message types on WhatsApp iOS/Android
        const requiresPatch = !!(msg.buttonsMessage || msg.listMessage || msg.interactiveMessage)
        if (requiresPatch) msg = { viewOnceMessage: { message: { messageContextInfo: { deviceSentMessage: { destinationJid: '' } }, message: msg } } }
        return msg
    }
})

sock.ev.on('groups.update', async (events) => {
    for (const event of events) {
        groupCache.set(event.id, await sock.groupMetadata(event.id))
    }
})
```

## 📡 Handling Events

Yudzxml uses an **event-driven architecture** — everything flows through `sock.ev`:

```ts
sock.ev.on('<event-name>', handler)
```

### Event Reference

| Event | Fired when |
|---|---|
| `connection.update` | Socket state changes: `connection` (`connecting`/`open`/`close`), `qr`, `receivedPendingNotifications`, `lastDisconnect`. |
| `creds.update` | Credentials updated (pairing code, keys, pushname...) — always call `saveCreds`. |
| `messages.upsert` | New incoming/outgoing messages (`type: 'notify'` for realtime, `'append'` for history). |
| `messages.update` | Message edits: reactions, poll updates, media retry, deletions, status transitions. |
| `messages.delete` | Message deleted for everyone / chat cleared. |
| `messages.reaction` | Reaction changes. |
| `messages.media-update` | Media upload/retry state changes. |
| `message-receipt.update` | Delivery/read receipts. |
| `message-capping.update` | Message storage capping info. |
| `groups.upsert` | Bot added to new group(s). |
| `groups.update` | Group metadata changed (subject, description, settings, participants). |
| `group-participants.update` | Participants added/removed/promoted/demoted. |
| `group.join-request` | Group join requests (approve/reject via `groupRequestParticipantsUpdate`). |
| `group.member-tag.update` | Group member labels changed. |
| `blocklist.update` | Blocklist changed. |
| `call` | Incoming call offers (accept/reject via `rejectCall`). |
| `presence.update` | Contact presence/typing. |
| `chats.upsert` / `chats.update` | Chat list added/updated. |
| `contacts.upsert` / `contacts.update` | Contact list added/updated. |
| `labels.edit` / `labels.association` | Labels (chat/message labels) changed. |
| `messaging-history.set` | History sync chunk processed. |
| `messaging-history.status` | History sync progress/status. |
| `newsletter-participants.update` | Newsletter subscribers changed. |
| `newsletter-settings.update` | Newsletter settings changed. |
| `newsletter.reaction` / `newsletter.view` | Newsletter message reactions / views. |
| `lid-mapping.update` | LID ↔ phone-number mapping updates. |

### Listening to Messages

```ts
sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type === 'notify') {
        for (const msg of messages) {
            if (!msg.key.fromMe && !msg.key.remoteJid.includes('status')) {
                console.log('Received:', msg.message?.conversation || getContentType(msg.message!))
            }
        }
    }
})
```

### Decrypting Poll Votes

```ts
import { getAggregateVotesInPollMessage } from '@yudzxml/baileys'

sock.ev.on('messages.update', async (updates) => {
    for (const { key, update } of updates) {
        if (update.pollUpdates) {
            const pollCreation = await getMessageFromStore(key) // your getMessage store
            if (pollCreation) {
                const pollUpdate = await getAggregateVotesInPollMessage({
                    message: pollCreation,
                    pollUpdates: update.pollUpdates,
                })
                console.log('Poll Results:', pollUpdate)
            }
        }
    }
})
```

---

## 💬 Sending Messages

Everything is unified through one function: `sock.sendMessage(jid, content, options?)`.

### Text & Mentions

```ts
await sock.sendMessage(jid, {
    text: 'Hello @user! Check https://yudzxml.com',
    mentions: ['6281234567890@s.whatsapp.net']
})
```

### Media Messages

```ts
// Image with caption
await sock.sendMessage(jid, {
    image: { url: 'https://example.com/image.jpg' }, // or Buffer / local path
    caption: 'Here is the image'
})

// Video (GIF playback)
await sock.sendMessage(jid, {
    video: { url: 'https://example.com/video.mp4' },
    gifPlayback: true,
    caption: 'GIF'
})

// Audio / voice note (PTT)
await sock.sendMessage(jid, {
    audio: { url: './audio.mp3' },
    mimetype: 'audio/mp4',
    ptt: true // voice note bubble
})

// Sticker
await sock.sendMessage(jid, { sticker: { url: './sticker.webp' } })

// Document with filename
await sock.sendMessage(jid, {
    document: { url: './file.pdf' },
    mimetype: 'application/pdf',
    fileName: 'report.pdf'
})
```

### Interactive Buttons

```ts
await sock.sendMessage(jid, {
    text: 'Select an option:',
    footer: 'Powered by Yudzxml',
    buttons: [
        { buttonId: 'id1', buttonText: { displayText: 'Option 1' }, type: 1 },
        { buttonId: 'id2', buttonText: { displayText: 'Option 2' }, type: 1 }
    ]
})
```

### List Messages

```ts
await sock.sendMessage(jid, {
    text: 'Here is our menu:',
    buttonText: 'View Menu',
    sections: [
        {
            title: 'Category 1',
            rows: [
                { title: 'Item 1', rowId: 'row1', description: 'Description 1' },
                { title: 'Item 2', rowId: 'row2', description: 'Description 2' }
            ]
        }
    ]
})
```

### Custom Interactive Messages (Native Flows)

Complex native flows — URL, Copy, Call, Catalog, Address, quick replies:

```ts
await sock.sendMessage(jid, {
    text: 'Interactive Body',
    footer: 'Footer',
    title: 'Title',
    interactiveButtons: [
        {
            name: 'cta_url',
            buttonParamsJson: JSON.stringify({
                display_text: 'Visit Website',
                url: 'https://yudzxml.com'
            })
        },
        {
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({
                display_text: 'Confirm',
                id: 'confirm_id'
            })
        }
    ]
})
```

### Carousel Messages

```ts
await sock.sendMessage(jid, {
    text: 'Choose a product',
    title: 'Catalog',
    interactiveMessage: {
        carouselMessage: {
            cards: [
                {
                    product: { productImage: { url: '...' }, productId: '...' },
                    title: 'Product 1',
                    description: 'Best product'
                }
                // ...more cards
            ]
        }
    }
})
```

### AI Icon Feature

```ts
await sock.sendMessage(jid, { text: 'AI Generated Message' }, { ai: true })
```

### Poll Messages

```ts
await sock.sendMessage(jid, {
    poll: {
        name: 'Favorite language?',
        values: ['TypeScript', 'JavaScript', 'Python'],
        selectableCount: 1
    }
})
```

### Album Messages

Native multi-media album (minimum 2 media). `albumDelayMs` config tunes the inter-media delay:

```ts
await sock.sendMessage(jid, {
    album: [
        { image: { url: 'https://example.com/1.jpg' }, caption: 'Photo 1' },
        { image: { url: 'https://example.com/2.jpg' }, caption: 'Photo 2' },
        { video: { url: 'https://example.com/3.mp4' }, caption: 'Video 1' }
    ]
})
```

### Event Messages

```ts
await sock.sendMessage(jid, {
    event: {
        name: 'Yudzxml Community Meetup',
        description: 'Monthly developer meetup',
        startTime: Date.now() + 86_400_000,
        endTime: Date.now() + 90_000_000,
        location: { degreesLatitude: 0, degreesLongitude: 0, name: 'Online' }
    }
})
```

### Group Status (Group Story)

Post a status to a group — supports text, image, and video:

```ts
await sock.sendMessage(jid, {
    groupStatusMessage: {
        text: 'Hello group status!' // also supports image/video
    }
})
```

### Quick Message Operations

```ts
await sock.sendMessage(jid, { delete: messageKey })          // delete for everyone
await sock.sendMessage(jid, { react: { text: '👍', key } })  // react to a message
await sock.sendMessage(jid, { pin: messageKey, type: 1 })    // pin (type: 0 = unpin)
await sock.sendMessage(jid, { forward: originalMessage })    // forward
await sock.sendMessage(jid, { contacts: { displayName: 'Dev', contacts: [...] } })
await sock.sendMessage(jid, { location: { degreesLatitude: -6.2, degreesLongitude: 106.8 } })
await sock.sendMessage(jid, { disappearingMessagesInChat: 604800 }) // 7 days
await sock.sendMessage(jid, { sharePhoneNumber: true })      // share your number card
await sock.sendMessage(jid, { requestPhoneNumber: true })    // request recipient's number
await sock.sendMessage(jid, { text: 'No forwarding!', limitSharing: true })
```

### Shop & Collection Messages

Business API features — shops, catalogs, and collections:

```ts
await sock.sendMessage(jid, {
    text: 'Check out our collection',
    title: 'New Arrivals',
    shop: {
        surface: 1, // 1 = catalog surface
        id: 'https://example.com/shop'
    }
})
```

### Dugong Special Message Types

The built-in **Dugong** engine auto-detects and relays special message types that require special node handling — routed transparently through `sock.sendMessage()`:

| Type | Content key |
|---|---|
| `PAYMENT` | `requestPaymentMessage` |
| `PRODUCT` | `productMessage` |
| `GROUP_INVITE` | `groupInvite` |
| `INTERACTIVE_BUTTONS` | `interactiveButtons` |
| `CAROUSEL` | `interactiveMessage.carouselMessage` |
| `INTERACTIVE` | `interactiveMessage` |
| `ALBUM` | `albumMessage` / `album` |
| `EVENT` | `eventMessage` |
| `POLL_RESULT` | `pollResultMessage` |
| `GROUP_STORY` | `groupStatusMessage` |

### Business Queries

```ts
// Catalog & orders
const catalog = await sock.getCatalog(jid, 10)          // list products
const product = await sock.getProductDetails(productId)
const order = await sock.getOrderDetails(orderId)       // order details

// Product management
await sock.productCreate({ name: 'Shirt', price: 100000, ... })
await sock.productUpdate(productId, { description: 'New' })
await sock.productDelete([productId])

// Profile
await sock.getBusinessProfile(jid)
await sock.updateBusinessProfile({ ... })
await sock.updateCoverPhoto({ url: '...' }, jid)
```

---

## 🏘️ Communities & Newsletters

### Communities Management

Full lifecycle management for WhatsApp Communities:

```ts
// Create a community (with linked announcement group)
const community = await sock.communityCreate('Yudzxml Community', 'Community description')

// Link / unlink member groups
await sock.communityLinkGroup(communityId, groupId)
await sock.communityUnlinkGroup(communityId, [groupId])

// Metadata & queries
const metadata = await sock.communityMetadata(communityId)
await sock.communityQuery(communityId, type, content)
await sock.communityFetchLinkedGroups(communityId)
await sock.communityFetchAllParticipating()

// Join approval mode & participant requests
await sock.communityJoinApprovalMode(communityId, true)
await sock.communityMemberAddMode(communityId, 'admin_add')
const requests = await sock.communityRequestParticipantsList(communityId)
await sock.communityRequestParticipantsUpdate(communityId, participants, 'approve')

// Invite codes & settings
const invite = await sock.communityInviteCode(communityId)
await sock.communityRevokeInvite(communityId)
await sock.communityAcceptInvite(code)
await sock.communityGetInviteInfo(code)
await sock.communityToggleEphemeral(communityId, 604800)   // disappearing messages
await sock.communitySettingUpdate(communityId, 'announcement')
await sock.communityUpdateDescription(communityId, 'New description')
await sock.communityLeave(communityId)
```

### Newsletter / Channel Management

```ts
// Create a newsletter (channel)
const newsletter = await sock.newsletterCreate('Yudzxml Channel', 'My channel description')

// Metadata & follow/unfollow
const meta = await sock.newsletterMetadata('invite', inviteCode) // or ('jid', jid)
await sock.newsletterFollow(jid)
await sock.newsletterUnfollow(jid)
await sock.newsletterSubscribers(jid)
await sock.newsletterSubscribed()

// Update name / description / picture
await sock.newsletterUpdateName(jid, 'New Name')
await sock.newsletterUpdateDescription(jid, 'New description')
await sock.newsletterUpdatePicture(jid, { url: 'https://example.com/logo.png' })
await sock.newsletterRemovePicture(jid)

// React to a newsletter message
await sock.newsletterReactMessage(jid, messageId, '🔥')

// Fetch messages & admin info
const messages = await sock.newsletterFetchMessages(jid, 'guest', 50)
const adminCount = await sock.newsletterAdminCount(jid)

// Mute / unmute / ownership / delete
await sock.newsletterMute(jid)
await sock.newsletterUnmute(jid)
await sock.newsletterChangeOwner(jid, newOwnerJid)
await sock.newsletterDemote(jid, adminJid)
await sock.newsletterDelete(jid)
```

### WMex Queries

Direct access to the WhatsApp Metadata Exchange (WMex) API for advanced metadata operations:

```ts
const result = await sock.executeWMexQuery(jid, [
    { tag: 'newsletter', attrs: {}, content: [{ tag: 'privacy', attrs: {}, content: [] }] }
])
```

---

## 👥 Groups & Privacy

### Group Management

```ts
// Create Group
const group = await sock.groupCreate('Yudzxml Dev', ['628xxx@s.whatsapp.net'])

// Query
const meta = await sock.groupMetadata(jid)
const groups = await sock.groupFetchAllParticipating()

// Update Settings ('announcement' | 'not_announcement' | 'locked' | 'unlocked')
await sock.groupSettingUpdate(jid, 'announcement') // only admins can send

// Update Metadata
await sock.groupUpdateSubject(jid, 'New Subject')
await sock.groupUpdateDescription(jid, 'New description')

// Participants ('add' | 'remove' | 'promote' | 'demote')
await sock.groupParticipantsUpdate(jid, ['628xxx@s.whatsapp.net'], 'add')

// Join approval & requests
await sock.groupJoinApprovalMode(jid, true)
await sock.groupRequestParticipantsList(jid)
await sock.groupRequestParticipantsUpdate(jid, [userJid], 'approve')

// Invite codes
const code = await sock.groupInviteCode(jid)
await sock.groupRevokeInvite(jid)
await sock.groupAcceptInvite(code)
await sock.groupGetInviteInfo(code)

// Ephemeral (disappearing messages)
await sock.groupToggleEphemeral(jid, 604800)
```

### Privacy Settings

```ts
// Block / unblock user
await sock.updateBlockStatus(jid, 'block')

// Privacy controls
await sock.updateLastSeenPrivacy('contacts')        // 'all' | 'contacts' | 'none'
await sock.updateOnlinePrivacy('match_last_seen')
await sock.updateProfilePicturePrivacy('none')
await sock.updateStatusPrivacy('contacts')
await sock.updateReadReceiptsPrivacy('none')
await sock.updateGroupsAddPrivacy('contacts')       // who can add you to groups
await sock.updateCallPrivacy('known')
await sock.updateMessagesPrivacy('contacts')
await sock.updateDefaultDisappearingMode({ ephemeralDuration: 604800 })

// Profile management
await sock.updateProfilePicture(jid, { url: './avatar.jpg' })
await sock.removeProfilePicture(jid)
await sock.updateProfileStatus('Building bots with Yudzxml')
await sock.updateProfileName('Yudzxml Bot')
await sock.fetchPrivacySettings(true)

// Calls & misc
await sock.rejectCall(callId, callFrom)
await sock.fetchBlocklist()
await sock.fetchStatus(jid)
await sock.createCallLink()
```

## 🤖 AI Rich Response

Native support for WhatsApp **AI Rich Response / Unified Response** messages — the styled "Meta AI" message format (`botForwardedMessage` → `richResponseMessage` → `unifiedResponse`). This feature is built directly into the library, nothing to enable, and fully backward compatible with the existing API.

### Sending a Unified Response

```ts
import { RichBuilder } from '@yudzxml/baileys'

// Preferred form
await sock.sendUnifiedResponse(jid, {
    text: '*MEGUMIN ARCADE*\nJOGO DA VELHA',
    sections: [
        RichBuilder.markdown('CONTRA IA  •  2 JOGADORES'),
        RichBuilder.table([
            ['X', 'O', 'X'],
            ['O', 'X', 'O'],
            [' ', 'X', ' ']
        ], '3x3 BOARD', true), // title, noHeading
        RichBuilder.divider(),
        RichBuilder.footerAction('NOVA RODADA', 'https://example.com/new-round')
    ],
    disclaimerText: 'AI generated' // optional
})

// Positional form
await sock.sendUnifiedResponse(jid, 'MEGUMIN RICH XO', [RichBuilder.markdown('hello')])

// Also works through the normal sendMessage content API
await sock.sendMessage(jid, { unifiedResponse: { text: 'hello', sections: [...] } })
```

The helper builds the full protobuf chain for you — `botForwardedMessage` → `message` → `richResponseMessage` → `messageType` → `submessages` → `unifiedResponse` → `data` — with `unifiedResponse.data` serialized as **bytes** (JSON UTF-8 in a Buffer) exactly as WAProto expects, and `botMetadata.botResponseId` mirroring the unified `response_id`.

### Primitives

| Builder | Renders as | Level | Status |
|---|---|---|---|
| `RichBuilder.markdown(text)` | Markdown text | proto submessage + JSON | ✅ Verified |
| `RichBuilder.code(code, lang)` | Highlighted code block | proto submessage + JSON | ✅ Verified |
| `RichBuilder.table(rows, title?)` | Table | proto submessage + JSON | ✅ Verified |
| `RichBuilder.latex(text, exprs)` | LaTeX | proto submessage + JSON | ✅ Verified |
| `RichBuilder.inlineImage({...})` | Inline image | proto submessage + JSON | ✅ Verified |
| `RichBuilder.items([...])` | Carousel | proto submessage + JSON | ✅ Verified |
| `RichBuilder.image(url)` | Image section | JSON only | ✅ Verified (captured) |
| `RichBuilder.divider()` / `spacer()` | Layout separators | JSON only | ✅ Verified (captured) |
| `RichBuilder.footerAction(text, url)` | Footer CTA button | JSON only | ⚠️ Community-captured |
| `RichBuilder.html(html, opts?)` | **HTML Mini App / interactive WebView** | JSON only | ✅ Wire format from @rexxhayanasi/elaina-baileys 1.3.8 |
| `RichBuilder.raw(section)` | Any captured section | JSON only | ✅ For capture-replay |

"Verified" means the primitive appears in the generated WhatsApp protobuf definitions and/or in decompiled WhatsApp Web renderers (`cometComposedTextV2GenAiUxPrimitiveParser`) and/or in real message captures. **Not verified / do not exist**: `GenAIGameUXPrimitive`, `GenAIInteractiveGamePrimitive`, or any game board schema. `UNIFIED_RESPONSE_EMBEDDED_SCREENS` is only a capability enum value (`BotCapabilityType = 60`) — no message schema is known for it.

### Games (jogo da velha style UI)

Interactive **HTML mini apps** (Tic-Tac-Toe, Snake, counters, canvas animations, etc.) are supported through `GenAIaeacdsnwHtmlPrimitive` — see the next section. There is no verified native *game board* primitive (`GenAIGameUXPrimitive` does not exist); real game cards seen in the wild are most likely server-driven Bloks UI (`FOABloksPrimitive`). To find that schema:

1. Run the capture tool below while a real game card is displayed in an official Meta AI chat.
2. Feed the captured `view_model`/`primitive` structure back through `RichBuilder.raw(section)`.

### HTML Mini App / HTML Rich Message (GenAIaeacdsnwHtmlPrimitive)

Send a **full interactive HTML document** (HTML + CSS + JavaScript) that WhatsApp Android renders as a native Rich UI / WebView mini app — not as plain text, not as a code block, not as markdown.

```ts
import { RichBuilder, htmlSection, sendHtmlApp } from '@yudzxml/baileys'

const html = `<!DOCTYPE html>
<html>
<head>
<style>
body { background: #111; color: white; font-family: sans-serif; text-align: center; }
button { padding: 12px; border-radius: 10px; }
</style>
</head>
<body>
<h2>YUDZXML HTML RICH</h2>
<div id="count">0</div>
<button onclick="add()">+1</button>
<script>
let count = 0
function add() {
  count++
  document.getElementById('count').textContent = count
}
</script>
</body>
</html>`

// 1) Through the unified response API (like every other primitive)
await sock.sendUnifiedResponse(jid, {
    text: 'YUDZXML HTML APP',
    sections: [RichBuilder.html(html)]
})

// 2) Raw section form (pass-through compatible)
await sock.sendUnifiedResponse(jid, { sections: [htmlSection(html)] })

// 3) One-shot helper — relay + bypassDownload MESSAGE_EDIT follow-up (recommended)
await sock.sendHtmlApp(jid, html, {
    title: 'YUDZXML HTML APP',   // botMetadata.messageDisclaimerText
    text: 'Demo counter',         // markdown text above the app
    height: 420,                  // optional fixed height with scroll shim
    trustedSources: [],           // primitive.trusted_sources
    bypassDownload: true          // default: send the type-14 MESSAGE_EDIT follow-up
})

// 4) Standalone, sock-first (same signature as the reference implementation)
await sendHtmlApp(sock, jid, html, { title: 'YUDZXML SNAKE' })
```

**Wire format** (reverse-engineered from `@rexxhayanasi/elaina-baileys` 1.3.8, `htmlSection()` + `AIRich.build()/send()/decodeAIRich()`): the HTML travels verbatim inside a JSON-only unified section `{ view_model: { primitive: { payload, trusted_sources, __typename: 'GenAIaeacdsnwHtmlPrimitive' }, __typename: 'GenAISingleLayoutViewModel' } }` → unified JSON `{ response_id, sections }` → bytes in `AIRichResponseMessage.unifiedResponse.data` (field 3) → `Message.botForwardedMessage` (field 834) → `relayMessage`, followed by the proven `protocolMessage(type 14 MESSAGE_EDIT)` edit carrying `editedMessage` — the `bypassDownload` flow that makes WhatsApp Android actually render the mini app. No protobuf schema changes were needed; the existing `AIRichResponseMessage` structure is used as-is.

**Decoding / capture:**

```ts
import { decodeHtmlRich } from '@yudzxml/baileys'

sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
        const decoded = decodeHtmlRich(msg) // never throws
        if (decoded.found) {
            console.log(decoded.html)            // original HTML, byte-exact
            console.log(decoded.trustedSources)  // primitive.trusted_sources
            console.log(decoded.section)         // raw unified section
            console.log(decoded.raw)             // wire-level utf8/base64/hex fallbacks
        }
    }
})
```

> ⚠️ `GenAIaeacdsnwHtmlPrimitive` is an **Android-only** primitive. Rendering fidelity depends on the WhatsApp Android version; other clients may ignore or flatten the section.

### Capture / Decode incoming responses

```ts
import { decodeUnifiedResponse, captureUnifiedResponse } from '@yudzxml/baileys'

sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
        const decoded = captureUnifiedResponse(msg) // alias of decodeUnifiedResponse
        if (decoded.found) {
            console.log('response_id:', decoded.responseId)
            console.log('primitives:', decoded.primitives.map(p => p.__typename))
            console.log('sections:', decoded.unified?.sections)
            // raw fallbacks (always available, even for non-JSON data):
            console.log(decoded.raw.hex, decoded.raw.base64, decoded.raw.utf8, decoded.raw.jsonError)
        }
    }
})
```

`decodeUnifiedResponse()` accepts a full `WAMessage`, a message content object, or a bare `richResponseMessage`. It **never throws** — malformed payloads are reported through `raw.jsonError` / `error` while `raw.hex`, `raw.base64` and `raw.utf8` still expose the raw bytes for analysis.

### Limitations

- Rendering fidelity depends on the WhatsApp client; JSON-only primitives (`image`, `divider`, `spacer`, `footerAction`, `html`) may render differently across app versions. `GenAIaeacdsnwHtmlPrimitive` is Android-only.
- The bot JID used for `forwardedAiBotMessageInfo` defaults to `867051314767696@bot` (same default as the existing rich response helpers) and can be overridden with the `botJid` option.

---

## 🗂️ Project Structure

```
Baileys/
├── lib/                          # Compiled library (entry: lib/index.js + lib/index.d.ts)
│   ├── index.js                  # Exports makeWASocket, Dugong + re-exports all modules
│   ├── Defaults/
│   │   └── index.js              # Default connection config, WA constants, cache TTLs,
│   │                             #   media paths, noise protocol constants, default version
│   ├── Socket/
│   │   ├── index.js              # makeWASocket — full public API surface (~150 methods)
│   │   ├── socket.js             # WS handshake, noise protocol, QR/pairing, reconnect logic
│   │   ├── messages-send.js      # sendMessage relay: media upload, protocol nodes, Dugong routing
│   │   ├── messages-recv.js      # Incoming message decoding, events emission, receipts
│   │   ├── chats.js              # Chat modification, labels, quick replies, contacts
│   │   ├── groups.js             # Group CRUD, participants, settings, invites
│   │   ├── communities.js        # Communities API (link/unlink, approval, invites)
│   │   ├── newsletter.js         # Newsletter/Channel API (create, follow, react, admin)
│   │   ├── business.js           # Business API (catalog, products, orders, profile)
│   │   ├── mex.js                # WMex (metadata exchange) queries
│   │   ├── dugong.js             # Special message engine (album/carousel/event/payment/...)
│   │   └── Client/
│   │       ├── index.js          # Reconnect/backoff orchestration
│   │       ├── websocket.js      # Raw ws wrapper with noise frame handling
│   │       └── types.js          # Client transport types
│   ├── Signal/
│   │   ├── libsignal.js          # Signal repository (identity, session, pre-keys, sender keys)
│   │   ├── lid-mapping.js        # LID ↔ PN (phone number) identity mapping
│   │   └── Group/                # Group cipher: sender-key distribution, ratchets, records
│   ├── Store/
│   │   ├── make-in-memory-store.js # Bindable in-memory store (chats, messages, contacts)
│   │   ├── make-ordered-dictionary.js
│   │   └── object-repository.js
│   ├── Types/                    # TypeScript type/enum definitions
│   │   ├── Auth, Chat, Contact, Message, Events, Socket, Signal
│   │   ├── GroupMetadata, Product, Call, State, Bussines, Mex
│   │   └── RichType.js           # AI rich response enums (RichSubMessageType, ...)
│   ├── Utils/                    # 30+ utility modules
│   │   ├── use-multi-file-auth-state.js   # Default folder-based auth state
│   │   ├── use-single-file-auth-state.js  # Single JSON file auth state
│   │   ├── use-sqlite-auth-state.js       # SQLite auth state (needs better-sqlite3)
│   │   ├── messages.js           # generateWAMessage*, content builder (all message types)
│   │   ├── messages-media.js     # Media download/upload, thumbnails, re-encoding
│   │   ├── crypto.js             # AES-GCM, HMAC, HKDF helpers
│   │   ├── noise-handler.js      # Noise_XX handshake + frame encryption
│   │   ├── generics.js           # fetchLatestBaileysVersion, delay, codecs, aggregation
│   │   ├── decode-wa-message.js  # Raw WA message → protobuf normalization
│   │   ├── process-message.js    # Incoming message pipeline (decrypt, receipts, events)
│   │   ├── message-retry-manager.js # Retry scheduling + device sentinel logic
│   │   ├── rich-response-builder.js # RichBuilder, sendUnifiedResponse, sendHtmlApp,
│   │   │                            #   decodeUnifiedResponse, decodeHtmlRich
│   │   ├── rich-message-utils.js # Legacy richResponse (code/table/links) builders
│   │   ├── link-preview.js       # URL preview generation
│   │   ├── auth-utils.js         # Key bundle parsing/validation
│   │   ├── browser-utils.js      # Browsers.* presets
│   │   ├── event-buffer.js       # Event coalescing buffer
│   │   ├── history.js            # History sync processing
│   │   ├── chat-utils.js         # JID/chat helpers
│   │   └── ...                   # signal, lt-hash, business, mex, usync, stanza-ack, etc.
│   ├── WABinary/
│   │   ├── encode.js / decode.js # WA binary node codec
│   │   ├── jid-utils.js          # JID encode/decode/normalize (s.whatsapp.net, lid, bot)
│   │   ├── generic-utils.js      # Binary tree traversal helpers
│   │   └── constants.js          # Tags & protocol constants
│   ├── WAM/                      # WhatsApp Analytics metrics (BinaryInfo, channel encoding)
│   ├── WAUSync/                  # USync protocol implementations
│   │   ├── USyncQuery.js / USyncUser.js
│   │   └── Protocols/            # device, contact, status, disappearing-mode,
│   │                             #   username, bot-profile, LID protocols
│   └── ... (index.d.ts / .map files for IDE IntelliSense)
├── WAProto/
│   ├── index.js                  # Generated protobuf classes (proto.*)
│   └── index.d.ts                # Full protobuf typings
├── examples/
│   ├── rich-response.js          # Unified response primitives demo
│   ├── html-rich.js              # HTML mini app: counter + canvas animation
│   ├── html-tictactoe.js         # HTML mini app: Tic-Tac-Toe with score
│   └── html-snake.js             # HTML mini app: Snake (keyboard + touch)
├── tests/
│   ├── rich-response.test.js     # Roundtrip + malformed-data safety tests
│   ├── html-rich.test.js         # HTML mini app roundtrip tests
│   └── smoke-socket.mjs          # Socket construction smoke check
├── scripts/
│   └── check-send-html-app.mjs   # Manual sendHtmlApp verification script
├── engine-requirements.js        # Node >= 20 engine check (runs on preinstall)
├── package.json                  # @yudzxml/baileys — ESM, yarn 4
└── README.md
```

### Key Module Map

| Module | Role |
|---|---|
| `lib/index.js` | Single entry point: `import makeWASocket, { ... } from '@yudzxml/baileys'` |
| `lib/Socket/` | Connection lifecycle + all public socket methods |
| `lib/Signal/` | E2E encryption (libsignal): 1:1 sessions, group sender-key, LID mapping |
| `lib/Utils/` | Auth states, message generation, media pipeline, rich response builders |
| `lib/WABinary/` | WhatsApp binary protocol codec (node serialization) |
| `lib/WAUSync/` | USync query protocols (devices, contacts, LID, bot profiles) |
| `WAProto/` | Generated protobuf definitions used across the wire |
| `lib/Store/` | Optional in-memory store for chats/messages |

---

## 🧰 Utilities

Handy helpers exported from the root package:

```ts
import {
    getContentType,               // (message) => string — extract the content type of a message
    downloadMediaMessage,         // (message) => Buffer | Readable — download media
    getDevice,                    // (message) => 'web' | 'android' | 'ios' | ...
    fetchLatestBaileysVersion,    // () => { version, isLatest }
    getAggregateVotesInPollMessage, // aggregate decrypted poll votes
    jidNormalizedUser,            // normalize a JID
    areJidsSameUser,              // compare two JIDs
    prepareWAMessageMedia,        // pre-upload media to WA servers
    generateWAMessageFromContent, // build a WAMessage from raw content
    generateMessageID,            // random message id
    decodeHtmlRich,               // extract HTML mini app from a message
    decodeUnifiedResponse,        // extract unified response from a message
    makeInMemoryStore             // optional store (lib/Store)
} from '@yudzxml/baileys'
```

---

## 🧪 Examples & Tests

### Bundled Examples (`examples/`)

| File | Description |
|---|---|
| `rich-response.js` | AI Rich Response / Unified Response primitives demo |
| `html-rich.js` | HTML Rich Message — static + CSS + JS + button + counter + canvas animation |
| `html-tictactoe.js` | 3x3 Tic-Tac-Toe mini app — turn order, winner detection, reset, score, dark UI |
| `html-snake.js` | Snake mini app — canvas grid, food, score, level, keyboard + touch, pause, reset |

Run any example with:

```bash
DEMO_JID=628xxxxxxxxxx@s.whatsapp.net node examples/html-snake.js
```

### Tests

```bash
npm test
```

Covers: build → serialize → deserialize → decode roundtrip, `response_id`/sections/primitives verification, malformed-data safety, HTML mini app roundtrip via `decodeHtmlRich`, and backward compatibility of the legacy `richResponse` path.

Full socket smoke check:

```bash
node tests/smoke-socket.mjs
```

---

## 🩺 Troubleshooting & FAQ

<details>
<summary><b>Connection closed with code 401 / logged out</b></summary>

The session was revoked (device unlinked from the phone or logged out via WhatsApp). Delete the `auth_info` folder (or your auth file/DB), then re-authenticate with a fresh QR / pairing code. Code 401 is terminal — do not auto-reconnect on it.
</details>

<details>
<summary><b>Connection replaced (440)</b></summary>

Another client opened the same session elsewhere. Only one process may own a session at a time — stop the duplicate instance or use a separate auth state per process.
</details>

<details>
<summary><b>restartRequired (515)</b></summary>

Normal after linking for the first time — WhatsApp requires a restart to complete registration. Reconnect automatically (retry the same auth state).
</details>

<details>
<summary><b>Bad MAC / decrypt errors</b></summary>

Sessions got out of sync. `enableAutoSessionRecreation: true` (default) rebuilds sessions automatically; also wire a `getMessage` store so retry requests can find original messages.
</details>

<details>
<summary><b>Poll votes / retries fail with "no message found"</b></summary>

Wire the `getMessage` config to your store:

```ts
getMessage: async (key) => store.loadMessage(key.remoteJid, key.id)?.message
```
</details>

<details>
<summary><b>HTML Mini App doesn't render</b></summary>

`GenAIaeacdsnwHtmlPrimitive` is **Android-only** and depends on the WhatsApp Android version. Other clients (iOS, Web, Desktop) may ignore or flatten the section. Verify with `decodeHtmlRich()` that the payload arrived intact.
</details>

<details>
<summary><b>QR deprecated warning in logs</b></summary>

You passed `printQRInTerminal`. Remove it and render the `qr` string from `connection.update` yourself (e.g. `qrcode-terminal`).
</details>

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository & create your branch (`git checkout -b feature/amazing-feature`)
2. Commit your changes (`git commit -m 'feat: add amazing feature'`)
3. Push to the branch (`git push origin feature/amazing-feature`)
4. Open a Pull Request

## 📄 License

MIT — Copyright (c) 2026 Yudzxml. See [LICENSE](LICENSE) for details.

---

<div align="center">

**Yudzxml** — Advanced WhatsApp Web API

[![NPM](https://img.shields.io/badge/NPM-%40yudzxml%2Fbaileys-CB3837?logo=npm&logoColor=white)](https://www.npmjs.com/package/@yudzxml/baileys)
[![GitHub](https://img.shields.io/badge/GitHub-Yudzxml%2FBaileys-181717?logo=github)](https://github.com/Yudzxml/Baileys)
[![Channel](https://img.shields.io/badge/WhatsApp-Community-25D366?logo=whatsapp)](https://whatsapp.com/channel/0029VbA78K82f3EGd78yGU28)

Made with ❤️ by Yudzxml

</div>

