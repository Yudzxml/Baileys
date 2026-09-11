<div align="center">⚡ Yudzxml Baileys

Modern WhatsApp Web Library for Node.js

<p>
  <img src="https://readme-typing-svg.demolab.com/?font=Fira+Code&weight=600&size=26&duration=3000&pause=1000&color=58A6FF&center=true&vCenter=true&width=760&lines=WhatsApp+Web+API+for+Node.js;Rich+Messages+%26+Interactive+UI;HTML+Mini+Apps;TypeScript+%26+JavaScript;Fast+%7C+Lightweight+%7C+Extensible" alt="Yudzxml Baileys" />
</p><p>
  <img src="https://img.shields.io/npm/dw/%40yudzxml%2Fbaileys?label=NPM%20Downloads&color=CB3837" alt="NPM Downloads"/>
  <img src="https://img.shields.io/github/v/release/Yudzxml/baileys?include_prereleases&sort=semver" alt="Latest Release"/>
  <img src="https://img.shields.io/github/languages/code-size/Yudzxml/baileys" alt="Code Size"/>
  <img src="https://img.shields.io/github/license/Yudzxml/baileys" alt="License"/>
  <img src="https://img.shields.io/github/stars/Yudzxml/baileys" alt="Stars"/>
  <img src="https://img.shields.io/github/forks/Yudzxml/baileys" alt="Forks"/>
  <img src="https://img.shields.io/node/v/%40yudzxml%2Fbaileys?label=Node.js&color=339933" alt="Node.js"/>
</p><br><img src="https://cdn.dyxzy.my.id/files/944f6b8d.png" alt="Yudzxml Baileys Showcase" width="800"/><br><sub>Build WhatsApp integrations without browser automation.</sub>

</div>---

📖 About

Yudzxml Baileys is a Node.js library for interacting with the WhatsApp Web Multi-Device protocol through a direct WebSocket connection.

It is designed for developers who want to build WhatsApp bots, automation systems, integrations, and custom messaging applications without running Selenium, Chromium, or a headless browser.

The library provides a typed, event-driven API with support for messaging, media, groups, communities, newsletters, business features, interactive messages, rich responses, and HTML-based mini applications.

Highlights

- ⚡ Direct WebSocket communication
- 📱 WhatsApp Multi-Device support
- 🔐 Signal-based end-to-end encryption
- 🧩 Event-driven architecture
- 🛠️ JavaScript & TypeScript support
- 🤖 Rich response builder
- 🌐 HTML Mini App support
- 🎫 Pairing code authentication
- 💾 Multiple authentication storage options
- 🏘️ Groups & Communities API
- 📢 Newsletter API
- 🛍️ Business & Catalog API

---

✨ Features

Core

Feature| Description
⚡ Direct Connection| Communicates with WhatsApp through WebSocket without browser automation.
📱 Multi-Device| Built around the WhatsApp Multi-Device protocol.
🔐 Encryption| Signal protocol support for secure message sessions.
🧠 Event Driven| Connection, message, group, presence and other events are exposed through "sock.ev".
🔄 Reconnection| Connection recovery and session recreation mechanisms.
🛡️ TypeScript| Type definitions included for development with TypeScript and IntelliSense.

Messaging

Feature| Description
💬 Text| Text messages, mentions and formatting.
🖼️ Media| Images, videos, audio, stickers and documents.
🔘 Buttons| Interactive buttons and native actions.
📋 Lists| List messages with sections and rows.
🎠 Carousel| Interactive carousel cards.
📊 Polls| Poll creation and vote processing.
🖼️ Albums| Multiple media items in a single album.
📅 Events| Calendar-style event messages.
👥 Group Status| Group story/status messages.
📌 Message Actions| Reply, forward, delete, react, pin and other operations.

Extended APIs

Feature| Description
🏘️ Communities| Community creation, groups, approval and participant management.
📢 Newsletters| Channel creation, following, reactions, metadata and administration.
🛍️ Business| Catalogs, products, collections, orders and business profiles.
🔒 Privacy| Account privacy, blocklist, profile and call settings.
📡 WMex| Low-level metadata exchange queries.

Yudzxml Extensions

Feature| Description
🤖 AIRich| Structured rich responses with text, code, tables, media, widgets and actions.
✏️ Live Edit| Update a previously sent rich response without creating a new message.
🌐 HTML Mini App| Deliver interactive HTML/CSS/JS content through supported WhatsApp clients.
🧩 Message Builder| Composable primitives for building rich response layouts.
🎫 Custom Pairing| Generate custom alphanumeric pairing codes.
💾 Auth Backends| Multi-file, single-file and SQLite authentication storage.

