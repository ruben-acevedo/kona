const { app, BrowserWindow, nativeTheme, nativeImage, Menu, session, shell, components, ipcMain, webContents } = require('electron');
const path = require('path');
const fs = require('fs');
const { installChromeWebStore, uninstallExtension } = require('electron-chrome-web-store');
const { createPolicy } = require('./session-policy');
const { onUi, handleUi } = require('./ipc');
const { startUpdater } = require('./updater');
const { registerImporter } = require('./importer');
const { registerDownloads } = require('./downloads');
const { registerContextMenu, watchPage } = require('./context-menu');
const extensionsApi = require('./extensions');
const { registerPasswords } = require('./passwords');
const { watchReader, registerReader } = require('./reader');
const { installShare, registerShare, shareEndedFrom } = require('./screen-share');
const { watchMedia, registerMedia } = require('./media');
const { execFile } = require('child_process');
const { pathToFileURL } = require('url');

// Todos os processos de página e da interface rodam na sandbox do Chromium, como no Chrome
app.enableSandbox();

// Ícone do app (gerado de assets/icon.svg por scripts/icons.js). A identidade própria no Windows
// faz a barra de tarefas agrupar e mostrar o Kona como um app, e não como "Electron".
const APP_ICON = path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon-512.png');
if (process.platform === 'win32') app.setAppUserModelId('com.ruben-acevedo.kona');

// Pasta de dados alternativa (útil para testes sem mexer no perfil real)
if (process.env.KONA_USER_DATA) app.setPath('userData', process.env.KONA_USER_DATA);

// Uma instância só: abrir o Kona de novo (ou um link vindo de outro programa, quando ele é o
// navegador padrão) abre uma aba na janela que já existe. O bloqueio é por pasta de dados, então
// os testes (KONA_USER_DATA) não esbarram no Kona aberto.
if (!app.requestSingleInstanceLock()) app.exit(0);

