/**
 * examples/html-tictactoe.js
 * Yudzxml@Changes 03-09-26
 *
 * Tic-Tac-Toe HTML Mini App (GenAIaeacdsnwHtmlPrimitive).
 * Board 3x3, X/O turn, winner detection, reset, score, dark UI —
 * everything inside the HTML payload (CSS + interactive JS).
 *
 * Run: DEMO_JID=628xxxxxxxxxx@s.whatsapp.net node examples/html-tictactoe.js
 */
import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, RichBuilder, decodeHtmlRich } from '../lib/index.js';
import pino from 'pino';

const DEMO_JID = process.env.DEMO_JID;

const html = `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body {
    background: #0d1117;
    color: #e6edf3;
    font-family: 'Segoe UI', sans-serif;
    text-align: center;
    margin: 0;
    padding: 12px;
  }

  h2 { margin: 4px 0 12px; letter-spacing: 2px; }

  #board {
    display: grid;
    grid-template-columns: repeat(3, 72px);
    gap: 6px;
    justify-content: center;
  }

  .cell {
    width: 72px;
    height: 72px;
    border: none;
    border-radius: 12px;
    background: #161b22;
    color: #58a6ff;
    font-size: 34px;
    font-weight: bold;
  }

  .cell.o { color: #f78166; }
  .cell.win { background: #1f6feb; color: #fff; }

  #status { margin: 14px 0 10px; font-size: 16px; min-height: 22px; }

  .row { display: flex; gap: 10px; justify-content: center; margin-top: 6px; }

  button.act {
    padding: 10px 18px;
    border: none;
    border-radius: 10px;
    background: #238636;
    color: #fff;
    font-size: 15px;
    font-weight: bold;
  }

  #score { margin-top: 10px; color: #8b949e; font-size: 14px; }
</style>
</head>

<body>

<h2>TIC-TAC-TOE</h2>

<div id="status">Giliran: X</div>

<div id="board"></div>

<div class="row">
  <button class="act" onclick="resetBoard()">RESET</button>
</div>

<div id="score">X: 0 &bull; O: 0 &bull; Draw: 0</div>

<script>
let board, turn, over, score = { X: 0, O: 0, D: 0 }

const LINES = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6]
]

function init() {
  board = Array(9).fill('')
  turn = 'X'
  over = false
  render()
  setStatus('Giliran: ' + turn)
}

function render(winLine) {
  const el = document.getElementById('board')
  el.innerHTML = ''
  board.forEach((v, i) => {
    const b = document.createElement('button')
    b.className = 'cell' + (v === 'O' ? ' o' : '') + (winLine && winLine.includes(i) ? ' win' : '')
    b.textContent = v
    b.onclick = () => play(i)
    el.appendChild(b)
  })
  document.getElementById('score').innerHTML =
    'X: ' + score.X + ' &bull; O: ' + score.O + ' &bull; Draw: ' + score.D
}

function setStatus(s) {
  document.getElementById('status').textContent = s
}

function play(i) {
  if (over || board[i]) return
  board[i] = turn
  const win = checkWin()
  if (win) {
    over = true
    score[turn]++
    render(win)
    setStatus(turn + ' MENANG!')
    return
  }
  if (board.every(v => v)) {
    over = true
    score.D++
    render()
    setStatus('SERI!')
    return
  }
  turn = turn === 'X' ? 'O' : 'X'
  render()
  setStatus('Giliran: ' + turn)
}

function checkWin() {
  for (const line of LINES) {
    const [a, b, c] = line
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return line
  }
  return null
}

function resetBoard() {
  init()
}

init()
</script>

</body>
</html>
`;

const run = async () => {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_html_tictactoe');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ['TicTacToe Example', 'Chrome', '1.0.0']
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

    await sock.sendUnifiedResponse(DEMO_JID, {
        text: 'YUDZXML TIC-TAC-TOE',
        sections: [RichBuilder.html(html)]
    });
    console.log('Tic-Tac-Toe mini app sent via sendUnifiedResponse + RichBuilder.html');

    await new Promise(r => setTimeout(r, 3000));
    sock.end(undefined);
};

run().catch(err => {
    console.error(err);
    process.exit(1);
});
