// N11: instalar sites como app — ícone "Instalar app" na barra (site com manifest), a janela de
// instalar (nome e ícone do manifest), o atalho do Windows (numa pasta de teste, sem mexer no menu
// Iniciar de verdade), a janela do app (uma aba, sem barra de endereço), links que saem do app indo
// para o navegador, abrir de novo pelo atalho (second-instance), "Abrir no app", a seção Apps das
// Configurações, site sem manifest (ícone com a inicial) e desinstalar. Só servidor local.
const os = require('os'); const path = require('path'); const http = require('http'); const fs = require('fs');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-apps-${process.pid}`);
process.env.KONA_SHORTCUT_DIR = path.join(os.tmpdir(), `kona-apps-lnk-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow, shell } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('R', ...a);
const OUT = path.join(os.tmpdir(), 'kona-apps-shots');
fs.mkdirSync(OUT, { recursive: true });

const ICON = fs.readFileSync(path.join(__dirname, '../../assets/icon-256.png'));
const server = http.createServer((req, res) => {
  const u = req.url;
  if (u === '/icon.png') { res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(ICON); return; }
  if (u === '/manifest.json') {
    res.writeHead(200, { 'Content-Type': 'application/manifest+json' });
    res.end(JSON.stringify({ name: 'Caderno Teste', short_name: 'Caderno', start_url: '/app/?fonte=pwa', scope: '/app/', display: 'standalone', theme_color: '#2b6cb0', icons: [{ src: '/icon.png', sizes: '256x256', type: 'image/png' }] }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  if (u.startsWith('/app/')) res.end(`<title>Caderno — ${u}</title><link rel="manifest" href="/manifest.json"><h1>App ${u}</h1><a id="fora" href="/fora" target="_blank">fora</a>`);
  else res.end(`<title>Página ${u}</title><h1>${u}</h1>`);
});
const uiWins = () => BrowserWindow.getAllWindows().filter((w) => w.webContents.getURL().includes('index.html'));
const appWins = () => uiWins().filter((w) => w.webContents.getURL().includes('app='));
const browserWins = () => uiWins().filter((w) => !w.webContents.getURL().includes('app='));
const lnks = (sub) => { try { return fs.readdirSync(path.join(process.env.KONA_SHORTCUT_DIR, sub)); } catch { return []; } };

app.whenReady().then(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let w; while (!(w = browserWins()[0])) await sleep(50);
  await sleep(3000);
  const js = (c, win = w) => win.webContents.executeJavaScript(c);
  await js("settings.sounds = false; setLanguage('pt-BR'); 0");

  // ── site com manifest: ícone "Instalar app" ──
  await js(`navigate(active(), '${base}/app/notas'); newTab('${base}/outra', false); 0`); await sleep(1500);
  await js("activate(tabs[0].id); 0"); await sleep(1200);
  log('Site com manifest → botão:', await js("(() => { const b = document.querySelector('#tabs .tab.active .appbtn'); return b.hidden ? '(escondido)' : b.title; })()"));
  await js("activate(tabs[1].id); 0"); await sleep(400);
  log('Site sem manifest → botão escondido:', await js("document.querySelector('#tabs .tab.active .appbtn').hidden"), '· menu da página tem:', JSON.stringify(await js('appMenuItems(active()).map((i) => i.label)')));
  await js("activate(tabs[0].id); 0"); await sleep(300);
  await w.webContents.capturePage({ x: 0, y: 0, width: 1400, height: 60 }).then((i) => fs.writeFileSync(path.join(OUT, 'bar.png'), i.toPNG()));

  // ── instalar ──
  await js("document.querySelector('#tabs .tab.active .appbtn').click(); 0"); await sleep(2000);
  log('Janela de instalar → nome:', await js("document.querySelector('#app-name').value"), '· origem:', await js("document.querySelector('#app-origin').textContent"), '· ícone:', await js("!!document.querySelector('#app-icon img')"), '· botão ativo:', await js("!document.querySelector('#app-install').disabled"));
  await w.webContents.capturePage().then((i) => fs.writeFileSync(path.join(OUT, 'sheet.png'), i.toPNG()));
  await js("document.querySelector('#app-desktop').checked = true; document.querySelector('#app-install').click(); 0");
  for (let i = 0; i < 60 && !appWins().length; i++) await sleep(100);
  await sleep(2500);
  const aw = appWins()[0];
  const list = JSON.parse(fs.readFileSync(path.join(process.env.KONA_USER_DATA, 'apps.json'), 'utf8'));
  const rec = list[0];
  log('Instalado →', JSON.stringify({ nome: rec?.name, inicio: rec?.startUrl.replace(base, ''), escopo: rec?.scope.replace(base, ''), cor: rec?.themeColor }));
  log('   aba do site fechou no navegador:', await js('tabs.map((t) => t.url.replace(location.origin, "")).join(", ")').then((s) => s.replace(new RegExp(base.replace(/[.:/]/g, '\\$&'), 'g'), '')));
  log('   atalhos → menu Iniciar:', lnks('Start Menu').join(', '), '· área de trabalho:', lnks('Desktop').join(', '));
  if (process.platform === 'win32' && lnks('Start Menu').length) {
    const l = shell.readShortcutLink(path.join(process.env.KONA_SHORTCUT_DIR, 'Start Menu', lnks('Start Menu')[0]));
    log('   atalho aponta para:', path.basename(l.target), l.args.replace(/"[^"]*"\s*/, '"<app>" '), '· id na barra de tarefas:', l.appUserModelId, '· ícone .ico:', fs.existsSync(l.icon));
  }
  await sleep(2000); // a animação de abertura da janela
  log('Janela do app → aberta:', !!aw, '· abas:', await js('tabs.length', aw), '· página:', (await js('active().url', aw)).replace(base, ''), '· modo app:', await js("document.body.classList.contains('app-mode')", aw));
  log('   barra de endereço escondida:', await js("getComputedStyle(document.querySelector('#tabs .tab.active .addr')).display", aw), '· título na faixa:', await js("document.querySelector('#tabs .tab.active .title').textContent", aw), '· título da janela:', aw.getTitle());
  await aw.webContents.capturePage().then((i) => fs.writeFileSync(path.join(OUT, 'app-window.png'), i.toPNG()));

  // ── links que saem do app ──
  const before = await js('tabs.length');
  await js(`newTab('${base}/fora', false); 0`, aw); await sleep(1500);
  log('Link em nova janela (target=_blank) → abas do app:', await js('tabs.length', aw), '· abas do navegador:', before, '→', await js('tabs.length'), '· última:', (await js('tabs[tabs.length - 1].url')).replace(base, ''));
  aw.focus();
  await js(`navigate(active(), '${base}/outro-lugar'); 0`, aw); await sleep(1500);
  log('Fora do escopo dentro do app → endereço antes do título:', await js("document.querySelector('#tabs .tab.active').classList.contains('outscope') && document.querySelector('#tabs .tab.active .title').dataset.host", aw));
  await aw.webContents.capturePage({ x: 0, y: 0, width: 1180, height: 60 }).then((i) => fs.writeFileSync(path.join(OUT, 'app-outscope.png'), i.toPNG()));
  await js("shortcut('t'); 0", aw); await sleep(800);
  log('Ctrl+T no app → abas do app:', await js('tabs.length', aw), '· janelas do navegador:', browserWins().length);

  // ── abrir de novo pelo atalho (o Windows chama o Kona com --kona-app=<id>) ──
  aw.close(); await sleep(800);
  app.emit('second-instance', {}, ['Kona.exe', `--kona-app=${rec.id}`], process.cwd());
  for (let i = 0; i < 60 && !appWins().length; i++) await sleep(100);
  await sleep(1500);
  const aw2 = appWins()[0];
  log('Atalho com o Kona aberto → janela do app:', !!aw2, '· página:', aw2 && (await js('active().url', aw2)).replace(base, ''));
  app.emit('second-instance', {}, ['Kona.exe', `--kona-app=${rec.id}`], process.cwd()); await sleep(800);
  log('   de novo → continua uma janela só:', appWins().length);

  // ── "Abrir no app" no navegador ──
  w.focus();
  await js(`navigate(active(), '${base}/app/outra-nota'); 0`); await sleep(1800);
  log('Página do app no navegador → botão:', await js("(() => { const b = document.querySelector('#tabs .tab.active .appbtn'); return b.hidden ? '(escondido)' : b.title; })()"), '· menu:', JSON.stringify(await js('appMenuItems(active()).map((i) => i.label)')));
  await js("document.querySelector('#tabs .tab.active .appbtn').click(); 0"); await sleep(1500);
  log('   abrir no app → página no app:', (await js('active().url', aw2)).replace(base, ''), '· janelas do app:', appWins().length);

  // ── Configurações › Apps ──
  w.focus();
  await js("openSettings('apps'); 0"); await sleep(1200);
  await js("settingsPage.scrollTo('apps'); 0"); await sleep(900);
  log('Configurações › Apps →', await js("[...document.querySelectorAll('.st-app b')].map((b) => b.textContent).join(', ')"));
  await w.webContents.capturePage().then((i) => fs.writeFileSync(path.join(OUT, 'settings.png'), i.toPNG()));

  // ── site sem manifest: ícone com a inicial ──
  await js(`newTab('${base}/blog', false); 0`); await sleep(1500);
  await js('openInstallSheet(active()); 0'); await sleep(2000);
  log('Sem manifest → nome:', await js("document.querySelector('#app-name').value"), '· ícone gerado:', await js("document.querySelector('#app-icon img')?.src.startsWith('data:image/png')"));
  await js("document.querySelector('#app-install').click(); 0"); await sleep(2500);
  log('   instalados:', await js('installedApps.map((a) => a.name + " (" + a.scope.replace(location.origin, "") + ")").join(", ")').then((s) => s.replace(new RegExp(base.replace(/[.:/]/g, '\\$&'), 'g'), '')), '· janelas do app:', appWins().length);

  // ── desinstalar ──
  for (const a of await js('installedApps.map((a) => a.id)')) await js(`api.apps.uninstall('${a}')`);
  await sleep(1200);
  log('Desinstalar tudo → apps:', JSON.parse(fs.readFileSync(path.join(process.env.KONA_USER_DATA, 'apps.json'), 'utf8')).length, '· atalhos:', lnks('Start Menu').length + lnks('Desktop').length, '· janelas do app:', appWins().length, '· Configurações:', await js("document.querySelectorAll('.st-app').length"));
  log('capturas em:', OUT);
  server.close(); app.exit(0);
});
