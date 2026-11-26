// Políticas aplicadas a cada sessão (perfil ou privada): client hints, cookies de terceiros,
// Global Privacy Control, permissões de sites e downloads. Os ajustes vêm da interface (prefs:set).
const { app, dialog, shell, session } = require('electron');
const { onUi, handleUi } = require('./ipc');
const downloads = require('./downloads');
const path = require('path');
const fs = require('fs');

const DEFAULT_PREFS = {
  cookies: 'block-third-party', // 'allow' | 'block-third-party' | 'block-all'
  gpc: true,
  clearOnExit: false,
  permissions: { camera: 'ask', microphone: 'ask', location: 'ask', notifications: 'ask', clipboard: 'ask', apps: 'ask' },
  sites: {}, // { "https://site.com": { camera: 'allow' | 'block', ... } }
  downloadDir: null,
  downloadAsk: false,
  httpsFirst: true, // tenta HTTPS antes de HTTP (volta para HTTP se o site não tiver)
  secureDns: true, // DNS criptografado (Quad9), que também bloqueia domínios de malware e phishing
};
const PERM_KINDS = Object.keys(DEFAULT_PREFS.permissions);
const prefsByPartition = new Map();

function sanitize(p = {}) {
  const ok = (v, list, def) => (list.includes(v) ? v : def);
  const perms = {};
  for (const k of PERM_KINDS) perms[k] = ok(p.permissions?.[k], ['ask', 'allow', 'block'], 'ask');
  const sites = {};
  for (const [origin, d] of Object.entries(p.sites || {})) {
    if (!/^https?:\/\/[^/]+$/.test(origin)) continue;
    sites[origin] = {};
    for (const k of PERM_KINDS) if (d?.[k] === 'allow' || d?.[k] === 'block') sites[origin][k] = d[k];
  }
  return {
    cookies: ok(p.cookies, ['allow', 'block-third-party', 'block-all'], DEFAULT_PREFS.cookies),
    gpc: p.gpc !== false,
    clearOnExit: !!p.clearOnExit,
    permissions: perms,
    sites,
    downloadDir: typeof p.downloadDir === 'string' && path.isAbsolute(p.downloadDir) ? p.downloadDir : null,
    downloadAsk: !!p.downloadAsk,
    httpsFirst: p.httpsFirst !== false,
    secureDns: p.secureDns !== false,
  };
}

/* ───────────── Terceiros ─────────────
   "Site" ≈ domínio registrável (eTLD+1). Sem a Public Suffix List completa, usamos os
   sufixos de dois níveis mais comuns; o erro possível é tratar como terceiro algo que é o
   mesmo site em sufixos raros (mais restritivo, nunca menos). */
const MULTI = new Set(['co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.br', 'net.br', 'org.br', 'gov.br', 'edu.br', 'com.au', 'net.au',
  'org.au', 'co.jp', 'ne.jp', 'or.jp', 'co.nz', 'com.mx', 'com.ar', 'co.in', 'com.cn', 'com.tr', 'co.za', 'com.sg', 'com.hk',
  'co.kr', 'com.tw', 'com.pt', 'github.io', 'vercel.app', 'netlify.app', 'pages.dev', 'herokuapp.com', 'blogspot.com', 'appspot.com']);
const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
function siteOf(host) {
  if (!host || /^[\d.]+$/.test(host) || host.includes(':')) return host;
  const parts = host.split('.');
  const last2 = parts.slice(-2).join('.');
  return parts.length >= 3 && MULTI.has(last2) ? parts.slice(-3).join('.') : last2;
}
function isThirdParty(details) {
  if (details.resourceType === 'mainFrame') return false;
  let top = '';
  try { top = details.webContents?.getURL() || ''; } catch { /* aba já fechada */ }
  top = top || details.referrer || '';
  const a = siteOf(hostOf(details.url));
  const b = siteOf(hostOf(top));
  return !!a && !!b && a !== b;
}
const originOf = (u) => { try { const x = new URL(u); return `${x.protocol}//${x.host}`; } catch { return ''; } };

