'use strict';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const api = window.kona;
const params = new URLSearchParams(location.search);

/* ───────────── Ícones ───────────── */
const ICONS = {
  sidebar: '<rect x="3" y="4.5" width="18" height="15" rx="3.5"/><path d="M9.5 4.5v15"/>',
  back: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  forward: '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  reload: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4.5H15"/>',
  x: '<path d="M7 7l10 10M17 7 7 17"/>',
  compass: '<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  tabs: '<rect x="3.5" y="6.5" width="17" height="13" rx="3"/><path d="M7 6.5V5.8A1.8 1.8 0 0 1 8.8 4h6.4A1.8 1.8 0 0 1 17 5.8v.7"/>',
  hand: '<path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11"/><path d="M11 10.5V5a1.5 1.5 0 0 1 3 0v6"/><path d="M14 10.5V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.5a6 6 0 0 1-4.6-2.2L3.6 15a1.5 1.5 0 0 1 2.2-2L8 15"/>',
  folder: '<path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h3.6l2 2h7.4a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  book: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15.5H5.5A1.5 1.5 0 0 1 4 18z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15.5h5.5A1.5 1.5 0 0 0 20 18z"/>',
  glasses: '<circle cx="6.5" cy="14.5" r="3.5"/><circle cx="17.5" cy="14.5" r="3.5"/><path d="M10 14.5a2 2 0 0 1 4 0"/><path d="M3 14l2-7h2M21 14l-2-7h-2"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  shield: '<path d="M12 3.5 19 6v5.5c0 4.4-2.9 7.6-7 9-4.1-1.4-7-4.6-7-9V6z"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  puzzle: '<path d="M10 4.8a2 2 0 1 1 4 0V6h3.5A1.5 1.5 0 0 1 19 7.5V11h-1.2a2 2 0 1 0 0 4H19v3.5a1.5 1.5 0 0 1-1.5 1.5H14v-1.2a2 2 0 1 0-4 0V20H6.5A1.5 1.5 0 0 1 5 18.5V15h1.2a2 2 0 1 0 0-4H5V7.5A1.5 1.5 0 0 1 6.5 6H10z"/>',
  store: '<path d="M4 9h16l-1.2 9.6A1.6 1.6 0 0 1 17.2 20H6.8a1.6 1.6 0 0 1-1.6-1.4z"/><path d="M8.5 9V7.5a3.5 3.5 0 0 1 7 0V9"/>',
  chevron: '<path d="m8 10 4 4 4-4"/>',
  star: '<path d="m12 3.8 2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.5-2-3.4-2.3 1a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.5 2.6A7.6 7.6 0 0 0 6.9 6.6l-2.3-1-2 3.4 2 1.5a7.6 7.6 0 0 0 0 3l-2 1.5 2 3.4 2.3-1a7.6 7.6 0 0 0 2.6 1.5l.5 2.6h4l.5-2.6a7.6 7.6 0 0 0 2.6-1.5l2.3 1 2-3.4z"/>',
  mic: '<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5"/>',
  thumbtack: '<path d="M9 4.5h6M10 4.5v5.2L7.5 13h9L14 9.7V4.5M12 13v6.5"/>',
  volume: '<path d="M4.5 9.5h3l4-3.5v12l-4-3.5h-3z"/><path d="M15 9.2a4 4 0 0 1 0 5.6M17.6 6.8a7.5 7.5 0 0 1 0 10.4"/>',
  volumeOff: '<path d="M4.5 9.5h3l4-3.5v12l-4-3.5h-3z"/><path d="m15.5 9.5 5 5M20.5 9.5l-5 5"/>',
  reader: '<rect x="4.5" y="4" width="15" height="16" rx="2.5"/><path d="M8 8.5h8M8 12h8M8 15.5h5"/>',
  speaker: '<path d="M4.5 9.5h3l4-3.5v12l-4-3.5h-3z"/><path d="M15 9.2a4 4 0 0 1 0 5.6"/>',
  key: '<circle cx="8" cy="14.5" r="3.8"/><path d="m10.7 11.8 8.3-8.3M15.5 7.3l2.2 2.2M17.6 5.2l1.6 1.6"/>',
  eye: '<path d="M2.8 12s3.4-6.2 9.2-6.2 9.2 6.2 9.2 6.2-3.4 6.2-9.2 6.2S2.8 12 2.8 12z"/><circle cx="12" cy="12" r="2.8"/>',
  eyeOff: '<path d="M2.8 12s3.4-6.2 9.2-6.2c1.6 0 3 .5 4.2 1.1M21.2 12s-3.4 6.2-9.2 6.2c-1.6 0-3-.5-4.2-1.1"/><path d="M4 20 20 4"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
  pin: '<path d="M12 21s6.5-6.1 6.5-11.2a6.5 6.5 0 0 0-13 0C5.5 14.9 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.4"/>',
  bell: '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  clipboard: '<rect x="5.5" y="5" width="13" height="15.5" rx="2.5"/><path d="M9 5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/>',
  external: '<path d="M13.5 4.5h6v6M19.5 4.5l-8 8"/><path d="M17.5 13.5v4a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h4"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
  play: '<path d="M8.5 6.2v11.6a.8.8 0 0 0 1.2.7l9.2-5.8a.8.8 0 0 0 0-1.4L9.7 5.5a.8.8 0 0 0-1.2.7z"/>',
  pause: '<path d="M9 6v12M15 6v12"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
  cookie: '<path d="M20.5 12.5A8.5 8.5 0 1 1 11.5 3.5a3 3 0 0 0 3.6 3.4 3 3 0 0 0 3.3 3.6 2.5 2.5 0 0 0 2.1 2z"/><circle cx="9" cy="10" r=".9"/><circle cx="14" cy="15" r=".9"/><circle cx="9.5" cy="15.5" r=".9"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
  user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 19.5a7 7 0 0 1 14 0"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.3-1.3-1.5-1.3-2.8 0-1 .8-1.8 1.8-1.8h2.2a4 4 0 0 0 4-4C20.5 6.8 16.7 3.5 12 3.5z"/><circle cx="7.8" cy="11" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15" cy="7.8" r="1"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 4.5 4.5"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.3 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.3-3.5-8.5s1.1-6.1 3.5-8.5z"/>',
  pencil: '<path d="M15.5 5.5l3 3L9 18H6v-3z"/><path d="M13.5 7.5l3 3"/>',
  check: '<path d="m5.5 12.5 4 4 9-9"/>',
  camera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="13" r="3.5"/>',
  image: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5"/>',
};
const icon = (name) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
const hydrateIcons = (root = document) =>
  $$('[data-icon]', root).forEach((el) => {
    if (!el.querySelector('svg')) el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon));
  });

const WIN_ICONS = {
  max: '<svg viewBox="0 0 16 16"><rect x="3.5" y="3.5" width="9" height="9" rx="2"/></svg>',
  restore: '<svg viewBox="0 0 16 16"><rect x="3" y="5.5" width="7.5" height="7.5" rx="1.8"/><path d="M5.5 5.5V4.8A1.8 1.8 0 0 1 7.3 3h3.9A1.8 1.8 0 0 1 13 4.8v3.9a1.8 1.8 0 0 1-1.8 1.8h-.7"/></svg>',
};

/* ───────────── Utilidades ───────────── */
const START = 'kona://start';
const hostOf = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
};
const brandOf = (url) => {
  const host = hostOf(url);
  if (/^[\d.:]+$/.test(host) || host === 'localhost') return host; // IP / localhost: sem "marca"
  const parts = host.split('.');
  return parts.length > 1 ? parts[parts.length - 2] : parts[0];
};
const monogram = (name) => `<span class="mono">${(name[0] || '?').toUpperCase()}</span>`;
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function luminance(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const ENGINES = {
  google: { name: 'Google', url: 'https://www.google.com/search?q=' },
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=' },
  ecosia: { name: 'Ecosia', url: 'https://www.ecosia.org/search?q=' },
  brave: { name: 'Brave Search', url: 'https://search.brave.com/search?q=' },
};
const engine = () => ENGINES[settings.searchEngine] || ENGINES.google;
const isSearchUrl = (url) => Object.values(ENGINES).some((e) => url.startsWith(e.url));
/**
 * Endereço da busca. No Google, no mesmo formato da barra de endereço do Chrome (oq, sourceid,
 * ie): um "/search?q=" sem mais nada, vindo de um cliente novo, é o padrão de robôs que coletam
 * resultados, e a primeira busca caía na verificação "não sou um robô".
 */
function searchUrl(q, typed = q) {
  const e = engine();
  const enc = encodeURIComponent(q);
  if (e === ENGINES.google) return `${e.url}${enc}&oq=${encodeURIComponent(typed)}&sourceid=chrome&ie=UTF-8`;
  return e.url + enc;
}
const SETTINGS = 'kona://settings';
const isInternal = (url) => url === START || url === SETTINGS;

function toUrl(input) {
  const q = input.trim();
  if (!q) return null;
  if (/^(https?|file|about|data):/i.test(q) || /^view-source:https?:/i.test(q)) return q;
  if (/^kona:\/\/(settings|configura[cç](o|õ)es)\/?$/i.test(q)) return SETTINGS;
  if (/^localhost(:\d+)?(\/|$)/i.test(q) || /^[\d.]+(:\d+)?(\/|$)/.test(q)) return 'http://' + q;
  if (/^[^\s]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(q)) return 'https://' + q;
  return searchUrl(q);
}

// Ícones guardados no app para sites populares cujo ícone não está no endereço padrão
// (ou que exigem login): aparecem na hora, sem rede (renderer/sites/)
const LOCAL_ICONS = {
  'mail.google.com': 'gmail.png', 'chatgpt.com': 'chatgpt.png', 'youtube.com': 'youtube.png',
  'reddit.com': 'reddit.png', 'netflix.com': 'netflix.png', 'web.whatsapp.com': 'whatsapp.png',
  'en.wikipedia.org': 'wikipedia.png', 'instagram.com': 'instagram.webp', 'open.spotify.com': 'spotify.png',
};

/** Ícone do site: ícone do app, ou o ícone grande do site, depois o favicon, por fim a letra. */
function siteIcon(url, letterClass = '') {
  const origin = (() => { try { return new URL(url).origin; } catch { return ''; } })();
  const letter = brandOf(url)[0]?.toUpperCase() || '?';
  const local = LOCAL_ICONS[hostOf(url)];
  if (local) return `<img src="sites/${local}" data-fallback="${origin}/favicon.ico" data-letter="${letter}" class="${letterClass}" alt="" />`;
  return `<img src="${origin}/apple-touch-icon.png" data-fallback="${origin}/favicon.ico" data-letter="${letter}" class="${letterClass}" alt="" />`;
}
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.dataset.letter) return;
  if (img.dataset.fallback) {
    img.src = img.dataset.fallback;
    delete img.dataset.fallback;
  } else {
    img.replaceWith(document.createTextNode(img.dataset.letter));
  }
}, true);

