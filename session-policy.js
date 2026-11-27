// Políticas aplicadas a cada sessão (perfil ou privada): client hints, cookies de terceiros,
// Global Privacy Control, permissões de sites e downloads. Os ajustes vêm da interface (prefs:set).
const { app, dialog, shell, session, webContents } = require('electron');
const { onUi, handleUi } = require('./ipc');
const downloads = require('./downloads');
const safe = require('./safe-browsing');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const { pathToFileURL } = require('url');

/**
 * "Windows 11 23H2 (build 22631.4602)", para o "Relatar um problema" (O4). O Windows 11 ainda se
 * apresenta como 10.0: o que diferencia é o build (22000 em diante). A versão de exibição (23H2)
 * e a revisão vêm do registro; sem elas, fica só o build.
 */
let osCache = null;
function osInfo() {
  if (osCache) return osCache;
  osCache = new Promise((resolve) => {
    if (process.platform !== 'win32') { resolve(`${os.type()} ${os.release()}`); return; }
    const build = Number(os.release().split('.')[2]) || 0;
    const name = build >= 22000 ? 'Windows 11' : 'Windows 10';
    execFile('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion'], { windowsHide: true, timeout: 3000 }, (err, out) => {
      const val = (k) => (String(out || '').match(new RegExp(`^\\s*${k}\\s+REG_\\w+\\s+(.+)$`, 'm')) || [])[1]?.trim();
      const display = !err && val('DisplayVersion');
      const ubr = !err && val('UBR'); // revisão, em hexadecimal (0x1202)
      const rev = ubr ? `.${parseInt(ubr, 16)}` : '';
      resolve(`${name}${display ? ` ${display}` : ''} (build ${build}${rev})`);
    });
  });
  return osCache;
}

const DEFAULT_PREFS = {
  cookies: 'block-third-party', // 'allow' | 'block-third-party' | 'block-all'
  gpc: true,
  clearOnExit: false,
  permissions: { camera: 'ask', microphone: 'ask', location: 'ask', notifications: 'ask', clipboard: 'ask', apps: 'ask' },
  sites: {}, // { "https://site.com": { camera: 'allow' | 'block', ... } }
  // Configurações por site (N17), pelo site inteiro (domínio registrável, com subdomínios):
  // { "site.com": { js: 'block', popups: 'allow' | 'block', cookies: 'allow' | 'block' } }
  siteRules: {},
  downloadDir: null,
  downloadAsk: false,
  httpsFirst: true, // tenta HTTPS antes de HTTP (volta para HTTP se o site não tiver)
  secureDns: true, // DNS criptografado (Quad9), que também bloqueia domínios de malware e phishing
  safeBrowsing: true, // O2: avisa antes de abrir site de golpe ou que distribui malware (safe-browsing.js)
  safeBrowsingKey: '', // chave própria do Google Safe Browsing (opcional): o Google também confere
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
    siteRules: sanitizeRules(p.siteRules),
    cookies: ok(p.cookies, ['allow', 'block-third-party', 'block-all'], DEFAULT_PREFS.cookies),
    gpc: p.gpc !== false,
    clearOnExit: !!p.clearOnExit,
    permissions: perms,
    sites,
    downloadDir: typeof p.downloadDir === 'string' && path.isAbsolute(p.downloadDir) ? p.downloadDir : null,
    downloadAsk: !!p.downloadAsk,
    httpsFirst: p.httpsFirst !== false,
    secureDns: p.secureDns !== false,
    safeBrowsing: p.safeBrowsing !== false,
    safeBrowsingKey: typeof p.safeBrowsingKey === 'string' && /^[\w-]{20,80}$/.test(p.safeBrowsingKey.trim()) ? p.safeBrowsingKey.trim() : '',
  };
}

