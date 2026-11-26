// Sites instalados como aplicativo (N11). Cada app tem: nome, endereço inicial, escopo (o pedaço do
// site que é "dele"), o perfil (partição) onde foi instalado e um ícone. No Windows ganha atalho no
// menu Iniciar (e, se a pessoa quiser, na área de trabalho) que abre o Kona com --kona-app=<id>, e
// identidade própria na barra de tarefas (dá para fixar como um app).
// A janela do app é a própria interface do Kona no "modo app" (ver main.js e renderer/app-mode.js).
const { app, nativeImage, shell, webContents } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { onUi, handleUi } = require('./ipc');

const ARG = '--kona-app=';
const validPartition = (p) => typeof p === 'string' && /^persist:kona(-[a-z0-9]{4,32})?$/.test(p);
const isWeb = (u) => typeof u === 'string' && /^https?:\/\/[^\s]+$/i.test(u) && u.length < 4000;
const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f<>:"/\\|?*]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);

/* ───────────── Lista dos apps (userData/apps.json) ───────────── */
const dir = () => path.join(app.getPath('userData'), 'apps');
const file = () => path.join(app.getPath('userData'), 'apps.json');
let cache = null;
function list() {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(file(), 'utf8')).filter((a) => a && /^[a-f0-9]{12}$/.test(a.id)); } catch { cache = []; }
  return cache;
}
function save() {
  try { fs.writeFileSync(file(), JSON.stringify(list(), null, 1)); } catch (err) { console.error('apps: save failed', err?.message); }
}
const get = (id) => list().find((a) => a.id === id) || null;
/** O app (se houver) cujo escopo contém o endereço, no perfil dado. */
const appFor = (url, partition) => (isWeb(url) ? list().filter((a) => a.partition === partition && url.startsWith(a.scope)).sort((a, b) => b.scope.length - a.scope.length)[0] || null : null);
const appIdFrom = (argv) => {
  const a = (argv || []).find((x) => typeof x === 'string' && x.startsWith(ARG));
  const id = a ? a.slice(ARG.length) : '';
  return /^[a-f0-9]{12}$/.test(id) ? id : null;
};

/* ───────────── Ícones ─────────────
   O .ico do atalho guarda as imagens em PNG (aceito pelo Windows desde o Vista). */
function icoFrom(img) {
  const pngs = [256, 48, 32, 16].map((s) => ({ s, buf: img.resize({ width: s, height: s, quality: 'best' }).toPNG() }));
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(({ s, buf }, i) => {
    const o = 6 + 16 * i;
    head.writeUInt8(s >= 256 ? 0 : s, o); head.writeUInt8(s >= 256 ? 0 : s, o + 1);
    head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6);
    head.writeUInt32LE(buf.length, o + 8); head.writeUInt32LE(offset, o + 12);
    offset += buf.length;
  });
  return Buffer.concat([head, ...pngs.map((p) => p.buf)]);
}
/** Imagem quadrada 256×256 (centralizada, sem distorcer). */
function squareIcon(img) {
  const { width, height } = img.getSize();
  if (!width || !height) return null;
  if (width === height) return img.resize({ width: 256, height: 256, quality: 'best' });
  const side = Math.min(width, height);
  return img.crop({ x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), width: side, height: side }).resize({ width: 256, height: 256, quality: 'best' });
}
/** O ícone do app (64 px) para a interface. */
function iconData(id) {
  const img = nativeImage.createFromPath(iconPaths(id).png);
  return img.isEmpty() ? '' : img.resize({ width: 64, height: 64, quality: 'best' }).toDataURL();
}
const iconPaths = (id) => ({ png: path.join(dir(), `${id}.png`), ico: path.join(dir(), `${id}.ico`) });

/* ───────────── O que a página oferece (manifest) ───────────── */
async function fetchWith(ses, url, timeout = 8000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await (ses.fetch ? ses.fetch(url, { signal: ctl.signal }) : fetch(url, { signal: ctl.signal }));
    if (!r.ok) return null;
    return r;
  } catch { return null; } finally { clearTimeout(timer); }
}
const sizeOf = (s) => Math.max(0, ...String(s || '').split(/\s+/).map((x) => (x === 'any' ? 512 : Number(x.split('x')[0]) || 0)));