let toastTimer;
/** Aviso rápido; com `action` ({ label, run }) ganha um botão e fica mais tempo. */
function toast(msg, action) {
  const t = $('#toast');
  t.textContent = msg;
  if (action) {
    const b = document.createElement('button');
    b.className = 'toast-act';
    b.textContent = action.label;
    b.addEventListener('click', () => { action.run(); t.classList.remove('show'); });
    t.append(b);
  }
  t.classList.toggle('actionable', !!action);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), action ? 5000 : 1800);
}

/* ───────────── Ajustes (salvos localmente) ───────────── */
const SECTIONS = [
  { id: 'favorites', name: 'Favorites' },
  { id: 'frequent', name: 'Frequently Visited' },
  { id: 'privacy', name: 'Privacy Report' },
  { id: 'reading', name: 'Reading List' },
];
const AURORA = {
  light: 'radial-gradient(60% 70% at 12% 8%, #a9c9ff 0%, transparent 70%), radial-gradient(50% 60% at 92% 12%, #f6c6e2 0%, transparent 70%), radial-gradient(60% 60% at 40% 105%, #ffdcb0 0%, transparent 70%), radial-gradient(45% 50% at 88% 95%, #c3b4ff 0%, transparent 70%), #eceef6',
  dark: 'radial-gradient(60% 70% at 12% 8%, rgba(40,90,190,.55) 0%, transparent 70%), radial-gradient(50% 60% at 92% 12%, rgba(120,50,125,.5) 0%, transparent 70%), radial-gradient(60% 60% at 40% 105%, rgba(140,85,35,.45) 0%, transparent 70%), radial-gradient(45% 50% at 88% 95%, rgba(70,50,160,.5) 0%, transparent 70%), #121319',
};
const WALLPAPERS = [
  { id: 'aurora', name: 'Aurora', tone: 'theme' },
  { id: 'grafite', name: 'Graphite', tone: 'dark', css: 'radial-gradient(120% 90% at 50% 0%, #2a2a2f 0%, #161618 60%, #0e0e10 100%)' },
  { id: 'noite', name: 'Night', tone: 'dark', css: 'radial-gradient(90% 70% at 15% 0%, #22305e 0%, transparent 60%), radial-gradient(80% 60% at 95% 100%, #3a1f52 0%, transparent 60%), #0c0e18' },
  { id: 'oceano', name: 'Ocean', tone: 'dark', css: 'linear-gradient(165deg, #0d2230 0%, #1a4559 55%, #3c7a86 100%)' },
  { id: 'floresta', name: 'Forest', tone: 'dark', css: 'linear-gradient(165deg, #101712 0%, #1f3326 55%, #46664b 100%)' },
  { id: 'brasa', name: 'Ember', tone: 'dark', css: 'radial-gradient(100% 80% at 85% 100%, #b5432c 0%, transparent 60%), radial-gradient(80% 70% at 10% 0%, #521c36 0%, transparent 60%), #180e12' },
  { id: 'areia', name: 'Sand', tone: 'light', css: 'linear-gradient(165deg, #f5efe7 0%, #e2d2bf 100%)' },
  { id: 'nevoa', name: 'Mist', tone: 'light', css: 'linear-gradient(180deg, #f6f6f8 0%, #e1e2e7 100%)' },
];
const DEFAULTS = {
  theme: 'dark',
  wallpaper: 'aurora',
  customImage: null,
  customImageTone: 'dark',
  customColor: '#1e2430',
  sections: { favorites: true, frequent: false, privacy: false, reading: false },
  // Geral
  startup: 'newtab', searchEngine: 'google', suggestions: true, saveHistory: true, zoom: 1, sounds: true,
  // Privacidade (aplicadas no processo principal — ver session-policy.js)
  cookies: 'block-third-party', clearOnExit: false, gpc: true, httpsFirst: true, secureDns: true,
  permissions: { camera: 'ask', microphone: 'ask', location: 'ask', notifications: 'ask', clipboard: 'ask', apps: 'ask' },
  sites: {},
  siteZoom: {}, // zoom guardado por site (host → fator), como no Chrome
  offerPasswords: true, // oferecer salvar senhas (o gerenciador do Kona)
  reader: { size: 5, font: 'system', theme: null }, // modo leitura (theme null = segue o tema do Kona)
  readerAuto: {}, // sites em que o modo leitura abre sozinho
  // Downloads
  downloadDir: null, downloadAsk: false,
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(profileKey('settings'));
    const s = JSON.parse(raw || '{}');
    const base = structuredClone(DEFAULTS);
    return { ...base, ...s, sections: { ...base.sections, ...(s.sections || {}) }, permissions: { ...base.permissions, ...(s.permissions || {}) }, sites: s.sites || {} };
  } catch {
    return structuredClone(DEFAULTS);
  }
}
const settings = loadSettings();
/** Troca o conteúdo dos ajustes pelo do perfil atual (o objeto continua o mesmo). */
function reloadSettings() {
  const fresh = loadSettings();
  for (const k of Object.keys(settings)) delete settings[k];
  Object.assign(settings, fresh);
  syncPrefs();
}
/** Envia ao processo principal os ajustes que ele aplica (cookies, GPC, permissões, downloads). */
const PREF_KEYS = ['cookies', 'gpc', 'clearOnExit', 'httpsFirst', 'secureDns', 'permissions', 'sites', 'downloadDir', 'downloadAsk'];
function syncPrefs() {
  const p = {};
  for (const k of PREF_KEYS) p[k] = settings[k];
  api?.setPrefs(PROFILES.currentProfile().partition, p);
}
function saveSettings() {
  try {
    localStorage.setItem(profileKey('settings'), JSON.stringify(settings));
    syncPrefs();
    return true;
  } catch {
    toast('Couldn’t save: the image is too large');
    return false;
  }
}

const darkMq = matchMedia('(prefers-color-scheme: dark)');
let isDark = true;
function applyTheme(animate = false) {
  const run = () => {
    const pref = params.get('theme') || settings.theme;
    api?.setTheme(pref);
    isDark = pref === 'system' ? darkMq.matches : pref === 'dark';
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    $$('#seg-theme button').forEach((b) => b.classList.toggle('on', b.dataset.theme === settings.theme));
    applyWallpaper();
  };
  // Troca animada com View Transitions: o Chromium faz um fade entre uma "foto" da interface
  // antes e a interface nova (duas camadas na GPU), em vez de animar a cor de cada elemento.
  if (animate && document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.startViewTransition(run);
  } else {
    run();
  }
}
darkMq.addEventListener('change', () => settings.theme === 'system' && applyTheme(true));

function wallpaperStyle() {
  const id = settings.wallpaper;
  if (id === 'image' && settings.customImage)
    return { css: `center / cover no-repeat url("${settings.customImage}")`, tone: settings.customImageTone };
  if (id === 'color') return { css: settings.customColor, tone: luminance(settings.customColor) > 0.4 ? 'light' : 'dark' };
  const w = WALLPAPERS.find((x) => x.id === id) || WALLPAPERS[0];
  if (w.tone === 'theme') return { css: isDark ? AURORA.dark : AURORA.light, tone: isDark ? 'dark' : 'light' };
  return { css: w.css, tone: w.tone };
}

/** Troca o fundo com fade: nova camada entra por cima, a antiga sai depois. */
function applyWallpaper() {
  const { css, tone } = wallpaperStyle();
  const wp = $('#start .wallpaper');
  const current = wp.lastElementChild;
  if (current?.dataset.css !== css) {
    const layer = document.createElement('div');
    layer.className = 'wp-layer';
    layer.dataset.css = css;
    layer.style.background = css;
    wp.appendChild(layer);
    requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add('in')));
    layer.addEventListener('transitionend', () => {
      while (wp.firstElementChild !== layer) wp.firstElementChild.remove();
    }, { once: true });
  }
  $('#start').classList.toggle('tone-dark', tone === 'dark');
  $('#start').classList.toggle('tone-light', tone === 'light');
  syncToolbarTone();
  $$('.wp-swatch[data-wp]').forEach((b) => b.classList.toggle('on', b.dataset.wp === settings.wallpaper));
}