/** Endereços e arquivos passados na linha de comando ("Kona.exe -- <link>", como o Windows chama). */
function targetsFrom(argv) {
  const sep = argv.indexOf('--');
  const args = sep >= 0 ? argv.slice(sep + 1) : argv.slice(1).filter((a) => !a.startsWith('-'));
  const out = [];
  for (const a of args) {
    if (/^https?:\/\//i.test(a)) out.push(a);
    else if (/\.(html?|xhtml|svg|pdf)$/i.test(a) && fs.existsSync(a)) out.push(pathToFileURL(path.resolve(a)).href);
  }
  return out;
}
const pendingTargets = targetsFrom(process.argv);
function openTargets(list) {
  const w = focusedWin();
  if (!w) { pendingTargets.push(...list); return; }
  for (const url of list) w.webContents.send('tab:external', url);
}
app.on('second-instance', (_e, argv) => {
  const w = focusedWin();
  if (!w) return;
  if (w.isMinimized()) w.restore();
  w.show();
  w.focus();
  openTargets(targetsFrom(argv));
});

// Rolagem suave nas páginas, como no macOS
app.commandLine.appendSwitch('enable-smooth-scrolling');

// Modo escuro por padrão; a interface ajusta depois conforme a preferência salva.
// KONA_THEME=light|dark|system força um tema (útil para capturas de tela).
nativeTheme.themeSource = process.env.KONA_THEME || 'dark';
const bgColor = () => (nativeTheme.shouldUseDarkColors ? '#161618' : '#f2f2f7');

// Cada perfil tem a própria sessão do Chromium (cookies, logins, cache, extensões).
// O primeiro perfil usa a sessão original, para manter os dados que já existiam.
const DEFAULT_PARTITION = 'persist:kona';
const isPartition = (p) => typeof p === 'string' && /^persist:kona(-[a-z0-9]{4,32})?$/.test(p);
// Modo privado: sessão só em memória (sem "persist:"), nada vai para o disco
const isPrivatePartition = (p) => typeof p === 'string' && /^kona-private-[a-f0-9]{12}$/.test(p);
let currentPartition = DEFAULT_PARTITION;

// Identidade de navegador: sem "Electron/x" e "Kona/x" o user agent fica igual ao do Chromium.
// Importante: isto muda o user agent PADRÃO. Substituir o user agent da sessão (setUserAgent)
// faz o Chromium parar de enviar as client hints (Sec-CH-UA) — o Google trata "Chrome sem
// client hints" como robô e mostra a verificação “não sou um robô”.
app.userAgentFallback = app.userAgentFallback.replace(/\s(Electron|kona)\/\S+/gi, '');
/* ───────────── Janelas ─────────────
   O Kona pode ter várias janelas (Ctrl+N, arrastar uma aba para fora). A primeira é a "principal":
   ela guarda a sessão e os grupos de abas. Se fechar com outras abertas, a mais antiga assume. */
const windows = []; // em ordem de abertura
let lastFocused = null;
let primaryWin = null;
const alive = (w) => w && !w.isDestroyed();
/** A janela em uso (a última que teve o foco). */
const focusedWin = () => (alive(lastFocused) ? lastFocused : windows.find(alive)) || null;
/** A janela da interface que hospeda uma aba (ou a em uso, se não der para saber). */
const winFor = (wc) => {
  const host = wc && !wc.isDestroyed() ? (wc.hostWebContents || wc) : null;
  const w = host && BrowserWindow.fromWebContents(host);
  return (w && windows.includes(w) ? w : null) || focusedWin();
};
const isUiContents = (wc) => windows.some((w) => alive(w) && w.webContents === wc);
/** Avisa todas as janelas (downloads, senhas, extensões…). */
const broadcast = (channel, data) => { for (const w of windows) if (alive(w)) w.webContents.send(channel, data); };

/**
 * opts: { adopt (aba vinda de outra janela), bounds, maximize }.
 * Sem opts é a abertura do app (maximizada, como sempre).
 */
function createWindow(opts = {}) {
  const first = !windows.length;
  const win = new BrowserWindow({
    width: opts.bounds?.width || 1360,
    height: opts.bounds?.height || 860,
    ...(opts.bounds && opts.bounds.x != null ? { x: opts.bounds.x, y: opts.bounds.y } : {}),
    minWidth: 760,
    minHeight: 480,
    frame: false,
    show: false,
    icon: APP_ICON,
    backgroundColor: bgColor(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  windows.push(win);
  if (first || !alive(primaryWin)) primaryWin = win;
  lastFocused = win;
  win.on('focus', () => { lastFocused = win; });
  // A interface nunca sai do index.html nem abre janelas próprias
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.on('closed', () => {
    windows.splice(windows.indexOf(win), 1);
    if (lastFocused === win) lastFocused = null;
    // a principal fechou: a mais antiga das outras passa a guardar a sessão
    if (primaryWin === win) {
      primaryWin = windows.find(alive) || null;
      primaryWin?.webContents.send('win:promote');
    }
  });
  // botões laterais do mouse (voltar/avançar)
  win.on('app-command', (_e, cmd) => {
    if (cmd === 'browser-backward' || cmd === 'browser-forward') win.webContents.send('shortcut', { key: cmd === 'browser-backward' ? 'back' : 'forward' });
  });

  const query = { state: first ? process.env.KONA_STATE || '' : '' };
  if (!first) { query.role = 'secondary'; query.nowelcome = '1'; } // as ofertas do primeiro uso só na 1ª janela
  if (process.env.KONA_THEME) query.theme = process.env.KONA_THEME;
  if (process.env.KONA_WALLPAPER) query.wallpaper = process.env.KONA_WALLPAPER;
  // testes automáticos (pasta de dados própria) não recebem as ofertas do primeiro uso, a não ser que peçam
  if (process.env.KONA_USER_DATA && !process.env.KONA_WELCOME) query.nowelcome = '1';
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'), { query });
  win.once('ready-to-show', () => {
    // a abertura do app é sempre maximizada (restaurar volta a 1360×860); as outras janelas seguem
    // a de onde vieram (Ctrl+N) ou abrem onde a aba foi solta
    if (first || opts.maximize) win.maximize();
    win.show();
    win.webContents.send('win:shown');
  });
  // a janela foi aberta para receber esta aba: ela toma o lugar da nova aba vazia
  if (opts.adopt) win.webContents.once('did-finish-load', () => win.webContents.send('tab:adopt', { ...opts.adopt, fresh: true }));

  const sendState = () =>
    win.webContents.send('win:state', { maximized: win.isMaximized(), focused: win.isFocused(), fullscreen: win.isFullScreen() });
  ['maximize', 'unmaximize', 'focus', 'blur', 'enter-full-screen', 'leave-full-screen'].forEach((ev) => win.on(ev, sendState));
  win.webContents.on('did-finish-load', sendState);
  if (first) {
    win.webContents.once('did-finish-load', () => captureUaHints(win.webContents));
    win.webContents.once('did-finish-load', () => setTimeout(() => openTargets(pendingTargets.splice(0)), 400));
  }

  // KONA_SCREENSHOT=arquivo.png salva uma captura da janela e encerra (útil para revisar o design)
  const shot = first && process.env.KONA_SCREENSHOT;
  if (shot) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const img = await win.webContents.capturePage();
        fs.writeFileSync(shot, img.toPNG());
        app.quit();
      }, Number(process.env.KONA_SHOT_DELAY || 2500));
    });
  }
  return win;
}

/** Ctrl+N: janela nova do tamanho da atual, um pouco deslocada (ou maximizada, se a atual estiver). */
function newWindowFrom(src, adopt) {
  const b = alive(src) ? src.getNormalBounds() : null;
  return createWindow({ adopt, maximize: !!src?.isMaximized(), bounds: b && { x: b.x + 30, y: b.y + 30, width: b.width, height: b.height } });
}

