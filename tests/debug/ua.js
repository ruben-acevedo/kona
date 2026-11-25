// Mostra o user agent e as client hints que as abas do Kona enviam.
process.env.KONA_USER_DATA = require('path').join(require('os').tmpdir(), 'kona-ua-probe');
require('../../main.js');
const { app, BrowserWindow, webContents } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  let wc; while (!(wc = BrowserWindow.getAllWindows()[0]?.webContents)) await sleep(50);
  await sleep(2500);
  await wc.executeJavaScript(`newTab(${JSON.stringify(process.env.KONA_PROBE_URL || 'https://httpbin.org/headers')}, false); 0`);
  await sleep(2500);
  await wc.executeJavaScript(`active().wv.reload(); 0`); // 2ª requisição já com as hints pedidas
  await sleep(2000);
  const g = webContents.fromId(await wc.executeJavaScript('active().wv.getWebContentsId()'));
  const info = await g.executeJavaScript(`navigator.userAgentData.getHighEntropyValues(['platform','platformVersion','fullVersionList','architecture']).then((h) => ({ ua: navigator.userAgent, brands: navigator.userAgentData.brands, high: h, webdriver: navigator.webdriver,
     globaisDaLoja: ['electronWebstore', 'electronRuntime', 'electronManagement'].filter((k) => k in window), chromeKeys: Object.keys(window.chrome || {}) }))`);
  console.log('PAGINA', JSON.stringify(info));
  console.log('ECO', await g.executeJavaScript('document.body.innerText'));
  app.exit(0);
});