---

📦 Installation

NPM

npm install @yudzxml/baileys

or:

yarn add @yudzxml/baileys

GitHub

For the latest development version:

yarn add github:Yudzxml/baileys

Specific release:

yarn add github:Yudzxml/baileys#v7.5.0

Requirements

- Node.js ">= 20"
- npm, yarn or another compatible package manager

---

🚀 Quick Start

Import

ESM:

import makeWASocket from '@yudzxml/baileys'

CommonJS:

const makeWASocket = require('@yudzxml/baileys').default

Basic Connection

import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState
} from '@yudzxml/baileys'
import { Boom } from '@hapi/boom'

async function start() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info')

    const sock = makeWASocket({
        auth: state
    })

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
        if (qr) {
            console.log('QR:', qr)
        }

        if (connection === 'open') {
            console.log('Connected:', sock.user?.id)
        }

        if (connection === 'close') {
            const code = (lastDisconnect?.error as Boom)?.output?.statusCode
            const reconnect = code !== DisconnectReason.loggedOut

            if (reconnect) {
                start()
            }
        }
    })

    sock.ev.on('creds.update', saveCreds)
}

start()

---

🔐 Authentication

Yudzxml Baileys supports QR authentication and phone-number pairing.

QR Code

The QR string is available through "connection.update":

sock.ev.on('connection.update', ({ qr }) => {
    if (qr) {
        console.log(qr)
    }
})

Render the QR using a package such as "qrcode-terminal".

Pairing Code

const sock = makeWASocket({
    auth: state
})

if (!sock.authState.creds.registered) {
    const code = await sock.requestPairingCode('6281234567890')

    console.log('Pairing Code:', code)
}

Phone numbers must use international format without "+", spaces or separators.

Custom Pairing Code

const code = await sock.requestPairingCode(
    '6281234567890',
    'YUDZXML1'
)

console.log(code)

The custom value must contain exactly 8 alphanumeric characters.

---

💾 Authentication Storage

Multi-file

Recommended for most applications:

const { state, saveCreds } =
    await useMultiFileAuthState('auth_info')

Single-file

const { state, saveCreds } =
    await useSingleFileAuthState('auth.json')

SQLite

const { state, saveCreds } =
    await useSqliteAuthState({
        /* options */
    })

SQLite authentication requires:

npm install better-sqlite3

Always persist credential changes:

sock.ev.on('creds.update', saveCreds)

---

⚙️ Configuration

"makeWASocket()" accepts configuration options for connection behavior, authentication, retries, message processing and protocol features.

Option| Type| Description
"auth"| "AuthenticationState"| Authentication credentials and keys.
"version"| "[number, number, number]"| WhatsApp Web protocol version.
"browser"| "WABrowserDescription"| Client/browser identity.
"waWebSocketUrl"| "string | URL"| WebSocket endpoint.
"connectTimeoutMs"| "number"| Initial connection timeout.
"keepAliveIntervalMs"| "number"| WebSocket keep-alive interval.
"defaultQueryTimeoutMs"| "number"| Default request timeout.
"logger"| "Logger"| Pino-compatible logger.
"markOnlineOnConnect"| "boolean"| Whether to broadcast online presence.
"syncFullHistory"| "boolean"| Whether to request complete history synchronization.
"maxMsgRetryCount"| "number"| Maximum message retry count.
"getMessage"| "function"| Message lookup used by retries and poll processing.
"cachedGroupMetadata"| "function"| Optional group metadata cache.
"shouldIgnoreJid"| "function"| Filter JIDs from processing.
"enableAutoSessionRecreation"| "boolean"| Automatically recover certain Signal sessions.
"enableRecentMessageCache"| "boolean"| Cache recent messages for retry handling.
"albumDelayMs"| "number"| Delay between album media uploads.
"customUploadHosts"| "MediaHostInfo[]"| Additional media upload hosts.

---

📡 Events

The library exposes events through:

sock.ev.on('event-name', handler)

Common events include:

Event| Description
"connection.update"| Connection lifecycle and QR updates.
"creds.update"| Credential changes.
"messages.upsert"| Incoming and outgoing messages.
"messages.update"| Message updates, reactions and poll updates.
"messages.delete"| Message deletion events.
"messages.reaction"| Reaction changes.
"message-receipt.update"| Delivery and read receipts.
"groups.upsert"| New groups.
"groups.update"| Group metadata changes.
"group-participants.update"| Participant changes.
"group.join-request"| Group join requests.
"presence.update"| Presence and typing information.
"chats.upsert"| New chats.
"chats.update"| Chat changes.
"contacts.upsert"| New contacts.
"contacts.update"| Contact changes.
"messaging-history.set"| History synchronization.
"newsletter.reaction"| Newsletter reactions.
"newsletter.view"| Newsletter views.