/* ───────────── Extensões (Chrome Web Store) ───────────── */
const browserSession = (partition = currentPartition) => session.fromPartition(partition);
const extApi = (ses) => ses.extensions || ses; // Electron novo expõe session.extensions

/* ───────────── Client hints nas navegações ─────────────
   O Chrome envia Sec-CH-UA / -Mobile / -Platform em toda requisição HTTPS, inclusive na navegação
   principal. O Electron não os coloca nas navegações (só nas sub-requisições feitas pela página).
   Para o Google, um "Chrome" cuja página chega sem essas dicas parece robô → verificação "não sou um robô".
   Os valores vêm do próprio Chromium (navigator.userAgentData), então batem com o que as páginas veem. */
let uaHints = null;

async function captureUaHints(wc) {
  const d = await wc.executeJavaScript(
    'navigator.userAgentData ? { brands: navigator.userAgentData.brands, mobile: navigator.userAgentData.mobile, platform: navigator.userAgentData.platform } : null',
  ).catch(() => null);
  if (!d) return;
  uaHints = {
    'sec-ch-ua': d.brands.map((b) => `"${b.brand}";v="${b.version}"`).join(', '),
    'sec-ch-ua-mobile': d.mobile ? '?1' : '?0',
    'sec-ch-ua-platform': `"${d.platform}"`,
  };
}

// Client hints, cookies de terceiros, GPC, permissões e downloads (ver session-policy.js)
const policy = createPolicy({
  win: () => focusedWin(),
  winFor,
  uaHints: () => uaHints,
  currentPartition: () => currentPartition,
  isPrivate: (p) => isPrivatePartition(p),
  onPrefs: (partition) => { if (partition === currentPartition) applySecureDns(); },
});

/* ───────────── DNS seguro ─────────────
   DNS criptografado (DoH) pelo Quad9: o provedor de internet não vê os sites visitados, e o Quad9
   bloqueia domínios conhecidos de malware e phishing. Isso cobre parte do que o Safe Browsing faz
   no Chrome. O modo "automatic" volta para o DNS do sistema se o Quad9 não responder.
   Desligado: o mesmo padrão do Chrome (usa DoH só se o DNS do sistema oferecer). */
let dnsState = null;
function applySecureDns() {
  if (!app.isReady()) return;
  const on = policy.prefsFor(currentPartition).secureDns;
  if (on === dnsState) return;
  dnsState = on;
  app.configureHostResolver(on
    ? { secureDnsMode: 'automatic', secureDnsServers: ['https://dns.quad9.net/dns-query'] }
    : { secureDnsMode: 'automatic', secureDnsServers: [] });
}
// Toda sessão de abas: política acima + preload que deixa window.chrome igual ao do Chrome
// (sem isso o login do Google recusa o Kona como "navegador inseguro"; ver page-preload.js)
const installSession = (ses, partition) => {
  policy.install(ses, partition);
  ses.registerPreloadScript({ type: 'frame', filePath: path.join(__dirname, 'page-preload.js') });
  ses.registerPreloadScript({ type: 'frame', filePath: path.join(__dirname, 'page-passwords.js') }); // gerenciador de senhas
  ses.registerPreloadScript({ type: 'frame', filePath: path.join(__dirname, 'page-share.js') }); // compartilhar a tela
  ses.registerPreloadScript({ type: 'frame', filePath: path.join(__dirname, 'page-media.js') }); // controle de mídia
  installShare(ses); // seletor de tela/janela/aba do Kona
};

const pendingConfirms = new Map();
let confirmSeq = 0;

/** Resolve nomes "__MSG_x__" usando os arquivos de idioma da extensão. */
function localize(ext, text) {
  const m = /^__MSG_(.+)__$/.exec(text || '');
  if (!m) return text || '';
  const key = m[1].toLowerCase();
  const locales = [app.getLocale().replace('-', '_'), app.getLocale().split('-')[0], ext.manifest.default_locale, 'en'];
  for (const loc of locales.filter(Boolean)) {
    try {
      const msgs = JSON.parse(fs.readFileSync(path.join(ext.path, '_locales', loc, 'messages.json'), 'utf8'));
      const hit = Object.entries(msgs).find(([k]) => k.toLowerCase() === key);
      if (hit) return hit[1].message;
    } catch { /* tenta o próximo idioma */ }
  }
  return text;
}

function iconFor(ext) {
  const icons = ext.manifest.icons || {};
  const sizes = Object.keys(icons).map(Number).sort((a, b) => b - a);
  const size = sizes.find((s) => s <= 128) ?? sizes[0];
  if (!size) return null;
  const img = nativeImage.createFromPath(path.join(ext.path, icons[size]));
  return img.isEmpty() ? null : img.resize({ width: 48, quality: 'best' }).toDataURL();
}

