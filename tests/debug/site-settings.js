// N17: configurações por site — painel do cadeado, JavaScript bloqueado (CSP), pop-ups permitir/bloquear,
// cookies por site (bloquear o próprio site; permitir os de terceiros dentro de um site), a lista nas
// Configurações e a passagem dos "pop-ups sempre permitidos" antigos. Só servidores locais:
// 127.0.0.1 e localhost são sites diferentes (servem de "terceiro" um para o outro).
const os = require('os'); const path = require('path'); const http = require('http'); const https = require('https'); const fs = require('fs');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-sites-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow, webContents } = require('electron');
// cookies de terceiros precisam de https (SameSite=None; Secure): certificado de teste em tests/fixtures/tls/
app.on('certificate-error', (e, _wc, url, _err, _cert, cb) => { if (/^https:\/\/(127\.0\.0\.1|localhost):/.test(url)) { e.preventDefault(); cb(true); } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('R', ...a);
const OUT = path.join(os.tmpdir(), 'kona-sites-shots');
fs.mkdirSync(OUT, { recursive: true });

let sport = 0;
const handler = (req, res) => {
  const u = req.url;
  const html = (body, headers = {}) => { res.writeHead(200, { 'Content-Type': 'text/html', ...headers }); res.end(body); };
  if (u === '/js') return html("<title>sem js</title><script>document.title = 'JS-RODOU'</script><noscript>noscript</noscript>");
  if (u === '/pop') return html("<title>pop</title><script>setTimeout(() => window.open('/alvo', 'x', 'width=300,height=200'), 400)</script>");
  if (u === '/alvo') return html('<title>alvo</title>alvo');
  if (u.startsWith('/set')) return html('<title>set</title>ok', { 'Set-Cookie': `${u.slice(4) || 'a'}=1; SameSite=None; Secure; Path=/` });
  if (u === '/read') return html(`<title>read</title>[${req.headers.cookie || ''}]`);
  if (u === '/embed') return html(`<title>embed</title><iframe src="https://127.0.0.1:${sport}/read"></iframe>`);
  return html('<title>x</title>x');
};
const server = http.createServer(handler);
const tls = { key: fs.readFileSync(path.join(__dirname, '../fixtures/tls/key.pem')), cert: fs.readFileSync(path.join(__dirname, '../fixtures/tls/cert.pem')) };
const sserver = https.createServer(tls, handler);
const uiWins = () => BrowserWindow.getAllWindows().filter((w) => w.webContents.getURL().includes('index.html'));

app.whenReady().then(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  await new Promise((r) => sserver.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  sport = sserver.address().port;
  const A = `http://127.0.0.1:${port}`, B = `http://localhost:${port}`;
  const SA = `https://127.0.0.1:${sport}`, SB = `https://localhost:${sport}`;
  let w; while (!(w = uiWins()[0])) await sleep(50);
  await sleep(3000);
  const js = (c) => w.webContents.executeJavaScript(c);
  const guest = () => webContents.getAllWebContents().find((g) => g.getType() === 'webview' && g.id === guestId);
  let guestId = 0;
  const go = async (url, wait = 1500) => { await js(`navigate(active(), ${JSON.stringify(url)}); 0`); await sleep(wait); guestId = await js('active().wv.getWebContentsId()'); };
  const title = () => js('active().wv.getTitle()');
  const body = () => guest().executeJavaScript('document.body.innerText');
  const shot = async (name, h = 520) => fs.writeFileSync(path.join(OUT, name), (await w.webContents.capturePage({ x: 0, y: 0, width: 1400, height: h })).toPNG());
  const openPanel = async () => { await js("document.querySelector('#tabs .tab.active .lock').click(); 0"); await sleep(500); };
  const panelSet = (kind, v) => js(`(() => { const s = document.querySelector('#site-pop [data-kind=${kind}]'); s.value = '${v}'; s.dispatchEvent(new Event('change', { bubbles: true })); return 0; })()`);
  const panelText = () => js("document.querySelector('#site-pop').innerText.replace(/\\s+/g, ' ')");

  await js("settings.sounds = false; setLanguage('pt-BR'); 0");

  // ── JavaScript ──
  await go(`${A}/js`);
  log('JS padrão → título:', await title(), '· cadeado visível (http):', await js("getComputedStyle(document.querySelector('#tabs .tab.active .lock')).display"));
  await openPanel();
  log('painel:', await panelText());
  await shot('panel.png');
  await panelSet('js', 'block'); await sleep(300);
  log('   bloquear → aviso de recarregar:', await js("!!document.querySelector('#site-pop .si-reload')"), '· regra:', JSON.stringify(await js('settings.siteRules')));
  await js("document.querySelector('#site-pop [data-si=reload]').click(); 0"); await sleep(1500);
  log('   recarregado → título:', await title(), '(esperado: sem js) · ícone JS bloqueado:', await js("!document.querySelector('#tabs .tab.active .jsind').hidden"), '· painel fechado:', await js("!document.querySelector('#site-pop').classList.contains('show')"));
  await shot('js-blocked.png', 120);
  await go(`${B}/js`);
  log('   outro site (localhost) → título:', await title(), '· ícone:', await js("!document.querySelector('#tabs .tab.active .jsind').hidden"));
  await js("setSiteRule('127.0.0.1', 'js', ''); 0");
  await go(`${A}/js`);
  log('   desfeito → título:', await title());

  // ── Pop-ups ──
  const popups = () => BrowserWindow.getAllWindows().filter((x) => !x.webContents.getURL().includes('index.html')).length;
  await go(`${A}/pop`, 1500);
  log('Pop-up sem clique, padrão → bloqueado:', await js('!!active().blockedPopups?.length'), '· janelas pop-up:', popups(), '· site no aviso:', await js('active().blockedPopupsSite'));
  await openPanel(); await panelSet('popups', 'allow'); await sleep(200);
  log('   permitir no painel → aviso some:', await js('!active().blockedPopups'));
  await js('toggleSitePop(null, null, false); 0');
  await js('active().wv.reload(); 0'); await sleep(1800);
  log('   recarregado → janelas pop-up:', popups());
  for (const x of BrowserWindow.getAllWindows()) if (!x.webContents.getURL().includes('index.html')) x.close();
  await js("setSiteRule('127.0.0.1', 'popups', 'block'); 0");
  await js('active().wv.reload(); 0'); await sleep(1800);
  log('   bloquear → janelas pop-up:', popups(), '· bloqueado:', await js('!!active().blockedPopups?.length'));
  await js("setSiteRule('127.0.0.1', 'popups', ''); 0");

  // ── Cookies ──
  await go(`${SA}/seta`); await go(`${SA}/read`);
  log('Cookies, 1º site, padrão →', await body());
  await go(`${SB}/embed`, 2000);
  const frameText = () => guest().mainFrame.frames[0]?.executeJavaScript('document.body.innerText');
  log('   dentro de outro site (terceiro), padrão →', await frameText(), '(esperado: [])');
  await openPanel(); await panelSet('cookies', 'allow'); await sleep(200);
  log('   permitir cookies em localhost: aviso de recarregar:', await js("!!document.querySelector('#site-pop .si-reload')"));
  await js("document.querySelector('#site-pop [data-si=reload]').click(); 0"); await sleep(2000);
  log('   recarregado → terceiro dentro dele:', await frameText(), '(esperado: [a=1])');
  await js("setSiteRule('127.0.0.1', 'cookies', 'block'); 0");
  await go(`${SA}/setb`); await go(`${SA}/read`);
  log('   bloquear 127.0.0.1 →', await body(), '(esperado: [] e sem b)');
  await js("setSiteRule('127.0.0.1', 'cookies', ''); 0");
  await go(`${SA}/read`);
  log('   desfeito →', await body(), '(esperado: [a=1], sem b)');
  await openPanel(); await sleep(400);
  log('   painel → contagem:', await js("document.querySelector('#si-cookie-count').textContent"));
  await js('toggleSitePop(null, null, false); 0');

  // ── Configurações › Permissões de sites ──
  await js("setSiteRule('exemplo.com', 'js', 'block'); setSiteRule('exemplo.com', 'cookies', 'block'); openSettings('permissoes'); 0"); await sleep(800);
  log('Configurações → sites na lista:', await js("[...document.querySelectorAll('[data-rule-row]')].map((r) => r.dataset.ruleRow).join(', ')"));
  await js("settingsPage.scrollTo('permissoes'); 0"); await sleep(900);
  await shot('settings.png', 900);
  await js("(() => { const s = document.querySelector('[data-rule-site=\"exemplo.com\"][data-rule-kind=js]'); s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); return 0; })()"); await sleep(200);
  log('   mudar na lista →', JSON.stringify(await js("settings.siteRules['exemplo.com']")));
  await js("document.querySelector('[data-do=rule-forget][data-site=\"exemplo.com\"]').click(); 0"); await sleep(200);
  log('   esquecer →', JSON.stringify(await js("settings.siteRules['exemplo.com'] || null")));
  log('   permissões de câmera etc. continuam:', await js("document.querySelectorAll('[data-perm]').length"));

  // ── "Pop-ups sempre permitidos" de antes ──
  await js("settings.popupsAllowed = ['https://www.antigo.com.br', 'http://foo.bar.org']; migratePopupsAllowed(); 0"); await sleep(500);
  log('Migração →', JSON.stringify(await js("({ a: settings.siteRules['antigo.com.br'], b: settings.siteRules['bar.org'], lista: settings.popupsAllowed })")));

  // ── Janela privada: o que se muda lá vale só para ela ──
  await js("library.switchTo('private'); 0"); await sleep(1500);
  await go(`${A}/js`);
  log('Privada, padrão → título:', await title(), '· privada:', await js('library.isPrivate()'));
  await openPanel();
  log('   painel avisa que vale só nesta janela:', (await panelText()).includes('navegação privada'), '· sem "Configurações do site":', !(await js("!!document.querySelector('#site-pop [data-si=settings]')")));
  await panelSet('js', 'block'); await sleep(200);
  await js("document.querySelector('#site-pop [data-si=reload]').click(); 0"); await sleep(1500);
  log('   bloquear → título:', await title(), '· regras do perfil (sem 127.0.0.1):', JSON.stringify(await js("settings.siteRules['127.0.0.1'] || null")));
  await js("library.switchTo('default'); 0"); await sleep(1500);
  await go(`${A}/js`);
  log('   de volta ao perfil → título:', await title(), '(esperado: JS-RODOU)');

  log('capturas em:', OUT);
  server.close(); sserver.close(); app.exit(0);
});
