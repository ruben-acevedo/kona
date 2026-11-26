// L3: extensões completas — instala o uBlock Origin Lite num perfil temporário e confere: fixada na
// barra, lista (quebra-cabeça), popup da extensão, chrome.tabs vendo as abas do Kona e o menu do ícone.
const os = require('os'); const fs = require('fs'); const path = require('path');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-extbar-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow, webContents } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = path.join(__dirname, '..', 'output-windows', 'extensions'); fs.mkdirSync(OUT, { recursive: true });
const UBOL = 'ddkjiahejlhfcafbddmgiahcphecmpfh'; // uBlock Origin Lite
app.whenReady().then(async () => {
  let win; while (!(win = BrowserWindow.getAllWindows()[0])) await sleep(50);
  const wc = win.webContents;
  await sleep(3500);
  wc.on('console-message', (e) => { if (e.level === 'error' || /Uncaught/.test(e.message)) console.log('C erro:', e.message); });
  const js = (c) => wc.executeJavaScript(c);
  const log = (...a) => console.log('R', ...a);
  const until = async (c, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await js(c)) return true; await sleep(250); } return false; };
  await js(`settings.sounds = false; 0`);
  const { session } = require('electron');
  session.fromPartition('persist:kona').serviceWorkers.on('console-message', (_e, d) => log('SW console:', d.message.slice(0, 160)));
  log('preloads da sessão:', JSON.stringify(session.fromPartition('persist:kona').getPreloadScripts().map((p) => p.type + ':' + require('path').basename(p.filePath))));
  log('quebra-cabeça sem extensões:', await js(`document.querySelector('#btn-ext').hidden ? 'escondido' : 'visível'`));
  log('instalar uBlock Origin Lite:', await js(`api.importExtension(${JSON.stringify(UBOL)})`));
  const pinned = await until(`!!document.querySelector('#ext-pinned [data-ext="${UBOL}"]')`);
  log('fixada na barra ao instalar:', pinned, '· quebra-cabeça:', await js(`document.querySelector('#btn-ext').hidden ? 'escondido' : 'visível'`));
  await js(`navigate(active(), 'https://example.com/'); 0`);
  await sleep(3000);
  log('ícone carregou:', await js(`(() => { const i = document.querySelector('#ext-pinned img'); return i && i.complete && i.naturalWidth > 0; })()`), '· título:', await js(`document.querySelector('#ext-pinned [data-ext]')?.title`));

  // lista do quebra-cabeça
  await js(`document.querySelector('#btn-ext').click(); 0`); await sleep(500);
  log('lista:', await js(`[...document.querySelectorAll('#ext-pop .ext-pop-row')].map((r) => r.querySelector('.ext-pop-name').textContent + (r.querySelector('.ext-pin.on') ? ' (fixada)' : '')).join(', ')`));
  fs.writeFileSync(path.join(OUT, 'list.png'), (await wc.capturePage()).toPNG());
  await js(`document.querySelector('#ext-pop [data-pin]').click(); 0`); await sleep(300);
  log('desafixar pela lista → na barra:', await js(`document.querySelectorAll('#ext-pinned [data-ext]').length`));
  await js(`document.querySelector('#ext-pop [data-pin]').click(); closeExtPop(); 0`); await sleep(300);

  // popup
  const before = webContents.getAllWebContents().length;
  await js(`document.querySelector('#ext-pinned [data-ext]').click(); 0`);
  let popup = null;
  for (let i = 0; i < 40 && !popup; i++) { popup = webContents.getAllWebContents().find((w) => w.getURL().startsWith(`chrome-extension://${UBOL}/`) && /popup/i.test(w.getURL())); await sleep(250); }
  log('popup abriu:', !!popup, popup ? popup.getURL().replace(`chrome-extension://${UBOL}`, '') : '', '· webContents:', before, '→', webContents.getAllWebContents().length);
  if (popup) {
    await sleep(1500);
    const pw = BrowserWindow.fromWebContents(popup);
    if (pw) fs.writeFileSync(path.join(OUT, 'popup.png'), (await pw.webContents.capturePage()).toPNG());
    log('chrome.tabs no popup:', await popup.executeJavaScript(`chrome.tabs.query({ active: true, currentWindow: true }).then((t) => t.map((x) => x.url).join(', '))`).catch((e) => 'erro: ' + e.message));
    popup.close?.(); BrowserWindow.fromWebContents(popup)?.close();
  }
  fs.writeFileSync(path.join(OUT, 'bar.png'), (await wc.capturePage()).toPNG());

  // botão direito no ícone
  const r = await js(`(() => { const b = document.querySelector('#ext-pinned [data-ext]').getBoundingClientRect(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }; })()`);
  wc.sendInputEvent({ type: 'mouseDown', ...r, button: 'right', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', ...r, button: 'right', clickCount: 1 });
  await sleep(500);
  log('menu do ícone:', await js(`[...document.querySelectorAll('#ctx-menu > *')].map((el) => el.classList.contains('ctx-sep') ? '|' : (el.classList.contains('disabled') ? '(' + el.textContent.trim() + ')' : el.textContent.trim())).join(' · ')`));
  app.exit(0);
});