function listExtensions() {
  const api = extApi(browserSession());
  return api.getAllExtensions().map((ext) => ({
    id: ext.id,
    name: localize(ext, ext.name),
    version: ext.version,
    description: localize(ext, ext.manifest.description),
    icon: iconFor(ext),
    options: ext.manifest.options_ui?.page || ext.manifest.options_page || null, // página de opções
  })).sort((a, b) => a.name.localeCompare(b.name));
}

const extensionsPathFor = (partition) => (partition === DEFAULT_PARTITION
  ? path.join(app.getPath('userData'), 'Extensions')
  : path.join(app.getPath('userData'), 'Extensions-perfis', partition.replace(/[^a-z0-9-]/gi, '_')));

// Antes de instalar uma extensão, pede confirmação numa folha da própria interface
async function beforeInstall(details) {
  const mainWin = focusedWin();
  if (!mainWin) return { action: 'deny' };
  const id = ++confirmSeq;
  const m = details.manifest || {};
  const hosts = [...(m.host_permissions || []), ...((m.content_scripts || []).flatMap((c) => c.matches || []))];
  mainWin.webContents.send('ext:confirm', {
    id,
    name: details.localizedName,
    icon: details.icon && !details.icon.isEmpty() ? details.icon.resize({ width: 64 }).toDataURL() : null,
    allSites: hosts.some((h) => h === '<all_urls>' || h.startsWith('*://*/') || h.startsWith('http://*/') || h.startsWith('https://*/')),
    permissions: m.permissions || [],
  });
  const ok = await new Promise((resolve) => pendingConfirms.set(id, resolve));
  return { action: ok ? 'allow' : 'deny' };
}

/** Prepara a sessão de um perfil (uma vez): client hints, Chrome Web Store e extensões dele. */
const prepared = new Map();
function prepareSession(partition) {
  if (!prepared.has(partition)) {
    prepared.set(partition, (async () => {
      const ses = browserSession(partition);
      installSession(ses, partition);
      extensionsApi.attach(ses, partition); // APIs chrome.tabs/action/contextMenus e popups (antes de carregar as extensões)
      await installChromeWebStore({ session: ses, extensionsPath: extensionsPathFor(partition), beforeInstall });
      const notify = () => { if (partition === currentPartition) broadcast('ext:changed'); };
      const api = extApi(ses);
      api.on?.('extension-loaded', notify);
      api.on?.('extension-unloaded', notify);
    })());
  }
  return prepared.get(partition);
}

const setupExtensions = () => prepareSession(DEFAULT_PARTITION);

/* ───────────── Navegador padrão (Windows) ─────────────
   O instalador registra o Kona como navegador (installer/uninstall.nsh). O Windows não deixa
   nenhum app se tornar padrão sozinho: o Kona abre Configurações já na página dele, e a pessoa
   confirma lá. "registered" é falso no Kona de desenvolvimento (sem instalador): sem aviso. */
const regValue = (key, name) => new Promise((resolve) => {
  execFile('reg.exe', ['query', key, '/v', name], { windowsHide: true }, (err, out) => {
    if (err) return resolve(null);
    const m = new RegExp(`${name}\\s+REG_\\w+\\s+(.*)`, 'i').exec(out);
    resolve(m ? m[1].trim() : null);
  });
});
handleUi('default:status', async () => {
  if (process.platform !== 'win32') return { registered: false, isDefault: false };
  const registered = !!(await regValue('HKLM\\Software\\RegisteredApplications', 'Kona')
    || await regValue('HKCU\\Software\\RegisteredApplications', 'Kona'));
  // O Windows 11 recente grava a escolha em UserChoiceLatest\ProgId e deixa o UserChoice antigo
  // desatualizado; versões anteriores usam só o UserChoice. Vale a primeira que existir.
  const base = 'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https';
  const progId = (await regValue(`${base}\\UserChoiceLatest\\ProgId`, 'ProgId'))
    || (await regValue(`${base}\\UserChoiceLatest`, 'ProgId'))
    || (await regValue(`${base}\\UserChoice`, 'ProgId'));
  // confirmação pela API do próprio Windows (AssocQueryString): o app que abre links https
  const handler = app.getApplicationNameForProtocol('https://');
  return { registered, isDefault: progId === 'KonaHTML' || /^kona$/i.test(handler), progId, handler };
});
handleUi('default:set', async () => {
  await shell.openExternal('ms-settings:defaultapps?registeredAppMachine=Kona').catch(() => shell.openExternal('ms-settings:defaultapps'));
  return true;
});

// Downloads: controles, abrir, ícones e arrastar (a lista fica na interface)
registerDownloads({ broadcast, currentSession: () => browserSession() });

// Gerenciador de senhas (salvar, preencher, gerar, importar/exportar), por perfil
registerPasswords({ win: focusedWin, broadcast, currentPartition: () => currentPartition });

// Modo leitura (como o do Safari)
registerReader();

// Compartilhar a tela: seletor do Kona e "Stop sharing"
registerShare({ winFor, broadcast });
ipcMain.on('share:ended-page', (e) => { if (e.sender.getType() === 'webview') shareEndedFrom(e.sender.id); });

