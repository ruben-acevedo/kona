// B2: verifica as correções de segurança no Windows (sandbox, HTTPS primeiro, DNS seguro,
// WebRTC, popups para file:, IPC da interface, window.chrome nas abas).
const os = require('os'); const path = require('path');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-sec-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow, webContents } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('R', ...a);

app.whenReady().then(async () => {
  let wc; while (!(wc = BrowserWindow.getAllWindows()[0]?.webContents)) await sleep(50);
  await sleep(3000);
  const tab = async () => webContents.fromId(await wc.executeJavaScript('active().wv.getWebContentsId()'));
  const go = async (url, ms = 6000) => {
    await wc.executeJavaScript(`newTab(${JSON.stringify(url)}, false); 0`);
    await sleep(ms);
    return tab();
  };

  log('IPC da interface (app:info):', (await wc.executeJavaScript('kona.appInfo()'))?.electron ? 'ok' : 'FALHOU');

  let g = await go('http://example.com/');
  log('HTTPS primeiro (example.com):', g.getURL());
  g = await go('http://neverssl.com/', 9000);
  log('Volta para HTTP (neverssl.com):', g.getURL(), '·', (await g.executeJavaScript('document.title')).slice(0, 40));

  g = await go('https://on.quad9.net/', 6000);
  log('DNS seguro (on.quad9.net):', /YES/i.test(await g.executeJavaScript('document.body.innerText')) ? 'usando Quad9' : 'NÃO usa Quad9');

  g = await go('https://example.com/', 4000);
  log('window.chrome na aba:', await g.executeJavaScript('Object.keys(window.chrome || {}).join(",")'));
  const cands = await g.executeJavaScript(`new Promise((res) => {
    const pc = new RTCPeerConnection({ iceServers: [] }); const out = [];
    pc.createDataChannel('x');
    pc.onicecandidate = (e) => { if (e.candidate) out.push(e.candidate.candidate.split(' ')[4]); else res(out); };
    pc.createOffer().then((o) => pc.setLocalDescription(o));
    setTimeout(() => res(out), 4000);
  })`);
  log('WebRTC candidatos:', JSON.stringify(cands), cands.some((c) => /^(10\\.|192\\.168\\.|172\\.(1[6-9]|2\\d|3[01])\\.)/.test(c)) ? 'VAZA IP LOCAL' : 'sem IP local');

  const before = await wc.executeJavaScript('tabs.length');
  await g.executeJavaScript(`window.open('file:///C:/Windows/win.ini'); 0`, true);
  await sleep(1500);
  log('Popup file:// bloqueado:', (await wc.executeJavaScript('tabs.length')) === before ? 'sim' : 'NÃO');

  const procs = app.getAppMetrics().filter((m) => m.type === 'Tab');
  log('Renderers na sandbox:', procs.map((m) => m.sandboxed).join(','));
  app.exit(0);
});