function applySections() {
  SECTIONS.forEach((s) => { $(`#sec-${s.id}`).hidden = !settings.sections[s.id]; });
  $$('#toggles .toggle').forEach((t) => t.classList.toggle('on', !!settings.sections[t.dataset.sec]));
  $('#tg-sounds').classList.toggle('on', settings.sounds !== false);
}

/* ───────────── Painel Personalizar ───────────── */
function buildCustomize() {
  const grid = $('#wp-grid');
  grid.innerHTML =
    WALLPAPERS.map((w) => `<button class="wp-swatch" data-wp="${w.id}" title="${w.name}" style="background:${w.css || AURORA.light}"></button>`).join('') +
    `<button class="wp-swatch color" data-wp="color" title="Solid color"><span class="dot" style="background:${settings.customColor}"></span><input type="color" value="${settings.customColor}" /></button>` +
    (settings.customImage
      ? `<button class="wp-swatch" data-wp="image" title="Your image" style="background:center / cover url('${settings.customImage}')"></button>`
      : '') +
    `<button class="wp-swatch add" id="wp-upload" title="Choose an image…">${icon('image')}</button>`;

  $('#toggles').innerHTML = SECTIONS.map((s) =>
    `<button class="toggle" data-sec="${s.id}"><span>${s.name}</span><span class="switch"></span></button>`).join('');
  applyWallpaper();
  applySections();
}

$('#wp-grid').addEventListener('click', (e) => {
  const b = e.target.closest('.wp-swatch');
  if (!b) return;
  if (b.id === 'wp-upload') { $('#wp-file').click(); return; }
  settings.wallpaper = b.dataset.wp;
  saveSettings();
  applyWallpaper();
});
$('#wp-grid').addEventListener('input', (e) => {
  if (e.target.type !== 'color') return;
  settings.customColor = e.target.value;
  settings.wallpaper = 'color';
  $('.wp-swatch.color .dot').style.background = e.target.value;
  applyWallpaper();
});
$('#wp-grid').addEventListener('change', (e) => { if (e.target.type === 'color') saveSettings(); });

$('#wp-file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    // Tom médio da imagem decide se o texto fica claro ou escuro
    const s = document.createElement('canvas');
    s.width = s.height = 8;
    const sx = s.getContext('2d');
    sx.drawImage(c, 0, 0, 8, 8);
    const px = sx.getImageData(0, 0, 8, 8).data;
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) sum += (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
    const prev = { img: settings.customImage, tone: settings.customImageTone, wp: settings.wallpaper };
    settings.customImage = c.toDataURL('image/jpeg', 0.86);
    settings.customImageTone = sum / 64 > 0.55 ? 'light' : 'dark';
    settings.wallpaper = 'image';
    if (!saveSettings()) {
      settings.customImage = prev.img; settings.customImageTone = prev.tone; settings.wallpaper = prev.wp;
    }
    buildCustomize();
  } catch {
    toast('Couldn’t open that image');
  }
});

$('#seg-theme').addEventListener('click', (e) => {
  const b = e.target.closest('[data-theme]');
  if (!b) return;
  settings.theme = b.dataset.theme;
  saveSettings();
  params.delete('theme');
  applyTheme(true);
});

$('#toggles').addEventListener('click', (e) => {
  const t = e.target.closest('.toggle');
  if (!t) return;
  settings.sections[t.dataset.sec] = !settings.sections[t.dataset.sec];
  saveSettings();
  applySections();
});

$('#tg-sounds').addEventListener('click', () => {
  settings.sounds = settings.sounds === false;
  saveSettings();
  applySections();
  if (settings.sounds) sfx.play('select'); // amostra ao ligar
});

function toggleCustomize(force) {
  const pop = $('#custom-pop');
  const show = force ?? !pop.classList.contains('show');
  if (show !== pop.classList.contains('show')) sfx.play(show ? 'open' : 'close');
  pop.classList.toggle('show', show);
  $('#btn-customize').classList.toggle('on', show);
}
document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('#custom-pop, #btn-customize, #sb-settings')) toggleCustomize(false);
});

/* ───────────── Abas ───────────── */
let seq = 0;
const tabs = [];
let activeId = null;
const active = () => tabs.find((t) => t.id === activeId);

function makeTab(url = START, { title, index } = {}) {
  const t = {
    id: ++seq, url, title: title || (url === START ? 'New Tab' : url === SETTINGS ? 'Settings' : hostOf(url)),
    favicon: null, loading: false, canBack: false, canFwd: false, fromStart: false, wv: null, thumb: null,
    partition: library.partition(),
  };
  tabs.splice(index ?? tabs.length, 0, t);
  return t;
}

function ensureWebview(t) {
  if (t.wv || isInternal(t.url)) return;
  const wv = document.createElement('webview');
  wv.setAttribute('src', t.url);
  wv.setAttribute('partition', t.partition);
  wv.setAttribute('allowpopups', ''); // window.open/target=_blank chegam ao main.js, que abre como aba
  wv.setAttribute('plugins', ''); // leitor de PDF do Chromium (sem isso, PDFs são baixados)
  const sync = () => {
    try { t.canBack = wv.canGoBack(); t.canFwd = wv.canGoForward(); } catch { /* ainda não pronto */ }
  };
  // Uma página guardada (depois de "voltar" para a nova aba) não mexe mais no estado da aba
  const on = (ev, fn) => wv.addEventListener(ev, (e) => { if (t.wv === wv) fn(e); });
  on('did-start-loading', () => { t.loading = true; render(); });
  on('did-stop-loading', () => {
    t.loading = false; sync(); render();
    setTimeout(() => { if (t.id === activeId) captureThumb(t); }, 700);
    const el = tabEl(t);
    el?.classList.add('done');
    setTimeout(() => el?.classList.remove('done'), 600);
  });
  // tela cheia pedida pela página (vídeo): esconde a interface do Kona; a janela já vai para tela cheia
  on('enter-html-full-screen', () => document.body.classList.add('page-fullscreen'));
  on('leave-html-full-screen', () => document.body.classList.remove('page-fullscreen'));
  // zoom do site (ou o padrão) e busca na página (renderer/page-tools.js, carregado depois deste arquivo)
  on('dom-ready', () => { if (typeof applyZoom === 'function') applyZoom(t); else if (settings.zoom !== 1) wv.setZoomFactor(settings.zoom); });
  if (typeof findBar !== 'undefined') findBar.watch(t, wv);
  // o código-fonte (view-source:) chega como o endereço da página: mantém o prefixo e não entra no histórico
  const viewSource = (url) => (t.url.startsWith('view-source:') && !url.startsWith('view-source:') ? `view-source:${url}` : url);
  on('did-navigate', (e) => {
    t.reader = null; // o modo leitura vale por página
    t.url = viewSource(e.url); t.favicon = null; sync(); render();
    if (!t.url.startsWith('view-source:')) browseHistory.addVisit(e.url, t.title);
  });
  on('did-navigate-in-page', (e) => { if (e.isMainFrame) { t.url = viewSource(e.url); sync(); render(); } });
  on('page-title-updated', (e) => { t.title = e.title; render(); browseHistory.updateTitle(t.url, e.title); });
  on('page-favicon-updated', (e) => { t.favicon = e.favicons?.[0] || null; render(); });
  performance.mark('kona:webview-create');
  $('#views').appendChild(wv);
  performance.measure('kona:webview-append', 'kona:webview-create');
  t.wv = wv;
}

function discardParked(t) {
  t.parked?.wv.remove();
  t.parked = null;
}

function navigate(t, url) {
  discardParked(t);
  if (t.url === START) t.fromStart = true;
  t.url = url;
  t.title = hostOf(url);
  t.favicon = null;
  // loadURL rejeita quando a página não carrega (sem internet, endereço inválido, navegação
  // interrompida); a página de erro do Chromium já aparece na aba, então não há o que tratar aqui
  if (t.wv) t.wv.loadURL(url).catch(() => {});
  else ensureWebview(t);
  render();
}

async function captureThumb(t) {
  if (!t?.wv) return;
  try {
    const img = await t.wv.capturePage();
    if (img && !img.isEmpty()) t.thumb = img.resize({ width: 480 }).toDataURL();
  } catch { /* ignora */ }
}

// Abas usadas mais recentemente: só elas ficam desenhadas (troca instantânea);
// as demais são "estacionadas" (sem pintura) para não sobrecarregar a GPU.
const KEEP_RENDERED = 3;
let mru = [];

function activate(id) {
  if (typeof findBar !== 'undefined' && findBar.tab && findBar.tab.id !== id) findBar.close(false);
  activeId = id;
  mru = [id, ...mru.filter((x) => x !== id)].slice(0, 12);
  ensureWebview(active());
  render();
  if (typeof extTabChanged === 'function') requestAnimationFrame(extTabChanged); // extensões: aba ativa e contadores
}

function newTab(url = START, focus = true) {
  const t = makeTab(url, { index: tabs.indexOf(active()) + 1 });
  sfx.play('tabOpen');
  activate(t.id);
  // com a visão geral aberta, a aba nova aparece nela na hora (e fica selecionada)
  if (ovOpen()) { ovSel = tabs.indexOf(t); buildOverview(); }
  if (focus && url === START) focusAddress(); // já existe no DOM: foco imediato (não depende de um quadro)
  return t;
}