/* ───────────── Permissões ───────────── */
// sempre permitidas (inofensivas e esperadas): tela cheia, copiar, travar o ponteiro em jogos
// 'display-capture' (compartilhar a tela): o consentimento é o seletor do Kona (screen-share.js), que
// pergunta a cada vez e só entrega o que a pessoa escolher.
const ALWAYS = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock', 'keyboardLock', 'display-capture']);
const SIMPLE = { geolocation: 'location', notifications: 'notifications', 'clipboard-read': 'clipboard', openExternal: 'apps' };
function kindsFor(permission, details = {}) {
  if (permission === 'media') {
    const t = details.mediaTypes || [];
    const k = [];
    if (t.includes('video')) k.push('camera');
    if (t.includes('audio')) k.push('microphone');
    return k.length ? k : ['camera', 'microphone'];
  }
  return SIMPLE[permission] ? [SIMPLE[permission]] : null; // o resto (MIDI, USB, serial…) é negado
}
const decide = (p, origin, kind) => p.sites[origin]?.[kind] || p.permissions[kind] || 'ask';

/* ───────────── HTTPS primeiro ─────────────
   Como o "Sempre usar conexões seguras" do Chrome: navegações http:// viram https://.
   Se o HTTPS falhar (sem HTTPS, certificado inválido) ou o site redirecionar de volta para
   http://, o host fica liberado em HTTP até o Kona fechar e a página carrega em HTTP. */
const httpOk = new Set();
const pendingUpgrade = new Map(); // host → { url: URL http original, timer }
const UPGRADE_TIMEOUT = 4000; // sem resposta em HTTPS nesse tempo → carrega em HTTP
function fallbackToHttp(host, wc) {
  const p = pendingUpgrade.get(host);
  if (!p) return;
  clearTimeout(p.timer);
  pendingUpgrade.delete(host);
  httpOk.add(host);
  try { if (wc && !wc.isDestroyed()) wc.loadURL(p.url); } catch { /* aba já fechada */ }
}
const clearUpgrade = (host) => { clearTimeout(pendingUpgrade.get(host)?.timer); pendingUpgrade.delete(host); };
const isLocalHost = (h) => !h.includes('.') || /^[\d.]+$/.test(h) || h.startsWith('[')
  || /\.(localhost|local|lan|internal|home\.arpa|test)$/i.test(h);

