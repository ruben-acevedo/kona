// Passkey: a página fica sabendo que não há mediação condicional, e um pedido condicional não abre a
// janela do Windows (fica aguardando até a página cancelar). Não chama passkey de verdade.
const os = require('os'); const path = require('path'); const http = require('http');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-pk-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow, webContents } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = http.createServer((_q, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><title>pk</title><p>pk</p>'); });
app.whenReady().then(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://localhost:${server.address().port}/`;
  let wc; while (!(wc = BrowserWindow.getAllWindows()[0]?.webContents)) await sleep(50);
  await sleep(3000);
  await wc.executeJavaScript(`navigate(active(), ${JSON.stringify(url)}); 0`);
  let g; for (let i = 0; i < 60 && !g; i++) { g = webContents.getAllWebContents().find((w) => w.getType() === 'webview' && w.getURL().startsWith(url)); await sleep(100); }
  await sleep(1500);
  const r = await g.executeJavaScript(`(async () => {
    const avail = await PublicKeyCredential.isConditionalMediationAvailable();
    const ac = new AbortController();
    const p = navigator.credentials.get({ mediation: 'conditional', publicKey: { challenge: new Uint8Array(16), rpId: 'localhost' }, signal: ac.signal })
      .then(() => 'resolveu', (e) => e.name);
    await new Promise((r) => setTimeout(r, 800));
    ac.abort();
    return { condicional: avail, pedidoCondicional: await p, getNome: navigator.credentials.get.name };
  })()`);
  console.log('R', JSON.stringify(r));
  server.close();
  app.exit(0);
});