async function inspect(wc) {
  const page = await wc.executeJavaScript(`(() => {
    const q = (s) => document.querySelector(s);
    const icons = [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]')]
      .map((l) => ({ href: l.href, sizes: l.getAttribute('sizes') || (l.rel.includes('apple') ? '180x180' : ''), type: l.type || '' }));
    return { url: location.href, title: document.title, manifest: q('link[rel="manifest"]')?.href || '',
      theme: q('meta[name="theme-color"]')?.content || '', appName: q('meta[name="application-name"]')?.content || q('meta[name="apple-mobile-web-app-title"]')?.content || '', icons };
  })()`, true).catch(() => null);
  if (!page || !isWeb(page.url)) return null;
  const origin = new URL(page.url).origin;
  const out = { url: page.url, name: page.appName || page.title || new URL(page.url).hostname, startUrl: `${origin}/`, scope: `${origin}/`, themeColor: page.theme, hasManifest: false, icon: null };
  let candidates = page.icons.map((i) => ({ src: i.href, size: sizeOf(i.sizes) || 32, type: i.type }));
  if (page.manifest && isWeb(page.manifest)) {
    const r = await fetchWith(wc.session, page.manifest);
    const m = r && await r.json().catch(() => null);
    if (m && typeof m === 'object') {
      out.hasManifest = true;
      const abs = (u) => { try { return new URL(u, page.manifest).href; } catch { return ''; } };
      out.name = String(m.name || m.short_name || out.name);
      const start = abs(m.start_url || '/');
      // o endereço inicial e o escopo precisam ser do mesmo site da página (como no Chrome)
      if (isWeb(start) && new URL(start).origin === origin) out.startUrl = start;
      const scope = m.scope ? abs(m.scope) : out.startUrl.replace(/[^/]*$/, '');
      if (isWeb(scope) && new URL(scope).origin === origin && out.startUrl.startsWith(scope)) out.scope = scope;
      if (typeof m.theme_color === 'string') out.themeColor = m.theme_color;
      const icons = Array.isArray(m.icons) ? m.icons : [];
      candidates = [...icons.filter((i) => !/monochrome/.test(i.purpose || '')).map((i) => ({ src: abs(i.src), size: sizeOf(i.sizes), type: i.type || '' })), ...candidates];
    }
  }
  // o maior ícone em PNG/JPEG/ICO (SVG não serve para o atalho); de preferência entre 144 e 512
  candidates = candidates.filter((c) => isWeb(c.src) && !/svg/i.test(c.type) && !/\.svg(\?|$)/i.test(c.src));
  candidates.sort((a, b) => (b.size >= 144 && b.size <= 512 ? 1000 : 0) + b.size - ((a.size >= 144 && a.size <= 512 ? 1000 : 0) + a.size));
  for (const c of candidates.slice(0, 6)) {
    const r = await fetchWith(wc.session, c.src);
    const buf = r && Buffer.from(await r.arrayBuffer().catch(() => new ArrayBuffer(0)));
    const img = buf?.length ? nativeImage.createFromBuffer(buf) : null;
    const sq = img && !img.isEmpty() ? squareIcon(img) : null;
    if (sq) { out.icon = sq.toDataURL(); break; }
  }
  out.name = cleanName(out.name) || new URL(page.url).hostname;
  return out;
}

/* ───────────── Atalhos do Windows ───────────── */
const appUserModelId = (id) => `com.ruben-acevedo.kona.app.${id}`;
// No Kona de desenvolvimento o executável é o electron.exe: o atalho também leva a pasta do app
const launchArgs = (id) => [...(app.isPackaged ? [] : [`"${app.getAppPath()}"`]), `${ARG}${id}`].join(' ');
const shortcutDirs = () => {
  const base = process.env.KONA_SHORTCUT_DIR; // testes: uma pasta à parte, sem mexer no menu Iniciar
  return {
    start: base ? path.join(base, 'Start Menu') : path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Kona Apps'),
    desktop: base ? path.join(base, 'Desktop') : app.getPath('desktop'),
  };
};
function writeShortcuts(a) {
  if (process.platform !== 'win32') return [];
  const { start, desktop } = shortcutDirs();
  const where = [start, ...(a.desktop ? [desktop] : [])];
  const made = [];
  for (const d of where) {
    try {
      fs.mkdirSync(d, { recursive: true });
      const p = path.join(d, `${cleanName(a.name) || 'App'}.lnk`);
      const ok = shell.writeShortcutLink(p, 'create', {
        target: process.execPath, args: launchArgs(a.id), icon: iconPaths(a.id).ico, iconIndex: 0,
        appUserModelId: appUserModelId(a.id), description: a.name, cwd: path.dirname(process.execPath),
      });
      if (ok) made.push(p);
    } catch (err) { console.error('apps: shortcut failed', err?.message); }
  }
  return made;
}
function removeShortcuts(a) {
  for (const p of a.shortcuts || []) { try { fs.rmSync(p, { force: true }); } catch { /* já não existe */ } }
  // pasta "Kona Apps" vazia: sai do menu Iniciar
  try { const { start } = shortcutDirs(); if (!fs.readdirSync(start).length) fs.rmdirSync(start); } catch { /* não existe */ }
}

