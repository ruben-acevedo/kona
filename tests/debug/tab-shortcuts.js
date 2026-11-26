// N8: Ctrl+1…9, Ctrl+PgUp/PgDn, Ctrl+Shift+PgUp/PgDn (na interface e com o foco dentro da página) e
// soltar um link/texto na barra de abas (sobre uma aba → abre nela; entre abas → aba nova ali).
const os = require('os'); const path = require('path'); const http = require('http');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-tabkeys-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow, webContents } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(`<title>P${req.url}</title><body>page ${req.url}`); });
const log = (...a) => console.log('R', ...a);
app.whenReady().then(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let w; while (!(w = BrowserWindow.getAllWindows()[0])) await sleep(50);
  await sleep(3000);
  const js = (c) => w.webContents.executeJavaScript(c);
  const strip = () => js('tabs.map((t) => (t.id === activeId ? "*" : "") + (t.pinned ? "📌" : "") + t.url.replace(/^https?:\\/\\/[^/]+/, "")).join(" ")');
  await js(`settings.sounds = false; navigate(active(), '${base}/1'); for (const n of [2, 3, 4, 5]) newTab('${base}/' + n, false); 0`); await sleep(2000);
  const key = async (target, k, mods = ['control']) => {
    target.sendInputEvent({ type: 'keyDown', keyCode: k, modifiers: mods });
    target.sendInputEvent({ type: 'keyUp', keyCode: k, modifiers: mods });
    await sleep(350);
  };
  w.focus(); w.webContents.focus(); await js('document.activeElement?.blur(); 0');
  await key(w.webContents, '2'); log('Ctrl+2 (interface):', await strip());
  await key(w.webContents, '9'); log('Ctrl+9:', await strip());
  await key(w.webContents, 'PageUp'); log('Ctrl+PgUp:', await strip());
  await key(w.webContents, 'PageDown'); log('Ctrl+PgDn:', await strip());
  await key(w.webContents, 'PageDown'); log('Ctrl+PgDn de novo (volta ao começo):', await strip());
  await key(w.webContents, 'PageDown', ['control', 'shift']); log('Ctrl+Shift+PgDn (leva a aba):', await strip());
  await key(w.webContents, 'PageUp', ['control', 'shift']); log('Ctrl+Shift+PgUp:', await strip());
  // com o foco dentro da página
  await js('activate(tabs[2].id); 0'); await sleep(1200);
  const g = webContents.fromId(await js('active().wv.getWebContentsId()'));
  g.focus(); await sleep(300);
  await key(g, '1'); log('Ctrl+1 (foco na página):', await strip());
  await js('activate(tabs[2].id); 0'); await sleep(800); g.focus(); await sleep(200);
  await key(g, 'PageDown'); log('Ctrl+PgDn (foco na página):', await strip());
  // fixada não sai da zona das fixadas
  await js('library.pin(tabs[3]); render(); activate(tabs[0].id); 0'); await sleep(500);
  log('fixou a 4ª:', await strip());
  await key(w.webContents, 'PageUp', ['control', 'shift']); log('Ctrl+Shift+PgUp na 1ª não-fixada (não entra nas fixadas):', await strip());

  // soltar link/texto
  const drop = (x, data) => js(`(() => {
    const dt = new DataTransfer(); for (const [k, v] of Object.entries(${JSON.stringify(data)})) dt.setData(k, v);
    const strip = document.querySelector('#tabs'); const y = strip.getBoundingClientRect().top + 15;
    strip.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: ${x}, clientY: y, dataTransfer: dt }));
    const mark = document.querySelector('#tabs .drop-into, #tabs .drop-before, #tabs .drop-after')?.className.match(/drop-\\w+/)[0] || 'nenhum';
    strip.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: ${x}, clientY: y, dataTransfer: dt }));
    return mark;
  })()`);
  const mid = await js("(() => { const r = $$('#tabs .tab:not(.leaving)')[2].getBoundingClientRect(); return Math.round(r.left + r.width / 2); })()");
  log('soltar link no meio da 3ª aba (marca:', await drop(mid, { 'text/uri-list': `${base}/dropped` }), ') →', await strip());
  await sleep(800);
  const edge = await js("(() => { const r = $$('#tabs .tab:not(.leaving)')[2].getBoundingClientRect(); return Math.round(r.left + 3); })()");
  log('soltar link na borda da 3ª (marca:', await drop(edge, { 'text/uri-list': `${base}/between` }), ') →', await strip());
  await sleep(800);
  const end = await js("(() => { const r = document.querySelector('#tabs').getBoundingClientRect(); return Math.round(r.right - 5); })()");
  log('soltar texto no fim da barra (marca:', await drop(end, { 'text/plain': 'kona browser' }), ') →', await strip());
  log('   a aba nova buscou:', await js('active().url.slice(0, 60)'));
  log('soltar "javascript:" é ignorado:', await drop(mid, { 'text/plain': 'javascript:alert(1)' }) && await js('tabs.length'));
  server.close(); app.exit(0);
});
