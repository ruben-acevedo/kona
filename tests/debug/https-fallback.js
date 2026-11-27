// Volta para HTTP: a aba e a barra de endereço mostram o endereço certo?
const os = require('os'); const path = require('path');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-fb-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow, webContents } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  let wc; while (!(wc = BrowserWindow.getAllWindows()[0]?.webContents)) await sleep(50);
  await sleep(3000);
  await wc.executeJavaScript(`newTab('http://http.badssl.com/', false); 0`);
  for (let i = 0; i < 7; i++) {
    await sleep(1000);
    const g = webContents.fromId(await wc.executeJavaScript('active().wv.getWebContentsId()'));
    console.log('R', i, 'wv:', g.getURL(), '· aba:', await wc.executeJavaScript('active().url'), '· barra:', await wc.executeJavaScript(`document.querySelector('.addr input')?.value`), '· título:', g.getTitle());
  }
  app.exit(0);
});