// Controle de mídia global: o painel ♪ da interface (abas de todas as janelas)
registerMedia({ broadcast, winFor });

// Extensões completas: botões, popups, chrome.tabs e itens no menu do botão direito
extensionsApi.registerExtensions({ win: focusedWin, winFor });

// Sites com pop-ups sempre permitidos (escolha da pessoa no aviso de pop-up bloqueado)
const popupsAllowed = new Set();
onUi('popups:allowed', (_e, list) => {
  popupsAllowed.clear();
  if (Array.isArray(list)) for (const o of list.slice(0, 1000)) if (typeof o === 'string' && /^https?:\/\//.test(o)) popupsAllowed.add(o);
});

// Menu de contexto (botão direito): ações nas páginas e nos campos da interface
registerContextMenu({ win: focusedWin, askNextDownload: (url) => policy.askNext(url) });

// Importar de outro navegador: tudo entra no perfil em uso
registerImporter(handleUi, {
  currentSession: () => browserSession(),
  currentExtensionsPath: () => extensionsPathFor(currentPartition),
});

/* ───────────── Perfis ───────────── */
handleUi('profile:use', async (_e, partition) => {
  if (!isPartition(partition)) return false;
  await prepareSession(partition);
  currentPartition = partition;
  applySecureDns();
  broadcast('ext:changed');
  return true;
});

// Apagar um perfil apaga de verdade os dados dele: cookies, logins, cache, armazenamento e extensões
handleUi('profile:forget', async (_e, partition) => {
  if (!isPartition(partition) || partition === currentPartition) return false;
  const ses = browserSession(partition);
  const api = extApi(ses);
  for (const ext of api.getAllExtensions()) api.removeExtension(ext.id);
  await ses.clearStorageData();
  await ses.clearCache();
  fs.rmSync(extensionsPathFor(partition), { recursive: true, force: true });
  prepared.delete(partition);
  return true;
});

/* ───────────── Dados de navegação ───────────── */
handleUi('data:clear', async (_e, partition, { cookies = false, cache = false } = {}) => {
  if (!isPartition(partition)) return false;
  const ses = browserSession(partition);
  if (cookies) await ses.clearStorageData(); // cookies, localStorage, IndexedDB, service workers…
  if (cache) await ses.clearCache();
  return true;
});

/* ───────────── Modo privado ───────────── */
handleUi('private:open', () => {
  const partition = `kona-private-${require('crypto').randomBytes(6).toString('hex')}`;
  installSession(session.fromPartition(partition), partition); // sem extensões, como no modo anônimo do Chrome
  return partition;
});
handleUi('private:close', async (_e, partition) => {
  if (!isPrivatePartition(partition)) return false;
  const ses = session.fromPartition(partition);
  await ses.clearStorageData();
  await ses.clearCache();
  return true;
});

/* ───────────── Sugestões de pesquisa (Google) ───────────── */
// Feito aqui (e não na interface) por causa do CORS. Usa a sessão do perfil, como o Chrome.
// Endpoints de sugestão (formato OpenSearch: [consulta, [sugestões]]) de cada buscador
const SUGGEST = {
  google: (q, hl) => `https://suggestqueries.google.com/complete/search?client=firefox&ie=UTF-8&oe=UTF-8&hl=${hl}&q=${q}`,
  duckduckgo: (q) => `https://duckduckgo.com/ac/?type=list&q=${q}`,
  bing: (q) => `https://api.bing.com/osjson.aspx?query=${q}`,
  ecosia: (q) => `https://ac.ecosia.org/autocomplete?type=list&q=${q}`,
  brave: (q) => `https://search.brave.com/api/suggest?q=${q}`,
};
handleUi('suggest', async (_e, q, partition, engine = 'google') => {
  if (typeof q !== 'string' || !q.trim() || q.length > 200 || !SUGGEST[engine]) return [];
  const hl = encodeURIComponent(app.getLocale());
  const url = process.env.KONA_SUGGEST_URL
    ? `${process.env.KONA_SUGGEST_URL}?client=firefox&q=${encodeURIComponent(q)}`
    : SUGGEST[engine](encodeURIComponent(q), hl);
  try {
    // As sugestões saem por uma sessão própria, só na memória e sem cookies. Pedidas pela sessão do
    // perfil, a rajada de pedidos da digitação criava o primeiro cookie do Google de um perfil novo,
    // e a busca seguinte (com esse cookie) caía na verificação "não sou um robô". Também é mais
    // privado: as sugestões não ficam ligadas à conta do Google de quem está logado.
    const ses = session.fromPartition('kona-suggest');
    const res = await ses.fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(2500) });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.[1]) ? data[1].filter((x) => typeof x === 'string').slice(0, 8) : [];
  } catch {
    return [];
  }
});

