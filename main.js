const { app, BrowserWindow, nativeTheme, nativeImage, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { installChromeWebStore, uninstallExtension } = require('electron-chrome-web-store');
const { createPolicy } = require('./session-policy');
const { onUi, handleUi } = require('./ipc');
const { startUpdater } = require('./updater');

// Todos os processos de página e da interface rodam na sandbox do Chromium, como no Chrome
app.enableSandbox();

// Ícone do app (gerado de assets/icon.svg por scripts/icons.js). A identidade própria no Windows
// faz a barra de tarefas agrupar e mostrar o Kona como um app, e não como "Electron".
const APP_ICON = path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon-512.png');
if (process.platform === 'win32') app.setAppUserModelId('com.ruben-acevedo.kona');

// Pasta de dados alternativa (útil para testes sem mexer no perfil real)
if (process.env.KONA_USER_DATA) app.setPath('userData', process.env.KONA_USER_DATA);

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
let mainWin = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
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
  mainWin = win;
  // A interface nunca sai do index.html nem abre janelas próprias
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.on('closed', () => { if (mainWin === win) mainWin = null; });

  const query = { state: process.env.KONA_STATE || '' };
  if (process.env.KONA_THEME) query.theme = process.env.KONA_THEME;
  if (process.env.KONA_WALLPAPER) query.wallpaper = process.env.KONA_WALLPAPER;
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'), { query });
  win.once('ready-to-show', () => {
    win.maximize(); // sempre abre maximizado (restaurar volta a 1360×860)
    win.show();
    win.webContents.send('win:shown');
  });

  const sendState = () =>
    win.webContents.send('win:state', { maximized: win.isMaximized(), focused: win.isFocused() });
  ['maximize', 'unmaximize', 'focus', 'blur'].forEach((ev) => win.on(ev, sendState));
  win.webContents.on('did-finish-load', sendState);
  win.webContents.once('did-finish-load', () => captureUaHints(win.webContents));

  // KONA_SCREENSHOT=arquivo.png salva uma captura da janela e encerra (útil para revisar o design)
  const shot = process.env.KONA_SCREENSHOT;
  if (shot) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const img = await win.webContents.capturePage();
        fs.writeFileSync(shot, img.toPNG());
        app.quit();
      }, Number(process.env.KONA_SHOT_DELAY || 2500));
    });
  }
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
  win: () => mainWin,
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
  })).sort((a, b) => a.name.localeCompare(b.name));
}

const extensionsPathFor = (partition) => (partition === DEFAULT_PARTITION
  ? path.join(app.getPath('userData'), 'Extensions')
  : path.join(app.getPath('userData'), 'Extensions-perfis', partition.replace(/[^a-z0-9-]/gi, '_')));

// Antes de instalar uma extensão, pede confirmação numa folha da própria interface
async function beforeInstall(details) {
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
      await installChromeWebStore({ session: ses, extensionsPath: extensionsPathFor(partition), beforeInstall });
      const notify = () => { if (partition === currentPartition) mainWin?.webContents.send('ext:changed'); };
      const api = extApi(ses);
      api.on?.('extension-loaded', notify);
      api.on?.('extension-unloaded', notify);
    })());
  }
  return prepared.get(partition);
}

const setupExtensions = () => prepareSession(DEFAULT_PARTITION);

/* ───────────── Perfis ───────────── */
handleUi('profile:use', async (_e, partition) => {
  if (!isPartition(partition)) return false;
  await prepareSession(partition);
  currentPartition = partition;
  applySecureDns();
  mainWin?.webContents.send('ext:changed');
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
    // no modo privado, a sugestão sai pela sessão privada (sem os cookies do perfil)
    const ses = isPrivatePartition(partition) ? session.fromPartition(partition) : browserSession();
    const res = await ses.fetch(url, { signal: AbortSignal.timeout(2500) });
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
onUi('win:devtools', (e) => e.sender.openDevTools({ mode: 'detach' }));

// Conteúdo das abas (webviews): popups viram novas abas e atalhos sobem para a interface
// Endereços que uma aba pode carregar ao ser criada (os digitados podem ser file: e data:)
const TAB_SCHEMES = new Set(['http:', 'https:', 'about:', 'file:', 'data:', 'chrome-extension:']);
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
      if (contents !== mainWin?.webContents || !TAB_SCHEMES.has(schemeOf(params.src))) e.preventDefault();
    });
  }
  if (contents.getType() !== 'webview') return;
  // Não revela os IPs da rede local por WebRTC (videochamadas continuam funcionando)
  contents.setWebRTCIPHandlingPolicy('default_public_interface_only');
  contents.setWindowOpenHandler(({ url }) => {
    // Popups viram abas, mas uma página não pode abrir arquivos locais nem esquemas estranhos
    if (['http:', 'https:'].includes(schemeOf(url)) || url === 'about:blank') contents.hostWebContents?.send('tab:open', url);
    return { action: 'deny' };
  });
  // Cliques dentro das páginas não chegam ao DOM da interface: avisa para fechar menus abertos
  contents.on('before-mouse-event', (_event, mouse) => {
    if (mouse.type === 'mouseDown') contents.hostWebContents?.send('page:mousedown');
  });
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    // Alt+Z (barra lateral) e Alt+V (visão geral) também funcionam com o foco dentro de uma página
    if (input.alt && !input.control && !input.meta && (input.code === 'KeyZ' || input.code === 'KeyV')) {
      event.preventDefault();
      contents.hostWebContents?.send('shortcut', { key: input.code === 'KeyZ' ? 'z' : 'v', alt: true });
      return;
    }
    if (!(input.control || input.meta)) return;
    const key = input.key.toLowerCase();
    if (['t', 'w', 'l', 'r', 'd', 'h', 'n', 'tab', ',', '\\', '|'].includes(key)) {
      event.preventDefault();
      contents.hostWebContents?.send('shortcut', { key, shift: input.shift });
    }
  });
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  try {
    await setupExtensions();
  } catch (err) {
    console.error('Failed to set up extensions:', err);
  }
  applySecureDns();
  createWindow();
  startUpdater(() => mainWin);
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