const RULE_VALUES = { js: ['allow', 'block'], popups: ['allow', 'block'], cookies: ['allow', 'block'] };
function sanitizeRules(rules) {
  const out = {};
  if (!rules || typeof rules !== 'object') return out;
  for (const [site, d] of Object.entries(rules).slice(0, 5000)) {
    if (!/^[a-z0-9.-]{1,253}$|^\[[0-9a-f:.]+\]$/i.test(site) || !d || typeof d !== 'object') continue;
    const r = {};
    for (const [k, vals] of Object.entries(RULE_VALUES)) if (vals.includes(d[k])) r[k] = d[k];
    if (Object.keys(r).length) out[site.toLowerCase()] = r;
  }
  return out;
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
/** O site da página que está na aba (o "de cima"), para um pedido de rede. */
function topSiteOf(details) {
  if (details.resourceType === 'mainFrame') return siteOf(hostOf(details.url));
  let top = '';
  try { top = details.webContents?.getURL() || ''; } catch { /* aba já fechada */ }
  return siteOf(hostOf(top || details.referrer || ''));
}
function isThirdParty(details) {
  if (details.resourceType === 'mainFrame') return false;
  const a = siteOf(hostOf(details.url));
  const b = topSiteOf(details);
  return !!a && !!b && a !== b;
}
/** O site (chave das configurações por site) de um endereço http(s). */
const siteKeyOf = (url) => (/^https?:/i.test(url || '') ? siteOf(hostOf(url)).toLowerCase() : '');
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
  // ctx: { win(), winFor(webContents), uaHints(), parentOf(privatePartition), isPrivate(p), onPrefs(partition) }
  // janela privada: os ajustes do perfil de onde ela foi aberta (O7)
  const prefsFor = (partition) => prefsByPartition.get(ctx.isPrivate(partition) ? ctx.parentOf(partition) : partition)
    || prefsByPartition.get('persist:kona') || DEFAULT_PREFS;

  // Configurações por site. Nas janelas privadas, o que se muda lá vale só para aquela sessão
  // (fica aqui na memória, por cima das do perfil) e some quando ela fecha.
  const privateRules = new Map(); // partição privada → { site: { js, popups, cookies } }
  const partitionOfSession = new WeakMap();
  app.whenReady().then(() => safe.start()); // listas de golpes e malware: carrega as guardadas e atualiza
  onUi('siterules:private', (_e, partition, rules) => {
    if (!ctx.isPrivate(partition)) return;
    privateRules.set(partition, sanitizeRules(rules));
  });
  function ruleFor(partition, site, kind) {
    if (!site) return null;
    return privateRules.get(partition)?.[site]?.[kind] || prefsFor(partition).siteRules?.[site]?.[kind] || null;
  }
  /** A escolha do site para um conteúdo (aba): 'allow' | 'block' | null (o padrão). */
  function ruleForContents(wc, url, kind) {
    const partition = partitionOfSession.get(wc.session);
    return partition ? ruleFor(partition, siteKeyOf(url), kind) : null;
  }
  // cookies de um pedido: a escolha do site do pedido vale primeiro; "permitir" no site aberto na
  // aba libera também os de terceiros dentro dele (login embutido que quebra com o bloqueio)
  function cookiesBlocked(partition, p, details) {
    const own = ruleFor(partition, siteOf(hostOf(details.url)).toLowerCase(), 'cookies');
    if (own === 'block') return true;
    if (own === 'allow') return false;
    const top = ruleFor(partition, (topSiteOf(details) || '').toLowerCase(), 'cookies');
    if (top === 'block') return true;
    if (top === 'allow') return false;
    return p.cookies === 'block-all' || (p.cookies === 'block-third-party' && isThirdParty(details));
  }

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

  function storageAccessOk(partition, p, topUrl, reqUrl) {
    const own = ruleFor(partition, siteKeyOf(reqUrl), 'cookies');
    const top = ruleFor(partition, siteKeyOf(topUrl), 'cookies');
    if (own === 'block' || top === 'block') return false;
    return own === 'allow' || top === 'allow' || p.cookies === 'allow';
  }

  function install(ses, partition) {
    partitionOfSession.set(ses, partition);
    // Corretor ortográfico: os idiomas do Windows (Configurações → Idioma), na mesma ordem
    try {
      const avail = ses.availableSpellCheckerLanguages || [];
      const want = app.getPreferredSystemLanguages()
        .map((l) => avail.find((a) => a.toLowerCase() === l.toLowerCase()) || avail.find((a) => a.toLowerCase().split('-')[0] === l.toLowerCase().split('-')[0]))
        .filter((l, i, a) => l && a.indexOf(l) === i);
      if (want.length) ses.setSpellCheckerLanguages(want);
    } catch { /* sem corretor: segue sem */ }
    // Um só interceptador por sessão (o Electron guarda o último): proteção contra golpes e, depois,
    // HTTPS primeiro. Só páginas e frames (não cada imagem ou script), para não pesar.
    ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'], types: ['mainFrame', 'subFrame'] }, (details, callback) => {
      const pr = prefsFor(partition);
      if (pr.safeBrowsing && !safeAllowed(partition, details.url)) {
        const threat = safe.check(details.url);
        if (threat) {
          callback({ cancel: true });
          if (details.resourceType === 'mainFrame') tellBlocked(details.webContents, details.url, threat);
          return;
        }
        // com a chave do Google: confere também lá, sem segurar a página (se for perigosa, para e avisa)
        if (pr.safeBrowsingKey && details.resourceType === 'mainFrame') {
          const wc = details.webContents;
          safe.checkGoogle(details.url, pr.safeBrowsingKey).then((t) => {
            if (t && wc && !wc.isDestroyed()) { wc.stop(); tellBlocked(wc, details.url, t); }
          });
        }
      }
      if (details.resourceType !== 'mainFrame' || !details.url.startsWith('http:') || !pr.httpsFirst) { callback({}); return; }
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
      if (cookiesBlocked(partition, p, details)) {
        for (const k of Object.keys(h)) if (k.toLowerCase() === 'cookie') delete h[k];
      }
      callback({ requestHeaders: h });
    });
    // Cookies definidos por HTTP (a grande maioria dos cookies de rastreamento)
    // + JavaScript bloqueado num site (N17): a página e os quadros dela recebem a regra de segurança
    // da própria web (CSP) que proíbe todos os scripts, inclusive os escritos dentro da página
    ses.webRequest.onHeadersReceived((details, callback) => {
      const p = prefsFor(partition);
      const rh = { ...details.responseHeaders };
      let changed = false;
      if (cookiesBlocked(partition, p, details)) {
        for (const k of Object.keys(rh)) if (k.toLowerCase() === 'set-cookie') { delete rh[k]; changed = true; }
      }
      const frame = details.resourceType === 'mainFrame' || details.resourceType === 'subFrame';
      if (frame && ruleFor(partition, (topSiteOf(details) || '').toLowerCase(), 'js') === 'block') {
        const key = Object.keys(rh).find((k) => k.toLowerCase() === 'content-security-policy') || 'Content-Security-Policy';
        rh[key] = [...[].concat(rh[key] || []), "script-src 'none'"];
        changed = true;
        if (details.resourceType === 'mainFrame') {
          const wc = details.webContents;
          try { wc?.hostWebContents?.send('site:jsblocked', { id: wc.id, url: details.url }); } catch { /* aba já fechada */ }
        }
      }
      callback(changed ? { responseHeaders: rh } : {});
    });

    ses.setPermissionRequestHandler(async (wc, permission, callback, details) => {
      // câmera/microfone liberados: a aba fica marcada "em chamada" (a economia de memória não a suspende)
      if (permission === 'media') { const cb = callback; callback = (ok) => { if (ok) markMedia(wc); cb(ok); }; }
      if (ALWAYS.has(permission)) { callback(true); return; }
      const p = prefsFor(partition);
      if (permission === 'storage-access' || permission === 'top-level-storage-access') { callback(storageAccessOk(partition, p, wc?.getURL?.(), details.requestingUrl)); return; }
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
      if (permission === 'storage-access' || permission === 'top-level-storage-access') return storageAccessOk(partition, p, _wc?.getURL?.(), requestingOrigin);
      const kinds = permission === 'media'
        ? [details?.mediaType === 'audio' ? 'microphone' : 'camera']
        : kindsFor(permission, details);
      if (!kinds) return false;
      const origin = originOf(requestingOrigin);
      return kinds.every((k) => decide(p, origin, k) === 'allow');
    });

    ses.on('will-download', (_e, item, wc) => {
      const p = prefsFor(partition);
      // arquivo vindo de um endereço conhecido por distribuir malware: nem começa
      const bad = p.safeBrowsing && item.getURLChain().map((u) => !safeAllowed(partition, u) && safe.check(u)).find(Boolean);
      if (bad) {
        item.cancel();
        const host = wc?.hostWebContents || wc;
        if (host && !host.isDestroyed()) host.send('safe:download-blocked', { name: item.getFilename(), threat: bad });
        return;
      }
      const askThis = item.getURLChain().some((u) => askUrls.delete(u));
      const dir = p.downloadDir && fs.existsSync(p.downloadDir) ? p.downloadDir : app.getPath('downloads');
      // arquivo que pode rodar programas, ou que veio sem criptografia: fica guardado à parte até a
      // pessoa escolher "Manter" (aí vai para a pasta) ou "Descartar" (ver downloads.js)
      const danger = downloads.riskOf(item.getFilename(), item.getURLChain());
      if (danger) item.setSavePath(downloads.holdingPath(item.getFilename()));
      else if (!p.downloadAsk && !askThis) item.setSavePath(uniquePath(dir, item.getFilename()));
      downloads.track(item, { priv: ctx.isPrivate(partition), danger, finalDir: dir, ask: !!(p.downloadAsk || askThis) });
    });
  }

  // Os ajustes também ficam no disco: um app instalado (N11) aberto pelo atalho, com o Kona fechado,
  // já nasce com os ajustes do perfil dele (antes de qualquer interface mandar os seus)
  const prefsFile = path.join(app.getPath('userData'), 'site-prefs.json');
  try {
    const saved = JSON.parse(fs.readFileSync(prefsFile, 'utf8'));
    for (const [part, pr] of Object.entries(saved || {})) if (/^persist:kona(-[a-z0-9]{4,32})?$/.test(part)) prefsByPartition.set(part, sanitize(pr));
  } catch { /* primeira vez */ }
  let saveTimer = null;
  const savePrefs = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { fs.writeFileSync(prefsFile, JSON.stringify(Object.fromEntries(prefsByPartition))); } catch { /* sem espaço: segue na memória */ }
    }, 500);
  };
  onUi('prefs:set', (_e, partition, prefs) => {
    if (typeof partition === 'string' && /^persist:kona(-[a-z0-9]{4,32})?$/.test(partition)) {
      prefsByPartition.set(partition, sanitize(prefs));
      savePrefs();
      ctx.onPrefs?.(partition);
    }
  });
  handleUi('dialog:folder', async () => {
    const r = await dialog.showOpenDialog(ctx.win(), { properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  // licenças de terceiros (gerado por scripts/licenses.js)
  handleUi('app:licenses', () => JSON.parse(fs.readFileSync(path.join(__dirname, 'assets', 'licenses.json'), 'utf8')));
  handleUi('app:info', async () => ({
    version: require('./package.json').version, electron: process.versions.electron, chrome: process.versions.chrome,
    node: process.versions.node, v8: process.versions.v8, downloads: app.getPath('downloads'),
    os: await osInfo(), arch: process.arch, packaged: app.isPackaged,
    // as licenças do Chromium vêm com o Electron, ao lado do executável (no app instalado e no de desenvolvimento)
    chromiumLicenses: (() => {
      const f = path.join(path.dirname(process.execPath), 'LICENSES.chromium.html');
      return fs.existsSync(f) ? pathToFileURL(f).href : null;
    })(),
  }));

  // Dados de sites (cookies agrupados por site)
  const validPartition = (p) => typeof p === 'string' && (/^persist:kona(-[a-z0-9]{4,32})?$/.test(p) || ctx.isPrivate(p));
  // o painel do cadeado: o site (chave das configurações) e quantos cookies ele guarda
  handleUi('site:info', async (_e, partition, url) => {
    const site = siteKeyOf(typeof url === 'string' ? url : '');
    if (!site || !validPartition(partition)) return { site, cookies: 0 };
    const cookies = await session.fromPartition(partition).cookies.get({}).catch(() => []);
    return { site, cookies: cookies.filter((c) => siteOf((c.domain || '').replace(/^\./, '')).toLowerCase() === site).length };
  });
  handleUi('site:key', (_e, url) => siteKeyOf(typeof url === 'string' ? url : ''));
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

  /* Proteção contra golpes e malware (O2): o aviso é a interface que mostra (por cima da aba);
     "Continuar mesmo assim" libera aquele site até o Kona fechar (só naquele perfil). */
  const allowedSites = new Map(); // partição → Set de hosts liberados
  const hostKey = (url) => { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } };
  function safeAllowed(partition, url) { return !!allowedSites.get(partition)?.has(hostKey(url)); }
  function tellBlocked(wc, url, threat) {
    const host = wc?.hostWebContents;
    if (host && !host.isDestroyed()) host.send('safe:blocked', { wcId: wc.id, url, threat });
  }
  handleUi('safe:allow', (e, wcId, url) => {
    const wc = Number.isInteger(wcId) && webContents.fromId(wcId);
    if (!wc || wc.isDestroyed() || wc.hostWebContents !== e.sender || typeof url !== 'string') return false;
    const part = partitionOfSession.get(wc.session);
    if (!part) return false;
    if (!allowedSites.has(part)) allowedSites.set(part, new Set());
    allowedSites.get(part).add(hostKey(url));
    return true;
  });
  handleUi('safe:status', () => safe.status());
  handleUi('safe:update', async () => { await safe.update({ force: true }); return safe.status(); });

  /* Economia de memória (O1): abas que precisam continuar vivas, como no Chrome: com câmera ou
     microfone liberados nesta página, ou de um site com notificações permitidas (WhatsApp, Gmail…). */
  const mediaTabs = new Set();
  function markMedia(wc) {
    if (!wc || mediaTabs.has(wc.id)) return;
    mediaTabs.add(wc.id);
    const id = wc.id;
    const clear = () => mediaTabs.delete(id);
    wc.once('did-navigate', clear);
    wc.once('destroyed', clear);
  }
  function keepAliveReason(wc, partition) {
    if (mediaTabs.has(wc.id)) return 'media';
    const origin = originOf(wc.getURL());
    if (origin && decide(prefsFor(partition), origin, 'notifications') === 'allow') return 'notifications';
    return null;
  }

  return { install, prefsFor, askNext, ruleForContents, keepAliveReason };
}

module.exports = { createPolicy, siteOf, siteKeyOf, isThirdParty, DEFAULT_PREFS };
