// Downloads: acompanha cada download (progresso, pausar, continuar, cancelar) e atende a lista do
// menu lateral (abrir o arquivo, mostrar na pasta, ícone do tipo de arquivo, arrastar para fora).
// A lista em si fica na interface, por perfil. Por segurança, abrir/mostrar/arrastar só vale para
// arquivos que o próprio Kona baixou (lembrados em downloads-known.json, na pasta de dados).
const { app, shell, nativeImage, dialog, BrowserWindow } = require('electron');
const { onUi, handleUi } = require('./ipc');
const path = require('path');
const fs = require('fs');

const live = new Map(); // id → DownloadItem em andamento
const held = new Map(); // id → download arriscado esperando "Manter" ou "Descartar" (N14)
let seq = 0;
let broadcast = () => {};
let currentSession = () => null;

/* ───────────── Arquivos baixados pelo Kona ───────────── */
let known = null;
const knownFile = () => path.join(app.getPath('userData'), 'downloads-known.json');
function knownSet() {
  if (!known) {
    try { known = new Set(JSON.parse(fs.readFileSync(knownFile(), 'utf8'))); } catch { known = new Set(); }
  }
  return known;
}
function remember(file) {
  const list = [...knownSet()].filter((f) => f !== file).concat(file).slice(-500);
  known = new Set(list);
  fs.writeFile(knownFile(), JSON.stringify(list), () => {});
}
const isKnown = (file) => typeof file === 'string' && knownSet().has(file) && fs.existsSync(file);

/* ───────────── Acompanhar um download ───────────── */
function info(id, item) {
  const file = item.getSavePath();
  return {
    id,
    name: path.basename(file || item.getFilename()),
    url: item.getURL(),
    path: file || null,
    received: item.getReceivedBytes(),
    total: item.getTotalBytes(),
    paused: item.isPaused(),
    canResume: item.canResume(),
    state: item.getState(),
    start: Math.round(item.getStartTime() * 1000) || Date.now(),
  };
}

/* ───────────── Downloads arriscados (N14) ─────────────
   Tipos que podem rodar programas (a mesma família que o Chrome trata como perigosa) e qualquer
   arquivo que veio sem criptografia (http, fora da própria máquina). Sem o serviço de reputação do
   Google, o Kona avisa sempre: o arquivo fica numa pasta à parte até a pessoa escolher. O antivírus
   do Windows já examina todo download ao ser salvo (o Chromium pede); se ele barra, o aviso é outro. */
const RISKY = new Set(['exe', 'msi', 'msix', 'msixbundle', 'appx', 'appxbundle', 'msp', 'mst', 'bat', 'cmd', 'com', 'scr', 'pif',
  'ps1', 'psm1', 'psd1', 'vbs', 'vbe', 'vb', 'js', 'jse', 'wsf', 'wsh', 'wsc', 'ws', 'hta', 'jar', 'reg', 'lnk', 'url', 'scf',
  'cpl', 'msc', 'dll', 'sys', 'inf', 'application', 'appref-ms', 'gadget', 'iso', 'img', 'vhd', 'vhdx', 'xll', 'settingcontent-ms']);
const isLocal = (host) => /^(localhost|127(\.\d+){3}|\[::1\])$/i.test(host);
/** 'file' (tipo que pode rodar programas), 'insecure' (veio sem criptografia) ou null. */
function riskOf(name, urlChain = []) {
  const insecure = urlChain.some((u) => { try { const x = new URL(u); return x.protocol === 'http:' && !isLocal(x.hostname); } catch { return false; } });
  if (insecure) return 'insecure';
  const ext = path.extname(String(name || '')).slice(1).toLowerCase();
  return RISKY.has(ext) ? 'file' : null;
}
const holdingDir = () => path.join(app.getPath('userData'), 'Downloads-holding');
/** Onde o arquivo arriscado espera a decisão (uma pasta por download: o nome do arquivo não muda). */
function holdingPath(name) {
  const dir = path.join(holdingDir(), require('crypto').randomBytes(6).toString('hex'));
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, path.basename(String(name || 'download')));
}
function uniquePath(dir, name) {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  let file = path.join(dir, name);
  for (let i = 1; fs.existsSync(file); i++) file = path.join(dir, `${base} (${i})${ext}`);
  return file;
}
/** "Veio da internet" (Mark of the Web): o Windows avisa e o SmartScreen confere ao abrir. */
function markOfTheWeb(file, url) {
  if (process.platform !== 'win32') return;
  try {
    if (fs.existsSync(`${file}:Zone.Identifier`)) return;
    fs.writeFileSync(`${file}:Zone.Identifier`, `[ZoneTransfer]\r\nZoneId=3\r\nHostUrl=${String(url || '').replace(/[\r\n]/g, '')}\r\n`);
  } catch { /* disco sem fluxos alternativos (FAT/exFAT): segue sem a marca */ }
}

