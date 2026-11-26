// I1: menu de contexto — página (vazio, link, imagem, texto selecionado, campo com erro de ortografia,
// vídeo), abas, barra de endereço e favoritos da nova aba; teclado (↓, Enter, Esc) e algumas ações.
const os = require('os'); const fs = require('fs'); const path = require('path'); const http = require('http');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-ctx-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow, webContents, clipboard } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = path.join(__dirname, '..', 'output-windows', 'context-menu'); fs.mkdirSync(OUT, { recursive: true });

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAQ0lEQVR42u3OMQ0AAAgDIJfc6FrDzwEFmpLjGhERERERERERERERERERERERERERERERERERERERERERERERERHxsHhHTwABKqzqFwAAAABJRU5ErkJggg==', 'base64');
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Menu test</title>
<style>body{font:16px sans-serif;margin:40px} #blank{height:120px}</style></head><body>
<p id="text">Pineapples are tropical fruits with a sweet taste.</p>
<p><a id="link" href="/other">A link to another page</a></p>
<p><img id="img" src="/img.png" width="64" height="64"></p>
<p><input id="field" value="helo wrold" spellcheck="true" style="width:300px;font-size:16px"></p>
<p><video id="video" src="/none.mp4" width="200" height="100" style="background:#000"></video></p>
<div id="blank"></div></body></html>`;
const server = http.createServer((req, res) => {
  if (req.url === '/img.png') { res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(PNG); return; }
  res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(PAGE);
});

app.whenReady().then(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  let wc; while (!(wc = BrowserWindow.getAllWindows()[0]?.webContents)) await sleep(50);
  await sleep(3500);
  wc.on('console-message', (e) => { if (e.level === 'error' || /Uncaught/.test(e.message)) console.log('C erro:', e.message); });
  const js = (c) => wc.executeJavaScript(c);
  const log = (...a) => console.log('R', ...a);
  const shot = async (name) => { await sleep(250); fs.writeFileSync(path.join(OUT, name), (await wc.capturePage()).toPNG()); };
  const menu = () => js(`document.querySelector('#ctx-menu').classList.contains('show') ? [...document.querySelectorAll('#ctx-menu > *')].map((el) => el.classList.contains('ctx-sep') ? '|' : (el.classList.contains('disabled') ? '(' + el.querySelector('.ctx-label').textContent + ')' : el.querySelector('.ctx-label').textContent)).join(' · ') : 'FECHADO'`);
  const esc = async () => { wc.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' }); await sleep(250); };
  const rightClick = async (target, p) => {
    target.sendInputEvent({ type: 'mouseDown', x: p.x, y: p.y, button: 'right', clickCount: 1 });
    target.sendInputEvent({ type: 'mouseUp', x: p.x, y: p.y, button: 'right', clickCount: 1 });
    await sleep(500);
  };
  await js(`settings.sounds = false; navigate(active(), ${JSON.stringify(base)}); 0`);
  let guest; for (let i = 0; i < 50 && !guest; i++) { guest = webContents.getAllWebContents().find((w) => w.getType() === 'webview' && w.getURL().startsWith(base)); await sleep(100); }
  await sleep(1500);
  const at = async (sel) => guest.executeJavaScript(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: Math.round(r.x + Math.min(r.width / 2, 30)), y: Math.round(r.y + r.height / 2) }; })()`);

  await rightClick(guest, await at('#blank'));
  log('página:', await menu()); await shot('page.png');
  // teclado: ↓ duas vezes marca "Forward"? (Back está desativado) e Esc fecha
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'Down' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Down' }); await sleep(150);
  log('↓ seleciona:', await js(`document.querySelector('#ctx-menu .ctx-item.sel .ctx-label')?.textContent`));
  await esc(); log('Esc fecha:', (await menu()) === 'FECHADO');

  await rightClick(guest, await at('#link'));
  log('link:', await menu()); await shot('link.png');
  const before = await js(`tabs.length + ':' + activeId`);
  await js(`[...document.querySelectorAll('#ctx-menu .ctx-item')].find((x) => x.textContent.includes('Open link in new tab')).click(); 0`); await sleep(600);
  log('abrir em nova aba (sem trocar de aba):', before, '→', await js(`tabs.length + ':' + activeId`), '·', await js(`tabs[tabs.length - 1].url`));
  await rightClick(guest, await at('#link'));
  await js(`[...document.querySelectorAll('#ctx-menu .ctx-item')].find((x) => x.textContent.includes('Copy link address')).click(); 0`); await sleep(400);
  log('copiar endereço do link:', await clipboard.readText());

  await rightClick(guest, await at('#img'));
  log('imagem:', await menu()); await esc();

  await guest.executeJavaScript(`(() => { const r = document.createRange(); r.selectNodeContents(document.querySelector('#text')); getSelection().removeAllRanges(); getSelection().addRange(r); })()`);
  await rightClick(guest, await at('#text'));
  log('texto selecionado:', await menu()); await shot('selection.png'); await esc();

  await guest.executeJavaScript(`document.querySelector('#field').value = ''; document.querySelector('#field').focus(); 0`);
  for (const ch of 'helo wrold ') { guest.sendInputEvent({ type: 'char', keyCode: ch }); await sleep(30); }
  await sleep(1500);
  log('idiomas do corretor:', JSON.stringify(guest.session.getSpellCheckerLanguages()), '· ligado:', guest.session.isSpellCheckerEnabled());
  const f = await at('#field');
  await rightClick(guest, { x: f.x - 18, y: f.y });
  log('campo (erro de ortografia):', await menu()); await shot('field.png'); await esc();
  await guest.executeJavaScript(`document.querySelector('#field').value = ''; 0`);
  for (const ch of 'abacaxi doçe ') { guest.sendInputEvent({ type: 'char', keyCode: ch }); await sleep(30); }
  await sleep(1500);
  const f2 = await at('#field');
  await rightClick(guest, { x: f2.x + 50, y: f2.y });
  log('campo em português ("doçe"):', await menu()); await esc();

  await rightClick(guest, await at('#video'));
  log('vídeo:', await menu()); await esc();

  // abas e barra de endereço (interface)
  const tabAt = (i) => js(`(() => { const r = document.querySelectorAll('#tabs .tab')[${i}].getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
  await rightClick(wc, await tabAt(1));
  log('aba inativa:', await menu(), '· aba ativa não mudou:', await js(`document.querySelectorAll('#tabs .tab')[1].classList.contains('active') === false`)); await shot('tab.png'); await esc();
  await rightClick(wc, await tabAt(0));
  log('aba ativa:', await menu()); await esc();
  await js(`document.querySelector('#tabs .tab.active input').focus(); 0`); await sleep(300);
  await rightClick(wc, await js(`(() => { const r = document.querySelector('#tabs .tab.active input').getBoundingClientRect(); return { x: Math.round(r.x + 40), y: Math.round(r.y + r.height / 2) }; })()`));
  log('barra de endereço (editando):', await menu());
  clipboard.writeText(base + 'other');
  await js(`[...document.querySelectorAll('#ctx-menu .ctx-item')].find((x) => x.textContent.includes('Paste and go')).click(); 0`); await sleep(800);
  log('colar e abrir:', await js(`active().url`));
  // atalhos novos dentro da página: Ctrl+U (código-fonte) e Alt+← (voltar)
  await sleep(800);
  const activeWc = await js(`active().wv.getWebContentsId()`);
  const g2 = webContents.fromId(activeWc);
  g2.focus();
  g2.sendInputEvent({ type: 'keyDown', keyCode: 'U', modifiers: ['control'] }); g2.sendInputEvent({ type: 'keyUp', keyCode: 'U', modifiers: ['control'] });
  await sleep(1500);
  const vs = webContents.getAllWebContents().find((w) => w.getType() === 'webview' && w.getURL().startsWith('view-source:'));
  log('Ctrl+U:', await js(`tabs.map((t) => t.url).join(' | ')`), '· página do código-fonte:', vs?.getURL());
  g2.sendInputEvent({ type: 'keyDown', keyCode: 'Left', modifiers: ['alt'] }); g2.sendInputEvent({ type: 'keyUp', keyCode: 'Left', modifiers: ['alt'] });
  await sleep(1200);
  log('Alt+← voltou para:', await js(`active().url`));

  // favoritos na nova aba
  await js(`newTab(); 0`); await sleep(800);
  await rightClick(wc, await js(`(() => { const r = document.querySelector('#fav-grid .fav-item[data-url]').getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`));
  log('favorito:', await menu()); await shot('favorite.png'); await esc();
  server.close();
  app.exit(0);
});
