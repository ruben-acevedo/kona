// N5: idiomas — automático (segue o sistema), troca ao vivo (pt-BR ↔ es ↔ en) sem perder as abas,
// HTML fixo e textos desenhados pelos scripts, processo principal (language.json), idioma das páginas
// (navigator.language / Accept-Language) e capturas das telas principais em português.
const os = require('os'); const path = require('path'); const http = require('http'); const fs = require('fs');
const DATA = path.join(os.tmpdir(), `kona-i18n-${process.pid}`);
process.env.KONA_USER_DATA = DATA;
require('../../main.js');
const { app, BrowserWindow, webContents } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastLang = '';
const server = http.createServer((req, res) => { lastLang = req.headers['accept-language'] || ''; res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<title>Page</title><p>page'); });
const log = (...a) => console.log('R', ...a);
const OUT = path.join(os.tmpdir(), 'kona-i18n-shots');
fs.mkdirSync(OUT, { recursive: true });
app.whenReady().then(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let w; while (!(w = BrowserWindow.getAllWindows()[0])) await sleep(50);
  await sleep(3000);
  const js = (c) => w.webContents.executeJavaScript(c);
  const shot = async (name) => { fs.writeFileSync(path.join(OUT, `${name}.png`), (await w.webContents.capturePage()).toPNG()); };
  log('sistema:', app.getPreferredSystemLanguages().join(','), '· --lang:', app.commandLine.getSwitchValue('lang'), '· interface:', await js('i18n.lang'), '(escolha:', await js('i18n.choice') + ')');
  await js(`settings.sounds = false; navigate(active(), '${base}/'); newTab(); 0`); await sleep(2000);
  log('página: Accept-Language:', lastLang, '· navigator.language:', await webContents.getAllWebContents().find((c) => c.getType() === 'webview')?.executeJavaScript('navigator.language'));
  const sample = () => js(`JSON.stringify({
    novaAba: tabs[1] && tabTitle(tabs[1]),
    placeholder: document.querySelector('#tabs .tab.active input')?.placeholder,
    botaoNova: document.querySelector('#btn-new').title,
    menuAba: tabItems(tabs[0]).filter((x) => x !== '-').slice(0, 3).map((x) => x.label).join(' | '),
    data: makeDateFormats && dayFmt.format(new Date(2026, 10, 26)),
  })`);
  log('pt? amostra:', await sample());
  await js('setLanguage("pt-BR"); 0'); await sleep(400);
  // capturas em português
  await js('openSettings(); 0'); await sleep(1200); await shot('pt-settings');
  await js("settingsPage.scrollTo('privacidade'); 0"); await sleep(900); await shot('pt-settings-privacy');
  await js('activate(tabs[1].id); 0'); await sleep(400);
  await js('toggleSidebar(true); 0'); await sleep(900); await shot('pt-sidebar');
  await js('toggleSidebar(false); toggleCustomize(true); 0'); await sleep(900); await shot('pt-customize');
  await js('toggleCustomize(false); 0');
  // troca ao vivo para espanhol: as abas continuam
  const wcBefore = await js('tabs[0].wv.getWebContentsId()');
  await js('setLanguage("es"); 0'); await sleep(600);
  log('es: amostra:', await sample(), '· mesma aba (não recarregou):', wcBefore === await js('tabs[0].wv.getWebContentsId()'));
  log('es: título das Configurações:', await js("document.querySelector('#st-geral h2')?.textContent"), '· HTML fixo (barra lateral):', await js("document.querySelector('#sb-groups-h').textContent"));
  await sleep(300);
  log('processo principal guardou:', fs.readFileSync(path.join(DATA, 'language.json'), 'utf8'));
  await js('setLanguage("en"); 0'); await sleep(400);
  log('en: amostra:', await sample());
  await js('setLanguage("auto"); 0'); await sleep(400);
  log('automático de novo →', await js('i18n.lang'));
  log('capturas em:', OUT);
  server.close(); app.exit(0);
});