onUi('ext:confirm-reply', (_e, { id, ok }) => {
  pendingConfirms.get(id)?.(!!ok);
  pendingConfirms.delete(id);
});
handleUi('ext:list', () => listExtensions());
handleUi('ext:remove', async (_e, id) => {
  await uninstallExtension(id, { session: browserSession(), extensionsPath: extensionsPathFor(currentPartition) });
  return listExtensions();
});

/* ───────────── Janela ───────────── */
onUi('win:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close());
onUi('win:minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
onUi('win:maximize', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w) return;
  w.isMaximized() ? w.unmaximize() : w.maximize();
});
onUi('theme:set', (e, value) => {
  if (!['light', 'dark', 'system'].includes(value)) return;
  nativeTheme.themeSource = value;
  BrowserWindow.fromWebContents(e.sender)?.setBackgroundColor(bgColor());
});
// Várias janelas: nova janela (Ctrl+N, "abrir link em nova janela") e mover abas entre janelas
handleUi('win:new', (e, url) => {
  const adopt = typeof url === 'string' && /^https?:\/\//i.test(url) ? { url, title: '' } : null;
  newWindowFrom(BrowserWindow.fromWebContents(e.sender), adopt);
  return true;
});
handleUi('win:count', () => windows.filter(alive).length);
// janelas no modo privado não recebem abas de outras janelas (nem aparecem em "Mover para…")
const privateWins = new WeakSet();
onUi('win:private', (e, on) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w) { if (on) privateWins.add(w); else privateWins.delete(w); }
});
handleUi('win:role', (e) => ({ primary: BrowserWindow.fromWebContents(e.sender) === primaryWin }));
/** As outras janelas (para "Mover para…"): título da aba ativa de cada uma. */
handleUi('win:others', async (e) => {
  const me = BrowserWindow.fromWebContents(e.sender);
  const out = [];
  for (const w of windows) {
    if (!alive(w) || w === me || privateWins.has(w)) continue;
    const title = await w.webContents.executeJavaScript('typeof active === "function" ? active()?.title || "" : ""').catch(() => '');
    out.push({ id: w.id, title: String(title).slice(0, 80) });
  }
  return out;
});
// Histórico das abas que estão mudando de janela, até a aba nova nascer (token → { index, entries })
const pendingRestores = new Map();
const attachQueues = new WeakMap();
const attachQueue = (contents) => { if (!attachQueues.has(contents)) attachQueues.set(contents, []); return attachQueues.get(contents); };
/**
 * Move uma aba para outra janela. O <webview> não muda de janela: a aba renasce lá, com o histórico
 * de voltar/avançar. to: { window: id } | { point: {x, y} } (onde a aba foi solta) | { newWindow: true }.
 * Devolve true se a aba foi aceita (a janela de origem então fecha a dela).
 */
handleUi('tab:move', (e, { wcId, url, title, to } = {}) => {
  const src = BrowserWindow.fromWebContents(e.sender);
  if (!src || typeof url !== 'string' || !(TAB_SCHEMES.has(schemeOf(url)) || /^kona:\/\/\w+$/.test(url))) return false;
  const adopt = { url, title: typeof title === 'string' ? title.slice(0, 300) : '' };
  const wc = Number.isInteger(wcId) && webContents.fromId(wcId);
  if (wc && !wc.isDestroyed() && wc.hostWebContents === e.sender) {
    const entries = wc.navigationHistory.getAllEntries();
    if (entries.length) {
      const token = require('crypto').randomBytes(8).toString('hex');
      pendingRestores.set(token, { index: wc.navigationHistory.getActiveIndex(), entries });
      setTimeout(() => pendingRestores.delete(token), 30000);
      adopt.restore = token;
    }
  }
  let target = null;
  const pt = to?.point;
  if (Number.isInteger(to?.window)) target = windows.find((w) => alive(w) && w.id === to.window && w !== src && !privateWins.has(w));
  else if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
    // solta sobre a barra de abas de outra janela → vai para ela; em qualquer outro lugar → janela nova
    target = windows.find((w) => {
      if (!alive(w) || w === src || w.isMinimized() || privateWins.has(w)) return false;
      const b = w.getBounds();
      return pt.x >= b.x && pt.x < b.x + b.width && pt.y >= b.y && pt.y < b.y + 64;
    });
    if (target) adopt.screenX = pt.x;
  }
  if (target) {
    target.webContents.send('tab:adopt', adopt);
    target.focus();
  } else if (pt) {
    if (to.allowNew === false) return false; // a única aba da janela, solta fora: nada a fazer
    const b = src.getNormalBounds();
    const width = Math.min(b.width, 1360), height = Math.min(b.height, 860);
    // a janela nova aparece com a aba sob o mouse
    createWindow({ adopt, bounds: { x: Math.round(pt.x - 140), y: Math.round(pt.y - 22), width, height } });
  } else if (to?.newWindow) newWindowFrom(src, adopt);
  else return false;
  return true;
});
// Abas fixadas: um link para outro site abre numa aba nova (a fixada continua no site dela)
const pinnedTabs = new Set(); // webContents.id
onUi('tab:pinned', (e, wcId, on) => {
  const wc = webContents.fromId(Number(wcId));
  if (!wc || wc.hostWebContents !== e.sender) return;
  if (on) pinnedTabs.add(wc.id); else pinnedTabs.delete(wc.id);
});
/** "Site" de um endereço: o domínio registrável (aproximado: exemplo.com, exemplo.com.br, exemplo.co.uk). */
function siteOf(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return null;
    const p = u.hostname.split('.');
    if (p.length <= 2 || /^\d+$/.test(p.at(-1)) || u.hostname.includes(':')) return u.hostname;
    const second = ['co', 'com', 'net', 'org', 'gov', 'edu', 'ac', 'gob', 'or', 'ne'].includes(p.at(-2)) && p.at(-1).length === 2;
    return p.slice(second ? -3 : -2).join('.');
  } catch { return null; }
}

