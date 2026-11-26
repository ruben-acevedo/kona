// Controle de mídia global (N16): guarda os botões de mídia que a página registra
// (navigator.mediaSession.setActionHandler: tocar, pausar, faixa anterior/seguinte) para o painel ♪ do
// Kona acioná-los, como o controle de mídia do Chrome. Também informa o que está tocando (título,
// artista, capa). Só no quadro principal. A troca de mensagens com a página usa eventos de nome
// aleatório, e a função substituída tem cara de nativa (toString igual ao do Chrome).
const { contextBridge, ipcRenderer } = require('electron');

if (process.isMainFrame) {
  const ev = `__kona_media_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

  contextBridge.executeInMainWorld({
    args: [ev],
    func: (ev) => {
      const ms = navigator.mediaSession;
      if (!ms || typeof ms.setActionHandler !== 'function') return;
      const handlers = new Map();
      const proto = Object.getPrototypeOf(ms);
      const original = proto.setActionHandler;
      const setActionHandler = function setActionHandler(action, handler) {
        const r = original.call(this, action, handler);
        if (typeof handler === 'function') handlers.set(action, handler); else handlers.delete(action);
        return r;
      };
      const prevToString = Function.prototype.toString;
      const fakes = new WeakSet();
      const toString = function toString() {
        return fakes.has(this) ? `function ${this.name}() { [native code] }` : prevToString.call(this);
      };
      fakes.add(setActionHandler);
      fakes.add(toString);
      Function.prototype.toString = toString;
      Object.defineProperty(proto, 'setActionHandler', { value: setActionHandler, writable: true, configurable: true, enumerable: true });

      const media = () => [...document.querySelectorAll('video, audio')];
      const abs = (src) => { try { return new URL(src, location.href).href; } catch { return ''; } };
      window.addEventListener(`${ev}:q`, () => {
        const m = ms.metadata;
        const art = (m?.artwork || []).map((a) => a?.src).filter(Boolean);
        window.dispatchEvent(new CustomEvent(`${ev}:r`, {
          detail: JSON.stringify({
            title: m?.title || '', artist: m?.artist || '', album: m?.album || '',
            artwork: art.length ? abs(art[art.length - 1]) : '',
            actions: [...handlers.keys()],
          }),
        }));
      });
      window.addEventListener(`${ev}:a`, (e) => {
        const action = String(e.detail);
        const h = handlers.get(action);
        if (h) { try { h({ action }); } catch { /* a página que trate */ } return; }
        // sem botão registrado: toca/pausa os vídeos e áudios da página
        if (action === 'pause') for (const el of media()) el.pause();
        if (action === 'play') media().find((el) => el.paused && el.currentSrc)?.play().catch(() => {});
      });
    },
  });

  let reply = null;
  window.addEventListener(`${ev}:r`, (e) => { reply = e.detail; });
  ipcRenderer.on('media:query', () => {
    reply = null;
    window.dispatchEvent(new CustomEvent(`${ev}:q`));
    let data = null;
    try { data = JSON.parse(reply); } catch { /* página sem mediaSession */ }
    ipcRenderer.send('media:state', data);
  });
  ipcRenderer.on('media:action', (_e, action) => window.dispatchEvent(new CustomEvent(`${ev}:a`, { detail: String(action) })));
}