---

💬 Sending Messages

Everything is handled through:

sock.sendMessage(jid, content, options?)

Text

await sock.sendMessage(jid, {
    text: 'Hello from Yudzxml!'
})

Mentions

await sock.sendMessage(jid, {
    text: 'Hello @6281234567890',
    mentions: [
        '6281234567890@s.whatsapp.net'
    ]
})

Image

await sock.sendMessage(jid, {
    image: {
        url: 'https://example.com/image.jpg'
    },
    caption: 'Yudzxml'
})

Video

await sock.sendMessage(jid, {
    video: {
        url: 'https://example.com/video.mp4'
    },
    caption: 'Video'
})

Audio

await sock.sendMessage(jid, {
    audio: {
        url: './audio.mp3'
    },
    mimetype: 'audio/mp4',
    ptt: true
})

Sticker

await sock.sendMessage(jid, {
    sticker: {
        url: './sticker.webp'
    }
})

Document

await sock.sendMessage(jid, {
    document: {
        url: './file.pdf'
    },
    mimetype: 'application/pdf',
    fileName: 'document.pdf'
})

---

🎛️ Interactive Messages

Buttons

await sock.sendMessage(jid, {
    text: 'Choose an option:',
    footer: 'Yudzxml',
    buttons: [
        {
            buttonId: 'option_1',
            buttonText: {
                displayText: 'Option 1'
            },
            type: 1
        },
        {
            buttonId: 'option_2',
            buttonText: {
                displayText: 'Option 2'
            },
            type: 1
        }
    ]
})

List

await sock.sendMessage(jid, {
    text: 'Select a menu:',
    buttonText: 'Open Menu',
    sections: [
        {
            title: 'Options',
            rows: [
                {
                    title: 'Item 1',
                    rowId: 'item_1',
                    description: 'First option'
                },
                {
                    title: 'Item 2',
                    rowId: 'item_2',
                    description: 'Second option'
                }
            ]
        }
    ]
})

Native Interactive Actions

await sock.sendMessage(jid, {
    text: 'Yudzxml',
    footer: 'Interactive Message',
    interactiveButtons: [
        {
            name: 'cta_url',
            buttonParamsJson: JSON.stringify({
                display_text: 'Open Website',
                url: 'https://yudzxml.com'
            })
        },
        {
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({
                display_text: 'Confirm',
                id: 'confirm'
            })
        }
    ]
})

---

🤖 Rich Response

Yudzxml provides a builder-based API for structured WhatsApp rich responses.

import { AIRich } from '@yudzxml/baileys'

const rich = new AIRich(sock)
    .setTitle('YUDZXML')
    .setFooter('Powered by Yudzxml')
    .addText('Hello from a rich response.')
    .addCode(
        'javascript',
        'console.log("Yudzxml")'
    )
    .addTable([
        ['Feature', 'Status'],
        ['AIRich', 'Ready'],
        ['HTML App', 'Ready']
    ])

await rich.send(jid)

Available Components

Method| Purpose
"addText()"| Markdown text
"addCode()"| Code block
"addTable()"| Table
"addSource()"| Sources/citations
"addReels()"| Reels content
"addImage()"| Image content
"addVideo()"| Video content
"addProduct()"| Product card
"addPost()"| Post card
"addMetadata()"| Metadata
"addTip()"| Tip/information
"addWidget()"| Custom widget
"addFooterAction()"| Footer action
"addSuggest()"| Suggestion button
"addSection()"| Custom section

---

✏️ Live Rich Response Editing

A previously sent rich response can be updated using "sendEdit()".

const rich = new AIRich(sock)
    .addText('Processing...', {
        id: 'status'
    })

await rich.send(jid)

rich.addImage('', {
    status: 'GENERATING',
    insertAt: 'status',
    id: 'preview'
})

await rich.sendEdit()

rich.addImage(
    'https://example.com/result.jpg',
    {
        replace: 'preview'
    }
)

await rich.sendEdit()

The builder also exposes item management helpers:

rich.getIds()
rich.hasId(id)
rich.peek(id)
rich.assignId(index, id)
rich.delete(id)

---

🌐 HTML Mini Apps

