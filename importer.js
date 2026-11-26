// Importar de outro navegador (Chrome, Edge, Brave): favoritos (com pastas), histórico e extensões.
// Lê os arquivos do perfil do navegador direto do disco. O histórico (SQLite) é copiado antes de
// abrir, para funcionar com o navegador aberto. Senhas e cookies não: o Chrome os criptografa de
// um jeito que só ele lê. Extensões são reinstaladas da Chrome Web Store (as configurações
// internas de cada uma não vêm).
const { app, nativeImage } = require('electron');
const fs = require('fs');
const { tl } = require('./i18n');
const os = require('os');
const path = require('path');
const { installExtension } = require('electron-chrome-web-store');

const WEBKIT_EPOCH_MS = 11644473600000; // o Chromium conta microssegundos desde 1601
// as datas do Chromium passam do maior inteiro seguro do JS: a conversão para ms (Unix) é feita no SQL
const T_MS = `(last_visit_time / 1000 - ${WEBKIT_EPOCH_MS})`;
const STORE_UPDATE = /^https:\/\/clients2\.google\.com\/service\/update2\/crx/;
const MAX_VISITS = 600; // os mesmos limites do histórico do Kona (renderer/omnibox.js)
const MAX_SEARCHES = 300;

function browserDirs() {
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return [
      ['chrome', 'Google Chrome', path.join(local, 'Google', 'Chrome', 'User Data')],
      ['edge', 'Microsoft Edge', path.join(local, 'Microsoft', 'Edge', 'User Data')],
      ['brave', 'Brave', path.join(local, 'BraveSoftware', 'Brave-Browser', 'User Data')],
    ];
  }
  const cfg = path.join(os.homedir(), '.config');
  return [
    ['chrome', 'Google Chrome', path.join(cfg, 'google-chrome')],
    ['edge', 'Microsoft Edge', path.join(cfg, 'microsoft-edge')],
    ['brave', 'Brave', path.join(cfg, 'BraveSoftware', 'Brave-Browser')],
  ];
}

const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch { return null; } };

/** Navegadores e perfis encontrados: [{ id: 'chrome:Default', browser, profile }]. */
function sources() {
  const out = [];
  for (const [key, browser, dir] of browserDirs()) {
    if (!fs.existsSync(dir)) continue;
    const cache = readJson(path.join(dir, 'Local State'))?.profile?.info_cache || {};
    const dirs = Object.keys(cache).length ? Object.keys(cache) : ['Default'];
    for (const d of dirs) {
      if (!/^[\w .-]+$/.test(d) || !fs.existsSync(path.join(dir, d))) continue;
      out.push({ id: `${key}:${d}`, browser, profile: cache[d]?.name || d, dir: path.join(dir, d) });
    }
  }
  return out;
}

/* ───────────── Favoritos ───────────── */
let seq = 0;
const nid = () => `i${Date.now().toString(36)}${(seq++).toString(36)}`;
function convert(node) {
  if (node.type === 'url') return /^https?:/i.test(node.url || '') ? { id: nid(), title: node.name || node.url, url: node.url } : null;
  const children = (node.children || []).map(convert).filter(Boolean);
  return { id: nid(), title: node.name || 'Folder', folder: true, children };
}
function readBookmarks(dir) {
  const roots = readJson(path.join(dir, 'Bookmarks'))?.roots;
  if (!roots) return [];
  // a barra de favoritos vai para o nível principal; "Outros" e "Celular" viram pastas
  const list = (roots.bookmark_bar?.children || []).map(convert).filter(Boolean);
  for (const [k, title] of [['other', tl('Other favorites')], ['synced', tl('Mobile favorites')]]) {
    const f = roots[k] && convert(roots[k]);
    if (f?.children.length) { f.title = title; list.push(f); }
  }
  return list;
}
const countUrls = (list) => list.reduce((n, b) => n + (b.folder ? countUrls(b.children) : 1), 0);

/* ───────────── Histórico ───────────── */
function readHistory(dir) {
  const src = path.join(dir, 'History');
  if (!fs.existsSync(src)) return { visits: [], searches: [] };
  const tmp = path.join(os.tmpdir(), `kona-import-${process.pid}-${Date.now()}.sqlite`);
  fs.copyFileSync(src, tmp);
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(tmp, { readOnly: true });
  try {
    // os mais recentes e os mais visitados, até o limite do Kona
    const recent = db.prepare(`SELECT url, title, visit_count n, ${T_MS} t FROM urls
      WHERE hidden = 0 AND url LIKE 'http%' ORDER BY last_visit_time DESC LIMIT ${Math.round(MAX_VISITS * 0.65)}`).all();
    const frequent = db.prepare(`SELECT url, title, visit_count n, ${T_MS} t FROM urls
      WHERE hidden = 0 AND url LIKE 'http%' ORDER BY visit_count DESC, last_visit_time DESC LIMIT ${MAX_VISITS}`).all();
    const byUrl = new Map();
    for (const r of [...recent, ...frequent]) {
      if (byUrl.size >= MAX_VISITS && !byUrl.has(r.url)) break;
      if (!byUrl.has(r.url)) byUrl.set(r.url, { url: r.url, title: r.title || '', n: Math.max(1, Number(r.n) || 1), t: Math.max(0, Number(r.t) || 0) });
    }
    let searches = [];
    try {
      searches = db.prepare(`SELECT k.term q, MAX(u.last_visit_time / 1000 - ${WEBKIT_EPOCH_MS}) t, COUNT(*) n FROM keyword_search_terms k
        JOIN urls u ON u.id = k.url_id GROUP BY k.normalized_term ORDER BY t DESC LIMIT ${MAX_SEARCHES}`).all()
        .filter((r) => r.q).map((r) => ({ q: String(r.q), n: Number(r.n) || 1, t: Math.max(0, Number(r.t) || 0) }));
    } catch { /* tabela ausente em versões antigas: segue sem buscas */ }
    return { visits: [...byUrl.values()].sort((a, b) => b.t - a.t), searches };
  } finally {
    db.close();
    fs.rmSync(tmp, { force: true });
  }
}