function closeTab(id) {
  const i = tabs.findIndex((t) => t.id === id);
  if (i < 0) return;
  const [t] = tabs.splice(i, 1);
  if (typeof rememberClosed === 'function') rememberClosed(t, i); // Ctrl+Shift+T
  sfx.play('tabClose');
  t.wv?.remove();
  discardParked(t);
  mru = mru.filter((x) => x !== id);
  if (!tabs.length) makeTab();
  if (activeId === id) activeId = (tabs[i] || tabs[i - 1]).id;
  ensureWebview(active());
  render();
  if ($('#overview').classList.contains('show')) buildOverview();
}

function focusAddress() {
  const put = () => {
    const input = $('#tabs .tab.active:not(.leaving) input');
    if (input && document.activeElement !== input) { input.focus(); input.select(); }
  };
  put();
  // Ao fechar uma aba cuja página tinha o foco, o Chromium devolve o foco à janela um instante
  // depois e tira o da barra. Se o foco cair no vazio logo em seguida, a barra o recupera.
  for (const ms of [30, 120, 300]) setTimeout(() => { if (document.activeElement === document.body) put(); }, ms);
}

const tabEl = (t) => $(`#tabs .tab[data-id="${t.id}"]:not(.leaving)`);

function createTabEl(t) {
  const el = document.createElement('div');
  el.className = 'tab';
  el.dataset.id = t.id;
  el.innerHTML = `
    <span class="slot"><span class="tfav"></span><button class="x" title="Close tab">${icon('x')}</button></span>
    <span class="title"></span>
    <button class="snd" title="Mute tab" hidden></button>
    <form class="addr"><span class="lock">${icon('lock')}</span><input spellcheck="false" autocomplete="off" placeholder="Search or enter address" /></form>
    <button class="readerbtn" title="Show Reader (Ctrl+Shift+R)" hidden></button>
    <button class="aabtn" title="Reader options" hidden>Aa</button>
    <button class="zoomind" title="Reset zoom (Ctrl+0)" hidden></button>
    <button class="bm" title="Add to Favorites (Ctrl+D)">${icon('star')}</button>
    <button class="reload" title="Reload">${icon('reload')}</button>
    <span class="progress"></span>`;

  const input = $('input', el);
  let wasActive = false;
  el.addEventListener('mousedown', (e) => {
    wasActive = t.id === activeId;
    if (e.button === 1) { e.preventDefault(); closeTab(t.id); return; }
    // botão direito: só o menu (não troca de aba nem começa a editar o endereço)
    if (e.button === 2) { if (document.activeElement !== input) e.preventDefault(); return; }
    if (t.id !== activeId && !e.target.closest('.x')) { activate(t.id); e.preventDefault(); }
  });
  // Na aba ativa, qualquer ponto da caixa (não só o texto) começa a edição do endereço.
  // É feito no "click" (e não cancelando o mousedown): assim o clique tira o foco de uma
  // página aberta antes, e o campo consegue recebê-lo. Clicar numa aba inativa só a ativa.
  el.addEventListener('click', (e) => {
    if (wasActive && t.id === activeId && !e.target.closest('.x, .reload, .bm, input')) input.focus();
  });
  $('.x', el).addEventListener('click', (e) => { e.stopPropagation(); closeTab(t.id); });
  $('.reload', el).addEventListener('click', () => { if (t.wv) (t.loading ? t.wv.stop() : t.wv.reload()); });
  $('.bm', el).addEventListener('click', () => toggleBookmark(t));
  $('.zoomind', el).addEventListener('click', () => zoomReset());
  $('.readerbtn', el).addEventListener('click', (e) => { e.stopPropagation(); toggleReader(t); });
  $('.aabtn', el).addEventListener('click', (e) => { e.stopPropagation(); toggleReaderPop(e.currentTarget); });
  $('.snd', el).addEventListener('mousedown', (e) => e.stopPropagation()); // não troca de aba
  $('.snd', el).addEventListener('click', (e) => { e.stopPropagation(); toggleMute(t); });
  input.addEventListener('focus', () => {
    el.classList.add('editing');
    input.value = t.url === START ? '' : t.url;
    requestAnimationFrame(() => input.select());
    omnibox.open(input, t);
  });
  input.addEventListener('blur', () => { el.classList.remove('editing'); paintTab(t, el); omnibox.close(); });
  input.addEventListener('input', () => omnibox.update());
  input.addEventListener('keydown', (e) => {
    if (omnibox.key(e)) return;
    if (e.key === 'Escape') input.blur();
  });
  $('form', el).addEventListener('submit', (e) => {
    e.preventDefault();
    const choice = omnibox.choice() || { text: input.value };
    input.blur();
    go(t, choice);
  });
  el.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); tabMenu(t, e.clientX, e.clientY, e.target.closest('input')); });
  return el;
}

/** Abre o que veio da barra de endereço (texto digitado ou sugestão escolhida). */
function go(t, choice) {
  const url = choice.url || toUrl(choice.text || '');
  if (!url) return;
  if (url === SETTINGS) { openSettings(); return; }
  if (isSearchUrl(url) && !library.isPrivate()) browseHistory.addSearch(choice.query || choice.text.trim());
  navigate(t, url);
}

/** Liga/desliga o favorito da página da aba. */
/** Abre as Configurações (reaproveita a aba delas, ou uma nova aba vazia). */
function openSettings(section) {
  const existing = tabs.find((x) => x.url === SETTINGS);
  const a = active();
  if (existing) activate(existing.id);
  else if (a.url === START && !a.wv) { a.url = SETTINGS; a.title = 'Settings'; render(); }
  else newTab(SETTINGS, false);
  if (section) requestAnimationFrame(() => settingsPage.scrollTo(section));
}

function toggleBookmark(t = active()) {
  if (!t || t.url === START || !/^https?:/.test(t.url)) return;
  const added = bookmarks.toggle(t.url, t.title);
  toast(added ? 'Added to Favorites' : 'Removed from Favorites');
  render();
}
/** Guarda a página da aba na Lista de Leitura. */
function addToReadingList(t = active()) {
  if (!t || t.url === START || !/^https?:/.test(t.url)) { toast('Open a page to save it to your Reading List'); return; }
  readingList.add(t.url, t.title);
  toast('Saved to Reading List');
}

function favHtml(t) {
  if (t.url === START) return { key: 'start', html: icon('compass') };
  if (t.url === SETTINGS) return { key: 'settings', html: icon('gear') };
  if (t.favicon) return { key: t.favicon, html: `<img src="${escapeHtml(t.favicon)}" alt="" />` };
  const b = brandOf(t.url);
  return { key: 'm:' + b, html: monogram(b) };
}

function paintTab(t, el) {
  const isActive = t.id === activeId;
  el.classList.toggle('active', isActive);
  el.classList.toggle('web', !isInternal(t.url));
  el.classList.toggle('loading', t.loading);
  el.classList.toggle('secure', t.url.startsWith('https://'));
  el.classList.toggle('bookmarked', isActive && t.url !== START && !!bookmarks.find(t.url));
  // modo leitura: ícone quando a página é um artigo; "Aa" com o leitor aberto
  const rb = $('.readerbtn', el), aa = $('.aabtn', el);
  rb.hidden = !(isActive && t.reader?.available);
  aa.hidden = !(isActive && t.reader?.active);
  if (!rb.hidden && !rb.firstChild) rb.innerHTML = icon('reader');
  rb.classList.toggle('on', !!t.reader?.active);
  rb.title = t.reader?.active ? 'Hide Reader (Ctrl+Shift+R)' : 'Show Reader (Ctrl+Shift+R)';
  // som: 🔊 tocando, 🔇 silenciada (clicar alterna)
  const snd = $('.snd', el);
  const muted = !!t.muted;
  snd.hidden = !(t.audible || muted);
  el.classList.toggle('audible', !!t.audible && !muted);
  el.classList.toggle('muted', muted);
  if (!snd.hidden && snd.dataset.state !== String(muted)) {
    snd.dataset.state = String(muted);
    snd.innerHTML = icon(muted ? 'volumeOff' : 'volume');
    snd.title = muted ? 'Unmute tab' : 'Mute tab';
  }
  // zoom diferente do padrão: aparece na barra (clicar volta ao padrão)
  const z = isActive && t.wv && typeof zoomFor === 'function' ? zoomFor(t.url) : settings.zoom;
  const zi = $('.zoomind', el);
  zi.hidden = Math.abs(z - (settings.zoom || 1)) < 0.001;
  if (!zi.hidden) zi.textContent = `${Math.round(z * 100)}%`;
  const bm = $('.bm', el);
  if (bm) bm.title = el.classList.contains('bookmarked') ? 'Remove from Favorites (Ctrl+D)' : 'Add to Favorites (Ctrl+D)';
  el.title = isActive ? '' : t.title;
  $('.title', el).textContent = t.title;

  const f = favHtml(t);
  const fav = $('.tfav', el);
  if (fav.dataset.key !== f.key) {
    fav.dataset.key = f.key;
    fav.innerHTML = f.html;
    const img = $('img', fav);
    if (img) img.onerror = () => { t.favicon = null; fav.dataset.key = ''; paintTab(t, el); };
  }

  const input = $('input', el);
  input.placeholder = library.isPrivate() ? 'Private browsing — search or enter address' : 'Search or enter address';
  if (document.activeElement !== input) input.value = t.url === START ? '' : t.url === SETTINGS ? 'Settings' : hostOf(t.url);
  const loadKey = t.loading ? 'x' : 'reload';
  if (el.dataset.reload !== loadKey) {
    el.dataset.reload = loadKey;
    $('.reload', el).innerHTML = icon(loadKey);
  }
}