Yudzxml supports interactive HTML content through the HTML rich-message interface.

A mini app can contain:

- HTML
- CSS
- JavaScript
- Interactive controls
- Custom layouts
- Client-side state

Basic Example

import {
    sendHtmlApp
} from '@yudzxml/baileys'

const html = `
<!DOCTYPE html>
<html>
<body>
    <h2>Yudzxml Mini App</h2>

    <div id="count">0</div>

    <button onclick="
        count++;
        document.getElementById('count').textContent = count
    ">
        +1
    </button>

    <script>
        let count = 0
    </script>
</body>
</html>
`

await sendHtmlApp(
    sock,
    jid,
    html,
    {
        title: 'YUDZXML MINI APP',
        label: 'Interactive HTML',
        height: 420,
        trustedSources: []
    }
)

Socket API

await sock.sendHtmlApp(
    jid,
    html,
    {
        label: 'Interactive HTML'
    }
)

HTML Validation

Before sending:

import {
    checkHtmlApp
} from '@yudzxml/baileys'

const result = checkHtmlApp(html)

console.log(result)

The validator checks the HTML payload and reports problems or warnings that may affect rendering.

«Compatibility: HTML Mini App rendering depends on WhatsApp client support. Unsupported clients may display the fallback label instead of the interactive application.»

---

🎠 Carousel

await sock.sendMessage(jid, {
    text: 'Choose a product',
    title: 'Products',
    interactiveMessage: {
        carouselMessage: {
            cards: [
                {
                    title: 'Product 1',
                    description: 'First product'
                },
                {
                    title: 'Product 2',
                    description: 'Second product'
                }
            ]
        }
    }
})

---

📊 Polls

await sock.sendMessage(jid, {
    poll: {
        name: 'Favorite language?',
        values: [
            'JavaScript',
            'TypeScript',
            'Python'
        ],
        selectableCount: 1
    }
})

---

🖼️ Albums

await sock.sendMessage(jid, {
    album: [
        {
            image: {
                url: 'https://example.com/1.jpg'
            },
            caption: 'Image 1'
        },
        {
            image: {
                url: 'https://example.com/2.jpg'
            },
            caption: 'Image 2'
        }
    ]
})

---

📅 Events

await sock.sendMessage(jid, {
    event: {
        name: 'Yudzxml Meetup',
        description: 'Developer meetup',
        startTime: Date.now() + 86_400_000,
        endTime: Date.now() + 90_000_000,
        location: {
            degreesLatitude: 0,
            degreesLongitude: 0,
            name: 'Online'
        }
    }
})

---

🛍️ Business

Catalog

const catalog = await sock.getCatalog(jid, 10)

Product

const product =
    await sock.getProductDetails(productId)

Order

const order =
    await sock.getOrderDetails(orderId)

Product Management

await sock.productCreate({
    name: 'Yudzxml Product',
    price: 100000
})

await sock.productUpdate(
    productId,
    {
        description: 'Updated product'
    }
)

await sock.productDelete([
    productId
])

---

🏘️ Communities

const community =
    await sock.communityCreate(
        'Yudzxml Community',
        'Developer community'
    )

Link a group:

await sock.communityLinkGroup(
    communityId,
    groupId
)

Fetch metadata:

const metadata =
    await sock.communityMetadata(
        communityId
    )

Participant requests:

const requests =
    await sock.communityRequestParticipantsList(
        communityId
    )

---

📢 Newsletters

Create a channel:

const newsletter =
    await sock.newsletterCreate(
        'Yudzxml Channel',
        'Official channel'
    )

Follow:

await sock.newsletterFollow(jid)

React:

await sock.newsletterReactMessage(
    jid,
    messageId,
    '🔥'
)

Fetch messages:

const messages =
    await sock.newsletterFetchMessages(
        jid,
        'guest',
        50
    )

---

👥 Groups

Create

const group = await sock.groupCreate(
    'Yudzxml Dev',
    [
        '6281234567890@s.whatsapp.net'
    ]
)

Metadata

const metadata =
    await sock.groupMetadata(jid)

Participants

await sock.groupParticipantsUpdate(
    jid,
    [
        '6281234567890@s.whatsapp.net'
    ],
    'add'
)

Settings

await sock.groupSettingUpdate(
    jid,
    'announcement'
)

Invite

const code =
    await sock.groupInviteCode(jid)

---

🔒 Privacy

await sock.updateBlockStatus(
    jid,
    'block'
)

await sock.updateLastSeenPrivacy(
    'contacts'
)

await sock.updateOnlinePrivacy(
    'match_last_seen'
)

