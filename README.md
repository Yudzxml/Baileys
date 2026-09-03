<div align="center">

# Yudzxml

<!-- TULISAN ANIMASI (Typewriter Effect) -->
<p>
  <img src="https://readme-typing-svg.demolab.com/?font=Fira+Code&weight=600&size=28&duration=3000&pause=1000&color=58A6FF&center=true&vCenter=true&width=800&lines=Advanced+WhatsApp+Web+API;Built+with+TypeScript+%26+Baileys;Lightweight+%7C+Efficient+%7C+Stable" alt="Typing Animation" />
</p>

<!-- BADGES -->
<img src="https://img.shields.io/npm/dw/%40yudzxml%2Fbaileys?label=NPM&color=%23CB3837" alt="NPM Downloads"/>
<img src="https://img.shields.io/github/v/release/Yudzxml/baileys?include_prereleases&sort=semver" alt="Latest Release"/>
<img src="https://img.shields.io/github/languages/code-size/Yudzxml/baileys" alt="Code Size"/>
<img src="https://img.shields.io/github/license/Yudzxml/baileys" alt="License"/>
<img src="https://img.shields.io/github/stars/Yudzxml/baileys" alt="Stars"/>
<img src="https://img.shields.io/github/forks/Yudzxml/baileys" alt="Forks"/>

<br/>
<br/>

<!-- FOTO / VISUAL SHOWCASE -->
### 📸 Project Showcase

<img src="https://cdn.dyxzy.my.id/files/944f6b8d.png" alt="WhatsApp Interface" width="800" />
<br/>
<small><i>Native WhatsApp Experience integrated into your project</i></small>

<br/>

**Yudzxml** is a powerful, lightweight, and efficient library for interacting with the WhatsApp Web API. Built on top of the Baileys ecosystem, it introduces enhanced features, custom message types, and improved stability for developers.

</div>

---

## ⚠️ Disclaimer & Liability

This library is a community-driven project and is in no way affiliated with, endorsed by, or sponsored by WhatsApp Inc. Use at your own discretion.

**Important Guidelines:**
- Do not use this library for spamming, bulk messaging, or stalkerware activities.
- The developers are not liable for any misuse of this software. Please refer to the [MIT License](LICENSE) for details.
- Users are responsible for ensuring their usage complies with WhatsApp's Terms of Service.

---

## 🚀 Features

- **Lightweight:** No Selenium or Chromium required. Uses direct WebSocket connections.
- **Efficient:** Saves significant RAM usage compared to browser-based automation.
- **Multi-Device Support:** Full support for WhatsApp Multi-Device (MD) protocols.
- **Advanced Message Types:** Support for Buttons, Lists, Interactive Messages, AI Icons, Polls, and more.
- **Type-Safe:** Written in TypeScript with full IntelliSense support.

---

## 📦 Installation

### Stable Version
```bash
yarn add @yudzxml/baileys
# or
npm install @yudzxml/baileys
```

### Edge Version (Latest Features)
```bash
yarn add github:Yudzxml/baileys
```

### Basic Import
```ts
import makeWASocket from '@yudzxml/baileys'
```

---

## 📚 Documentation