/* ───────────── Registro (IPC) ───────────── */
function register({ openAppWindow, openInBrowser, appWindows, broadcast }) {
  const publicInfo = (a) => a && ({ id: a.id, name: a.name, startUrl: a.startUrl, scope: a.scope, partition: a.partition, themeColor: a.themeColor, icon: iconData(a.id), desktop: !!a.desktop });
  const changed = () => broadcast('apps:changed', list().map(publicInfo));

  handleUi('app:inspect', (_e, wcId) => {
    const wc = webContents.fromId(Number(wcId));
    return wc && wc.getType() === 'webview' ? inspect(wc) : null;
  });
  // a aba tem um app instalado para ela? (o ícone da barra mostra "Abrir no app")
  handleUi('app:check', async (_e, wcId, partition) => {
    const wc = webContents.fromId(Number(wcId));
    if (!wc || wc.getType() !== 'webview') return null;
    const url = wc.getURL();
    const installed = appFor(url, partition);
    const manifest = installed ? true : await wc.executeJavaScript('!!document.querySelector(\'link[rel="manifest"]\')', true).catch(() => false);
    return { manifest: !!manifest, installed: installed ? installed.id : null };
  });
  handleUi('app:install', async (_e, req) => {
    if (!req || !isWeb(req.startUrl) || !isWeb(req.scope) || !validPartition(req.partition)) return null;
    if (!req.startUrl.startsWith(req.scope)) return null;
    const name = cleanName(req.name);
    if (!name) return null;
    const img = typeof req.icon === 'string' && /^data:image\/(png|jpeg);base64,/.test(req.icon) ? nativeImage.createFromDataURL(req.icon) : null;
    const sq = img && !img.isEmpty() ? squareIcon(img) : null;
    if (!sq) return null;
    const id = crypto.createHash('sha1').update(`${req.partition}|${req.scope}`).digest('hex').slice(0, 12);
    const old = get(id);
    if (old) removeShortcuts(old);
    fs.mkdirSync(dir(), { recursive: true });
    const p = iconPaths(id);
    fs.writeFileSync(p.png, sq.toPNG());
    fs.writeFileSync(p.ico, icoFrom(sq));
    const a = { id, name, startUrl: req.startUrl, scope: req.scope, partition: req.partition, themeColor: typeof req.themeColor === 'string' ? req.themeColor.slice(0, 40) : '', desktop: !!req.desktop, installed: old?.installed || Date.now(), updated: Date.now() };
    a.shortcuts = writeShortcuts(a);
    cache = [...list().filter((x) => x.id !== id), a];
    save();
    changed();
    if (req.open !== false) openAppWindow(a, isWeb(req.openUrl) && req.openUrl.startsWith(a.scope) ? req.openUrl : a.startUrl);
    return publicInfo(a);
  });
  handleUi('app:list', () => list().map(publicInfo));
  handleUi('app:get', (_e, id) => publicInfo(get(id)));
  handleUi('app:open', (_e, id, url) => { const a = get(id); if (a) openAppWindow(a, isWeb(url) && url.startsWith(a.scope) ? url : a.startUrl); return !!a; });
  handleUi('app:uninstall', (_e, id) => {
    const a = get(id);
    if (!a) return false;
    removeShortcuts(a);
    for (const f of Object.values(iconPaths(id))) { try { fs.rmSync(f, { force: true }); } catch { /* já não existe */ } }
    cache = list().filter((x) => x.id !== id);
    save();
    for (const w of appWindows(id)) w.close();
    changed();
    return true;
  });
  onUi('app:browser', (_e, url) => openInBrowser(typeof url === 'string' ? url : ''));
}

module.exports = { register, list, get, appIdFrom, appUserModelId, launchArgs, iconPaths, ARG };
