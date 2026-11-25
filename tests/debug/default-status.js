// G3: o que o Kona lê como navegador padrão neste Windows (só leitura).
const os = require('os'); const path = require('path');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-defstatus-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  let wc; while (!(wc = BrowserWindow.getAllWindows()[0]?.webContents)) await sleep(50);
  await sleep(2500);
  console.log('R status:', JSON.stringify(await wc.executeJavaScript('api.defaultStatus()')));
  app.exit(0);
});
