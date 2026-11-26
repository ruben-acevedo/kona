// L5: tela cheia — página pedindo tela cheia (como o botão do YouTube) e F11; som: aba tocando e silenciar.
const os = require('os'); const fs = require('fs'); const path = require('path'); const http = require('http');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-fs-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow, webContents } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = path.join(__dirname, '..', 'output-windows', 'fullscreen'); fs.mkdirSync(OUT, { recursive: true });
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Player</title><style>body{margin:0;font:15px sans-serif}#player{width:480px;height:270px;background:linear-gradient(135deg,#f7a823,#8b5cf6);display:grid;place-items:center;color:#fff;font-size:28px}</style></head>
<body><div id="player">VIDEO</div><button id="fs" onclick="document.getElementById('player').requestFullscreen()">Fullscreen</button>
<script>
function beep(){ const ctx = new AudioContext(); const o = ctx.createOscillator(); const g = ctx.createGain(); g.gain.value = 0.02; o.connect(g).connect(ctx.destination); o.start(); window._ctx = ctx; }
</script></body></html>`;
const server = http.createServer((_q, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(PAGE); });
app.whenReady().then(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  let win; while (!(win = BrowserWindow.getAllWindows()[0])) await sleep(50);
  const wc = win.webContents;
  await sleep(3500);
  wc.on('console-message', (e) => { if (e.level === 'error' || /Uncaught/.test(e.message)) console.log('C erro:', e.message); });
  const js = (c) => wc.executeJavaScript(c);
  const log = (...a) => console.log('R', ...a);
  await js(`settings.sounds = false; navigate(active(), ${JSON.stringify(url)}); 0`);
  let g; for (let i = 0; i < 60 && !g; i++) { g = webContents.getAllWebContents().find((w) => w.getType() === 'webview' && w.getURL() === url); await sleep(100); }
  await sleep(1200);
  const state = async () => ({
    janela: win.isFullScreen(),
    barra: await js(`(() => { const t = document.querySelector('#toolbar'); const r = t.getBoundingClientRect(); return getComputedStyle(t).display !== 'none' && r.bottom > 1; })()`),
    pagina: await js(`(() => { const r = active().wv.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(','); })()`),
    tela: win.getBounds().width + 'x' + win.getBounds().height,
  });
  log('antes:', JSON.stringify(await state()));
  // clique real no botão (pedido de tela cheia exige gesto do usuário)
  const p = await g.executeJavaScript(`(() => { const r = document.querySelector('#fs').getBoundingClientRect(); return { x: Math.round(r.x + 10), y: Math.round(r.y + 8) }; })()`);
  g.sendInputEvent({ type: 'mouseDown', ...p, button: 'left', clickCount: 1 }); g.sendInputEvent({ type: 'mouseUp', ...p, button: 'left', clickCount: 1 });
  await sleep(1500);
  log('vídeo em tela cheia:', JSON.stringify(await state()), '· elemento:', await g.executeJavaScript(`document.fullscreenElement?.id || 'nenhum'`));
  fs.writeFileSync(path.join(OUT, 'video-fullscreen.png'), (await wc.capturePage()).toPNG());
  g.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); g.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await sleep(1500);
  log('Esc:', JSON.stringify(await state()));
  // F11
  g.focus(); g.sendInputEvent({ type: 'keyDown', keyCode: 'F11' }); g.sendInputEvent({ type: 'keyUp', keyCode: 'F11' });
  await sleep(1500);
  log('F11:', JSON.stringify(await state()));
  wc.sendInputEvent({ type: 'mouseMove', x: 600, y: 2 }); await sleep(700);
  log('F11, mouse no topo → barra aparece:', await js(`document.body.classList.contains('peek') && document.querySelector('#toolbar').getBoundingClientRect().top >= 0`));
  wc.sendInputEvent({ type: 'mouseMove', x: 600, y: 600 }); await sleep(900);
  log('mouse sai → barra some:', await js(`!document.body.classList.contains('peek')`));
  fs.writeFileSync(path.join(OUT, 'f11.png'), (await wc.capturePage()).toPNG());
  g.sendInputEvent({ type: 'keyDown', keyCode: 'F11' }); g.sendInputEvent({ type: 'keyUp', keyCode: 'F11' });
  await sleep(1500);
  log('F11 de novo:', JSON.stringify(await state()));
  // som
  const b = await g.executeJavaScript(`(() => { const r = document.querySelector('#player').getBoundingClientRect(); return { x: Math.round(r.x + 20), y: Math.round(r.y + 20) }; })()`);
  g.sendInputEvent({ type: 'mouseDown', ...b, button: 'left', clickCount: 1 }); g.sendInputEvent({ type: 'mouseUp', ...b, button: 'left', clickCount: 1 });
  await g.executeJavaScript(`beep(); 0`, true);
  await sleep(2500);
  log('tocando som:', g.isCurrentlyAudible(), '· aba mostra:', await js(`(() => { const el = document.querySelector('#tabs .tab.active'); return (el.classList.contains('audible') ? 'som' : 'nada') + ' · botão: ' + (el.querySelector('.snd').hidden ? 'escondido' : el.querySelector('.snd').title); })()`));
  await js(`document.querySelector('#tabs .tab.active .snd').click(); 0`); await sleep(500);
  log('clicar silencia:', g.isAudioMuted(), '· aba:', await js(`document.querySelector('#tabs .tab.active').classList.contains('muted') ? 'silenciada' : '?'`), '· botão:', await js(`document.querySelector('#tabs .tab.active .snd').title`));
  fs.writeFileSync(path.join(OUT, 'muted.png'), (await wc.capturePage()).toPNG());
  await js(`document.querySelector('#tabs .tab.active .snd').click(); 0`); await sleep(300);
  log('clicar de novo reativa:', !g.isAudioMuted());
  server.close();
  app.exit(0);
});