/** Faixa de abas: liga a rolagem quando não cabe e mantém a aba ativa à vista. */
let stripPending = false;
/** Com uma única aba, a caixa do endereço fica no centro da JANELA (não só do espaço livre,
 *  que é assimétrico). O deslocamento é um padding-left animado na faixa de abas. */
function centerSingleTab() {
  const strip = $('#tabs');
  const live = $$('#tabs .tab:not(.leaving)');
  let pad = 4;
  let max = 720;
  if (live.length === 1) {
    const s = strip.getBoundingClientRect();
    // maior largura simétrica em torno do centro da janela que cabe na faixa
    const half = Math.min(innerWidth / 2 - s.left - 4, s.right - innerWidth / 2 - 4);
    const w = Math.min(720, Math.floor(half * 2));
    if (w >= 300) { max = w; pad = Math.round(innerWidth / 2 - w / 2 - s.left); }
    else max = Math.min(720, s.width - 8); // estreito demais: ocupa a faixa
  }
  strip.style.setProperty('--pad-l', `${pad}px`);
  strip.style.setProperty('--single-max', `${max}px`);
}

function syncTabStrip() {
  if (stripPending) return;
  stripPending = true;
  requestAnimationFrame(() => {
    stripPending = false;
    centerSingleTab();
    const strip = $('#tabs');
    const over = strip.scrollWidth > strip.clientWidth + 1;
    strip.classList.toggle('overflowing', over);
    if (!over) { strip.scrollLeft = 0; return; }
    const el = $('#tabs .tab.active:not(.leaving)');
    if (!el) return;
    const s = strip.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.left < s.left + 20 || r.right > s.right - 20) el.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
  });
  // as larguras das abas animam por 400 ms: confere de novo quando assentarem
  clearTimeout(syncTabStrip.t);
  syncTabStrip.t = setTimeout(() => { if (!stripPending) { stripPending = false; syncTabStripNow(); } }, 460);
}
function syncTabStripNow() {
  centerSingleTab();
  const strip = $('#tabs');
  const over = strip.scrollWidth > strip.clientWidth + 1;
  strip.classList.toggle('overflowing', over);
  const el = $('#tabs .tab.active:not(.leaving)');
  if (!over || !el) return;
  const s = strip.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (r.left < s.left + 20 || r.right > s.right - 20) el.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
}
new ResizeObserver(syncTabStrip).observe($('#tabs'));
$('#tabs').addEventListener('transitionend', (e) => { if (e.propertyName === 'flex-grow' || e.propertyName === 'max-width') syncTabStrip(); });
$('#tabs').addEventListener('wheel', (e) => {
  const strip = e.currentTarget;
  if (!strip.classList.contains('overflowing') || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
  strip.scrollBy({ left: e.deltaY });
  e.preventDefault();
}, { passive: false });

/** Na nova aba, a barra acrílica segue o tom do fundo; nas páginas, o tema do app. */
function syncToolbarTone() {
  const onStart = $('#start').classList.contains('show');
  const tb = $('#toolbar');
  tb.classList.toggle('tone-dark', onStart && $('#start').classList.contains('tone-dark'));
  tb.classList.toggle('tone-light', onStart && $('#start').classList.contains('tone-light'));
}

let startShownFor = null;
function render() {
  const strip = $('#tabs');
  $$('.tab:not(.leaving)', strip).forEach((el) => {
    if (tabs.some((t) => String(t.id) === el.dataset.id)) return;
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 420);
  });
  tabs.forEach((t, i) => {
    let el = tabEl(t);
    if (!el) {
      el = createTabEl(t);
      el.classList.add('entering');
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('entering')));
    }
    const live = $$('.tab:not(.leaving)', strip);
    if (live[i] !== el) strip.insertBefore(el, live[i] || null);
    paintTab(t, el);
  });

  const a = active();
  const ai = tabs.indexOf(a);
  const hot = new Set([...mru.slice(0, KEEP_RENDERED), tabs[ai - 1]?.id, tabs[ai + 1]?.id]);
  tabs.forEach((t) => {
    if (!t.wv) return;
    t.wv.classList.toggle('parked', t !== a && !hot.has(t.id));
    const was = t.wv.classList.contains('active');
    if (was && t !== a) t.wv.classList.add('under'); // fica embaixo durante o fade da próxima
    else if (t === a || !was) t.wv.classList.remove('under');
    t.wv.classList.toggle('active', t === a);
  });
  $$('#views webview.under').forEach((wv) => { if (!tabs.some((t) => t.wv === wv && t !== a)) wv.classList.remove('under'); });
  const onStart = a.url === START;
  const onSettings = a.url === SETTINGS;
  $('#start').classList.toggle('show', onStart);
  $('#settings').classList.toggle('show', onSettings);
  if (onSettings && typeof settingsPage !== 'undefined') settingsPage.render();
  if (onStart && startShownFor !== a.id) {
    renderStartContent();
    const start = $('#start');
    start.classList.remove('enter');
    void start.offsetWidth; // reinicia a animação
    start.classList.add('enter');
  }
  startShownFor = onStart ? a.id : null;
  syncToolbarTone();
  library.onTabsChanged();
  syncTabStrip();
  document.body.classList.toggle('on-web', !onStart && !onSettings);
  if (!onStart) { toggleCustomize(false); closeFolderPop(); }
  $('#back').disabled = !(a.canBack || (a.fromStart && !onStart));
  $('#fwd').disabled = !a.canFwd;
  document.title = onStart || !a.title ? 'Kona' : `${a.title} — Kona`;
}

function goBack() {
  const a = active();
  if (a.wv && a.canBack) a.wv.goBack();
  else if (a.fromStart && a.url !== START) {
    discardParked(a);
    if (a.wv) {
      a.wv.classList.remove('active', 'under');
      a.wv.classList.add('parked');
      a.parked = { wv: a.wv, url: a.url, title: a.title, favicon: a.favicon };
    }
    Object.assign(a, { wv: null, url: START, title: 'New Tab', favicon: null, canBack: false, canFwd: !!a.parked, loading: false });
    render();
  }
}

function goForward() {
  const a = active();
  if (a.url === START && a.parked) {
    const p = a.parked;
    a.parked = null;
    Object.assign(a, { wv: p.wv, url: p.url, title: p.title, favicon: p.favicon, fromStart: true, loading: false });
    try { a.canBack = a.wv.canGoBack(); a.canFwd = a.wv.canGoForward(); } catch { a.canBack = false; a.canFwd = false; }
    render();
  } else {
    a.wv?.goForward();
  }
}

/* ───────────── Visão geral ───────────── */
// Navegação por teclado: Alt+V abre/fecha, setas escolhem, Enter abre, Esc fecha.
// O mouse e o teclado mexem na mesma seleção, então nunca há dois destaques ao mesmo tempo.
let ovSel = 0;
const ovOpen = () => $('#overview').classList.contains('show');

async function openOverview() {
  toggleCustomize(false);
  await captureThumb(active());
  ovSel = Math.max(0, tabs.indexOf(active()));
  buildOverview();
  sfx.play('open');
  $('#overview').classList.add('show');
  document.body.classList.add('ov-open');
  $('#btn-overview').classList.add('on');
  // tira o foco da página, para as setas chegarem aqui
  $('#ov-grid').focus({ preventScroll: true });
  ovSelect(ovSel, false);
}
const toggleOverview = () => (ovOpen() ? closeOverview() : openOverview());
function closeOverview() {
  const wasOpen = ovOpen();
  if (wasOpen) sfx.play('close');
  $('#ov-grid').classList.remove('kb');
  $('#overview').classList.remove('show');
  // o foco volta para a página, para o teclado rolar a aba aberta
  if (wasOpen && document.activeElement === $('#ov-grid')) active()?.wv?.focus();
  document.body.classList.remove('ov-open');
  $('#btn-overview').classList.remove('on');
}

function buildOverview() {
  const grid = $('#ov-grid');
  $('#ov-count').textContent = `${tabs.length} ${tabs.length === 1 ? 'Tab' : 'Tabs'}`;
  grid.innerHTML = '';
  const wp = wallpaperStyle().css || 'linear-gradient(135deg, #9ec5ff, #f7c2e1 55%, #ffd9a8)';
  ovSel = Math.min(ovSel, tabs.length - 1);
  tabs.forEach((t, i) => {
    const card = document.createElement('div');
    card.className = 'ov-card' + (t.id === activeId ? ' current' : '') + (i === ovSel ? ' sel' : '');
    card.style.transitionDelay = `${i * 25}ms`;
    let cls = '', style = '', inner = '';
    if (t.url === START) style = `background:${wp}`;
    else if (t.url === SETTINGS) { cls = 'page-thumb'; inner = `<span class="big-mono">${icon('gear')}</span><span class="host">Settings</span>`; }
    else if (t.thumb) style = `background-image:url(${t.thumb})`;
    else {
      cls = 'page-thumb';
      inner = `<span class="big-mono">${(brandOf(t.url)[0] || '?').toUpperCase()}</span><span class="host">${escapeHtml(hostOf(t.url))}</span>`;
    }
    card.innerHTML = `
      <div class="thumb ${cls}" style="${escapeHtml(style)}">${inner}<button class="ov-x glass" title="Close tab">${icon('x')}</button></div>
      <div class="cap"><span class="tfav">${favHtml(t).html}</span><span>${escapeHtml(t.title)}</span></div>`;
    card.addEventListener('click', (e) => {
      if (e.target.closest('.ov-x')) { closeTab(t.id); return; }
      sfx.play('select');
      activate(t.id);
      closeOverview();
    });
    card.addEventListener('mouseenter', () => { grid.classList.remove('kb'); ovSelect(tabs.indexOf(t), false); });
    grid.appendChild(card);
  });
}

