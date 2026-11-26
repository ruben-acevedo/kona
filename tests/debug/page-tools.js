// K1: buscar na página (Ctrl+F, Enter, Shift+Enter, Esc), zoom por site (Ctrl+= / Ctrl+- / Ctrl+0,
// indicador na barra, outra aba do mesmo site) e reabrir aba fechada (Ctrl+Shift+T).
const os = require('os'); const fs = require('fs'); const path = require('path'); const http = require('http');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-tools-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow, webContents } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = path.join(__dirname, '..', 'output-windows', 'page-tools'); fs.mkdirSync(OUT, { recursive: true });
const PAGE = (n) => `<!doctype html><html><head><meta charset="utf-8"><title>Page ${n}</title></head><body style="font:16px sans-serif;margin:40px">
${Array.from({ length: 5 }, (_, i) => `<p>Paragraph ${i + 1}: the pineapple is a tropical plant; pineapple juice is sweet.</p>`).join('')}</body></html>`;
const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(PAGE(req.url)); });

app.whenReady().then(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let wc; while (!(wc = BrowserWindow.getAllWindows()[0]?.webContents)) await sleep(50);
  await sleep(3500);
  wc.on('console-message', (e) => { if (e.level === 'error' || /Uncaught/.test(e.message)) console.log('C erro:', e.message); });
  const js = (c) => wc.executeJavaScript(c);
  const log = (...a) => console.log('R', ...a);
  const shot = async (name) => { await sleep(300); fs.writeFileSync(path.join(OUT, name), (await wc.capturePage()).toPNG()); };
  const press = async (target, keyCode, modifiers = []) => {
    target.sendInputEvent({ type: 'keyDown', keyCode, modifiers }); target.sendInputEvent({ type: 'keyUp', keyCode, modifiers }); await sleep(350);
  };
  const guestFor = async (url) => { for (let i = 0; i < 50; i++) { const g = webContents.getAllWebContents().find((w) => w.getType() === 'webview' && w.getURL() === url); if (g) return g; await sleep(100); } return null; };
  await js(`settings.sounds = false; navigate(active(), ${JSON.stringify(base + '/a')}); 0`);
  const g = await guestFor(base + '/a'); await sleep(1200);
  g.focus();

  // buscar na página (o atalho vem de dentro da página)
  await press(g, 'F', ['control']);
  log('Ctrl+F abre:', await js(`document.querySelector('#find-bar').classList.contains('show') && document.activeElement.id`));
  for (const ch of 'pineapple') { wc.sendInputEvent({ type: 'char', keyCode: ch }); await sleep(20); }
  await sleep(600);
  log('contagem:', await js(`document.querySelector('#fb-count').textContent`));
  await press(wc, 'Return'); await press(wc, 'Return');
  log('Enter, Enter:', await js(`document.querySelector('#fb-count').textContent`));
  await press(wc, 'Return', ['shift']);
  log('Shift+Enter:', await js(`document.querySelector('#fb-count').textContent`));
  await shot('find.png');
  for (const ch of 'xyz') { wc.sendInputEvent({ type: 'char', keyCode: ch }); await sleep(20); }
  await sleep(500);
  log('sem resultado:', await js(`document.querySelector('#fb-count').textContent + ' · vermelho: ' + document.querySelector('#find-bar').classList.contains('none')`));
  await press(wc, 'Escape');
  log('Esc fecha:', await js(`!document.querySelector('#find-bar').classList.contains('show')`));

  // zoom por site
  g.focus();
  await press(g, '=', ['control']); await sleep(400);
  log('Ctrl+= :', g.getZoomFactor(), '· barra:', await js(`(() => { const z = document.querySelector('#tabs .tab.active .zoomind'); return z.hidden ? 'escondido' : z.textContent; })()`), '· guardado:', await js(`JSON.stringify(settings.siteZoom)`));
  await press(g, '=', ['control']); await sleep(300);
  log('Ctrl+= de novo:', g.getZoomFactor());
  await shot('zoom.png');
  await js(`newTab(${JSON.stringify(base + '/b')}); 0`);
  const g2 = await guestFor(base + '/b'); await sleep(1500);
  log('outra aba do mesmo site abre com:', g2.getZoomFactor());
  g2.focus();
  await press(g2, '0', ['control']); await sleep(400);
  log('Ctrl+0:', g2.getZoomFactor(), '· primeira aba também:', g.getZoomFactor(), '· barra:', await js(`document.querySelector('#tabs .tab.active .zoomind').hidden ? 'escondido' : 'visível'`), '· guardado:', await js(`JSON.stringify(settings.siteZoom)`));
  await press(g2, '-', ['control']); await sleep(300);
  log('Ctrl+- :', g2.getZoomFactor());
  await press(g2, '0', ['control']);

  // reabrir aba fechada
  const before = await js(`tabs.map((t) => t.url.replace(${JSON.stringify(base)}, '')).join(', ')`);
  await press(g2, 'W', ['control']); await sleep(500);
  const mid = await js(`tabs.map((t) => t.url.replace(${JSON.stringify(base)}, '')).join(', ')`);
  await press(wc, 'T', ['control', 'shift']); await sleep(800);
  log('reabrir aba fechada:', before, '→ (Ctrl+W)', mid, '→ (Ctrl+Shift+T)', await js(`tabs.map((t) => t.url.replace(${JSON.stringify(base)}, '')).join(', ') + ' · ativa: ' + active().url.replace(${JSON.stringify(base)}, '')`));
  await press(wc, 'T', ['control', 'shift']); await sleep(500);
  log('sem mais abas para reabrir:', await js(`document.querySelector('#toast').textContent`));
  server.close();
  app.exit(0);
});
