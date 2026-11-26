// N16: controle de mídia global — botão ♪ aparece quando uma aba toca, painel com título/artista
// (mediaSession), pausar/tocar e faixa seguinte pelos botões do próprio site, ir para a aba, aparece
// em outra janela, aba privada só na própria janela, some ao sair da página. Salva uma captura do painel.
const os = require('os'); const path = require('path'); const http = require('http'); const fs = require('fs');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-media-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow, webContents } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// página com um áudio gerado (tom baixinho em loop) e os botões de mídia registrados
const PLAYER = `<!doctype html><title>Player page</title><body style="font:16px sans-serif">player <span id="st"></span><script>
const rate = 8000, n = rate; const buf = new ArrayBuffer(44 + n * 2); const v = new DataView(buf);
const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(i / 8) * 300, true);
const a = new Audio(URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))); a.loop = true; a.volume = 0.05; window.a = a;
let track = 1; window.events = [];
const meta = () => { navigator.mediaSession.metadata = new MediaMetadata({ title: 'Song ' + track, artist: 'Test Artist', artwork: [{ src: location.origin + '/art.svg', sizes: '96x96' }] }); };
meta();
navigator.mediaSession.setActionHandler('play', () => { events.push('play'); a.play(); });
navigator.mediaSession.setActionHandler('pause', () => { events.push('pause'); a.pause(); });
navigator.mediaSession.setActionHandler('nexttrack', () => { events.push('next'); track++; meta(); });
navigator.mediaSession.setActionHandler('previoustrack', () => { events.push('prev'); track = Math.max(1, track - 1); meta(); });
a.play();
</script>`;
const ART = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#7c5cff"/><circle cx="48" cy="48" r="20" fill="#fff"/></svg>';
const server = http.createServer((req, res) => {
  if (req.url === '/art.svg') { res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); res.end(ART); return; }
  res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(req.url.startsWith('/player') ? PLAYER : '<title>Other</title>other');
});
const log = (...a) => console.log('R', ...a);
const wins = () => BrowserWindow.getAllWindows().filter((w) => w.webContents.getURL().includes('index.html'));
app.whenReady().then(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let w1; while (!(w1 = wins()[0])) await sleep(50);
  await sleep(3000);
  const js = (w, c) => w.webContents.executeJavaScript(c);
  log('antes de tocar, botão ♪ visível:', await js(w1, "!document.querySelector('#btn-media').hidden"));
  await js(w1, `settings.sounds = false; navigate(active(), '${base}/player'); newTab('${base}/other', false); 0`); await sleep(3500);
  const player = webContents.getAllWebContents().find((c) => c.getType() === 'webview' && c.getURL().endsWith('/player'));
  log('tocando:', await player.executeJavaScript('!a.paused'), '· botão ♪ visível:', await js(w1, "!document.querySelector('#btn-media').hidden"), '· destacado:', await js(w1, "document.querySelector('#btn-media').classList.contains('playing')"));
  log('setActionHandler parece nativa:', await player.executeJavaScript('MediaSession.prototype.setActionHandler.toString()'), '·', await player.executeJavaScript('Function.prototype.toString.toString()'));
  await js(w1, 'toggleMediaPop(true); 0'); await sleep(800);
  log('painel:', await js(w1, "[...document.querySelectorAll('#media-pop .md-row')].map((r) => r.innerText.replace(/\\s+/g, ' ').trim()).join(' | ')"),
    '· botões:', await js(w1, "[...document.querySelectorAll('#media-pop [data-act]')].map((b) => b.dataset.act).join(',')"));
  const r = await js(w1, "(() => { const b = document.querySelector('#media-pop').getBoundingClientRect(); return { x: Math.round(b.x) - 20, y: 0, width: Math.round(b.width) + 40, height: Math.round(b.bottom) + 20 }; })()");
  fs.writeFileSync(path.join(os.tmpdir(), 'kona-media-pop.png'), (await w1.webContents.capturePage(r)).toPNG());
  log('captura:', path.join(os.tmpdir(), 'kona-media-pop.png'));
  const press = (act) => js(w1, `document.querySelector('#media-pop [data-act="${act}"]').click(); 0`);
  await press('toggle'); await sleep(1200);
  log('pausar pelo painel → pausado:', await player.executeJavaScript('a.paused'), '· eventos:', await player.executeJavaScript('events.join(",")'), '· botão destacado:', await js(w1, "document.querySelector('#btn-media').classList.contains('playing')"));
  await press('nexttrack'); await sleep(1200);
  log('faixa seguinte → título no painel:', await js(w1, "document.querySelector('#media-pop .md-title').textContent"));
  await press('toggle'); await sleep(1200);
  log('tocar de novo → tocando:', !(await player.executeJavaScript('a.paused')));
  // ir para a aba
  log('aba ativa antes:', await js(w1, 'active().url.slice(-7)'));
  await press('focus'); await sleep(600);
  log('"ir para a aba" → aba ativa:', await js(w1, 'active().url.slice(-7)'), '· painel fechou:', !(await js(w1, 'media.open')));
  // outra janela
  await js(w1, "shortcut('n'); 0");
  for (let i = 0; i < 60 && wins().length < 2; i++) await sleep(100);
  await sleep(2500);
  const w2 = wins().find((w) => w !== w1);
  log('janela 2 vê a mídia da janela 1:', await js(w2, "!document.querySelector('#btn-media').hidden"));
  // privado: a mídia da janela 2 privada não aparece na janela 1
  await js(w2, `settings.sounds = false; library.switchTo('private').then(() => navigate(active(), '${base}/player?p')); 0`); await sleep(3500);
  log('janela 2 privada tocando → painel da janela 2:', await js(w2, 'visibleMedia().length'), '· da janela 1:', await js(w1, 'visibleMedia().length'));
  // sair da página
  await js(w1, `navigate(tabs.find((t) => t.url.endsWith('/player')), '${base}/other2'); 0`); await sleep(1500);
  log('janela 1 saiu da página → itens na janela 1:', await js(w1, 'visibleMedia().length'), '· botão visível:', await js(w1, "!document.querySelector('#btn-media').hidden"));
  server.close(); app.exit(0);
});