function createPolicy(ctx) {
  // ctx: { win(), winFor(webContents), uaHints(), currentPartition(), isPrivate(p), onPrefs(partition) }
  const prefsFor = (partition) => prefsByPartition.get(ctx.isPrivate(partition) ? ctx.currentPartition() : partition)
    || prefsByPartition.get(ctx.currentPartition()) || DEFAULT_PREFS;

  // Pedido de permissão: pergunta na interface e espera a resposta
  const pending = new Map();
  let seq = 0;
  function askUser(req, wc) {
    const win = ctx.winFor(wc);
    if (!win) return Promise.resolve(false);
    const id = ++seq;
    win.webContents.send('perm:ask', { id, ...req });
    return new Promise((resolve) => {
      pending.set(id, resolve);
      setTimeout(() => { if (pending.has(id)) { pending.delete(id); resolve(false); } }, 120000);
    });
  }
  onUi('perm:reply', (_e, { id, allow }) => { pending.get(id)?.(!!allow); pending.delete(id); });

  // Downloads: nome livre na pasta escolhida; o resto fica em downloads.js.
  // "Save … as" (menu de contexto) pede a pasta mesmo com o salvamento automático ligado.
  const askUrls = new Set();
  const askNext = (url) => { askUrls.add(url); setTimeout(() => askUrls.delete(url), 30000); };
  const uniquePath = (dir, name) => {
    const ext = path.extname(name);
    const base = path.basename(name, ext);
    let file = path.join(dir, name);
    for (let i = 1; fs.existsSync(file); i++) file = path.join(dir, `${base} (${i})${ext}`);
    return file;
  };

  function install(ses, partition) {
    // Corretor ortográfico: os idiomas do Windows (Configurações → Idioma), na mesma ordem
    try {
      const avail = ses.availableSpellCheckerLanguages || [];
      const want = app.getPreferredSystemLanguages()
        .map((l) => avail.find((a) => a.toLowerCase() === l.toLowerCase()) || avail.find((a) => a.toLowerCase().split('-')[0] === l.toLowerCase().split('-')[0]))
        .filter((l, i, a) => l && a.indexOf(l) === i);
      if (want.length) ses.setSpellCheckerLanguages(want);
    } catch { /* sem corretor: segue sem */ }
    ses.webRequest.onBeforeRequest({ urls: ['http://*/*'] }, (details, callback) => {
      if (details.resourceType !== 'mainFrame' || !prefsFor(partition).httpsFirst) { callback({}); return; }
      let u;
      try { u = new URL(details.url); } catch { callback({}); return; }
      const host = u.hostname;
      if (u.port || isLocalHost(host) || httpOk.has(host)) { callback({}); return; }
      // o https deste host acabou de mandar de volta para http: o site não funciona em HTTPS
      if (pendingUpgrade.has(host)) { clearUpgrade(host); httpOk.add(host); callback({}); return; }
      const wc = details.webContents;
      pendingUpgrade.set(host, { url: details.url, timer: setTimeout(() => fallbackToHttp(host, wc), UPGRADE_TIMEOUT) });
      u.protocol = 'https:';
      callback({ redirectURL: u.href });
    });
    ses.webRequest.onResponseStarted({ urls: ['https://*/*'] }, (details) => {
      if (details.resourceType !== 'mainFrame' || details.statusCode >= 300 && details.statusCode < 400) return;
      try { clearUpgrade(new URL(details.url).hostname); } catch { /* URL inválida */ }
    });
    ses.webRequest.onErrorOccurred({ urls: ['https://*/*'] }, (details) => {
      if (details.resourceType !== 'mainFrame' || details.error === 'net::ERR_ABORTED') return;
      try { fallbackToHttp(new URL(details.url).hostname, details.webContents); } catch { /* URL inválida */ }
    });
    ses.webRequest.onBeforeSendHeaders((details, callback) => {
      const h = details.requestHeaders;
      const p = prefsFor(partition);
      const hints = ctx.uaHints();
      if (hints && details.url.startsWith('https://')) {
        const have = new Set(Object.keys(h).map((k) => k.toLowerCase()));
        for (const [k, v] of Object.entries(hints)) if (!have.has(k)) h[k] = v;
      }
      if (p.gpc) h['Sec-GPC'] = '1';
      if (p.cookies === 'block-all' || (p.cookies === 'block-third-party' && isThirdParty(details))) {
        for (const k of Object.keys(h)) if (k.toLowerCase() === 'cookie') delete h[k];
      }
      callback({ requestHeaders: h });
    });
    // Cookies definidos por HTTP (a grande maioria dos cookies de rastreamento)
    ses.webRequest.onHeadersReceived((details, callback) => {
      const p = prefsFor(partition);
      if (p.cookies === 'block-all' || (p.cookies === 'block-third-party' && isThirdParty(details))) {
        const rh = { ...details.responseHeaders };
        let changed = false;
        for (const k of Object.keys(rh)) if (k.toLowerCase() === 'set-cookie') { delete rh[k]; changed = true; }
        callback(changed ? { responseHeaders: rh } : {});
        return;
      }
      callback({});
    });

    ses.setPermissionRequestHandler(async (wc, permission, callback, details) => {
      if (ALWAYS.has(permission)) { callback(true); return; }
      const p = prefsFor(partition);
      if (permission === 'storage-access' || permission === 'top-level-storage-access') { callback(p.cookies === 'allow'); return; }
      const kinds = kindsFor(permission, details);
      if (!kinds) { callback(false); return; }
      const origin = originOf(details.requestingUrl || wc.getURL());
      if (!origin) { callback(false); return; }
      const ds = kinds.map((k) => decide(p, origin, k));
      if (ds.includes('block')) { callback(false); return; }
      if (ds.every((d) => d === 'allow')) { callback(true); return; }
      callback(await askUser({ origin, kinds, partition, private: ctx.isPrivate(partition) }, wc));
    });
    // Consultas síncronas (navigator.permissions, Notification.permission): só "sim" se permitido
    ses.setPermissionCheckHandler((_wc, permission, requestingOrigin, details) => {
      if (ALWAYS.has(permission)) return true;
      const p = prefsFor(partition);
      if (permission === 'storage-access' || permission === 'top-level-storage-access') return p.cookies === 'allow';
      const kinds = permission === 'media'
        ? [details?.mediaType === 'audio' ? 'microphone' : 'camera']
        : kindsFor(permission, details);
      if (!kinds) return false;
      const origin = originOf(requestingOrigin);
      return kinds.every((k) => decide(p, origin, k) === 'allow');
    });

    ses.on('will-download', (_e, item) => {
      const p = prefsFor(partition);
      const askThis = item.getURLChain().some((u) => askUrls.delete(u));
      if (!p.downloadAsk && !askThis) {
        const dir = p.downloadDir && fs.existsSync(p.downloadDir) ? p.downloadDir : app.getPath('downloads');
        item.setSavePath(uniquePath(dir, item.getFilename()));
      }
      downloads.track(item, { priv: ctx.isPrivate(partition) });
    });
  }

  onUi('prefs:set', (_e, partition, prefs) => {
    if (typeof partition === 'string' && /^persist:kona(-[a-z0-9]{4,32})?$/.test(partition)) {
      prefsByPartition.set(partition, sanitize(prefs));
      ctx.onPrefs?.(partition);
    }
  });
  handleUi('dialog:folder', async () => {
    const r = await dialog.showOpenDialog(ctx.win(), { properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  handleUi('app:info', () => ({
    version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome,
    node: process.versions.node, v8: process.versions.v8, downloads: app.getPath('downloads'),
  }));

  // Dados de sites (cookies agrupados por site)
  const validPartition = (p) => typeof p === 'string' && /^persist:kona(-[a-z0-9]{4,32})?$/.test(p);
  handleUi('sites:list', async (_e, partition) => {
    if (!validPartition(partition)) return [];
    const cookies = await session.fromPartition(partition).cookies.get({});
    const by = new Map();
    for (const c of cookies) {
      const site = siteOf((c.domain || '').replace(/^\./, ''));
      by.set(site, (by.get(site) || 0) + 1);
    }
    return [...by].map(([site, count]) => ({ site, count })).sort((a, b) => a.site.localeCompare(b.site));
  });
  handleUi('sites:remove', async (_e, partition, site) => {
    if (!validPartition(partition) || typeof site !== 'string') return false;
    const ses = session.fromPartition(partition);
    const cookies = await ses.cookies.get({});
    for (const c of cookies) {
      const d = (c.domain || '').replace(/^\./, '');
      if (siteOf(d) !== site) continue;
      await ses.cookies.remove(`${c.secure ? 'https' : 'http'}://${d}${c.path || '/'}`, c.name).catch(() => {});
    }
    for (const proto of ['https', 'http']) {
      for (const host of [site, `www.${site}`]) await ses.clearStorageData({ origin: `${proto}://${host}` }).catch(() => {});
    }
    return true;
  });

  // Apagar cookies e dados ao fechar (perfis com a opção ligada)
  let clearing = false;
  app.on('before-quit', (e) => {
    if (clearing) return;
    const targets = [...prefsByPartition].filter(([, p]) => p.clearOnExit).map(([part]) => part);
    if (!targets.length) return;
    e.preventDefault();
    clearing = true;
    Promise.all(targets.map((part) => session.fromPartition(part).clearStorageData().catch(() => {})))
      .finally(() => app.quit());
  });

  return { install, prefsFor, askNext };
}

module.exports = { createPolicy, siteOf, isThirdParty, DEFAULT_PREFS };
