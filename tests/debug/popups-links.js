// N3/N4 (conferência): pop-up sem clique, pop-up com clique, link mailto: (a resposta é "Block", nada abre).
const os = require('os'); const path = require('path'); const http = require('http');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-pop-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow, webContents } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PAGE = `<!doctype html><title>Pop</title><body style="font:15px sans-serif;margin:40px">
<button id="b" onclick="window.open('/clicked', '_blank')">Open with click</button>
<p><a id="m" href="mailto:test@example.com">mailto link</a></p>
<p><a id="t" href="target=_blank" target="_blank">target blank link</a></p>
<script>setTimeout(() => window.open('/ad-popup'), 1500);</script></body>`;
const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(req.url === '/' ? PAGE : `<title>${req.url}</title>${req.url}`); });
app.whenReady().then(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let wc; while (!(wc = BrowserWindow.getAllWindows()[0]?.webContents)) await sleep(50);
  await sleep(3000);
  const js = (c) => wc.executeJavaScript(c);
  const log = (...a) => console.log('R', ...a);
  const urls = () => js(`tabs.map((t) => t.url.replace(${JSON.stringify(base)}, '') || '/').join(', ')`);
  await js(`settings.sounds = false; navigate(active(), ${JSON.stringify(base + '/')}); 0`);
  await sleep(4000);
  log('pop-up sem clique (1,5 s depois de abrir):', await urls(), '· aviso na barra:', await js(`!document.querySelector('#tabs .tab.active .popupind').hidden`), '· bloqueados:', await js(`JSON.stringify(active().blockedPopups)`));
  const g = webContents.getAllWebContents().find((w) => w.getType() === 'webview' && w.getURL() === base + '/');
  const click = async (sel) => { const p = await g.executeJavaScript(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: Math.round(r.x + 5), y: Math.round(r.y + 5) }; })()`); g.sendInputEvent({ type: 'mouseDown', ...p, button: 'left', clickCount: 1 }); g.sendInputEvent({ type: 'mouseUp', ...p, button: 'left', clickCount: 1 }); await sleep(1200); };
  await js(`activate(tabs[0].id); 0`); await sleep(500);
  await click('#b');
  log('pop-up com clique:', await urls());
  await js(`activate(tabs[0].id); 0`); await sleep(500);
  await click('#m');
  const asked = await js(`document.querySelector('#perm-sheet').classList.contains('show') ? document.querySelector('#perm-title').textContent : 'não perguntou'`);
  log('link mailto:', asked);
  if (asked !== 'não perguntou') await js(`document.querySelector('#perm-no').click(); 0`);
  // "Always allow pop-ups": recarrega e o pop-up sem clique passa a abrir
  await js(`activate(tabs[0].id); 0`); await sleep(300);
  const r = await js(`(() => { const b = document.querySelector('#tabs .tab.active .popupind'); const r = b.getBoundingClientRect(); return { x: r.left, y: r.bottom }; })()`);
  await js(`popupMenu(active(), 100, 100); 0`); await sleep(300);
  log('menu do aviso:', await js(`[...document.querySelectorAll('#ctx-menu .ctx-label')].map((x) => x.textContent).join(' · ')`));
  await js(`[...document.querySelectorAll('#ctx-menu .ctx-item')].find((x) => x.textContent.includes('Always allow')).click(); 0`); await sleep(400);
  const before = await js(`tabs.length`);
  await js(`active().wv.reload(); 0`); await sleep(4000);
  log('com "sempre permitir", pop-up sem clique abre:', before, '→', await js(`tabs.length`));
  void r;
  server.close();
  app.exit(0);
});
