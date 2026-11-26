// Compatibilidade para APIs de extensão que faltam no Electron. O electron-chrome-extensions completa o
// objeto `chrome` (chrome.commands, chrome.action…), mas o Electron também expõe `browser` (o nome
// das APIs no Firefox) sem esses complementos; extensões como o uBlock Origin Lite preferem `browser`
// e paravam no primeiro erro (browser.commands indefinido), deixando o popup vazio. Aqui `browser`
// recebe o que falta a partir de `chrome`, e chrome.commands existe mesmo sem a biblioteca.
// Só roda em service workers e páginas de extensões (chrome-extension://), nunca em sites.
const { contextBridge } = require('electron');

function shim() {
  const c = globalThis.chrome;
  if (!c) return;
  const event = () => ({ addListener() {}, removeListener() {}, hasListener() { return false; }, hasListeners() { return false; } });
  const commands = c.commands || { onCommand: event(), getAll: (cb) => { const r = Promise.resolve([]); if (cb) r.then(cb); return r; } };
  if (!c.commands && !Object.isFrozen(c)) c.commands = commands;
  const b = globalThis.browser;
  if (b && b !== c && !Object.isFrozen(b)) {
    // as versões completas (chrome.tabs que enxerga as abas do Kona etc.) valem também em `browser`
    for (const k of Object.keys(c)) if (b[k] !== c[k]) { try { b[k] = c[k]; } catch { /* somente leitura */ } }
    if (!b.commands) { try { b.commands = commands; } catch { /* somente leitura */ } }
  }
}

// service workers de extensão (no preload deles não há location) e páginas chrome-extension://
const isExtension = process.type === 'service-worker' || (typeof location !== 'undefined' && location.protocol === 'chrome-extension:');
if (isExtension) {
  try {
    if ('executeInMainWorld' in contextBridge) contextBridge.executeInMainWorld({ func: shim });
  } catch { /* contexto sem acesso ao mundo principal: segue sem */ }
}
