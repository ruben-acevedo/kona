// Controle de mídia global (N16): acompanha as abas que tocam vídeo ou áudio (de todas as janelas) e
// atende o painel ♪ da interface: tocar/pausar, faixa anterior/seguinte e ir para a aba. Os botões da
// própria página (navigator.mediaSession) chegam por page-media.js; sem eles, tocar/pausar age nos
// vídeos e áudios da página.
const { ipcMain, webContents } = require('electron');
const { onUi, handleUi } = require('./ipc');

const sessions = new Map(); // webContents.id → { wcId, url, title, artist, artwork, playing, actions, priv }
let broadcast = () => {};
let winFor = () => null;

let pushTimer = null;
function push() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => broadcast('media:list', [...sessions.values()]), 60);
}
const str = (v, n = 300) => (typeof v === 'string' ? v.slice(0, n) : '');

/** Uma aba (webview) passa a ser acompanhada. */
function watchMedia(contents) {
  const query = () => { if (!contents.isDestroyed()) contents.send('media:query'); };
  const touch = (playing) => {
    const s = sessions.get(contents.id) || {
      wcId: contents.id, title: '', artist: '', artwork: '', actions: [],
      priv: !contents.session.isPersistent(), // modo privado: só a própria janela mostra
    };
    s.url = contents.getURL();
    s.pageTitle = contents.getTitle();
    s.playing = playing;
    sessions.set(contents.id, s);
    push();
    query();
  };
  contents.on('media-started-playing', () => touch(true));
  contents.on('media-paused', () => { if (sessions.has(contents.id)) touch(false); });
  contents.on('page-title-updated', () => { const s = sessions.get(contents.id); if (s) { s.pageTitle = contents.getTitle(); query(); push(); } });
  // outra página: o que tocava acabou
  contents.on('did-start-navigation', (e) => {
    if (e.isMainFrame && !e.isSameDocument && sessions.delete(contents.id)) push();
  });
  contents.once('destroyed', () => { if (sessions.delete(contents.id)) push(); });
}

function registerMedia(opts) {
  broadcast = opts.broadcast;
  winFor = opts.winFor;
  // o que a página informou (título, artista, capa, botões que ela tem)
  ipcMain.on('media:state', (e, d) => {
    const s = sessions.get(e.sender.id);
    if (!s || !d || typeof d !== 'object') return;
    s.title = str(d.title);
    s.artist = str(d.artist);
    s.artwork = /^https?:\/\//i.test(d.artwork || '') ? str(d.artwork, 2000) : '';
    s.actions = Array.isArray(d.actions) ? d.actions.filter((a) => typeof a === 'string').slice(0, 20) : [];
    // tocando/pausado vem dos avisos do Chromium (valem também para áudio fora da página)
    push();
  });
  handleUi('media:list', () => [...sessions.values()]);
  onUi('media:control', (_e, wcId, action) => {
    const s = sessions.get(Number(wcId));
    const wc = s && webContents.fromId(s.wcId);
    if (!wc || wc.isDestroyed()) return;
    if (action === 'focus') {
      const w = winFor(wc);
      if (!w) return;
      if (w.isMinimized()) w.restore();
      w.show();
      w.focus();
      w.webContents.send('ext:tab-select', wc.id); // a interface ativa a aba desse webContents
      return;
    }
    if (action === 'toggle') action = s.playing ? 'pause' : 'play';
    if (!['play', 'pause', 'previoustrack', 'nexttrack'].includes(action)) return;
    wc.send('media:action', action);
    setTimeout(() => { if (!wc.isDestroyed()) wc.send('media:query'); }, 400);
  });
  // a faixa pode mudar sem pausa (playlist): enquanto algo toca, confere de tempos em tempos
  setInterval(() => {
    for (const s of sessions.values()) if (s.playing) webContents.fromId(s.wcId)?.send('media:query');
  }, 4000).unref?.();
}

module.exports = { watchMedia, registerMedia };
