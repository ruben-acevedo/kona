// Verifica o nome que a Chrome Web Store mostra no botão de instalar ("Add to Kona").
const path = require('path');
process.env.KONA_USER_DATA = path.join(require('os').tmpdir(), 'kona-cws-probe');
// Ao abrir o app de verdade, o Electron lê o nome do productName do package.json; aqui reproduzimos isso
require('electron').app.setName(require('../../package.json').productName);
require('../../main.js');
const { app, BrowserWindow, webContents } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  let wc; while (!(wc = BrowserWindow.getAllWindows()[0]?.webContents)) await sleep(50);
  await sleep(3000);
  console.log('R nome do app:', app.getName(), '· pasta de dados:', app.getPath('userData'));
  await wc.executeJavaScript(`newTab('https://chromewebstore.google.com/detail/eimadpbcbfnmbkopoojfekhnkhdbieeh', false); 0`);
  let label = '';
  for (let i = 0; i < 30 && !label; i++) {
    await sleep(1000);
    const g = webContents.getAllWebContents().find((w) => w.getType() === 'webview' && w.getURL().includes('chromewebstore'));
    if (g) label = await g.executeJavaScript(`[...document.querySelectorAll('button')].map((b) => b.innerText.trim()).find((t) => /^(Add to|Adicionar ao|Usar no)/i.test(t)) || ''`).catch(() => '');
  }
  console.log('R botão da loja:', label || '(não encontrado)');
  app.exit(0);
});
