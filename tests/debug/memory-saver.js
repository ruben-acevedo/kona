// O1: economia de memória — aba parada é suspensa (memória liberada, ícone apagado), volta no mesmo
// endereço com o histórico (voltar funciona); exceções: formulário preenchido, site "sempre ativo",
// tocando som, site com notificações permitidas. Prazos encurtados: 1 "minuto" = 200 ms.
const os = require('os'); const path = require('path'); const http = require('http'); const fs = require('fs');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-saver-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('R', ...a);
const OUT = path.join(os.tmpdir(), 'kona-saver-shots');
fs.mkdirSync(OUT, { recursive: true });

const big = 'x'.repeat(2e6); // páginas com algum peso, para a memória liberada aparecer
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  const form = req.url.startsWith('/form') ? '<input id="q" value="">' : '';
  res.end(`<title>Página ${req.url}</title><h1>${req.url}</h1>${form}<script>window.blob = ${JSON.stringify(big)}.split('');</script>`);
});
const appMem = () => app.getAppMetrics().reduce((s, m) => s + (m.memory?.workingSetSize || 0), 0);

app.whenReady().then(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const A = `http://127.0.0.1:${port}`, L = `http://localhost:${port}`;
  let w; while (!(w = BrowserWindow.getAllWindows()[0])) await sleep(50);
  await sleep(3000);
  const wc = w.webContents; wc.setAudioMuted(true);
  const js = (c) => wc.executeJavaScript(c);
  await js(`settings.sounds = false; setLanguage('pt-BR'); settings.memorySaver = false; navigate(active(), '${A}/atual'); 0`); await sleep(1200);

  // abas: B (com histórico b1 → b2), C (formulário preenchido), D (localhost = "sempre ativo"),
  // E (marcada tocando som), F (site com notificações permitidas)
  await js(`window.T = {};
    T.b = newTab('${A}/b1', false); T.c = newTab('${A}/form', false); T.d = newTab('${L}/sempre', false);
    T.e = newTab('${A}/som', false); T.f = newTab('${A}/notif', false); activate(tabs[0].id); 0`); await sleep(2500);
  await js(`navigate(T.b, '${A}/b2'); 0`); await sleep(1500);
  await js(`T.c.wv.executeJavaScript("document.getElementById('q').value = 'texto digitado'; 0"); T.e.audible = true;
    settings.keepActive = ['localhost']; settings.sites['${A}'] = { notifications: 'allow' }; saveSettings(); 0`);
  await sleep(500);
  // a aba F é do mesmo site (127.0.0.1) que a B: para o teste, as notificações valem só para ela
  await js(`settings.sites = {}; saveSettings(); 0`);
  const before = appMem();
  const webviews = () => js("document.querySelectorAll('#views webview').length");
  log('antes: webviews', await webviews(), '· memória do Kona', Math.round(before / 1024), 'MB');

  await js(`settings.memorySaverTestMs = 200; settings.memorySaverMode = 'maximum'; settings.memorySaver = true; saver.schedule(); 0`);
  await sleep(6500);
  const st = () => js(`Object.fromEntries(Object.entries(T).map(([k, t]) => [k, t.suspended ? 'suspensa ' + Math.round(t.suspended.kb / 1024) + ' MB' : (t.wv ? 'ativa' : 'sem página') + (t.keepAlive ? ' (' + t.keepAlive + ')' : '')]))`);
  log('depois de 3 s parada (modo máximo):', JSON.stringify(await st()));
  await sleep(1500);
  const after = appMem();
  log('webviews', await webviews(), '· memória do Kona', Math.round(after / 1024), 'MB · liberou', Math.round((before - after) / 1024), 'MB');
  log('aba suspensa: classe', await js("tabEl(T.b).classList.contains('suspended')"), '· dica:', JSON.stringify(await js('tabEl(T.b).title')));
  await js('toggleSidebar(true); 0'); await sleep(700);
  log('menu lateral marca a suspensa:', await js("!!document.querySelector('.sb-tab.suspended')"));
  fs.writeFileSync(path.join(OUT, 'suspended.png'), (await wc.capturePage()).toPNG());
  await js('toggleSidebar(false); 0');

  // voltar para a B: renasce em /b2 com o histórico (voltar → /b1)
  await js('activate(T.b.id); 0'); await sleep(2500);
  log('ativar a B → endereço:', await js('T.b.url'), '· pode voltar:', await js('T.b.canBack'), '· suspensa:', await js('!!T.b.suspended'));
  await js('T.b.wv.goBack(); 0'); await sleep(1500);
  log('voltar → ', await js('T.b.url'));

  // site com notificações permitidas (o processo principal decide)
  await js(`settings.sites['${A}'] = { notifications: 'allow' }; saveSettings(); T.g = newTab('${A}/notif2', false); activate(tabs[0].id); 0`); await sleep(5500);
  log('aba nova de site com notificações permitidas, parada 5 s:', JSON.stringify((await st()).g));
  log('   diagnóstico G:', JSON.stringify(await js("({ cand: saver.candidate(T.g), loading: T.g.loading, idle: Date.now() - T.g.lastSeen, wv: !!T.g.wv, url: T.g.url, keep: T.g.keepAlive })")));
  log('Configurações › Desempenho:', await js("openSettings('desempenho'); 0").then(() => sleep(900)).then(() => js("[...document.querySelectorAll('#st-desempenho .st-row b')].map((b) => b.textContent).join(' | ')")));
  fs.writeFileSync(path.join(OUT, 'settings.png'), (await wc.capturePage()).toPNG());
  log('capturas em:', OUT);
  server.close(); app.exit(0);
});
