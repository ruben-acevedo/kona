// Extensões completas (electron-chrome-extensions, MIT): APIs chrome.tabs / chrome.action /
// chrome.contextMenus, popups e ícones com contador. A interface desenha os botões e a lista no
// estilo do Kona (renderer/extensions-bar.js); aqui ficam um gerenciador por perfil (sessão),
// o acompanhamento das abas e a ponte com a interface.
const { ElectronChromeExtensions } = require('electron-chrome-extensions');
const { webContents } = require('electron');
const { onUi, handleUi } = require('./ipc');

const managers = new Map(); // partição → ElectronChromeExtensions
let win = () => null; // janela em foco
let winOfPartition = () => null; // uma janela do perfil (O7: cada janela tem o seu)
let winFor = () => null; // janela que hospeda uma aba

/** Aba nova pedida por uma extensão (chrome.tabs.create): a interface cria e devolve o webview. */
const waiting = new Map();
let reqSeq = 0;
function createTabFromExtension(details, partition) {
  return new Promise((resolve, reject) => {
    const id = ++reqSeq;
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error('tab not created')); }, 8000);
    waiting.set(id, (wcId) => {
      clearTimeout(timer);
      const wc = webContents.fromId(wcId);
      if (wc) resolve([wc, winFor(wc)]); else reject(new Error('tab not found'));
    });
    (winOfPartition(partition) || win())?.webContents.send('ext:tab-create', { id, url: details.url || '', active: details.active !== false });
  });
}
onUi('ext:tab-created', (_e, id, wcId) => { waiting.get(id)?.(Number(wcId)); waiting.delete(id); });

/** A interface que hospeda a aba. Uma aba já destruída (ao fechar) não tem mais: nada a avisar. */
const hostOf = (wc) => { try { return wc.isDestroyed() ? null : wc.hostWebContents; } catch { return null; } };

let registering = false; // trackTab em andamento: a "seleção" que vem dele não é de uma extensão

/** Cria o gerenciador de uma sessão de perfil (antes de carregar as extensões dela). */
function attach(ses, partition) {
  if (managers.has(partition)) return managers.get(partition);
  const m = new ElectronChromeExtensions({
    session: ses,
    createTab: (details) => createTabFromExtension(details, partition),
    // só quando uma extensão pede (chrome.tabs.update); a biblioteca também "seleciona" a 1ª aba que
    // conhece numa janela, e isso fazia uma aba carregando em segundo plano roubar a vez da atual
    selectTab: (wc) => { if (!registering) hostOf(wc)?.send('ext:tab-select', wc.id); },
    removeTab: (wc) => hostOf(wc)?.send('ext:tab-remove', wc.id),
    createWindow: async (details) => { // a "janela nova" de uma extensão vira uma aba da janela em foco
      const url = Array.isArray(details.url) ? details.url[0] : details.url;
      const [wc] = await createTabFromExtension({ url, active: true }, partition);
      return winFor(wc);
    },
  });
  // APIs que faltam (chrome.commands…), nas páginas e service workers das extensões
  for (const type of ['frame', 'service-worker']) {
    ses.registerPreloadScript({ type, filePath: require('path').join(__dirname, 'extension-shims.js') });
  }
  managers.set(partition, m);
  return m;
}

const managerOf = (ses) => ElectronChromeExtensions.fromSession(ses);

/** Cada aba (webview) da sessão passa a existir para chrome.tabs. */
function trackTab(contents) {
  const m = managerOf(contents.session);
  const w = winFor(contents);
  if (!m || !w) return;
  registering = true;
  try { m.addTab(contents, w); } finally { registering = false; }
}

/** Itens que as extensões acrescentam ao menu do botão direito (chrome.contextMenus). */
const pendingClicks = new Map();
let clickSeq = 0;
function contextItems(contents, params) {
  const m = managerOf(contents.session);
  if (!m) return [];
  pendingClicks.clear();
  const map = (items) => items.filter((it) => it.visible !== false).map((it) => {
    if (it.type === 'separator') return { sep: true };
    const id = ++clickSeq;
    if (it.click) pendingClicks.set(id, () => it.click(it, winFor(contents), contents));
    return { id, label: it.label, enabled: it.enabled !== false, checked: it.type === 'checkbox' || it.type === 'radio' ? !!it.checked : undefined,
      submenu: it.submenu ? map(it.submenu.items || it.submenu) : undefined };
  });
  try { return map(m.getContextMenuItems(contents, params) || []); } catch { return []; }
}

function registerExtensions(opts) {
  win = opts.win;
  winFor = opts.winFor;
  winOfPartition = opts.winOfPartition || (() => null);
  handleUi('ext:tab-selected', (_e, wcId) => {
    const wc = webContents.fromId(Number(wcId));
    if (wc) managerOf(wc.session)?.selectTab(wc);
    return true;
  });
  handleUi('ext:menu-click', (_e, id) => { pendingClicks.get(Number(id))?.(); pendingClicks.clear(); return true; });
}

module.exports = { attach, trackTab, contextItems, registerExtensions, ElectronChromeExtensions };
