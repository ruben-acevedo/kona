// N6: recuperar depois de um travamento. Roda em duas aberturas (o mesmo script, duas vezes):
//   1ª: abas em duas janelas; aba que trava (aviso + recarregar); página que para de responder
//       (Esperar/Fechar); interface que trava (recarrega com as abas); depois sai sem fechar direito.
//   2ª: a barra "O Kona não fechou corretamente" aparece; "Restaurar abas" reabre as duas janelas.
const os = require('os'); const path = require('path'); const http = require('http'); const fs = require('fs');
const DATA = path.join(os.tmpdir(), 'kona-crash-recovery');
const PHASE = path.join(os.tmpdir(), 'kona-crash-recovery.phase');
const phase = fs.existsSync(PHASE) ? 2 : 1;
if (phase === 1) fs.rmSync(DATA, { recursive: true, force: true });
process.env.KONA_USER_DATA = DATA;
require('../../main.js');
const { app, BrowserWindow, webContents } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HANG = '<title>Hang</title><button id="b" onclick="const t=Date.now(); while (Date.now() - t < 60000) {}">hang</button>';
const log = (...a) => console.log('R', `[${phase}]`, ...a);
const wins = () => BrowserWindow.getAllWindows().filter((w) => w.webContents.getURL().includes('index.html'));
const PORT = 47611;
const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(req.url === '/hang' ? HANG : `<title>P${req.url}</title>page ${req.url}`); });
app.whenReady().then(async () => {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const base = `http://127.0.0.1:${PORT}`;
  let w1; while (!(w1 = wins()[0])) await sleep(50);
  await sleep(3000);
  const js = (w, c) => w.webContents.executeJavaScript(c);
  const strip = (w) => js(w, 'tabs.map((t) => t.url.replace(/^https?:\\/\\/[^/]+/, "")).join(",")');

  if (phase === 1) {
    await js(w1, `settings.sounds = false; navigate(active(), '${base}/a'); newTab('${base}/b', false); newTab('${base}/c', false); 0`); await sleep(2000);
    await js(w1, "shortcut('n'); 0");
    for (let i = 0; i < 60 && wins().length < 2; i++) await sleep(100);
    await sleep(2500);
    const w2 = wins().find((w) => w !== w1);
    await js(w2, `settings.sounds = false; navigate(active(), '${base}/x'); newTab('${base}/y', false); 0`); await sleep(2000);
    log('janela 1:', await strip(w1), '· janela 2:', await strip(w2));

    // aba que trava
    await js(w1, 'activate(tabs[1].id); 0'); await sleep(1200);
    webContents.fromId(await js(w1, 'tabs[1].wv.getWebContentsId()')).forcefullyCrashRenderer();
    await sleep(1200);
    log('aba travou → aviso visível:', !(await js(w1, "document.querySelector('#crash-pane').hidden")), '· texto:', await js(w1, "document.querySelector('#crash-pane b').textContent"));
    await js(w1, "document.querySelector('#crash-reload').click(); 0"); await sleep(1800);
    log('Recarregar → aviso some:', await js(w1, "document.querySelector('#crash-pane').hidden"), '· página de volta:', await js(w1, 'tabs[1].title'));

    // página que para de responder
    await js(w1, `navigate(tabs[2], '${base}/hang'); activate(tabs[2].id); 0`); await sleep(1800);
    const g = webContents.fromId(await js(w1, 'tabs[2].wv.getWebContentsId()'));
    w1.focus(); g.focus();
    g.executeJavaScript('setTimeout(() => document.querySelector("#b").click(), 100); 0'); // a página trava por 60 s
    await sleep(500);
    let asked = false;
    // a pessoa tenta usar a página (teclas que ela não atende): o Chromium avisa ~15 s depois
    for (let i = 0; i < 60 && !asked; i++) {
      g.sendInputEvent({ type: 'keyDown', keyCode: 'A' }); g.sendInputEvent({ type: 'keyUp', keyCode: 'A' });
      await sleep(1000); asked = await js(w1, "document.querySelector('#ask-sheet').classList.contains('show')");
    }
    log('página sem resposta → pergunta apareceu:', asked, asked ? `· “${await js(w1, "document.querySelector('#ask-title').textContent")}” [${await js(w1, "document.querySelector('#ask-no').textContent")} / ${await js(w1, "document.querySelector('#ask-yes').textContent")}]` : '');
    if (asked) { await js(w1, "document.querySelector('#ask-yes').click(); 0"); await sleep(1500); }
    log('"Fechar página" → janela 1:', await strip(w1));

    // a interface da janela 2 trava: recarrega com as abas
    await sleep(1200);
    w2.webContents.forcefullyCrashRenderer();
    await sleep(6000);
    log('interface da janela 2 travou e voltou:', await strip(w2).catch((e) => `erro ${e.message}`));

    // sai sem fechar direito (sem will-quit: o marcador fica)
    await sleep(1500);
    fs.writeFileSync(PHASE, '2');
    log('saindo sem fechar direito; marcador existe:', fs.existsSync(path.join(DATA, 'session.lock')));
    server.close();
    app.exit(0);
    return;
  }

  // 2ª abertura
  fs.rmSync(PHASE, { force: true });
  await sleep(1500);
  log('barra visível:', await js(w1, "document.body.classList.contains('infobar-on')"), '· texto:', await js(w1, "document.querySelector('#ib-text').textContent"), '·', await js(w1, "document.querySelector('#ib-yes').textContent"));
  log('antes de restaurar → janelas:', wins().length, '· janela 1:', await strip(w1));
  await js(w1, "document.querySelector('#ib-yes').click(); 0");
  for (let i = 0; i < 60 && wins().length < 2; i++) await sleep(100);
  await sleep(3000);
  const w2 = wins().find((w) => w !== w1);
  log('Restaurar → janelas:', wins().length, '· janela 1:', await strip(w1), '· janela 2:', w2 && await strip(w2), '· barra sumiu:', !(await js(w1, "document.body.classList.contains('infobar-on')")));
  server.close();
  app.quit();
  await sleep(1500);
  log('fechou direito → marcador sumiu:', !fs.existsSync(path.join(DATA, 'session.lock')));
});
