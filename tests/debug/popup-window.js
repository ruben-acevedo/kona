// N3 (correção): pop-up de verdade vira janela ligada à página (não uma aba em branco); "abrir em nova
// aba" continua virando aba; pop-up sem clique continua bloqueado. Simula o login "Entrar com…" (a
// janela manda a resposta de volta pela window.opener) e a janela em branco preenchida pela página (Meet).
const os = require('os'); const path = require('path'); const http = require('http');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-popwin-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow, webContents } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PAGE = `<!doctype html><title>Opener</title><body style="font:15px sans-serif;margin:40px">
<button id="blank" style="padding:10px">Blank popup</button> <button id="login" style="padding:10px">Sign in with…</button>
<a id="tab" href="/other" target="_blank">open in new tab</a><p id="out">idle</p>
<script>
window.addEventListener('message', (e) => { document.getElementById('out').textContent = 'got ' + e.data; });
document.getElementById('blank').onclick = () => { const w = window.open('', 'ctl', 'width=320,height=200'); w.document.write('<title>Controls</title><h3>You are presenting</h3>'); window._w = w; };
document.getElementById('login').onclick = () => { window.open('/login', 'auth', 'width=480,height=520'); };
</script></body>`;
const LOGIN = `<!doctype html><title>Sign in</title><p>signing in…</p><script>setTimeout(() => { window.opener.postMessage('token-123', '*'); window.close(); }, 600);</script>`;
const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(req.url === '/login' ? LOGIN : req.url === '/other' ? '<title>Other</title>other' : PAGE); });
app.whenReady().then(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let win; while (!(win = BrowserWindow.getAllWindows()[0])) await sleep(50);
  const wc = win.webContents;
  await sleep(3000);
  const js = (c) => wc.executeJavaScript(c);
  const log = (...a) => console.log('R', ...a);
  await js(`settings.sounds = false; navigate(active(), ${JSON.stringify(base + '/')}); 0`);
  let g = null;
  for (let i = 0; i < 80 && !g; i++) { g = webContents.getAllWebContents().find((w) => w.getType() === 'webview' && w.getURL() === base + '/'); await sleep(100); }
  await sleep(800);
  g.focus(); g.sendInputEvent({ type: 'mouseDown', x: 700, y: 400, button: 'left', clickCount: 1 }); g.sendInputEvent({ type: 'mouseUp', x: 700, y: 400, button: 'left', clickCount: 1 }); await sleep(300);
  const click = async (sel) => { const p = await g.executeJavaScript(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: Math.round(r.x + 8), y: Math.round(r.y + 8) }; })()`); g.sendInputEvent({ type: 'mouseDown', ...p, button: 'left', clickCount: 1 }); g.sendInputEvent({ type: 'mouseUp', ...p, button: 'left', clickCount: 1 }); await sleep(1200); };
  const state = async () => `abas: ${await js('tabs.length')} · janelas: ${BrowserWindow.getAllWindows().length} (${BrowserWindow.getAllWindows().map((w) => w.getTitle()).join(' | ')})`;

  await click('#blank');
  log('pop-up em branco preenchido pela página (Meet):', await state());
  for (const w of BrowserWindow.getAllWindows()) if (w !== win) w.close();
  await sleep(500);
  await click('#login');
  await sleep(1500);
  log('"Entrar com…": resposta chegou na página:', await g.executeJavaScript(`document.querySelector('#out').textContent`), '·', await state());
  await click('#tab');
  log('"abrir em nova aba":', await state());
  server.close();
  app.exit(0);
});