/* ───────────── Nova aba: conteúdo (dados reais da biblioteca) ───────────── */
function renderStartContent() {
  const favs = bookmarks.list.slice(0, 16);
  // "+" discreto depois do último favorito (some no fundo até o mouse passar)
  const add = `<button class="fav-item fav-add" id="fav-add" style="--i:${favs.length}" title="Add favorite">
        <span class="tile">${icon('plus')}</span><span class="label">Add</span></button>`;
  $('#fav-grid').innerHTML = favs.map((f, i) => favTile(f, i)).join('') + add;
  if (folderPop.id && !bookmarks.get(folderPop.id)) closeFolderPop();
  const visits = typeof browseHistory !== 'undefined' ? browseHistory.data.visits : [];
  const freq = [...visits].sort((a, b) => b.n - a.n || b.t - a.t).slice(0, 4);
  $('#freq-grid').innerHTML = freq.length
    ? freq.map((f, i) => `
      <button class="freq" data-url="${escapeHtml(f.url)}" style="--i:${i + favs.length}">
        <span class="ftile">${siteIcon(f.url)}</span>
        <div><b>${escapeHtml(f.title || hostOf(f.url))}</b><span>${escapeHtml(hostOf(f.url))}</span></div>
      </button>`).join('')
    : '<p class="start-empty">The sites you visit most will show up here.</p>';
  // Privacidade: dados reais do perfil (só quando a seção está visível)
  if (settings.sections.privacy) {
    const label = { allow: 'Cookies allowed', 'block-third-party': 'Third-party cookies blocked', 'block-all': 'All cookies blocked' }[settings.cookies];
    $('#privacy-body').innerHTML = `<div class="big-num" id="pv-sites">–</div>
      <p>sites store cookies in this profile.<br><b>${label}</b>${settings.gpc ? ' · <b>GPC</b> on' : ''}</p>`;
    api?.sitesList(PROFILES.currentProfile().partition).then((l) => { const el = $('#pv-sites'); if (el) el.textContent = l.length; });
  }
  const unread = readingList.items.filter((x) => !x.read).slice(0, 3);
  $('#reading-list').innerHTML = unread.length
    ? unread.map((x) => `<li data-url="${escapeHtml(x.url)}" data-rid="${x.id}"><b>${escapeHtml(x.title)}</b><span>${escapeHtml(hostOf(x.url))}</span></li>`).join('')
    : '<li class="start-empty">Nothing to read right now. Press Ctrl+Shift+D to save a page.</li>';
}
/** Um item da grade de favoritos: site ou pasta (ícone com até 4 miniaturas, como no iPhone). */
function favTile(f, i) {
  if (f.folder) {
    const sites = bookmarks.all(f.children).slice(0, 4);
    const minis = sites.length ? [0, 1, 2, 3].map((k) => (sites[k] ? `<span class="mini">${siteIcon(sites[k].url)}</span>` : '<span class="mini slot"></span>')).join('') : '';
    return `<button class="fav-item fav-folder" data-folder="${f.id}" style="--i:${i}" title="${escapeHtml(f.title)}">
        <span class="tile glass">${minis ? `<span class="minis">${minis}</span>` : icon('folder')}</span>
        <span class="label">${escapeHtml(f.title)}</span>
      </button>`;
  }
  return `<button class="fav-item" data-url="${escapeHtml(f.url)}" data-bm="${f.id}" style="--i:${i}" title="${escapeHtml(f.title)}">
        <span class="tile glass">${siteIcon(f.url)}</span>
        <span class="label">${escapeHtml(f.title)}</span>
      </button>`;
}

/* Pasta de favoritos aberta na nova aba: painel com os itens dela (subpastas abrem no mesmo painel) */
const folderPop = { id: null, trail: [], anchor: null };
function openFolderPop(id, anchor) {
  const f = bookmarks.get(id);
  if (!f) return;
  if (anchor) { folderPop.trail = []; folderPop.anchor = anchor; }
  else if (folderPop.id) folderPop.trail.push(folderPop.id);
  folderPop.id = id;
  const pop = $('#folder-pop');
  pop.innerHTML = `<div class="fp-head">
      ${folderPop.trail.length ? `<button class="tb small" data-fp-back title="Back">${icon('back')}</button>` : ''}
      <b>${escapeHtml(f.title)}</b><span>${bookmarks.count(f.children)}</span></div>
    <div class="fav-grid fp-grid">${f.children.length ? f.children.map((c, i) => favTile(c, i)).join('') : '<p class="start-empty">This folder is empty.</p>'}</div>`;
  hydrateIcons(pop);
  placeFolderPop();
  if (!pop.classList.contains('show')) { pop.classList.add('show'); sfx.play('open'); }
}
function placeFolderPop() {
  const pop = $('#folder-pop');
  const a = folderPop.anchor?.isConnected ? folderPop.anchor.getBoundingClientRect() : null;
  const w = pop.offsetWidth, h = pop.offsetHeight;
  const vw = innerWidth, vh = innerHeight;
  let x = a ? a.left + a.width / 2 - w / 2 : (vw - w) / 2;
  let y = a ? a.bottom + 10 : (vh - h) / 2;
  if (a && y + h > vh - 16) y = Math.max(60, a.top - h - 10);
  x = Math.min(Math.max(16, x), vw - w - 16);
  pop.style.left = `${x}px`; pop.style.top = `${y}px`;
}
function closeFolderPop() {
  const pop = $('#folder-pop');
  if (!pop.classList.contains('show')) { folderPop.id = null; return false; }
  pop.classList.remove('show');
  folderPop.id = null; folderPop.trail = [];
  sfx.play('close');
  return true;
}
$('#folder-pop').addEventListener('click', (e) => {
  if (e.target.closest('[data-fp-back]')) {
    const prev = folderPop.trail.pop();
    folderPop.id = null;
    if (prev) { const t = folderPop.trail; openFolderPop(prev); folderPop.trail = t; }
    return;
  }
  const sub = e.target.closest('[data-folder]');
  if (sub) { sfx.play('select'); openFolderPop(sub.dataset.folder); return; }
  const el = e.target.closest('[data-url]');
  if (el) { closeFolderPop(); navigate(active(), el.dataset.url); }
});
$('#folder-pop').addEventListener('auxclick', (e) => {
  const el = e.target.closest('[data-url]');
  if (e.button === 1 && el) { e.preventDefault(); newTab(el.dataset.url, false); }
});
document.addEventListener('mousedown', (e) => {
  if (folderPop.id && !e.target.closest('#folder-pop, .fav-folder')) closeFolderPop();
}, true);
addEventListener('resize', () => { if (folderPop.id) placeFolderPop(); });

/* Adicionar favorito pelo "+" da nova aba */
function openFavSheet() {
  $('#fav-url').value = '';
  $('#fav-name').value = '';
  $('#fav-error').hidden = true;
  openSheet('#fav-sheet');
  $('#fav-url').focus();
}
function saveFav() {
  const raw = $('#fav-url').value.trim();
  const url = raw && toUrl(raw);
  if (!url || isSearchUrl(url) || !/^https?:\/\//.test(url)) {
    $('#fav-error').hidden = false;
    $('#fav-url').focus();
    return;
  }
  const brand = brandOf(url);
  const name = $('#fav-name').value.trim() || brand.charAt(0).toUpperCase() + brand.slice(1);
  closeSheet('#fav-sheet');
  if (!bookmarks.add(url, name)) { toast('That site is already in your Favorites'); return; }
  sfx.play('select');
  renderStartContent();
}
$('#fav-save').addEventListener('click', saveFav);
$('#fav-cancel').addEventListener('click', () => closeSheet('#fav-sheet'));
$('#fav-sheet').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveFav(); } });
$('#fav-url').addEventListener('input', () => { $('#fav-error').hidden = true; });

$('#start').addEventListener('click', (e) => {
  if (e.target.closest('#fav-add')) { openFavSheet(); return; }
  const folder = e.target.closest('.fav-folder');
  if (folder) {
    if (folderPop.id === folder.dataset.folder) closeFolderPop();
    else { sfx.play('select'); openFolderPop(folder.dataset.folder, folder); }
    return;
  }
  const el = e.target.closest('[data-url]');
  if (!el) return;
  if (el.dataset.rid) readingList.setRead(el.dataset.rid, true);
  navigate(active(), el.dataset.url);
});

/* ───────────── Janela ───────────── */
$('#winctl').addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act) api?.[act]();
});
function setMaximized(max) {
  $('#btn-max').innerHTML = max ? WIN_ICONS.restore : WIN_ICONS.max;
  $('#btn-max').title = max ? 'Restore' : 'Maximize';
}
$('#toolbar').addEventListener('dblclick', (e) => {
  if (e.target === e.currentTarget || e.target.id === 'tabs') api?.maximize();
});

