// L1: o Widevine (Electron da castLabs) está pronto e as páginas conseguem usá-lo?
const os = require('os'); const path = require('path');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-wv-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow, webContents, components } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const log = (...a) => console.log('R', ...a);
  log('Electron:', process.versions.electron, '· castLabs:', !!components);
  if (components) {
    const t0 = Date.now();
    try { await components.whenReady(); } catch (e) { log('whenReady falhou:', e.message); }
    log('componentes em', Date.now() - t0, 'ms:', JSON.stringify(components.status()));
  }
  let wc; while (!(wc = BrowserWindow.getAllWindows()[0]?.webContents)) await sleep(50);
  await sleep(3000);
  await wc.executeJavaScript(`settings.sounds = false; navigate(active(), 'https://example.com/'); 0`);
  let g; for (let i = 0; i < 80 && !g; i++) { g = webContents.getAllWebContents().find((w) => w.getType() === 'webview' && w.getURL().startsWith('https://example.com')); await sleep(100); }
  await sleep(2500);
  const r = await g.executeJavaScript(`(async () => {
    const cfg = [{ initDataTypes: ['cenc'], videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"', robustness: 'SW_SECURE_DECODE' }], audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"', robustness: 'SW_SECURE_CRYPTO' }] }];
    try { const a = await navigator.requestMediaKeySystemAccess('com.widevine.alpha', cfg); const k = await a.createMediaKeys(); return 'OK: ' + a.keySystem + (k ? ' · MediaKeys criado' : ''); }
    catch (e) { return 'FALHOU: ' + e.name + ' ' + e.message; }
  })()`);
  log('Widevine numa página:', r);
  app.exit(0);
});