/* ───────────── Extensões ───────────── */
function localized(extDir, manifest, text) {
  const m = /^__MSG_(.+)__$/.exec(text || '');
  if (!m) return text || '';
  const key = m[1].toLowerCase();
  for (const loc of [app.getLocale().replace('-', '_'), app.getLocale().split('-')[0], manifest.default_locale, 'en']) {
    if (!loc) continue;
    const msgs = readJson(path.join(extDir, '_locales', loc, 'messages.json'));
    const hit = msgs && Object.entries(msgs).find(([k]) => k.toLowerCase() === key);
    if (hit) return hit[1].message;
  }
  return text;
}
function iconOf(extDir, manifest) {
  const icons = manifest.icons || {};
  const size = Object.keys(icons).map(Number).sort((a, b) => b - a).find((s) => s <= 128);
  if (!size) return null;
  const img = nativeImage.createFromPath(path.join(extDir, icons[size]));
  return img.isEmpty() ? null : img.resize({ width: 40, quality: 'best' }).toDataURL();
}
/** Extensões da Chrome Web Store instaladas pela pessoa (sem as internas do navegador e sem temas). */
function readExtensions(dir) {
  const prefs = { ...(readJson(path.join(dir, 'Preferences'))?.extensions?.settings || {}),
    ...(readJson(path.join(dir, 'Secure Preferences'))?.extensions?.settings || {}) };
  const root = path.join(dir, 'Extensions');
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const id of fs.readdirSync(root)) {
    if (!/^[a-p]{32}$/.test(id)) continue;
    const p = prefs[id] || {};
    if (p.was_installed_by_default || (p.location && p.location !== 1)) continue;
    const versions = fs.readdirSync(path.join(root, id)).filter((v) => fs.existsSync(path.join(root, id, v, 'manifest.json')));
    if (!versions.length) continue;
    const extDir = path.join(root, id, versions.sort().at(-1));
    const manifest = readJson(path.join(extDir, 'manifest.json'));
    if (!manifest || manifest.theme || !STORE_UPDATE.test(manifest.update_url || '')) continue;
    const disabled = (Array.isArray(p.disable_reasons) ? p.disable_reasons.length : !!p.disable_reasons) || p.state === 0;
    out.push({ id, name: p.manifest?.name && !/^__MSG_/.test(p.manifest.name) ? p.manifest.name : localized(extDir, manifest, manifest.name),
      icon: iconOf(extDir, manifest), enabled: !disabled });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** O que dá para importar de uma fonte (sem mudar nada no Kona). */
function read(id) {
  const src = sources().find((s) => s.id === id);
  if (!src) return null;
  const result = { id, browser: src.browser, profile: src.profile, errors: [] };
  const step = (key, fn, empty) => { try { result[key] = fn(); } catch (err) { result[key] = empty; result.errors.push(`${key}: ${err.code || err.message}`); } };
  step('bookmarks', () => readBookmarks(src.dir), []);
  result.bookmarkCount = countUrls(result.bookmarks);
  step('history', () => readHistory(src.dir), { visits: [], searches: [] });
  step('extensions', () => readExtensions(src.dir), []);
  return result;
}

/**
 * A extensão ainda está na Chrome Web Store? A loja responde 204 (vazio) para as que saíram dela.
 * null = não deu para saber (sem internet): a instalação tenta mesmo assim.
 */
async function inStore(id) {
  const url = `https://clients2.google.com/service/update2/crx?response=redirect&acceptformat=crx2,crx3&x=${encodeURIComponent(`id=${id}&uc`)}&prodversion=${process.versions.chrome}`;
  try {
    const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(6000) });
    return r.status !== 204 && r.status !== 404;
  } catch { return null; }
}

/** Liga os canais da interface. `session` e `extensionsPath` são os do perfil em uso no Kona. */
function registerImporter(handleUi, { currentSession, currentExtensionsPath }) {
  handleUi('import:sources', () => sources().map(({ id, browser, profile }) => ({ id, browser, profile })));
  handleUi('import:read', async (_e, id) => {
    const data = read(String(id));
    if (data) await Promise.all(data.extensions.map(async (e) => { e.available = await inStore(e.id); }));
    return data;
  });
  handleUi('import:extension', async (_e, id) => {
    if (!/^[a-p]{32}$/.test(String(id))) return false;
    try {
      await installExtension(id, { session: currentSession(), extensionsPath: currentExtensionsPath() });
      return true;
    } catch (err) {
      console.error('extension import failed', id, err?.message);
      return false;
    }
  });
}

module.exports = { registerImporter, sources, read };
