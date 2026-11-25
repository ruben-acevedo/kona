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
