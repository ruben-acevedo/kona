// Downloads: acompanha cada download (progresso, pausar, continuar, cancelar) e atende a lista do
// menu lateral (abrir o arquivo, mostrar na pasta, ícone do tipo de arquivo, arrastar para fora).
// A lista em si fica na interface, por perfil. Por segurança, abrir/mostrar/arrastar só vale para
// arquivos que o próprio Kona baixou (lembrados em downloads-known.json, na pasta de dados).
const { app, shell, nativeImage } = require('electron');
const { onUi, handleUi } = require('./ipc');
const path = require('path');
const fs = require('fs');

const live = new Map(); // id → DownloadItem em andamento
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

/** Chamado pela política da sessão (session-policy.js) a cada download que começa. */
function track(item, { priv = false } = {}) {
  const id = ++seq;
  live.set(id, item);
  const send = (channel, data) => broadcast(channel, data);
  send('download:start', { ...info(id, item), priv });
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

module.exports = { track, registerDownloads };