// F11: tela cheia da janela (a barra do Kona aparece ao levar o mouse ao topo)
onUi('win:fullscreen', (e) => { const w = BrowserWindow.fromWebContents(e.sender); w?.setFullScreen(!w.isFullScreen()); });
onUi('win:devtools', (e) => e.sender.openDevTools({ mode: 'detach' }));

// Conteúdo das abas (webviews): popups viram novas abas e atalhos sobem para a interface
// Endereços que uma aba pode carregar ao ser criada (os digitados podem ser file: e data:)
const TAB_SCHEMES = new Set(['http:', 'https:', 'about:', 'file:', 'data:', 'chrome-extension:', 'view-source:']);
const schemeOf = (u) => { try { return new URL(u).protocol; } catch { return ''; } };

app.on('web-contents-created', (_e, contents) => {
  // Webviews só podem nascer da interface e sempre isoladas: sem Node, sem preload próprio, na sandbox
  if (contents.getType() === 'window') {
    contents.on('will-attach-webview', (e, prefs, params) => {
      delete prefs.preload;
      prefs.nodeIntegration = false;
      prefs.nodeIntegrationInSubFrames = false;
      prefs.contextIsolation = true;
      prefs.sandbox = true;
      prefs.webSecurity = true;
      prefs.allowRunningInsecureContent = false;
      prefs.plugins = true; // só o leitor de PDF embutido (o Electron não carrega plugins de terceiros)
      if (!isUiContents(contents) || !TAB_SCHEMES.has(schemeOf(params.src))) { e.preventDefault(); return; }
      // aba vinda de outra janela: nasce sem endereço e recebe o histórico inteiro (ver tab:move)
      const token = /^about:blank#kona-restore-(\w+)$/.exec(params.src)?.[1];
      const history = token && pendingRestores.get(token);
      if (history) {
        pendingRestores.delete(token);
        params.src = '';
        attachQueue(contents).push(history);
      }
    });
    // a aba vinda de outra janela: o histórico volta antes da primeira navegação
    contents.on('did-attach-webview', (_e, guest) => {
      const history = attachQueue(contents).shift();
      if (!history) return;
      guest.navigationHistory.restore(history).catch(() => {
        const entry = history.entries[history.index];
        if (entry && !guest.isDestroyed()) guest.loadURL(entry.url).catch(() => {});
      });
    });
  }
  if (contents.getType() !== 'webview') return;
  watchPage(contents); // botão direito → menu do Kona
  contents.on('will-navigate', (e) => {
    if (!pinnedTabs.has(contents.id) || !e.isMainFrame || e.isSameDocument) return;
    const from = siteOf(contents.getURL()), to = siteOf(e.url);
    if (!from || !to || from === to) return;
    e.preventDefault();
    contents.hostWebContents?.send('tab:open', e.url);
  });
  contents.once('destroyed', () => pinnedTabs.delete(contents.id));
  watchReader(contents); // modo leitura: a página é um artigo?
  watchMedia(contents); // controle de mídia: o que toca nesta aba
  // som: a aba mostra 🔊 enquanto toca (e permite silenciar)
  contents.on('audio-state-changed', (e) => contents.hostWebContents?.send('tab:audio', { id: contents.id, audible: !!e.audible }));
  extensionsApi.trackTab(contents); // a aba existe para as extensões (chrome.tabs)
  // Ctrl + roda do mouse: zoom do site (o Kona guarda por site, como o Chrome)
  contents.on('zoom-changed', (_e, dir) => contents.hostWebContents?.send('shortcut', { key: dir === 'in' ? 'zoomin' : 'zoomout' }));
  // Não revela os IPs da rede local por WebRTC (videochamadas continuam funcionando)
  contents.setWebRTCIPHandlingPolicy('default_public_interface_only');
  // Bloqueio de pop-ups, como o Chrome: só abre (como aba) o que vem logo depois de um clique ou tecla
  // da pessoa naquela aba; o resto é bloqueado e a interface mostra o aviso na barra de endereço.
  let lastInput = 0;
  contents.setWindowOpenHandler(({ url, disposition, features }) => {
    // uma página não pode abrir arquivos locais nem esquemas estranhos
    if (!(['http:', 'https:'].includes(schemeOf(url)) || url === 'about:blank')) return { action: 'deny' };
    const origin = (() => { try { return new URL(contents.getURL()).origin; } catch { return ''; } })();
    if (!(Date.now() - lastInput <= 5000 || popupsAllowed.has(origin))) {
      contents.hostWebContents?.send('popup:blocked', { id: contents.id, url, origin });
      return { action: 'deny' };
    }
    // Pop-up de verdade (janela com tamanho, ou em branco para a página preencher — os controles de
    // apresentação do Meet, o "Entrar com Google/Microsoft" de outros sites): janela pop-up ligada à
    // página que a abriu, como no Chrome. Virar aba quebraria esse vínculo (abria uma aba em branco).
    if (disposition === 'new-window' || url === 'about:blank' || /\b(width|height|popup)\b/i.test(features || '')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true, icon: APP_ICON, backgroundColor: '#ffffff', show: true,
          webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true },
        },
      };
    }
    contents.hostWebContents?.send('tab:open', url); // "abrir em nova aba" (target=_blank): aba do Kona
    return { action: 'deny' };
  });
  // a janela pop-up: sem menu; o que ela abrir vira aba do Kona; fecha junto se a aba que a abriu fechar
  contents.on('did-create-window', (popup) => {
    popup.setMenu(null);
    popup.webContents.setWindowOpenHandler(({ url }) => {
      if (['http:', 'https:'].includes(schemeOf(url))) winFor(contents)?.webContents.send('tab:open', url);
      return { action: 'deny' };
    });
    const closeWithOpener = () => { if (!popup.isDestroyed()) popup.close(); };
    contents.once('destroyed', closeWithOpener);
    popup.once('closed', () => contents.removeListener('destroyed', closeWithOpener));
  });
  // Cliques dentro das páginas não chegam ao DOM da interface: avisa para fechar menus abertos
  contents.on('before-mouse-event', (_event, mouse) => {
    if (mouse.type === 'mouseDown') { lastInput = Date.now(); contents.hostWebContents?.send('page:mousedown'); }
  });
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    lastInput = Date.now();
    // Alt+← / Alt+→: voltar e avançar (como no Chrome)
    if (input.alt && !input.control && !input.meta && (input.key === 'ArrowLeft' || input.key === 'ArrowRight')) {
      event.preventDefault();
      contents.hostWebContents?.send('shortcut', { key: input.key === 'ArrowLeft' ? 'back' : 'forward' });
      return;
    }
    // F11: tela cheia da janela
    if (input.key === 'F11' && !input.control && !input.alt) {
      event.preventDefault();
      contents.hostWebContents?.send('shortcut', { key: 'f11' });
      return;
    }
    // F3 / Shift+F3: próxima/anterior ocorrência da busca na página
    if (input.key === 'F3' && !input.control && !input.alt) {
      event.preventDefault();
      contents.hostWebContents?.send('shortcut', { key: 'f3', shift: input.shift });
      return;
    }
    // Ctrl+Shift+I: ferramentas de desenvolvedor da página
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      event.preventDefault();
      contents.openDevTools();
      return;
    }
    // Alt+Z (barra lateral) e Alt+V (visão geral) também funcionam com o foco dentro de uma página
    if (input.alt && !input.control && !input.meta && (input.code === 'KeyZ' || input.code === 'KeyV')) {
      event.preventDefault();
      contents.hostWebContents?.send('shortcut', { key: input.code === 'KeyZ' ? 'z' : 'v', alt: true });
      return;
    }
    if (!(input.control || input.meta)) return;
    const key = input.key.toLowerCase();
    if (['t', 'w', 'l', 'r', 'd', 'h', 'j', 'n', 's', 'p', 'u', 'f', 'g', '=', '+', '-', '_', '0', 'tab', ',', '\\', '|',
      '1', '2', '3', '4', '5', '6', '7', '8', '9', 'pageup', 'pagedown'].includes(key)) {
      event.preventDefault();
      contents.hostWebContents?.send('shortcut', { key, shift: input.shift });
    }
  });
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  // ícones das extensões na barra (crx://extension-icon/...) servidos para a interface
  extensionsApi.ElectronChromeExtensions.handleCRXProtocol(session.defaultSession);
  // Widevine (Electron da castLabs): vídeo protegido de Netflix, Spotify, Prime Video, Disney+.
  // Não segura a abertura: na 1ª vez o componente é baixado do Google em segundo plano.
  components?.whenReady?.().catch((err) => console.error('Widevine unavailable:', err?.message || err));
  try {
    await setupExtensions();
  } catch (err) {
    console.error('Failed to set up extensions:', err);
  }
  applySecureDns();
  createWindow();
  startUpdater(focusedWin);
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
