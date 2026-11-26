// Compartilhar a tela (Meet, Teams, Zoom, Discord…), como no Chrome: quando um site pede
// (getDisplayMedia), a interface mostra o seletor do Kona — tela inteira, janela ou uma aba do Kona,
// com "Also share system audio" — e só o que a pessoa escolher é entregue. Pergunta a cada vez.
// Enquanto compartilha, a interface mostra a barra "Sharing… · Stop sharing" (o pedido de parar chega
// à página por page-share.js, que encerra as faixas da captura).
const { desktopCapturer, webContents } = require('electron');
const { onUi } = require('./ipc');

let win = () => null;

/**
 * Responde ao Electron. Recusar é `null` (um objeto vazio, com vídeo pedido, lança erro no processo
 * principal). Um erro aqui nunca pode derrubar o Kona: vira uma recusa.
 */
function reply(callback, streams) {
  try { callback(streams); } catch (err) {
    console.error('screen share reply failed:', err?.message);
    if (streams) { try { callback(null); } catch { /* já respondido */ } }
  }
}
const pending = new Map(); // id → { callback, sources, origin, wcId }
const active = new Map();  // id → { wcId, origin }
let seq = 0;

/** Liga o seletor numa sessão de abas (perfil ou privada). */
function installShare(ses) {
  ses.setDisplayMediaRequestHandler(async (request, callback) => {
    const frame = request.frame;
    let wc = null;
    try { wc = frame && webContents.fromFrame?.(frame); } catch { /* frame já fechado */ }
    const origin = request.securityOrigin || (() => { try { return new URL(frame.url).origin; } catch { return ''; } })();
    const host = win();
    if (!host || !request.videoRequested) { reply(callback, null); return; }
    // o seletor abre na hora; telas e janelas (com miniaturas) chegam em seguida — a 1ª listagem é lenta
    const id = ++seq;
    const entry = { callback, sources: [], origin, wcId: wc?.id };
    pending.set(id, entry);
    host.webContents.send('share:pick', { id, origin, audio: !!request.audioRequested, sources: null });
    let sources = [];
    try {
      sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 200 }, fetchWindowIcons: true });
    } catch { /* sem captura disponível */ }
    if (!pending.has(id)) return; // já cancelado
    entry.sources = sources;
    host.webContents.send('share:sources', {
      id,
      sources: sources
        .filter((s) => s.id.startsWith('screen') || !/(^| — )Kona$/.test(s.name)) // a janela do próprio Kona: use "Kona tab"
        .map((s) => ({ id: s.id, name: s.name, type: s.id.startsWith('screen') ? 'screen' : 'window', thumb: s.thumbnail.isEmpty() ? null : s.thumbnail.toDataURL(), icon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null, display: s.display_id })),
    });
  }, { useSystemPicker: false });
}

function registerShare(opts) {
  win = opts.win;
  // resposta do seletor: { source } (tela/janela), { tab } (webContents de uma aba) ou nada (cancelar)
  onUi('share:choice', (_e, id, choice) => {
    const p = pending.get(Number(id));
    if (!p) return;
    pending.delete(Number(id));
    if (!choice) { reply(p.callback, null); return; }
    let video = null;
    if (choice.source) video = p.sources.find((s) => s.id === choice.source) || null;
    else if (choice.tab) {
      const t = webContents.fromId(Number(choice.tab));
      if (t && !t.isDestroyed() && t.getType() === 'webview') video = t.mainFrame;
    }
    if (!video) { reply(p.callback, null); return; }
    const res = { video };
    if (choice.audio) res.audio = 'loopback'; // áudio do sistema (Windows)
    reply(p.callback, res);
    active.set(Number(id), { wcId: p.wcId, origin: p.origin });
    win()?.webContents.send('share:started', { id: Number(id), origin: p.origin, wcId: p.wcId, what: choice.source ? (choice.source.startsWith('screen') ? 'screen' : 'window') : 'tab' });
  });
  // "Stop sharing": a página encerra a captura (page-share.js)
  onUi('share:stop', (_e, id) => {
    const a = active.get(Number(id));
    active.delete(Number(id));
    const wc = a?.wcId && webContents.fromId(a.wcId);
    if (wc && !wc.isDestroyed()) wc.send('share:stop');
    win()?.webContents.send('share:ended', { id: Number(id) });
  });
}

/** A página avisou que a captura acabou (o site parou de compartilhar). */
function shareEndedFrom(wcId) {
  for (const [id, a] of active) {
    if (a.wcId === wcId) { active.delete(id); win()?.webContents.send('share:ended', { id }); }
  }
}

module.exports = { installShare, registerShare, shareEndedFrom };
