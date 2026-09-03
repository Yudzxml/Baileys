/**
 * examples/html-snake.js
 * Yudzxml@Changes 03-09-26
 *
 * Snake HTML Mini App (GenAIaeacdsnwHtmlPrimitive).
 * Canvas/grid, snake, food, score, level, keyboard + touch controls,
 * pause, reset, start, animation loop — all inside the HTML payload.
 *
 * Run: DEMO_JID=628xxxxxxxxxx@s.whatsapp.net node examples/html-snake.js
 */
import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, sendHtmlApp, decodeHtmlRich } from '../lib/index.js';
import pino from 'pino';

const DEMO_JID = process.env.DEMO_JID;

const html = `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body {
    background: #0a0a0a;
    color: #e6edf3;
    font-family: monospace;
    text-align: center;
    margin: 0;
    padding: 10px;
    user-select: none;
    -webkit-user-select: none;
    touch-action: manipulation;
  }

  h2 { margin: 4px 0 10px; color: #25D366; letter-spacing: 2px; }

  #hud { display: flex; justify-content: space-between; max-width: 320px; margin: 0 auto 6px; font-size: 14px; }

  canvas {
    background: #111;
    border: 2px solid #25D366;
    border-radius: 8px;
    touch-action: none;
  }

  .row { display: flex; gap: 8px; justify-content: center; margin-top: 10px; flex-wrap: wrap; }

  button {
    padding: 10px 16px;
    border: none;
    border-radius: 10px;
    background: #1f6feb;
    color: #fff;
    font-size: 14px;
    font-weight: bold;
    font-family: monospace;
  }

  button.stop { background: #da3633; }
</style>
</head>

<body>

<h2>SNAKE</h2>

<div id="hud">
  <span>SCORE: <b id="score">0</b></span>
  <span>LEVEL: <b id="level">1</b></span>
  <span>HIGH: <b id="high">0</b></span>
</div>

<canvas id="game" width="320" height="320"></canvas>

<div class="row">
  <button onclick="startGame()">START</button>
  <button onclick="togglePause()">PAUSE</button>
  <button class="stop" onclick="resetGame()">RESET</button>
</div>

<script>
const CELL = 16
const COLS = 20
const ROWS = 20

const canvas = document.getElementById('game')
const ctx = canvas.getContext('2d')

let snake, dir, nextDir, food, score, level, speed
let running = false
let paused = false
let loopTimer = null

let high = Number(localStorage.getItem('snakeHigh') || 0)
document.getElementById('high').textContent = high

function init() {
  snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }]
  dir = { x: 1, y: 0 }
  nextDir = dir
  food = spawnFood()
  score = 0
  level = 1
  speed = 160
  updateHud()
}

function spawnFood() {
  while (true) {
    const f = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) }
    if (!snake.some(s => s.x === f.x && s.y === f.y)) return f
  }
}

function updateHud() {
  document.getElementById('score').textContent = score
  document.getElementById('level').textContent = level
  document.getElementById('high').textContent = high
}

function startGame() {
  if (running) return
  init()
  running = true
  paused = false
  schedule()
}

function schedule() {
  clearTimeout(loopTimer)
  loopTimer = setTimeout(tick, speed)
}

function togglePause() {
  if (!running) return
  paused = !paused
  draw()
  if (!paused) schedule()
}

function resetGame() {
  running = false
  paused = false
  clearTimeout(loopTimer)
  init()
  draw()
}

function gameOver() {
  running = false
  clearTimeout(loopTimer)
  if (score > high) {
    high = score
    localStorage.setItem('snakeHigh', high)
  }
  updateHud()
  draw()
  ctx.fillStyle = 'rgba(0,0,0,.65)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#da3633'
  ctx.font = 'bold 26px monospace'
  ctx.fillText('GAME OVER', 84, 150)
  ctx.fillStyle = '#e6edf3'
  ctx.font = '14px monospace'
  ctx.fillText('SCORE: ' + score + '  -  tekan START', 70, 180)
}

function tick() {
  if (!running || paused) return

  dir = nextDir
  const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y }

  const hitWall = head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS
  const hitSelf = snake.some(s => s.x === head.x && s.y === head.y)
  if (hitWall || hitSelf) return gameOver()

  snake.unshift(head)

  if (head.x === food.x && head.y === food.y) {
    score += 10
    if (score % 50 === 0) {
      level = Math.min(9, level + 1)
      speed = Math.max(60, 160 - level * 12)
    }
    food = spawnFood()
    updateHud()
  } else {
    snake.pop()
  }

  draw()
  schedule()
}

function draw() {
  ctx.fillStyle = '#111'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // grid
  ctx.strokeStyle = 'rgba(255,255,255,.04)'
  for (let i = 0; i <= COLS; i++) {
    ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, canvas.height); ctx.stroke()
  }
  for (let j = 0; j <= ROWS; j++) {
    ctx.beginPath(); ctx.moveTo(0, j * CELL); ctx.lineTo(canvas.width, j * CELL); ctx.stroke()
  }

  // food
  ctx.fillStyle = '#da3633'
  ctx.beginPath()
  ctx.arc(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, CELL / 2 - 2, 0, Math.PI * 2)
  ctx.fill()

  // snake
  snake.forEach((s, i) => {
    ctx.fillStyle = i === 0 ? '#25D366' : 'rgba(37,211,102,' + Math.max(0.35, 1 - i * 0.03) + ')'
    ctx.fillRect(s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2)
  })

  if (paused) {
    ctx.fillStyle = 'rgba(0,0,0,.55)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#e6edf3'
    ctx.font = 'bold 22px monospace'
    ctx.fillText('PAUSED', 118, 158)
  }
}

// keyboard controls
document.addEventListener('keydown', e => {
  const map = {
    ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
    w: { x: 0, y: -1 }, s: { x: 0, y: 1 },
    a: { x: -1, y: 0 }, d: { x: 1, y: 0 }
  }
  const d = map[e.key]
  if (d && !(d.x === -dir.x && d.y === -dir.y)) {
    nextDir = d
    e.preventDefault()
  }
  if (e.key === ' ') togglePause()
})

// touch/swipe controls
let touchStart = null
canvas.addEventListener('touchstart', e => {
  touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY }
}, { passive: true })

canvas.addEventListener('touchend', e => {
  if (!touchStart) return
  const dx = e.changedTouches[0].clientX - touchStart.x
  const dy = e.changedTouches[0].clientY - touchStart.y
  let d
  if (Math.abs(dx) > Math.abs(dy)) d = { x: dx > 0 ? 1 : -1, y: 0 }
  else d = { x: 0, y: dy > 0 ? 1 : -1 }
  if (!(d.x === -dir.x && d.y === -dir.y)) nextDir = d
  touchStart = null
}, { passive: true })

init()
draw()
</script>

</body>
</html>
`;

const run = async () => {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_html_snake');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ['Snake Example', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const msg of messages) {
            const decoded = decodeHtmlRich(msg);
            if (decoded.found) {
                console.log('=== HTML CAPTURED ===');
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
        console.log('Set DEMO_JID to send the demo, e.g. DEMO_JID=62812xxxx@s.whatsapp.net');
        sock.end(undefined);
        return;
    }

    // sendHtmlApp — one-shot helper (relay + bypassDownload MESSAGE_EDIT follow-up)
    await sendHtmlApp(sock, DEMO_JID, html, {
        title: 'YUDZXML SNAKE',
        text: 'Snake mini app — swipe atau pakai arrow keys',
        height: 520
    });
    console.log('Snake mini app sent via sendHtmlApp (standalone, sock-first)');

    await new Promise(r => setTimeout(r, 3000));
    sock.end(undefined);
};

run().catch(err => {
    console.error(err);
    process.exit(1);
});
