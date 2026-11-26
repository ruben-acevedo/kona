// Modo leitura (como o do Safari). O Readability da Mozilla (Apache 2.0, o do Firefox) roda num mundo
// isolado da página (os scripts do site não o alcançam): diz se a página é um artigo e monta a versão
// limpa numa camada por cima da página (shadow DOM fechado). Sair é instantâneo, sem recarregar.
// Também lê o artigo em voz alta com as vozes do Windows ("Listen to Page").
const { webContents } = require('electron');
const fs = require('fs');
const { tl } = require('./i18n');
const path = require('path');
const { handleUi } = require('./ipc');

const WORLD = 1999; // mundo isolado só do modo leitura
const dir = path.dirname(require.resolve('@mozilla/readability/package.json'));
const LIB = ['Readability.js', 'Readability-readerable.js'].map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n;\n');
const PAGE = fs.readFileSync(path.join(__dirname, 'reader-page.js'), 'utf8');

const isTab = (wc) => wc && !wc.isDestroyed() && wc.getType() === 'webview';
async function run(wc, code) {
  if (!isTab(wc)) return null;
  try {
    // a biblioteca e o leitor entram uma vez por documento (o mundo é recriado a cada navegação)
    const ready = await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: 'typeof window.__konaReader === "object"' }]);
    if (!ready) await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: `${LIB}\n;\n${PAGE}\n;0` }]);
    return await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code }], true);
  } catch { return null; }
}

/** Depois de cada carregamento: avisa a interface se a página é um artigo. */
function watchReader(contents) {
  const check = async () => {
    const url = contents.getURL();
    if (!/^https?:/i.test(url)) { contents.hostWebContents?.send('reader:state', { id: contents.id, available: false, active: false }); return; }
    const st = await run(contents, '({ available: __konaReader.check(), active: __konaReader.isOpen() })');
    const available = !!st?.available;
    contents.hostWebContents?.send('reader:state', { id: contents.id, available, active: !!st?.active, host: (() => { try { return new URL(url).hostname; } catch { return ''; } })() });
  };
  contents.on('did-stop-loading', check);
  // Esc dentro do modo leitura (o leitor avisa pelo console do mundo isolado)
  contents.on('console-message', (e) => {
    if ((e.message || '').includes('__kona_reader_closed__')) contents.hostWebContents?.send('reader:state', { id: contents.id, available: true, active: false });
  });
  contents.on('did-navigate-in-page', (_e, _url, isMainFrame) => { if (isMainFrame) setTimeout(check, 600); });
}

function registerReader() {
  const tab = (id) => { const wc = webContents.fromId(Number(id)); return isTab(wc) ? wc : null; };
  const opts = (s) => JSON.stringify(s && typeof s === 'object' ? s : {});
  handleUi('reader:open', async (_e, id, settings) => run(tab(id), `__konaReader.open(${opts({ ...settings, minRead: tl('{n} min read') })})`));
  handleUi('reader:close', async (_e, id) => run(tab(id), '__konaReader.close()'));
  handleUi('reader:apply', async (_e, id, settings) => run(tab(id), `__konaReader.apply(${opts(settings)})`));
  handleUi('reader:speech', async (_e, id, cmd) => {
    if (!['play', 'pause', 'resume', 'stop', 'status'].includes(cmd)) return null;
    return run(tab(id), `__konaReader.speech(${JSON.stringify(cmd)})`);
  });
}

module.exports = { watchReader, registerReader };