/** Chamado pela política da sessão (session-policy.js) a cada download que começa. */
function track(item, { priv = false, danger = null, finalDir = null, ask = false } = {}) {
  const id = ++seq;
  live.set(id, item);
  const send = (channel, data) => broadcast(channel, data);
  if (danger) held.set(id, { file: null, finalDir: finalDir || app.getPath('downloads'), ask, url: item.getURL(), danger });
  send('download:start', { ...info(id, item), priv, danger });
  let last = 0;
  item.on('updated', () => {
    const now = Date.now();
    if (now - last < 200 && !item.isPaused()) return; // no máximo 5 avisos por segundo
    last = now;
    send('download:progress', info(id, item));
  });
  item.once('done', (_e, state) => {
    live.delete(id);
    const file = item.getSavePath();
    const h = held.get(id);
    // baixou inteiro, mas o arquivo não está lá: o antivírus do Windows barrou
    if (state === 'interrupted' && item.getTotalBytes() > 0 && item.getReceivedBytes() === item.getTotalBytes() && file && !fs.existsSync(file)) state = 'blocked';
    if (state === 'completed' && h && file) {
      h.file = file;
      h.info = { ...info(id, item), danger: h.danger };
      send('download:done', { ...h.info, state: 'dangerous' });
      return;
    }
    held.delete(id);
    if (state === 'completed' && file) remember(file);
    send('download:done', { ...info(id, item), state });
  });
}

/* ───────────── Ícones (do Windows, por tipo de arquivo) ───────────── */
const iconCache = new Map();
const OWN_ICON = /\.(exe|ico|lnk|url|msi|appx|msix)$/i; // estes têm ícone próprio por arquivo
async function iconFor(file) {
  const key = OWN_ICON.test(file) ? file : path.extname(file).toLowerCase() || file;
  if (!iconCache.has(key)) {
    try { iconCache.set(key, await app.getFileIcon(file, { size: 'normal' })); } catch { iconCache.set(key, null); }
  }
  return iconCache.get(key);
}
let fallbackIcon = null;
const appIcon = () => (fallbackIcon ||= nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon-256.png')).resize({ width: 32 }));

function registerDownloads(opts) {
  broadcast = opts.broadcast;
  // arquivos arriscados que ficaram sem decisão quando o Kona fechou: descartados
  fs.rm(holdingDir(), { recursive: true, force: true }, () => {});
  // "Manter": o arquivo vai para a pasta de downloads (ou onde a pessoa escolher), com a marca de internet
  handleUi('download:keep', async (e, id) => {
    const h = held.get(Number(id));
    if (!h?.file || !fs.existsSync(h.file)) return null;
    let dest = uniquePath(h.finalDir, path.basename(h.file));
    if (h.ask) {
      const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), { defaultPath: dest });
      if (r.canceled || !r.filePath) return null;
      dest = r.filePath;
    }
    try { fs.renameSync(h.file, dest); } catch {
      fs.copyFileSync(h.file, dest); // outro disco: copia (a marca é refeita abaixo)
      fs.rmSync(h.file, { force: true });
    }
    fs.rm(path.dirname(h.file), { recursive: true, force: true }, () => {});
    markOfTheWeb(dest, h.url);
    remember(dest);
    held.delete(Number(id));
    broadcast('download:done', { ...h.info, name: path.basename(dest), path: dest, state: 'completed', kept: true });
    return dest;
  });
  // "Descartar": apaga o arquivo
  handleUi('download:discard', (_e, id) => {
    const h = held.get(Number(id));
    if (!h) return false;
    if (h.file) fs.rm(path.dirname(h.file), { recursive: true, force: true }, () => {});
    held.delete(Number(id));
    broadcast('download:done', { ...(h.info || { id: Number(id) }), path: null, state: 'cancelled', discarded: true });
    return true;
  });
  currentSession = opts.currentSession;
  const byId = (id) => live.get(Number(id));
  handleUi('download:pause', (_e, id) => { byId(id)?.pause(); return true; });
  handleUi('download:resume', (_e, id) => { const it = byId(id); if (it?.canResume()) it.resume(); return true; });
  handleUi('download:cancel', (_e, id) => { byId(id)?.cancel(); return true; });
  handleUi('download:retry', (_e, url) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return false;
    currentSession()?.downloadURL(url);
    return true;
  });
  handleUi('download:open', async (_e, file) => (isKnown(file) ? (await shell.openPath(file)) === '' : false));
  handleUi('download:show', (_e, file) => { if (isKnown(file)) shell.showItemInFolder(file); });
  handleUi('download:exists', (_e, files) => (Array.isArray(files) ? files.slice(0, 200).map(isKnown) : []));
  handleUi('download:icon', async (_e, file) => {
    if (!isKnown(file)) return null;
    const img = await iconFor(file);
    return img && !img.isEmpty() ? img.toDataURL() : null;
  });
  // Arrastar da lista para a área de trabalho, o Explorador ou outro programa
  onUi('download:drag', async (e, file) => {
    if (!isKnown(file)) return;
    const img = await iconFor(file);
    e.sender.startDrag({ file, icon: img && !img.isEmpty() ? img : appIcon() });
  });
}

module.exports = { track, registerDownloads, riskOf, holdingPath };
