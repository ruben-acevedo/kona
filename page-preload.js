// Preload das páginas (abas). Roda antes dos scripts de cada página.
//
// O Chrome expõe em toda página window.chrome.app, .csi e .loadTimes. No Electron o objeto vem
// vazio, e o login do Google usa isso para identificar um navegador embutido: recusa com
// "This browser or app may not be secure". Recriamos esses três como no Chrome.
const { contextBridge } = require('electron');

contextBridge.executeInMainWorld({
  func: () => {
    const c = window.chrome || {};
    if (c.app && c.csi && c.loadTimes) return;
    // funções com cara de nativas (toString igual ao das funções internas do Chrome)
    const toStr = Function.prototype.toString;
    const natives = new WeakSet();
    const native = (name, fn) => {
      Object.defineProperty(fn, 'name', { value: name });
      natives.add(fn);
      return fn;
    };
    const patched = native('toString', function toString() {
      return natives.has(this) ? `function ${this.name}() { [native code] }` : toStr.call(this);
    });
    Function.prototype.toString = patched;
    const define = (obj, key, value) => Object.defineProperty(obj, key, { value, writable: true, configurable: true, enumerable: true });

    if (!c.app) {
      define(c, 'app', {
        isInstalled: false,
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
        getDetails: native('getDetails', () => null),
        getIsInstalled: native('getIsInstalled', () => false),
        installState: native('installState', (cb) => { if (typeof cb === 'function') setTimeout(() => cb('not_installed')); }),
        runningState: native('runningState', () => 'cannot_run'),
      });
    }
    const nav = () => performance.getEntriesByType('navigation')[0];
    const t0 = performance.timeOrigin;
    if (!c.csi) {
      define(c, 'csi', native('csi', () => ({
        startE: Math.round(t0),
        onloadT: Math.round(t0 + (nav()?.domContentLoadedEventEnd || performance.now())),
        pageT: performance.now(),
        tran: 15,
      })));
    }
    if (!c.loadTimes) {
      define(c, 'loadTimes', native('loadTimes', () => {
        const n = nav();
        const s = (ms) => (ms ? (t0 + ms) / 1000 : 0);
        const proto = n?.nextHopProtocol || 'http/1.1';
        const spdy = ['h2', 'h3'].includes(proto);
        const paint = performance.getEntriesByName('first-paint')[0]?.startTime;
        return {
          requestTime: s(n?.startTime || 0.001), startLoadTime: s(n?.startTime || 0.001), commitLoadTime: s(n?.responseStart),
          finishDocumentLoadTime: s(n?.domContentLoadedEventEnd), finishLoadTime: s(n?.loadEventEnd),
          firstPaintTime: s(paint), firstPaintAfterLoadTime: 0, navigationType: 'Other',
          wasFetchedViaSpdy: spdy, wasNpnNegotiated: spdy, npnNegotiatedProtocol: spdy ? proto : 'unknown',
          wasAlternateProtocolAvailable: false, connectionInfo: proto,
        };
      }));
    }
    if (!window.chrome) Object.defineProperty(window, 'chrome', { value: c, writable: true, configurable: false, enumerable: true });
  },
});

// Passkeys: o Kona não tem a lista de preenchimento onde o Chrome sugere passkeys sem interromper
// ("mediação condicional"). Sem ela, o pedido silencioso do login do Google virava a janela de
// passkey do Windows, aberta sozinha. Aqui as páginas são informadas de que esse modo não existe
// (e um pedido condicional fica aguardando, sem abrir janela, até a página cancelar). A passkey
// continua funcionando quando a pessoa escolhe "Use a passkey".
contextBridge.executeInMainWorld({
  func: () => {
    const PKC = window.PublicKeyCredential;
    if (PKC && typeof PKC.isConditionalMediationAvailable === 'function') {
      const fn = function isConditionalMediationAvailable() { return Promise.resolve(false); };
      Object.defineProperty(PKC, 'isConditionalMediationAvailable', { value: fn, writable: true, configurable: true });
    }
    const creds = navigator.credentials;
    if (creds && typeof creds.get === 'function') {
      const get = creds.get.bind(creds);
      const wrapped = function get_(options) {
        if (options && options.mediation === 'conditional' && options.publicKey) {
          return new Promise((_resolve, reject) => {
            const signal = options.signal;
            if (signal) {
              if (signal.aborted) { reject(new DOMException('The operation was aborted.', 'AbortError')); return; }
              signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')), { once: true });
            }
          });
        }
        return get(options);
      };
      Object.defineProperty(wrapped, 'name', { value: 'get' });
      try { Object.defineProperty(Object.getPrototypeOf(creds), 'get', { value: wrapped, writable: true, configurable: true }); } catch { /* sem acesso: segue sem */ }
    }
  },
});

// Compartilhar a tela: guarda as capturas abertas pela página para o "Stop sharing" do Kona
// encerrá-las (evento vindo de page-share.js) e avisa quando todas acabaram.
contextBridge.executeInMainWorld({
  func: () => {
    const md = navigator.mediaDevices;
    if (!md || typeof md.getDisplayMedia !== 'function') return;
    const original = md.getDisplayMedia.bind(md);
    const live = new Set();
    const check = () => { if (![...live].some((s) => s.getTracks().some((t) => t.readyState === 'live'))) { live.clear(); window.dispatchEvent(new CustomEvent('__kona_share_ended')); } };
    const getDisplayMedia = function getDisplayMedia(constraints) {
      return original(constraints).then((stream) => {
        live.add(stream);
        for (const t of stream.getTracks()) t.addEventListener('ended', () => setTimeout(check, 0));
        return stream;
      });
    };
    Object.defineProperty(md, 'getDisplayMedia', { value: getDisplayMedia, writable: true, configurable: true });
    window.addEventListener('__kona_share_stop', () => {
      for (const s of live) for (const t of s.getTracks()) { t.stop(); t.dispatchEvent(new Event('ended')); }
      live.clear();
    });
  },
});