/* ───────────── Ligações ───────────── */
$('#btn-sidebar').addEventListener('click', () => toggleSidebar());
$('#back').addEventListener('click', goBack);
$('#fwd').addEventListener('click', goForward);
$('#btn-new').addEventListener('click', () => newTab());
$('#btn-overview').addEventListener('click', () => ($('#overview').classList.contains('show') ? closeOverview() : openOverview()));
$('#ov-done').addEventListener('click', closeOverview);
$('#ov-new').addEventListener('click', () => { closeOverview(); newTab(); });
$('#btn-customize').addEventListener('click', () => toggleCustomize());


function toggleSidebar(force) {
  const was = document.body.classList.contains('sidebar-open');
  const open = document.body.classList.toggle('sidebar-open', force);
  if (open !== was) sfx.play(open ? 'open' : 'close');
  $('#btn-sidebar').classList.toggle('on', open);
  if (open && !was) { // animação de entrada dos itens só ao abrir (não a cada atualização)
    $('#sidebar').classList.add('opening');
    clearTimeout(toggleSidebar.t);
    toggleSidebar.t = setTimeout(() => $('#sidebar').classList.remove('opening'), 600);
  }
  // Com o foco no menu, clicar numa página (outro processo) gera "focusin" no <webview> → fecha
  if (open) $('#sidebar').focus({ preventScroll: true });
}

// Clicar fora do menu lateral fecha o menu. Painéis abertos a partir dele não contam como "fora".
const SIDEBAR_INSIDE = '#sidebar, #btn-sidebar, #import-sheet, #profile-pop, #profile-sheet, #ask-sheet, #ext-sheet, #confirm-sheet, #clear-sheet, #sites-sheet, #perm-sheet, #scrim, #toast';
document.addEventListener('mousedown', (e) => {
  if (document.body.classList.contains('sidebar-open') && !e.target.closest(SIDEBAR_INSIDE)) toggleSidebar(false);
}, true);
document.addEventListener('focusin', (e) => {
  if (e.target.tagName === 'WEBVIEW' && document.body.classList.contains('sidebar-open')) toggleSidebar(false);
});
// Clique dentro de uma página (avisado pelo processo principal): também é "fora do menu"
/** Marca a aba de índice i na visão geral; com scroll, traz o cartão para a vista. */
function ovSelect(i, scroll = true) {
  const cards = $('#ov-grid').children;
  if (!cards.length) return;
  const prev = ovSel;
  ovSel = Math.max(0, Math.min(i, cards.length - 1));
  if (ovSel !== prev && ovOpen()) sfx.play('tick');
  for (let k = 0; k < cards.length; k++) cards[k].classList.toggle('sel', k === ovSel);
  if (scroll) cards[ovSel].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function overviewKey(e) {
  const grid = $('#ov-grid');
  const cols = Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(' ').length);
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[e.key];
  if (step !== undefined) {
    const next = ovSel + step;
    // para cima/baixo não sai da grade; para os lados passa de uma linha para a outra
    if (next >= 0 && next < tabs.length) ovSelect(next);
    grid.classList.add('kb');
  } else if (e.key === 'Home') { ovSelect(0); grid.classList.add('kb'); }
  else if (e.key === 'End') { ovSelect(tabs.length - 1); grid.classList.add('kb'); }
  else if (e.key === 'Enter' || e.key === ' ') {
    const t = tabs[ovSel];
    sfx.play('select');
    if (t) activate(t.id);
    closeOverview();
  } else return false;
  return true;
}

api?.on('page:mousedown', () => {
  if (document.body.classList.contains('sidebar-open')) toggleSidebar(false);
});

function shortcut(key, shift) {
  const a = active();
  if (key === 't' && shift) reopenClosedTab();
  else if (key === 't') newTab();
  else if (key === 'w') { if (tabs.length === 1) api?.close(); else closeTab(activeId); }
  else if (key === 'l' && shift) toggleSidebar();
  else if (key === 'l') focusAddress();
  else if (key === 'r' && shift) toggleReader(a);
  else if (key === 'r') a.wv?.reload();
  else if (key === 'd' && shift) addToReadingList();
  else if (key === 'd') toggleBookmark();
  else if (key === 'h') openSidebarView('history');
  else if (key === 'j') openSidebarView('downloads');
  else if (key === 'f' || key === 'g' || key === 'f3') {
    if (key === 'f' || !findBar.isOpen()) findBar.open(); else findBar.search(true, !shift);
  }
  else if (key === '=' || key === '+') zoomStep(1);
  else if (key === '-' || key === '_') zoomStep(-1);
  else if (key === '0') zoomReset();
  else if (key === 'zoomin') zoomStep(1);
  else if (key === 'zoomout') zoomStep(-1);
  else if (key === 'back') goBack();
  else if (key === 'f11') api?.toggleFullscreen();
  else if (key === 'forward') a.wv?.goForward();
  else if (['s', 'p', 'u'].includes(key) && !shift) {
    // salvar, imprimir e ver o código-fonte valem para a página da aba ativa
    if (!a.wv || !/^https?:/i.test(a.url)) return false;
    const id = a.wv.getWebContentsId();
    if (key === 's') api?.ctxDo(id, 'savePage');
    else if (key === 'p') api?.ctxDo(id, 'print');
    else openInBackground(`view-source:${a.url}`);
  }
  else if (key === 'n' && shift) library.switchTo(library.isPrivate() ? tabSets.data.current : 'private');
  else if (key === ',') openSettings();
  else if (key === '\\' || key === '|') toggleOverview();
  else if (key === 'tab') {
    const i = tabs.indexOf(a);
    activate(tabs[(i + (shift ? -1 : 1) + tabs.length) % tabs.length].id);
  } else return false;
  return true;
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if ($('#perm-sheet').classList.contains('show')) { answerPerm(false); return; }
    if ($('#import-sheet').classList.contains('show')) { closeImport(); return; }
    for (const id of ['#pw-sheet', '#sites-sheet', '#clear-sheet', '#fav-sheet']) if ($(id).classList.contains('show')) { closeSheet(id); return; }
    if (closeFolderPop()) return;
    if (findBar.close()) return;
    if (closeProfileLayers()) return;
    if ($('#confirm-sheet').classList.contains('show')) answerConfirm(false);
    else if ($('#ext-sheet').classList.contains('show')) closeSheet('#ext-sheet');
    else if (document.body.classList.contains('sidebar-open')) { if (!sidebarEscape()) toggleSidebar(false); }
    else { closeOverview(); toggleCustomize(false); }
    return;
  }
  if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyV') { toggleOverview(); e.preventDefault(); return; }
  if (ovOpen() && !e.altKey && !e.ctrlKey && !e.metaKey && !e.target.closest?.('input, textarea, [contenteditable]') && overviewKey(e)) {
    e.preventDefault();
    return;
  }
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'i') { api?.devtools(); return; }
  if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyZ') { toggleSidebar(); e.preventDefault(); return; }
  if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.target.closest?.('input, textarea')) {
    shortcut(e.key === 'ArrowLeft' ? 'back' : 'forward'); e.preventDefault(); return;
  }
  if (e.key === 'F11' && !e.ctrlKey && !e.altKey) { api?.toggleFullscreen(); e.preventDefault(); return; }
  if (e.key === 'F3' && !e.ctrlKey && !e.altKey) { shortcut('f3', e.shiftKey); e.preventDefault(); return; }
  if (!(e.ctrlKey || e.metaKey)) return;
  if (shortcut(e.key.toLowerCase(), e.shiftKey)) e.preventDefault();
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 3) goBack();
  if (e.button === 4) goForward();
});

api?.on('shortcut', ({ key, shift, alt }) => {
  if (alt && key === 'z') toggleSidebar();
  else if (alt && key === 'v') toggleOverview();
  else shortcut(key, shift);
});
api?.on('tab:open', (url) => newTab(url, false));
api?.on('update:ready', ({ version }) => toast(`Kona ${version} is ready to install`, { label: 'Restart now', run: () => api.installUpdate() }));
let wasMaximized = null;
api?.on('win:state', ({ focused, maximized, fullscreen }) => {
  document.body.classList.toggle('blurred', !focused);
  document.body.classList.toggle('win-fullscreen', !!fullscreen);
  if (!fullscreen) document.body.classList.remove('page-fullscreen', 'peek');
  setMaximized(maximized);
  if (wasMaximized !== null && wasMaximized !== maximized) settle(maximized);
  wasMaximized = maximized;
});

/* ───────────── Extensões ───────────── */
const STORE_URL = 'https://chromewebstore.google.com/category/extensions';
let extensions = [];

async function refreshExtensions() {
  if (!api?.extList) return;
  try { extensions = await api.extList(); } catch { extensions = []; }
  $('#sb-ext-count').textContent = extensions.length || '';
  if ($('#ext-sheet').classList.contains('show')) renderExtensions();
}

