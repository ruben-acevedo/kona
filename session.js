// Recuperar a sessão depois de um travamento (N6).
//
// Cada janela avisa as abas dela o tempo todo; elas ficam guardadas em session-recovery.json. Um
// marcador (session.lock) existe enquanto o Kona está aberto e some ao fechar direito: se ele ainda
// estiver lá na abertura, o Kona fechou de forma errada (travamento, queda de energia, Windows
// desligando) e a interface oferece "Restaurar abas" (ou restaura direto, com "Restore tabs" ligado).
// Também: aba cuja página travou ou parou de responder, e a interface de uma janela que travou
// (recarrega sozinha, com as abas).
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { onUi, handleUi } = require('./ipc');

const lockFile = () => path.join(app.getPath('userData'), 'session.lock');
const dataFile = () => path.join(app.getPath('userData'), 'session-recovery.json');

let crashed = false; // a última vez não fechou direito
let recovered = null; // { windows: [...] } da última vez (só se travou)
const live = new Map(); // id da janela → { primary, set, tabs: [{ url, title }], active }
let order = []; // ids na ordem de abertura

/** Na abertura (antes da 1ª janela): lê o marcador e o que havia aberto. */
function startSession() {
  try {
    crashed = fs.existsSync(lockFile());
    if (crashed) {
      const d = JSON.parse(fs.readFileSync(dataFile(), 'utf8'));
      if (Array.isArray(d?.windows) && d.windows.some((w) => w.tabs?.length)) recovered = d;
    }
  } catch { recovered = null; }
  try { fs.writeFileSync(lockFile(), String(process.pid)); } catch { /* sem disco: segue */ }
}

/** Fechou direito: sem marcador, a próxima abertura é normal. */
function endSession() {
  try { fs.rmSync(lockFile(), { force: true }); } catch { /* já não existe */ }
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    // a janela principal primeiro (é ela que a abertura seguinte usa)
    const all = order.map((id) => live.get(id)).filter(Boolean);
    const windows = [...all.filter((w) => w.primary), ...all.filter((w) => !w.primary)].filter((w) => w.tabs.length || w.primary);
    const tmp = `${dataFile()}.tmp`;
    try {
      fs.writeFileSync(tmp, JSON.stringify({ t: Date.now(), windows }));
      fs.renameSync(tmp, dataFile());
    } catch { /* tenta de novo na próxima mudança */ }
  }, 800);
}

const cleanTabs = (list) => (Array.isArray(list) ? list : [])
  .filter((x) => x && typeof x.url === 'string' && /^(https?|file|kona):/i.test(x.url) && x.url.length < 4000)
  .slice(0, 300)
  .map((x) => ({ url: x.url, title: typeof x.title === 'string' ? x.title.slice(0, 300) : '' }));

/**
 * opts: { windowOf(webContents) → BrowserWindow, isPrimary(win), partitionOf(win), createWindow({ restoreTabs, partition }) }.
 */
function registerSession(opts) {
  // as abas de cada janela (a interface manda a cada mudança; janela privada manda lista vazia)
  onUi('session:update', (e, snap) => {
    const w = opts.windowOf(e.sender);
    if (!w) return;
    if (!order.includes(w.id)) order.push(w.id);
    const tabs = cleanTabs(snap?.tabs);
    live.set(w.id, {
      primary: opts.isPrimary(w),
      partition: opts.partitionOf?.(w) || null, // o perfil da janela (O7)
      set: typeof snap?.set === 'string' ? snap.set.slice(0, 40) : 'default',
      tabs,
      active: Math.max(0, Math.min(Number(snap?.active) || 0, tabs.length - 1)),
    });
    save();
  });
  // o que a 1ª janela precisa saber na abertura
  // (a principal do perfil de quem pergunta vem primeiro: é ela que essa janela usa)
  const mineFirst = (e) => {
    const w = opts.windowOf(e.sender);
    const p = w && opts.partitionOf?.(w);
    const list = recovered.windows;
    const i = list.findIndex((x) => x.primary && (!x.partition || x.partition === p));
    return i > 0 ? [list[i], ...list.filter((_, j) => j !== i)] : list;
  };
  handleUi('session:recovery', (e) => (crashed && recovered ? { crashed: true, windows: mineFirst(e) } : { crashed }));
  // "Restaurar abas": as outras janelas da última vez reabrem, cada uma no seu perfil; a principal
  // fica com a 1ª da lista. A principal de outro perfil reabre as abas guardadas dele sozinha.
  handleUi('session:restore', (e) => {
    if (!recovered) return false;
    const w = opts.windowOf(e.sender);
    const p = w && opts.partitionOf?.(w);
    const [first, ...others] = mineFirst(e);
    const rest = first.primary && (!first.partition || first.partition === p) ? others : [first, ...others];
    for (const snap of rest) opts.createWindow(snap.primary && snap.partition && snap.partition !== p ? { partition: snap.partition } : { restoreTabs: snap, partition: snap.partition || undefined });
    recovered = null;
    return true;
  });
  handleUi('session:dismiss', () => { recovered = null; return true; });
}

/** A janela fechou normalmente: sai da lista (só as janelas abertas no travamento voltam). */
function windowClosed(id, { quitting = false } = {}) {
  if (quitting) return; // fechando o app: a última foto fica (para "Restore tabs" já cuida a sessão)
  live.delete(id);
  order = order.filter((x) => x !== id);
  save();
}
/** As abas que a janela tinha (para recarregar a interface que travou). */
const snapshotOf = (id) => live.get(id) || null;

module.exports = { startSession, endSession, registerSession, windowClosed, snapshotOf };