await sock.updateProfilePicturePrivacy(
    'none'
)

await sock.updateReadReceiptsPrivacy(
    'none'
)

---

🧰 Utilities

The package exposes several utilities directly from the root module:

import {
    getContentType,
    downloadMediaMessage,
    getDevice,
    fetchLatestBaileysVersion,
    getAggregateVotesInPollMessage,
    jidNormalizedUser,
    areJidsSameUser,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    generateMessageID,
    decodeHtmlRich,
    decodeUnifiedResponse,
    makeInMemoryStore
} from '@yudzxml/baileys'

---

🗂️ Project Structure

Baileys/
├── lib/
│   ├── index.js
│   ├── Defaults/
│   ├── Socket/
│   ├── Signal/
│   ├── Store/
│   ├── Types/
│   ├── Utils/
│   ├── MessageBuilder/
│   ├── WABinary/
│   ├── WAM/
│   └── WAUSync/
│
├── WAProto/
│   ├── index.js
│   └── index.d.ts
│
├── examples/
│   ├── ai-rich.js
│   ├── html-rich.js
│   └── buttons-carousel.js
│
├── tests/
│   ├── rich-response.test.js
│   ├── html-rich.test.js
│   └── smoke-socket.mjs
│
├── scripts/
├── engine-requirements.js
├── package.json
└── README.md

---

🧪 Examples

Run the bundled examples:

node examples/ai-rich.js

node examples/html-rich.js

node examples/buttons-carousel.js

For HTML Mini App testing:

DEMO_JID=628xxxxxxxxxx@s.whatsapp.net \
node examples/html-rich.js

---

🧪 Tests

Run the test suite:

npm test

Run the socket smoke test:

node tests/smoke-socket.mjs

The test suite covers message building, serialization, rich-response decoding, HTML payload handling, malformed payload protection and compatibility paths.

---

🩺 Troubleshooting

<details>
<summary><b>401 — Logged Out</b></summary>The linked session has been revoked.

Remove the existing authentication state and authenticate again using QR or pairing code.

Do not continuously reconnect a session that has been logged out.

</details><details>
<summary><b>440 — Connection Replaced</b></summary>Another client is using the same authentication state.

Stop the duplicate process or use a different authentication state.

</details><details>
<summary><b>515 — Restart Required</b></summary>WhatsApp may request a restart after the initial device linking process.

Reconnect using the same authentication state.

</details><details>
<summary><b>Bad MAC / Decryption Error</b></summary>The Signal session may be out of sync.

Enable session recreation and provide a working "getMessage" implementation for message retry operations.

</details><details>
<summary><b>HTML Mini App Not Rendering</b></summary>HTML Mini Apps require a compatible WhatsApp client.

Check the generated payload using:

const result = checkHtmlApp(html)

Unsupported clients may display the fallback text instead.

</details>---

⚠️ Disclaimer

Yudzxml Baileys is an unofficial, community-driven project and is not affiliated with, endorsed by, or sponsored by WhatsApp or Meta.

This project communicates with WhatsApp through reverse-engineered protocol behavior.

Do not use this library for:

- Spam
- Bulk unsolicited messaging
- Stalkerware
- Abuse
- Fraud
- Activities that violate WhatsApp policies

Users are responsible for their own implementation and usage.

See the "MIT License" (LICENSE) for the applicable software license.

---

🤝 Contributing

Contributions are welcome.

git checkout -b feature/my-feature

Make your changes, test them, then submit a Pull Request.

Please keep contributions focused, tested and compatible with the existing API.

---

📄 License

MIT — Copyright © 2026 Yudzxml.

See "LICENSE" (LICENSE).

---

<div align="center">Yudzxml Baileys

Build bots. Build integrations. Build your own WhatsApp stack.

<br><a href="https://www.npmjs.com/package/@yudzxml/baileys">
  <img src="https://img.shields.io/badge/NPM-%40yudzxml%2Fbaileys-CB3837?logo=npm&logoColor=white" alt="NPM"/>
</a><a href="https://github.com/Yudzxml/Baileys">
  <img src="https://img.shields.io/badge/GitHub-Yudzxml%2FBaileys-181717?logo=github&logoColor=white" alt="GitHub"/>
</a><a href="https://whatsapp.com/channel/0029VbA78K82f3EGd78yGU28">
  <img src="https://img.shields.io/badge/WhatsApp-Community-25D366?logo=whatsapp&logoColor=white" alt="WhatsApp"/>
</a><br><br>

Made with ❤️ by Yudzxml

</div>