function renderExtensions() {
  const list = $('#ext-list');
  if (!extensions.length) {
    list.innerHTML = `
      <div class="ext-empty">
        <span class="big">${icon('puzzle')}</span>
        <b>No extensions installed</b>
        <p>Open the Chrome Web Store and click “Add to Chrome” to add an extension to Kona.</p>
      </div>`;
    return;
  }
  list.innerHTML = extensions.map((e, i) => `
    <div class="ext-row" data-id="${e.id}" style="--i:${i}">
      <span class="eicon">${e.icon ? `<img src="${e.icon}" alt="" />` : icon('puzzle')}</span>
      <div class="einfo"><b>${escapeHtml(e.name)}<small>${escapeHtml(e.version)}</small></b><span>${escapeHtml(e.description || '')}</span></div>
      <button class="eremove">Remove</button>
    </div>`).join('');
}

$('#ext-list').addEventListener('click', async (e) => {
  const row = e.target.closest('.ext-row');
  if (!row || !e.target.closest('.eremove')) return;
  row.classList.add('removing');
  const name = extensions.find((x) => x.id === row.dataset.id)?.name;
  try {
    extensions = await api.extRemove(row.dataset.id);
    setTimeout(() => { renderExtensions(); $('#sb-ext-count').textContent = extensions.length || ''; }, 300);
    toast(`“${name}” removed`);
  } catch {
    row.classList.remove('removing');
    toast('Couldn’t remove the extension');
  }
});

const sheets = () => $$('.sheet.show');
function openSheet(id) {
  toggleCustomize(false);
  $('#scrim').classList.add('show');
  $(id).classList.add('show');
}
function closeSheet(id) {
  $(id).classList.remove('show');
  if (!sheets().length) $('#scrim').classList.remove('show');
}
function openExtensions() {
  renderExtensions();
  openSheet('#ext-sheet');
  refreshExtensions();
}
$('#sb-extensions').addEventListener('click', openExtensions);
$('#ext-close').addEventListener('click', () => closeSheet('#ext-sheet'));
$('#ext-store').addEventListener('click', () => { closeSheet('#ext-sheet'); newTab(STORE_URL, false); });

// Confirmação de instalação vinda da Chrome Web Store
let pendingConfirm = null;
function answerConfirm(ok) {
  if (!pendingConfirm) return;
  api?.extConfirmReply(pendingConfirm.id, ok);
  if (ok) toast(`Installing “${pendingConfirm.name}”…`);
  pendingConfirm = null;
  closeSheet('#confirm-sheet');
}
api?.on('ext:confirm', (req) => {
  if (pendingConfirm) api.extConfirmReply(pendingConfirm.id, false);
  pendingConfirm = req;
  $('#confirm-icon').innerHTML = req.icon ? `<img src="${req.icon}" alt="" />` : icon('puzzle');
  $('#confirm-title').textContent = `Add “${req.name}” to Kona?`;
  const perms = [];
  if (req.allSites) perms.push('Can read and change your data on all websites.');
  if (req.permissions.includes('tabs') || req.permissions.includes('history')) perms.push('Can see your browsing history.');
  if (req.permissions.includes('downloads')) perms.push('Can manage your downloads.');
  if (!perms.length) perms.push('This extension doesn’t ask for special permissions.');
  $('#confirm-perms').innerHTML = perms.map((x) => `<li>${escapeHtml(x)}</li>`).join('');
  openSheet('#confirm-sheet');
  $('#confirm-yes').focus();
});
$('#confirm-yes').addEventListener('click', () => answerConfirm(true));
$('#confirm-no').addEventListener('click', () => answerConfirm(false));
$('#scrim').addEventListener('click', () => {
  if ($('#confirm-sheet').classList.contains('show')) answerConfirm(false);
  closeSheet('#ext-sheet');
  closeSheet('#fav-sheet');
  closeSheet('#pw-sheet');
  if ($('#import-sheet').classList.contains('show')) closeImport();
});
api?.on('ext:changed', () => {
  const before = extensions.length;
  refreshExtensions().then(() => {
    if (extensions.length > before) toast('Extension installed');
  });
});

/* ───────────── Movimento: janela e reorganização ───────────── */
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

/** Ao maximizar/restaurar, o conteúdo "assenta" com um leve zoom e fade. */
function settle(growing) {
  // No Windows nativo, o próprio sistema já anima maximizar/restaurar
  if (reducedMotion.matches || api?.platform === 'win32') return;
  document.body.animate(
    [{ opacity: 0.35, transform: `scale(${growing ? 0.975 : 1.02})` }, { opacity: 1, transform: 'none' }],
    { duration: 480, easing: EASE },
  );
}

/** FLIP: quando a grade muda de linhas (janela redimensionada), os itens deslizam até o novo lugar. */
function flipGrid(container, selector) {
  let last = new Map();
  const snap = () => { last = new Map($$(selector, container).map((el) => [el, el.getBoundingClientRect()])); };
  new ResizeObserver(() => {
    if (!reducedMotion.matches) {
      $$(selector, container).forEach((el) => {
        const a = last.get(el);
        if (!a) return;
        const b = el.getBoundingClientRect();
        if (Math.abs(a.top - b.top) < 2) return; // só quando muda de linha
        el.animate(
          [{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)` }, { transform: 'none' }],
          { duration: 520, easing: EASE },
        );
      });
    }
    snap();
  }).observe(container);
  return snap;
}

/* ───────────── Início ───────────── */
function reveal() {
  if (document.body.classList.contains('ready')) return;
  performance.mark('kona:ready');
  document.body.classList.add('ready', 'booting');
  setTimeout(() => document.body.classList.remove('booting'), 1200);
}
/** Espera a janela começar a apresentar quadros de verdade antes de animar
 *  (no WSL, entre "mostrar" e o primeiro quadro podem passar centenas de ms). */
function revealWhenPresenting() {
  // Enquanto a janela "acorda", a GPU é aquecida com tudo a 1% de opacidade (invisível).
  // A animação de abertura só começa com os quadros fluindo e os shaders prontos.
  let last = 0; let steady = 0; let warmed = false;
  warmUp().then(() => { warmed = true; });
  const tick = (t) => {
    steady = last && t - last < 40 ? steady + 1 : 0;
    last = t;
    if (steady >= 3 && warmed) reveal(); else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
api?.on('win:shown', revealWhenPresenting);

/** Aquece a GPU: desenha os painéis e uma aba "fantasma" (com as mesmas transições)
 *  quase invisíveis por alguns quadros, para a primeira abertura real não engasgar. */
function warmUp() {
  const frames = (n) => new Promise((res) => { const f = () => (--n <= 0 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  return (async () => {
    buildOverview();
    renderExtensions();
    const box = document.createElement('div');
    box.id = 'warm';
    box.setAttribute('aria-hidden', 'true');
    const ghost = createTabEl({ id: -1, url: 'https://kona.invalid', title: '', loading: false });
    ghost.removeAttribute('data-id');
    ghost.className = 'tab active web secure entering';
    box.appendChild(ghost);
    document.body.appendChild(box);
    performance.mark('kona:warm-start');
    document.body.classList.add('warming', 'sidebar-open');
    const opened = ['#custom-pop', '#overview', '#ext-sheet', '#scrim', '#omnibox', '#profile-pop'].map((s) => $(s));
    opened.forEach((el) => el.classList.add('show'));
    await frames(3);
    ghost.classList.remove('entering');
    ghost.classList.add('editing');
    await frames(5);
    ghost.classList.add('leaving');
    await frames(4);
    opened.forEach((el) => el.classList.remove('show'));
    document.body.classList.remove('sidebar-open');
    await frames(1);
    document.body.classList.remove('warming');
    performance.mark('kona:warm-end');
    // a limpeza continua sozinha (transições de volta, invisíveis)
    setTimeout(() => box.remove(), 600);
  })();
}

/** Depois da abertura, carrega as abas de fundo uma a uma: trocar de aba fica instantâneo. */
let profileReadyDone = false;
function prewarmTabs() {
  const pending = tabs.filter((t) => !t.wv && t.url !== START);
  const next = () => {
    const t = pending.shift();
    if (!t) return;
    if (!profileReadyDone) { pending.unshift(t); profileReady.finally(() => { profileReadyDone = true; next(); }); return; }
    if (tabs.includes(t)) ensureWebview(t);
    setTimeout(() => requestIdleCallback(next, { timeout: 2000 }), 700);
  };
  // começa depois que a animação de abertura termina (≈ 0,9 s após a interface aparecer)
  const start = () => setTimeout(() => requestIdleCallback(next, { timeout: 1500 }), 1200);
  if (document.body.classList.contains('ready')) start();
  else new MutationObserver((_, mo) => { if (document.body.classList.contains('ready')) { mo.disconnect(); start(); } })
    .observe(document.body, { attributes: true, attributeFilter: ['class'] });
}
setTimeout(reveal, 2500); // segurança, caso o aviso da janela não chegue
$$('#toolbar > *').forEach((el, i) => el.style.setProperty('--i', i));

hydrateIcons();
setMaximized(false);
const snapFavs = flipGrid($('#fav-grid'), '.fav-item');
$('#start').addEventListener('animationend', snapFavs);
buildCustomize();
refreshExtensions();
applyTheme();

syncPrefs();
const profileReady = api?.profileUse(PROFILES.currentProfile().partition) ?? Promise.resolve();
library.boot();

const initial = params.get('state');
if (params.get('wallpaper')) { settings.wallpaper = params.get('wallpaper'); applyWallpaper(); }
if (initial === 'sidebar') toggleSidebar();
if (initial === 'overview') openOverview();
if (initial === 'customize') toggleCustomize(true);
if (initial === 'extensions') { toggleSidebar(); openExtensions(); }
