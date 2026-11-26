// N1: compartilhar a tela — o site pede (com clique), o seletor do Kona aparece (telas, janelas, abas),
// trocar de opção anima o indicador, escolher uma tela entrega a captura, a barra aparece e "Stop
// sharing" encerra; cancelar nega sem erro no processo principal. Confere também os sons tocados.
const os = require('os'); const fs = require('fs'); const path = require('path'); const http = require('http');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-share-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow, webContents } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = path.join(__dirname, '..', 'output-windows', 'share'); fs.mkdirSync(OUT, { recursive: true });
const PAGE = `<!doctype html><title>Meeting</title><body style="font:15px sans-serif;margin:40px"><button id="s" style="padding:12px 20px">Present</button><p id="out">idle</p>
<script>
document.getElementById('s').onclick = async () => {
  document.getElementById('out').textContent = 'clicked';
  try {
    const st = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    window._st = st;
    document.getElementById('out').textContent = 'sharing ' + st.getVideoTracks()[0].label;
    st.getVideoTracks()[0].onended = () => { document.getElementById('out').textContent = 'ended'; };
  } catch (e) { document.getElementById('out').textContent = 'error ' + e.name; }
};
</script></body>`;
const server = http.createServer((_q, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(PAGE); });
let mainErrors = 0;
process.on('uncaughtException', (e) => { mainErrors++; console.log('R ERRO NO PROCESSO PRINCIPAL:', e.message); });
app.whenReady().then(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  let win; while (!(win = BrowserWindow.getAllWindows()[0])) await sleep(50);
  const wc = win.webContents;
  await sleep(3000);
  wc.on('console-message', (e) => { if (e.level === 'error' || /Uncaught/.test(e.message)) console.log('C erro:', e.message); });
  const js = (c) => wc.executeJavaScript(c);
  const log = (...a) => console.log('R', ...a);
  const until = async (c, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await js(c)) return true; await sleep(200); } return false; };
  const capture = async (name) => {
    win.focus(); await sleep(600);
    const img = await Promise.race([wc.capturePage(), sleep(4000).then(() => null)]);
    if (img) fs.writeFileSync(path.join(OUT, name), img.toPNG()); else log('(captura não respondeu:', `${name})`);
  };
  const sounds = async () => { const l = await js('window.__sfxLog.splice(0).join(", ")'); return l || '(nenhum)'; };
  await js(`window.__sfxLog = []; navigate(active(), ${JSON.stringify(url)}); 0`);
  let g = null;
  for (let i = 0; i < 80 && !g; i++) { g = webContents.getAllWebContents().find((w) => w.getType() === 'webview' && w.getURL() === url); await sleep(100); }
  for (let i = 0; i < 50; i++) { if (await g.executeJavaScript('!!document.querySelector("#s")').catch(() => false)) break; await sleep(100); }
  await sleep(500);
  // o 1º clique simulado só dá foco à página: um clique "de aquecimento" numa área vazia antes
  g.focus();
  g.sendInputEvent({ type: 'mouseDown', x: 600, y: 400, button: 'left', clickCount: 1 }); g.sendInputEvent({ type: 'mouseUp', x: 600, y: 400, button: 'left', clickCount: 1 });
  await sleep(300);
  const present = async () => {
    g.focus();
    const p = await g.executeJavaScript(`(() => { const r = document.querySelector('#s').getBoundingClientRect(); return { x: Math.round(r.x + 12), y: Math.round(r.y + 12) }; })()`);
    g.sendInputEvent({ type: 'mouseDown', ...p, button: 'left', clickCount: 1 }); g.sendInputEvent({ type: 'mouseUp', ...p, button: 'left', clickCount: 1 });
  };
  const out = () => g.executeJavaScript(`document.querySelector('#out').textContent`);

  // 1. seletor, troca animada entre as opções, cancelar
  await js('window.__sfxLog.length = 0; 0');
  await present();
  // o 1º clique simulado às vezes só dá foco à página: tenta de novo uma vez
  if (!(await until(`document.querySelector('#share-sheet').classList.contains('show')`, 3000))) await present();
  log('seletor apareceu:', await until(`document.querySelector('#share-sheet').classList.contains('show')`), '·', await js(`document.querySelector('#share-sub').textContent`));
  await until(`document.querySelectorAll('#share-grid .share-item').length > 0`, 15000);
  log('telas:', await js(`document.querySelectorAll('#share-grid .share-item').length`), '· sons ao abrir:', await sounds());
  // passar o mouse (sem clicar) sobre "Window" troca a opção
  const hover = async (kind) => {
    const p = await js(`(() => { const r = document.querySelector('#share-tabs [data-kind="${kind}"]').getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
    wc.sendInputEvent({ type: 'mouseMove', ...p });
  };
  await sleep(700); // a janela termina de abrir (desliza 12 px)
  const tabsTop0 = await js(`Math.round(document.querySelector('#share-tabs').getBoundingClientRect().top)`);
  // o mouse chega vindo de outro ponto, como na vida real (o 1º movimento simulado só define a posição)
  wc.sendInputEvent({ type: 'mouseMove', x: 960, y: 900 }); await sleep(100);
  await hover('window');
  await sleep(200);
  log('indicador deslizando (no meio da animação):', await js(`getComputedStyle(document.querySelector('#share-tabs .share-ind')).transform`));
  await sleep(700);
  log('seletor não se mexe ao trocar (posição do "Window" antes → depois):', JSON.stringify(tabsTop0), '→', JSON.stringify(await js(`Math.round(document.querySelector('#share-tabs').getBoundingClientRect().top)`)));
  log('janelas:', await js(`document.querySelectorAll('#share-grid .share-item').length`), '· sem a do Kona:', await js(`![...document.querySelectorAll('#share-grid .share-name')].some((n) => /Kona$/.test(n.textContent))`), '· sons:', await sounds());
  // atravessar rápido (screen → tab passando por window) não deixa trocas pela metade
  await hover('screen'); await sleep(40); await hover('window'); await sleep(40); await hover('tab'); await sleep(1300);
  log('passar rápido termina em:', await js(`document.querySelector('#share-tabs button.on').dataset.kind`), '· grade de abas:', await js(`document.querySelectorAll('#share-grid .share-item').length`));
  log('abas do Kona:', await js(`[...document.querySelectorAll('#share-grid .share-name')].map((n) => n.textContent).join(', ')`));
  await capture('picker.png');
  await js(`document.querySelector('#share-cancel').click(); 0`); await sleep(900);
  log('cancelar → página recebe:', await out(), '· sons:', await sounds());

  // 2. compartilhar a tela inteira
  await present();
  await until(`document.querySelector('#share-sheet').classList.contains('show')`);
  await until(`document.querySelectorAll('#share-grid .share-item').length > 0`, 15000);
  await sleep(500);
  await js(`window.__sfxLog.length = 0; document.querySelector('#share-grid .share-item').click(); 0`); await sleep(200);
  await js(`document.querySelector('#share-go').click(); 0`);
  await sleep(1500);
  log('compartilhando:', await out(), '· barra:', await js(`document.querySelector('#share-bar').classList.contains('show') ? document.querySelector('#share-bar').innerText.replace(/\\s+/g, ' ') : 'escondida'`), '· sons:', await sounds());
  await capture('sharing.png');
  await js(`document.querySelector('#share-bar [data-stop]').click(); 0`); await sleep(1200);
  log('Stop sharing → página:', await out(), '· barra:', await js(`document.querySelector('#share-bar').classList.contains('show') ? 'visível' : 'escondida'`), '· sons:', await sounds());
  log('erros no processo principal:', mainErrors);
  server.close();
  app.exit(0);
});
