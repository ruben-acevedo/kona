// N2: várias janelas — Ctrl+N, mover aba com histórico (nova janela / outra janela / soltar na barra),
// arrastar de verdade (reordenar e soltar fora), favoritos sincronizados e a principal fechando.
const os = require('os'); const path = require('path'); const http = require('http');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-windows-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(`<title>P${req.url}</title><body style="font:20px sans-serif">page ${req.url}`); });
const log = (...a) => console.log('R', ...a);
const wins = () => BrowserWindow.getAllWindows().filter((w) => w.webContents.getURL().includes('index.html'));
const PATH = 'replace(/^http:\\/\\/[^/]+/, "")';
app.whenReady().then(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let w1; while (!(w1 = wins()[0])) await sleep(50);
  await sleep(3000);
  const js = (w, c) => w.webContents.executeJavaScript(c);
  const tabsOf = async (w) => js(w, `tabs.map((t) => t.url.${PATH}).join(",")`);
  const waitWins = async (n) => { for (let i = 0; i < 60 && wins().length !== n; i++) await sleep(100); await sleep(1500); return wins(); };
  await js(w1, `settings.sounds = false; navigate(active(), '${base}/a'); 0`); await sleep(1200);
  await js(w1, `active().wv.loadURL('${base}/b'); 0`); await sleep(1000);
  await js(w1, `active().wv.loadURL('${base}/c'); 0`); await sleep(1000);
  await js(w1, 'active().wv.goBack(); 0'); await sleep(1000);
  await js(w1, `newTab('${base}/x', false); newTab('${base}/y', false); 0`); await sleep(1500);
  log('janela 1:', await tabsOf(w1), '· principal:', await js(w1, 'library.primary'));

  // 1) Ctrl+N
  await js(w1, "shortcut('n'); 0");
  let ws = await waitWins(2); const w2 = ws.find((w) => w !== w1);
  log('Ctrl+N → janelas:', ws.length, '· janela 2:', await tabsOf(w2), '· secundária:', !(await js(w2, 'library.primary')),
    '· grupos escondidos:', await js(w2, "getComputedStyle(document.querySelector('#sb-groups')).display === 'none'"), '· maximizadas:', w1.isMaximized(), w2.isMaximized());

  // 2) mover para nova janela, com histórico
  await js(w1, 'activate(tabs[0].id); moveTab(tabs[0], { newWindow: true }); 0');
  ws = await waitWins(3); const w3 = ws.find((w) => w !== w1 && w !== w2);
  await sleep(1000);
  log('mover p/ nova janela → janela 1:', await tabsOf(w1), '· janela 3:', await tabsOf(w3));
  log('   histórico na janela 3: voltar', await js(w3, 'active().wv.canGoBack()'), '· avançar', await js(w3, 'active().wv.canGoForward()'), '· endereço', await js(w3, `active().url.${PATH}`));
  await js(w3, 'active().wv.goForward(); 0'); await sleep(1000);
  log('   avançar na janela 3 →', await js(w3, `active().url.${PATH}`));

  // 3) mover para outra janela (menu "Mover para…")
  const others = await js(w1, 'api.otherWindows()');
  log('"Mover para…" na janela 1 lista:', others.map((o) => o.title).join(' | '));
  await js(w1, `moveTab(tabs.find((t) => t.url.endsWith('/x')), { window: ${w2.id} }); 0`); await sleep(1500);
  log('mover /x p/ janela 2 → janela 1:', await tabsOf(w1), '· janela 2:', await tabsOf(w2));

  await js(w2, `newTab('${base}/w', false); 0`); await sleep(1200);
  log('   janela 2 antes de arrastar:', await tabsOf(w2));
  // 4) arrastar de verdade na janela 2: reordenar e soltar fora
  w2.unmaximize(); w2.setBounds({ x: 80, y: 80, width: 1100, height: 760 }); await sleep(800);
  w2.focus(); await sleep(300);
  const rects = await js(w2, "$$('#tabs .tab:not(.leaving)').map((el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })");
  const wc2 = w2.webContents;
  const mv = (type, x, y) => wc2.sendInputEvent({ type, x, y, button: 'left', clickCount: 1 });
  const last = rects[rects.length - 1], first = rects[0];
  mv('mouseDown', last.x, last.y);
  for (let x = last.x; x > first.x - 40; x -= 15) { mv('mouseMove', x, last.y); await sleep(16); }
  mv('mouseUp', first.x - 40, last.y); await sleep(800);
  log('arrastar p/ reordenar na janela 2 →', await tabsOf(w2));
  const r2 = await js(w2, "(() => { const el = $$('#tabs .tab:not(.leaving)')[0]; const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()");
  mv('mouseDown', r2.x, r2.y);
  for (let y = r2.y; y < r2.y + 300; y += 20) { mv('mouseMove', r2.x + 40, y); await sleep(16); }
  log('   etiqueta visível fora da barra:', await js(w2, "!!document.querySelector('#tab-ghost')"));
  mv('mouseUp', r2.x + 40, r2.y + 300);
  await sleep(2500); log('   todas as janelas:', JSON.stringify(BrowserWindow.getAllWindows().map((w) => [w.id, w.webContents.getURL().slice(-60), w.getBounds(), w.isVisible()])));
  ws = await waitWins(4); const w4 = ws.find((w) => ![w1, w2, w3].includes(w));
  log('   janela 1:', await tabsOf(w1), '· janela 3:', await tabsOf(w3)); log('soltar fora da barra → janelas:', ws.length, '· janela 2:', await tabsOf(w2), '· janela nova:', w4 && await tabsOf(w4));

  // 5) soltar sobre a barra de outra janela (janela 4 → barra da janela 2)
  if (w4) {
    w4.unmaximize(); w4.setBounds({ x: 300, y: 400, width: 900, height: 600 }); await sleep(500);
    const b2 = w2.getBounds();
    await js(w4, `newTab('${base}/z', false); 0`); await sleep(1200);
    await js(w4, `moveTab(tabs.find((t) => t.url.endsWith('/z')), { point: { x: ${b2.x + 300}, y: ${b2.y + 20} }, allowNew: true }); 0`); await sleep(1500);
    log('soltar /z na barra da janela 2 → janela 4:', await tabsOf(w4), '· janela 2:', await tabsOf(w2), '· janelas:', wins().length);
  }

  // 6) favoritos sincronizados
  await js(w1, `bookmarks.add('${base}/fav', 'Fav'); 0`); await sleep(600);
  log('janelas antes dos favoritos:', wins().length, '· janela 2 viva:', !w2.isDestroyed());
  log('favorito da janela 1 aparece na janela 2:', await js(w2, `!!bookmarks.find('${base}/fav')`));

  // 7) Ctrl+W na última aba fecha só a janela
  for (const w of [w3, w4].filter(Boolean)) await js(w, "while (tabs.length > 1) closeTab(tabs[1].id); shortcut('w'); 0").catch(() => {});
  ws = await waitWins(2);
  log('fechar a última aba fecha a janela → janelas:', ws.length);

  // 8) a principal fecha: a janela 2 assume e guarda a sessão
  w1.close(); await sleep(1500);
  log('principal fechou → janela 2 principal:', await js(w2, 'library.primary'), '· grupos visíveis:', await js(w2, "getComputedStyle(document.querySelector('#sb-groups')).display !== 'none'"));
  await js(w2, `newTab('${base}/after', false); 0`); await sleep(1200);
  log('   sessão guardada:', await js(w2, `JSON.parse(localStorage.getItem(profileKey('tabsets'))).default.tabs.map((t) => t.url.${PATH}).join(',')`));
  log('   abas da janela 2:', await tabsOf(w2));
  server.close(); app.exit(0);
});
