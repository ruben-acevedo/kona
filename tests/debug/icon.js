// D1: ícone do app carrega (janela/arquivo .ico) e aparece em "Sobre o Kona".
const os = require('os'); const fs = require('fs'); const path = require('path');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-icon-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow, nativeImage } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = path.join(__dirname, '..', 'output-windows'); fs.mkdirSync(OUT, { recursive: true });
app.whenReady().then(async () => {
  let wc; while (!(wc = BrowserWindow.getAllWindows()[0]?.webContents)) await sleep(50);
  await sleep(3000);
  wc.on('console-message', (e) => { if (e.level === 'error' || /Uncaught|Content Security/.test(e.message)) console.log('C erro:', e.message); });
  const ico = nativeImage.createFromPath(path.join(__dirname, '..', '..', 'assets', 'icon.ico'));
  console.log('R .ico válido para o Windows:', !ico.isEmpty(), ico.getSize());
  await wc.executeJavaScript(`openSettings('sobre'); 0`);
  await sleep(1500);
  console.log('R logo em Sobre:', await wc.executeJavaScript(`(() => { const i = document.querySelector('.st-logo'); return i ? i.complete && i.naturalWidth > 0 : 'ausente' })()`));
  console.log('R atalho da visão geral:', await wc.executeJavaScript(`[...document.querySelectorAll('.st-keys kbd')].some((k) => k.textContent === 'Alt+V')`));
  fs.writeFileSync(path.join(OUT, 'about.png'), (await wc.capturePage()).toPNG());
  app.exit(0);
});
