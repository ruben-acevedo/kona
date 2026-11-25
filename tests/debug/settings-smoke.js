const path = require('path'); const fs = require('fs');
const OUT = path.join(__dirname, '..', 'output'); fs.mkdirSync(OUT, { recursive: true });
process.env.KONA_USER_DATA = path.join(OUT, 'st-profile'); fs.rmSync(process.env.KONA_USER_DATA, { recursive: true, force: true });
require('../../main.js');
const { app, BrowserWindow } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  let wc; while (!(wc = BrowserWindow.getAllWindows()[0]?.webContents)) await sleep(50);
  const errors = [];
  wc.on('console-message', (e, l, m) => { const lv = e?.level ?? l; const msg = e?.message ?? m; if ((lv === 'error' || lv === 3) && !/Failed to load resource/.test(msg)) errors.push(msg); });
  await sleep(3500);
  await wc.executeJavaScript('openSettings(); 0', true); await sleep(1200);
  fs.writeFileSync(path.join(OUT, 'st-page.png'), (await wc.capturePage()).toPNG());
  console.log('R seções:', await wc.executeJavaScript(`document.querySelectorAll('.st-sec').length`));
  console.log('R erros:', errors.length ? errors.join(' | ') : 'nenhum');
  app.exit(0);
});
