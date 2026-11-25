// Diagnóstico do B1: abre o login do Google, digita um e-mail e mostra a resposta da página.
// KONA_PROBE_EMAIL=… e-mail (padrão: endereço inexistente)
// KONA_PROBE_MODE=lista separada por vírgula, para testar hipóteses via CDP:
//   firefox  → user agent do Firefox
//   brands   → client hints com "Google Chrome" nas marcas
//   chromeobj→ window.chrome com app/csi/loadTimes/runtime como no Chrome
const os = require('os');
const fs = require('fs');
const path = require('path');
const dir = path.join(os.tmpdir(), `kona-google-probe-${process.pid}`);
process.env.KONA_USER_DATA = dir;
require('../../main.js');
const { app, BrowserWindow, webContents } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EMAIL = process.env.KONA_PROBE_EMAIL || 'kona.probe.nao.existe.83127@gmail.com';
const MODES = (process.env.KONA_PROBE_MODE || '').split(',').filter(Boolean);
const URL = 'https://accounts.google.com/ServiceLogin?service=mail&continue=https://mail.google.com/mail/';

const CHROME_STUB = `(() => {
  if (window.chrome && window.chrome.app) return;
  const c = window.chrome || {};
  c.app = { isInstalled: false, InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' }, RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }, getDetails() { return null; }, getIsInstalled() { return false; }, runningState() { return 'cannot_run'; } };
  const t0 = performance.timeOrigin;
  c.csi = function csi() { return { startE: t0, onloadT: t0 + 300, pageT: performance.now(), tran: 15 }; };
  c.loadTimes = function loadTimes() { return { requestTime: t0 / 1000, startLoadTime: t0 / 1000, commitLoadTime: t0 / 1000 + 0.1, finishDocumentLoadTime: 0, finishLoadTime: 0, firstPaintTime: 0, firstPaintAfterLoadTime: 0, navigationType: 'Other', wasFetchedViaSpdy: true, wasNpnNegotiated: true, npnNegotiatedProtocol: 'h2', wasAlternateProtocolAvailable: false, connectionInfo: 'h2' }; };
  window.chrome = c;
})();`;

app.whenReady().then(async () => {
  let wc; while (!(wc = BrowserWindow.getAllWindows()[0]?.webContents)) await sleep(50);
  await sleep(2500);
  await wc.executeJavaScript(`newTab('about:blank', false); 0`);
  await sleep(1500);
  const g = webContents.fromId(await wc.executeJavaScript('active().wv.getWebContentsId()'));
  if (MODES.length) g.debugger.attach('1.3');
  const cdp = (m, p) => g.debugger.sendCommand(m, p);
  const ver = process.versions.chrome;
  const major = ver.split('.')[0];
  if (MODES.includes('firefox')) {
    await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0' });
  } else if (MODES.includes('brands')) {
    await cdp('Emulation.setUserAgentOverride', {
      userAgent: g.getUserAgent(),
      userAgentMetadata: {
        brands: [{ brand: 'Google Chrome', version: major }, { brand: 'Chromium', version: major }, { brand: 'Not:A-Brand', version: '8' }],
        fullVersionList: [{ brand: 'Google Chrome', version: ver }, { brand: 'Chromium', version: ver }, { brand: 'Not:A-Brand', version: '8.0.0.0' }],
        platform: 'Windows', platformVersion: '19.0.0', architecture: 'x86', model: '', mobile: false, bitness: '64',
      },
    });
  }
  if (MODES.length) await cdp('Page.enable');
  if (MODES.includes('chromeobj')) await cdp('Page.addScriptToEvaluateOnNewDocument', { source: CHROME_STUB });
  await g.loadURL(URL).catch(() => {});
  await sleep(4000);
  console.log('MODOS', MODES.join(',') || '(nenhum)');
  console.log('PAGINA', await g.executeJavaScript('JSON.stringify({ chrome: Object.keys(window.chrome || {}), csiStr: String(window.chrome?.csi), lt: window.chrome?.loadTimes?.().connectionInfo, ua: navigator.userAgent, brands: navigator.userAgentData?.brands.map((b) => b.brand) })'));
  for (let i = 0; i < 40 && !(await g.executeJavaScript(`!!document.querySelector('input[type=email]')`)); i++) await sleep(500);
  await g.executeJavaScript(`document.querySelector('input[type=email]')?.focus(); 0`);
  await g.insertText(EMAIL);
  console.log('CAMPO', await g.executeJavaScript(`JSON.stringify([document.querySelector('input[type=email]')?.value, document.activeElement?.tagName])`));
  await sleep(500);
  await g.executeJavaScript(`(document.querySelector('#identifierNext button') || [...document.querySelectorAll('button')].find(b => /next|avançar|próxima|siguiente/i.test(b.innerText)))?.click(); 0`);
  await sleep(7000);
  const url = g.getURL();
  console.log('RESULTADO', /rejected/.test(url) ? 'BLOQUEADO' : 'PASSOU', url.split('?')[0]);
  console.log('TEXTO', (await g.executeJavaScript('document.body.innerText')).replace(/\s+/g, ' ').slice(0, 250));
  const out = path.join(__dirname, '..', 'output-windows'); fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, `google-login-${MODES.join('+') || 'base'}.png`), (await wc.capturePage()).toPNG());
  app.exit(0);
});
