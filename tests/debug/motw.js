// Verifica se downloads recebem a "Mark of the Web" (Zone.Identifier) no Windows.
const os = require('os'); const fs = require('fs'); const path = require('path');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-motw-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow, webContents, session } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  let wc; while (!(wc = BrowserWindow.getAllWindows()[0]?.webContents)) await sleep(50);
  await sleep(2500);
  await wc.executeJavaScript(`newTab('https://httpbin.org/html', false); 0`);
  await sleep(3000);
  const g = webContents.fromId(await wc.executeJavaScript('active().wv.getWebContentsId()'));
  const done = new Promise((r) => g.session.once('will-download', (_e, item) => item.once('done', () => r(item.getSavePath()))));
  g.downloadURL('https://httpbin.org/response-headers?Content-Disposition=attachment%3B%20filename%3Dkona-motw-teste.txt');
  const file = await done;
  await sleep(1000);
  let zone = '(sem Zone.Identifier)';
  try { zone = fs.readFileSync(file + ':Zone.Identifier', 'utf8').replace(/\r?\n/g, ' | '); } catch { /* sem marca */ }
  console.log('R arquivo:', file);
  console.log('R marca:', zone);
  fs.rmSync(file, { force: true });
  app.exit(0);
});
