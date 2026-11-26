// Autocompletar na barra de endereço (como o Chrome): site visitado mais de uma vez completa enquanto
// se digita; Enter abre o completado; apagar tira a completação e não a traz de volta; site visitado
// uma vez só não completa; com "/", completa o endereço inteiro.
const os = require('os'); const path = require('path'); const http = require('http');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-ac-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(`<title>${req.url}</title>${req.url}`); });
app.whenReady().then(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  let wc; while (!(wc = BrowserWindow.getAllWindows()[0]?.webContents)) await sleep(50);
  await sleep(3000);
  const js = (c) => wc.executeJavaScript(c);
  const log = (...a) => console.log('R', ...a);
  const now = Date.now();
  await js(`settings.sounds = false;
    browseHistory.data.visits = [
      { url: 'https://meet.google.com/abc-defg-hij', title: 'Meet', n: 3, t: ${now} },
      { url: 'https://www.mercadolivre.com.br/', title: 'ML', n: 1, t: ${now} },
      { url: 'http://127.0.0.1:${port}/docs/guide', title: 'Guide', n: 2, t: ${now} },
      { url: 'http://127.0.0.1:${port}/home', title: 'Home', n: 4, t: ${now - 1000} },
    ]; 0`);
  const type = async (text) => { for (const ch of text) { wc.sendInputEvent({ type: 'char', keyCode: ch }); await sleep(60); } await sleep(250); };
  const key = async (k) => { wc.sendInputEvent({ type: 'keyDown', keyCode: k }); if (k === 'Return') wc.sendInputEvent({ type: 'char', keyCode: '\r' }); wc.sendInputEvent({ type: 'keyUp', keyCode: k }); await sleep(250); };
  const bar = () => js(`(() => { const i = document.querySelector('#tabs .tab.active input'); return i.value.slice(0, i.selectionStart) + '[' + i.value.slice(i.selectionStart, i.selectionEnd) + ']' + i.value.slice(i.selectionEnd); })()`);
  const fresh = async () => { await js(`document.querySelector('#tabs .tab.active input').blur(); focusAddress(); 0`); await sleep(300); };

  await fresh(); await type('mee');
  log('"mee" →', await bar(), '· 1º item:', await js(`omnibox.items[0]?.text + ' (' + omnibox.items[0]?.kind + ')'`));
  await type('t');
  log('continuar digitando "t" →', await bar());
  await key('Backspace');
  log('Backspace →', await bar());
  await key('Backspace');
  log('Backspace de novo →', await bar());
  await fresh(); await type('mer');
  log('visitado 1 vez só ("mer") →', await bar());
  await fresh(); await type('127.0.0.1:' + port + '/d');
  log('com "/" →', await bar());
  await fresh(); await type('127');
  log('"127" →', await bar());
  await key('Return'); await sleep(1500);
  log('Enter abre:', await js(`active().url`));
  server.close();
  app.exit(0);
});