- **[Official Documentation](https://www.npmjs.com/package/@yudzxml/baileys)** (Core Baileys Docs)
- **[Community](https://whatsapp.com/channel/0029VbA78K82f3EGd78yGU28)**

---

## 🔗 Table of Contents

- [Quick Start](#quick-start)
- [Configuration](#configuration)
    - [Socket Configuration](#important-notes-about-socket-config)
    - [Authentication](#connecting-account)
- [Handling Events](#handling-events)
- [Sending Messages](#sending-messages)
- [Advanced Features](#advanced-features)
- [Groups & Privacy](#groups--privacy)
- [AI Rich Response](#ai-rich-response)

---

## Quick Start

To get started quickly, clone the repository and run the example script:

```bash
git clone https://github.com/Yudzxml/baileys.git
cd baileys
yarn install
yarn example
```

### Basic Connection Example

```ts
import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@yudzxml/baileys'
import { Boom } from '@hapi/boom'

async function startConnection() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info')
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true
    })

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut
            console.log('Connection closed. Reconnecting:', shouldReconnect)
            if (shouldReconnect) startConnection()
        } else if (connection === 'open') {
            console.log('Connection opened successfully!')
        }
    })

    sock.ev.on('creds.update', saveCreds)
}

startConnection()
```

---

## Configuration

### Connecting Account

#### 1. Using QR Code
```ts
import makeWASocket, { Browsers } from '@yudzxml/baileys'

const sock = makeWASocket({
    browser: Browsers.ubuntu('Yudzxml Bot'),
    printQRInTerminal: true
})
```

#### 2. Using Pairing Code (Mobile)
> Note: Ensure `printQRInTerminal` is set to `false`.

```ts
const sock = makeWASocket({ printQRInTerminal: false })

if (!sock.authState.creds.registered) {
    const phoneNumber = '6281234567890' // Format: CountryCode + Number
    const code = await sock.requestPairingCode(phoneNumber)
    console.log('Pairing Code:', code)
}
```

### Important Notes About Socket Config

#### Caching Group Metadata (Recommended)
Optimize performance by caching group metadata to reduce API calls.

```ts
const groupCache = new NodeCache({ stdTTL: 5 * 60, useClones: false })

const sock = makeWASocket({
    cachedGroupMetadata: async (jid) => groupCache.get(jid)
})

sock.ev.on('groups.update', async (events) => {
    for (const event of events) {
        const metadata = await sock.groupMetadata(event.id)
        groupCache.set(event.id, metadata)
    }
})
```

---

## Handling Events

Yudzxml (Baileys) uses an Event-Driven architecture.

### Listening to Messages
```ts
sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type === 'notify') {
        for (const msg of messages) {
            if (!msg.key.fromMe) {
                console.log('Received:', msg.message?.conversation)
            }
        }
    }
})
```

### Decrypting Poll Votes
```ts
import { getAggregateVotesInPollMessage } from '@yudzxml/baileys'

sock.ev.on("messages.update", async (updates) => {
    for (const { key, update } of updates) {
        if (update.pollUpdates) {
            const pollCreation = await getMessageFromStore(key)
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

## Sending Messages

Yudzxml unifies message sending into a single `sendMessage` function.

### Text & Mentions
```ts
await sock.sendMessage(jid, { 
    text: 'Hello @user!', 
    mentions: ['6281234567890@s.whatsapp.net'] 
})
```

### Media Messages
```ts
// Image
await sock.sendMessage(jid, { 
    image: { url: 'https://example.com/image.jpg' }, 
    caption: 'Here is the image' 
})

// Video
await sock.sendMessage(jid, { 
    video: { url: 'https://example.com/video.mp4' }, 
    gifPlayback: true, 
    caption: 'GIF' 
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

### AI Icon Feature
```ts
await sock.sendMessage(jid, {
    text: 'AI Generated Message'
}, {
    ai: true // Enable AI specific handling
})
```

### Status Group
```ts
await sock.sendMessage(jid, {
    groupStatusMessage: {
    text: // support image/video
   }
})
```

---

## Advanced Features

### Custom Interactive Messages (Flows)
Support for complex native flows (URL, Copy, Call, Catalog, etc.).

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

### Shop & Collection Messages
Support for Business API features like Shops and Collections.

```ts
await sock.sendMessage(jid, {
    text: 'Check out our collection',
    title: 'New Arrivals',
    shop: {
        surface: 1,
        id: 'https://example.com/shop'
    }
})
```

### Status Mentions
Send Status updates with mentions (Limit: 5 mentions).

```ts
await sock.sendStatusMentions({
    text: 'Hello everyone!',
    font: 2,
    backgroundColor: '#000000'
}, ['user1@s.whatsapp.net', 'user2@s.whatsapp.net'])
```

---

## Groups & Privacy

### Group Management
```ts
// Create Group
const group = await sock.groupCreate('Yudzxml Dev', ['628xxx@s.whatsapp.net'])

// Update Settings
await sock.groupSettingUpdate(jid, 'announcement') // Admins only

// Update Metadata
await sock.groupUpdateSubject(jid, 'New Subject')
```

### Privacy Settings
```ts
// Block User
await sock.updateBlockStatus(jid, 'block')

// Update Privacy
await sock.updateLastSeenPrivacy('contacts')
await sock.updateProfilePicturePrivacy('none')
```

---

## AI Rich Response

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

Full examples: `examples/html-rich.js` (static + CSS + JS + button + counter + canvas animation), `examples/html-tictactoe.js` (3x3 board, X/O turn, winner detection, reset, score, dark UI) and `examples/html-snake.js` (canvas grid, food, score, level, keyboard + touch, pause, reset, start, animation loop).

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
- Tests: `npm test` (covers build → serialize → deserialize → decode roundtrip, response_id/sections/primitives verification, malformed-data safety, HTML mini app roundtrip via `decodeHtmlRich`, and backward compatibility of the legacy `richResponse` path). Full socket smoke check: `node tests/smoke-socket.mjs`. Examples: `examples/rich-response.js`, `examples/html-rich.js`, `examples/html-tictactoe.js`, `examples/html-snake.js`.

---

## Utilities

### Helper Functions
- `getContentType(message)`: Extract the type of message content.
- `downloadMediaMessage(message)`: Download media (Buffer/Stream).
- `getDevice(message)`: Get device type of sender.

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT - Copyright (c) 2026 Yudzxml

---

<div align="center">
Made with ❤️ by Yudzxml
</div>
