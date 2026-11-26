// N7: abas fixadas — fixar, só o ícone, Ctrl+W não fecha, link para outro site abre aba nova (mesmo
// site continua na fixada), aparece em outra janela e em outro grupo, some no modo privado, desafixar
// sincroniza, fica guardada. Salva uma captura da barra.
const os = require('os'); const path = require('path'); const http = require('http'); const fs = require('fs');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-pinned-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow, webContents } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const page = (host, p) => `<title>${host}${p}</title><body style="font:20px sans-serif">${host}${p}
<p><a id="same" href="http://${host}/other">same site</a> <a id="cross" href="http://otherhost.test:${server.address().port}/x">other site</a></p>`;
const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(page(req.headers.host, req.url)); });
const log = (...a) => console.log('R', ...a);
const wins = () => BrowserWindow.getAllWindows().filter((w) => w.webContents.getURL().includes('index.html'));
app.commandLine.appendSwitch('host-resolver-rules', 'MAP otherhost.test 127.0.0.1');
app.whenReady().then(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let w1; while (!(w1 = wins()[0])) await sleep(50);
  await sleep(3000);
  const js = (w, c) => w.webContents.executeJavaScript(c);
  const strip = (w) => js(w, 'tabs.map((t) => (t.pinned ? "📌" : "") + t.url.replace(/^https?:\\/\\/[^/]+/, "")).join(" , ")');
  await js(w1, `settings.sounds = false; navigate(active(), '${base}/mail'); newTab('${base}/news', false); 0`); await sleep(1500);
  await js(w1, "library.pin(tabs[0]); render(); library.onTabsChanged(); 0"); await sleep(800);
  log('fixou /mail:', await strip(w1), '· guardada:', await js(w1, "localStorage.getItem(profileKey('pinned')).includes('/mail')"));
  const width = await js(w1, "Math.round(document.querySelector('#tabs .tab.pinned').getBoundingClientRect().width)");
  log('largura da fixada (inativa):', width);
  const img = await w1.webContents.capturePage({ x: 0, y: 0, width: 900, height: 60 });
  fs.writeFileSync(path.join(os.tmpdir(), 'kona-pinned-strip.png'), img.toPNG());
  log('captura:', path.join(os.tmpdir(), 'kona-pinned-strip.png'));

  // Ctrl+W na fixada: não fecha, vai para a seguinte
  await js(w1, "activate(tabs[0].id); shortcut('w'); 0"); await sleep(500);
  log('Ctrl+W na fixada:', await strip(w1), '· ativa:', await js(w1, 'active().url.replace(/^https?:\\/\\/[^/]+/, "")'));

  // links dentro da fixada
  await js(w1, 'activate(tabs[0].id); 0'); await sleep(1500);
  const g = webContents.fromId(await js(w1, 'tabs[0].wv.getWebContentsId()'));
  const click = async (sel) => {
    const p = await g.executeJavaScript(`(() => { const r = document.querySelector('${sel}').getBoundingClientRect(); return { x: Math.round(r.x + 5), y: Math.round(r.y + 5) }; })()`);
    g.sendInputEvent({ type: 'mouseDown', ...p, button: 'left', clickCount: 1 }); g.sendInputEvent({ type: 'mouseUp', ...p, button: 'left', clickCount: 1 });
    await sleep(1500);
  };
  await click('#same');
  log('link do mesmo site na fixada:', await strip(w1));
  await click('#cross');
  log('link para outro site na fixada:', await strip(w1), '· ativa:', await js(w1, 'active().url'));

  // outro grupo e outra janela
  await js(w1, "library.switchTo(tabSets.createGroup('G').id); 0"); await sleep(1200);
  log('no grupo G:', await strip(w1));
  await js(w1, "library.switchTo('default'); 0"); await sleep(1200);
  log('de volta às abas sem grupo:', await strip(w1));
  await js(w1, "shortcut('n'); 0");
  for (let i = 0; i < 60 && wins().length < 2; i++) await sleep(100);
  await sleep(2000);
  const w2 = wins().find((w) => w !== w1);
  log('janela nova:', await strip(w2));

  // privado
  await js(w2, "library.switchTo('private'); 0"); await sleep(1200);
  log('janela 2 no modo privado:', await strip(w2));
  await js(w2, "library.switchTo('default'); 0"); await sleep(1200);
  log('janela 2 saiu do privado:', await strip(w2));

  // fixar na janela 2 aparece na 1; desafixar na 1 some da 2
  await js(w2, `navigate(active(), '${base}/chat'); 0`); await sleep(1200);
  await js(w2, "library.pin(active()); render(); 0"); await sleep(800);
  log('fixou /chat na janela 2 → janela 1:', await strip(w1));
  await js(w1, "library.unpin(tabs[0]); render(); 0"); await sleep(800);
  log('desafixou a 1ª na janela 1 → janela 1:', await strip(w1), '· janela 2:', await strip(w2));
  log('guardadas:', await js(w1, "JSON.parse(localStorage.getItem(profileKey('pinned'))).map((p) => p.url.replace(/^https?:\\/\\/[^/]+/, '')).join(',')"));
  server.close(); app.exit(0);
});
