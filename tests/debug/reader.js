// L6: modo leitura — ícone só em artigos, abrir (botão e Ctrl+Shift+R), painel Aa (tamanho, fonte,
// fundo), ouvir (inicia e para logo), Esc fecha, "Use Reader automatically" no site.
const os = require('os'); const fs = require('fs'); const path = require('path'); const http = require('http');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-reader-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow, webContents } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = path.join(__dirname, '..', 'output-windows', 'reader'); fs.mkdirSync(OUT, { recursive: true });
const para = (i) => `<p>Paragraph ${i}. The pineapple is a tropical plant with an edible fruit and the most economically significant plant in the family Bromeliaceae. Pineapples grow as a small shrub; the individual flowers of the unpollinated plant fuse to form a multiple fruit, which usually matures within a year.</p>`;
const ARTICLE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>The Kona pineapple</title><meta property="og:site_name" content="Fruit Weekly"></head><body>
<nav><a href="/">Home</a> · <a href="/a">Ads</a> · <a href="/b">Shop</a></nav><aside style="float:right;width:200px;background:#fc0">BUY NOW! Big sale on everything!</aside>
<article><h1>The Kona pineapple</h1><p class="byline">By Rubén Acevedo</p>${Array.from({ length: 14 }, (_, i) => para(i + 1)).join('')}
<h2>Growing it</h2>${Array.from({ length: 6 }, (_, i) => para(i + 15)).join('')}</article><footer>© Fruit Weekly · Cookie settings</footer></body></html>`;
const HOME = '<!doctype html><title>Home</title><h1>Home</h1><p>Links only.</p><a href="/article">Article</a>';
const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(req.url.startsWith('/article') ? ARTICLE : HOME); });
app.whenReady().then(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let wc; while (!(wc = BrowserWindow.getAllWindows()[0]?.webContents)) await sleep(50);
  await sleep(3500);
  wc.on('console-message', (e) => { if (e.level === 'error' || /Uncaught/.test(e.message)) console.log('C erro:', e.message); });
  const js = (c) => wc.executeJavaScript(c);
  const log = (...a) => console.log('R', ...a);
  // a janela do teste pode estar atrás de outras: o Windows para de redesenhá-la; traz para a frente antes da captura
  const shot = async (n) => { BrowserWindow.getAllWindows()[0].focus(); await sleep(700); fs.writeFileSync(path.join(OUT, n), (await wc.capturePage()).toPNG()); };
  const until = async (c, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await js(c)) return true; await sleep(150); } return false; };
  const btn = () => js(`(() => { const b = document.querySelector('#tabs .tab.active .readerbtn'); return b.hidden ? 'escondido' : (b.classList.contains('on') ? 'ligado' : 'visível'); })()`);
  await js(`settings.sounds = false; navigate(active(), ${JSON.stringify(base + '/home')}); 0`);
  await sleep(2500);
  log('página que não é artigo, ícone:', await btn());
  await js(`navigate(active(), ${JSON.stringify(base + '/article')}); 0`);
  log('artigo, ícone aparece:', await until(`!document.querySelector('#tabs .tab.active .readerbtn').hidden`));
  await shot('available.png');
  await js(`document.querySelector('#tabs .tab.active .readerbtn').click(); 0`);
  await until(`active().reader?.active === true`);
  const g = webContents.getAllWebContents().find((w) => w.getType() === 'webview' && w.getURL().startsWith(base + '/article'));
  log('leitor aberto:', await g.executeJavaScript(`!!document.querySelector('kona-reader')`), '· ícone:', await btn(), '· Aa:', await js(`!document.querySelector('#tabs .tab.active .aabtn').hidden`));
  await shot('reader.png');
  // painel Aa
  await js(`document.querySelector('#tabs .tab.active .aabtn').click(); 0`); await sleep(600);
  log('painel:', await js(`[...document.querySelectorAll('#reader-pop .rp-font')].map((b) => b.textContent.trim()).join(', ') + ' · fundos: ' + [...document.querySelectorAll('#reader-pop .rp-theme')].map((b) => b.title).join(', ')`));
  await shot('options.png');
  await js(`document.querySelector('#reader-pop [data-theme-r="sepia"]').click(); 0`); await sleep(300);
  await js(`document.querySelector('#reader-pop [data-font="georgia"]').click(); 0`); await sleep(300);
  await js(`document.querySelector('#reader-pop [data-size="1"]').click(); 0`); await sleep(400);
  log('ajustes guardados:', await js(`JSON.stringify(settings.reader)`));
  await shot('sepia.png');
  // ouvir (inicia e para logo)
  await js(`document.querySelector('#reader-pop [data-speech]').click(); 0`); await sleep(1200);
  log('ouvir:', JSON.stringify(await js(`api.reader.speech(active().wv.getWebContentsId(), 'status')`)), '· botão:', await js(`document.querySelector('#reader-pop [data-speech]')?.textContent.trim()`));
  await js(`api.reader.speech(active().wv.getWebContentsId(), 'stop'); closeReaderPop(); 0`); await sleep(300);
  // Esc na página fecha
  g.focus(); g.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); g.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  log('Esc fecha:', await until(`active().reader?.active === false`), '· camada removida:', !(await g.executeJavaScript(`!!document.querySelector('kona-reader')`)));
  // Ctrl+Shift+R abre e fecha
  g.focus(); g.sendInputEvent({ type: 'keyDown', keyCode: 'R', modifiers: ['control', 'shift'] }); g.sendInputEvent({ type: 'keyUp', keyCode: 'R', modifiers: ['control', 'shift'] });
  log('Ctrl+Shift+R abre:', await until(`active().reader?.active === true`));
  await js(`toggleReader(); 0`); await sleep(500);
  // automático no site
  await js(`settings.readerAuto = { '127.0.0.1': true }; saveSettings(); active().wv.reload(); 0`);
  log('"Use Reader automatically": abre sozinho ao carregar:', await until(`active().reader?.active === true`, 10000));
  server.close();
  app.exit(0);
});
