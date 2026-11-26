'use strict';
// Configurações (kona://settings), pedido de permissão dos sites e avisos de download.

const PERMS = [
  ['camera', 'Camera', 'camera', 'use your camera'],
  ['microphone', 'Microphone', 'mic', 'use your microphone'],
  ['location', 'Location', 'pin', 'know your location'],
  ['notifications', 'Notifications', 'bell', 'show notifications'],
  ['clipboard', 'Read the clipboard', 'clipboard', 'read your clipboard'],
  ['apps', 'Open external apps', 'external', 'open an app on your computer'],
];
const PERM_INFO = Object.fromEntries(PERMS.map(([k, label, ic, verb]) => [k, { label, ic, verb }]));

const ST_SECTIONS = [
  ['geral', 'General', 'gear'],
  ['aparencia', 'Appearance', 'palette'],
  ['senhas', 'Passwords', 'key'],
  ['privacidade', 'Privacy and security', 'shield'],
  ['permissoes', 'Site permissions', 'hand'],
  ['downloads', 'Downloads', 'download'],
  ['perfis', 'Profiles', 'user'],
  ['extensoes', 'Extensions', 'puzzle'],
  ['sobre', 'About Kona', 'info'],
];

/* ───────────── Controles ───────────── */
const stRow = (label, desc, control, extra = '') => `
  <div class="st-row${extra}">
    <div class="st-text"><b>${label}</b>${desc ? `<p>${desc}</p>` : ''}</div>
    <div class="st-ctrl">${control}</div>
  </div>`;
const stSelect = (key, options, value = settings[key], attr = `data-set="${key}"`) => `
  <select class="st-select" ${attr}>${options.map(([v, l]) => `<option value="${v}"${String(v) === String(value) ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
const stSwitch = (key, on = !!settings[key]) => `<button class="sw${on ? ' on' : ''}" role="switch" aria-checked="${on}" data-toggle="${key}"><span></span></button>`;
const stButton = (label, act, cls = 'btn-secondary', data = '') => `<button class="${cls}" data-do="${act}" ${data}>${label}</button>`;

let appInfo = null;

const settingsPage = {
  built: false,

  render() {
    if (!this.built) this.build();
  },

  build() {
    this.built = true;
    $('#st-nav').innerHTML = ST_SECTIONS.map(([id, label, ic]) =>
      `<button class="st-nav-item" data-go="${id}"><span data-icon="${ic}">${icon(ic)}</span>${label}</button>`).join('');
    this.refresh();
    // navegação acompanha a seção visível
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) this.mark(e.target.id.slice(3));
    }, { root: $('#st-scroll'), rootMargin: '-30% 0px -60% 0px' });
    $$('.st-sec').forEach((s) => io.observe(s));
    if (!appInfo) api?.appInfo().then((info) => { appInfo = info; this.refresh(); });
  },

  mark(id) { $$('.st-nav-item').forEach((b) => b.classList.toggle('on', b.dataset.go === id)); },

  scrollTo(id) {
    this.render();
    const sec = $(`#st-${id}`);
    if (sec) $('#st-scroll').scrollTo({ top: sec.offsetTop - 12, behavior: 'smooth' });
    this.mark(id);
  },

  /** Redesenha o conteúdo (preservando a rolagem). */
  refresh() {
    if (!this.built) return;
    const scroll = $('#st-scroll').scrollTop;
    $('#st-main').innerHTML = [
      this.general(), this.appearance(), this.passwords(), this.privacy(), this.permissions(),
      this.downloads(), this.profiles(), this.extensions(), this.about(),
    ].join('');
    $('#st-scroll').scrollTop = scroll;
  },

  section(id, title, body, intro = '') {
    return `<section class="st-sec" id="st-${id}"><h2>${title}</h2>${intro ? `<p class="st-intro">${intro}</p>` : ''}<div class="st-card">${body}</div></section>`;
  },

  general() {
    return this.section('geral', 'General',
      stRow('When Kona starts', 'Tabs in groups are always kept.',
        stSelect('startup', [['newtab', 'Open a new tab'], ['restore', 'Restore tabs from last session']])) +
      stRow('Search engine', 'Used in the address bar.',
        stSelect('searchEngine', Object.entries(ENGINES).map(([k, e]) => [k, e.name]))) +
      stRow('Search suggestions', `As you type in the address bar, your text is sent to ${escapeHtml(engine().name)} to suggest searches.`,
        stSwitch('suggestions')) +
      stRow('Save browsing history', 'Visited sites and searches stay on this computer, in the current profile.',
        stSwitch('saveHistory')) +
      stRow('Import from another browser', 'Bring your favorites, history and extensions from Chrome, Edge or Brave.',
        stButton('Import…', 'import')));
  },

  appearance() {
    const theme = settings.theme;
    const seg = ['light', 'dark', 'system'].map((t) =>
      `<button class="${t === theme ? 'on' : ''}" data-theme-set="${t}">${{ light: 'Light', dark: 'Dark', system: 'System' }[t]}</button>`).join('');
    return this.section('aparencia', 'Appearance',
      stRow('Theme', 'Applies to Kona and to pages that follow the system theme.', `<div class="seg st-seg">${seg}</div>`) +
      stRow('New tab background and sections', 'Pick a background, a color or your own photo, and choose what appears on the new tab.',
        stButton('Customize…', 'customize')) +
      stRow('Interface sounds', 'Short sounds when you open menus, move between tabs and hover over favorites.', stSwitch('sounds')) +
      stRow('Default page zoom', null,
        stSelect('zoom', [[0.75, '75%'], [0.9, '90%'], [1, '100%'], [1.1, '110%'], [1.25, '125%'], [1.5, '150%']])));
  },

  passwords() {
    const n = typeof pwState !== 'undefined' ? pwState.count : null;
    return this.section('senhas', 'Passwords',
      stRow('Offer to save passwords', 'Kona asks to save the password when you sign in to a site, and fills it in next time.', stSwitch('offerPasswords', settings.offerPasswords !== false)) +
      stRow('Saved passwords', n == null ? 'Stored on this computer, encrypted by Windows.' : `${n} ${n === 1 ? 'password' : 'passwords'} · stored on this computer, encrypted by Windows.`,
        stButton('Manage…', 'pw-manage')) +
      stRow('Import passwords', 'From a CSV file exported by Chrome, Edge, Firefox, Bitwarden or another password manager.', stButton('Import…', 'pw-import')) +
      stRow('Export passwords', 'Saves all your passwords to a CSV file. Anyone with the file can read them.', stButton('Export…', 'pw-export')));
  },

  privacy() {
    return this.section('privacidade', 'Privacy and security',
      stRow('Cookies', {
        allow: 'All sites can save and read cookies.',
        'block-third-party': 'Recommended. Blocks cookies that other sites (ads, trackers) use inside the page you’re viewing.',
        'block-all': 'No site can save cookies sent over the network. Sign-ins and shopping carts will stop working.',
      }[settings.cookies], stSelect('cookies', [['allow', 'Allow all'], ['block-third-party', 'Block third-party'], ['block-all', 'Block all']])) +
      stRow('Delete cookies and site data when Kona closes', 'You’ll be signed out of every account each time you close Kona.', stSwitch('clearOnExit')) +
      stRow('Ask sites not to sell or share your data', 'Sends the Global Privacy Control (GPC) signal. Some places require sites by law to honor it.', stSwitch('gpc')) +
      stRow('Always use secure connections', 'Opens sites over HTTPS. If a site doesn’t support HTTPS, it loads normally without encryption.', stSwitch('httpsFirst')) +
      stRow('Secure DNS', 'Encrypts DNS lookups (Quad9) and blocks known scam and malware sites. Turn it off if an address on your company network won’t open.', stSwitch('secureDns')) +
      stRow('Site data', 'See which sites store cookies in this profile and delete the ones you want.', stButton('View site data…', 'sites')) +
      stRow('Clear browsing data', 'History, cookies and cached files.', stButton('Clear…', 'clear-data')),
      'These options apply to the current profile. Private browsing follows the same rules and also deletes everything when you leave it.');
  },

  permissions() {
    const rows = PERMS.map(([k, label, ic]) => stRow(
      `<span class="st-ic">${icon(ic)}</span>${label}`, null,
      stSelect(null, [['ask', 'Ask'], ['allow', 'Allow'], ['block', 'Block']], settings.permissions[k], `data-perm="${k}"`),
    )).join('');
    const sites = Object.entries(settings.sites).filter(([, d]) => Object.keys(d).length);
    const list = sites.length
      ? sites.map(([origin, d]) => `
        <div class="st-site">
          <div class="st-site-head"><b>${escapeHtml(origin.replace(/^https?:\/\//, ''))}</b>${stButton('Forget', 'site-forget', 'btn-link', `data-origin="${escapeHtml(origin)}"`)}</div>
          <div class="st-site-perms">${Object.entries(d).map(([k, v]) => `
            <label class="st-chip"><span>${icon(PERM_INFO[k]?.ic || 'info')}${PERM_INFO[k]?.label || k}</span>
              ${stSelect(null, [['allow', 'Allow'], ['block', 'Block']], v, `data-site="${escapeHtml(origin)}" data-kind="${k}"`)}</label>`).join('')}
          </div>
        </div>`).join('')
      : '<p class="st-empty">No saved choices yet. When a site asks for a permission, your answer will show up here.</p>';
    return this.section('permissoes', 'Site permissions', rows,
      'What sites can do without asking. Screen sharing is blocked in this version.') +
      `<div class="st-card st-sites"><h3>Choices by site</h3>${list}</div>`;
  },

  downloads() {
    const dir = settings.downloadDir || appInfo?.downloads || 'System Downloads folder';
    return this.section('downloads', 'Downloads',
      stRow('Save files to', `<span class="st-path">${escapeHtml(dir)}</span>`,
        stButton('Change…', 'pick-folder') + (settings.downloadDir ? stButton('Default', 'reset-folder', 'btn-link') : '')) +
      stRow('Ask where to save each file', null, stSwitch('downloadAsk')));
  },

  profiles() {
    const rows = PROFILES.list.map((p) => `
      <div class="st-row">
        <div class="st-text st-profile">${avatarHtml(p.avatar, p.name, 'md')}<b>${escapeHtml(p.name)}</b>${p.id === PROFILES.current ? '<span class="st-tag">in use</span>' : ''}</div>
        <div class="st-ctrl">${p.id !== PROFILES.current ? stButton('Use', 'profile-use', 'btn-secondary', `data-id="${p.id}"`) : ''}${stButton('Edit…', 'profile-edit', 'btn-secondary', `data-id="${p.id}"`)}</div>
      </div>`).join('');
    return this.section('perfis', 'Profiles', rows + `<div class="st-row"><div class="st-text"></div><div class="st-ctrl">${stButton('New profile', 'profile-new', 'btn-primary')}</div></div>`,
      'Each profile has its own history, favorites, settings, sign-ins and extensions.');
  },

  extensions() {
    const n = typeof extensions !== 'undefined' ? extensions.length : 0;
    return this.section('extensoes', 'Extensions',
      stRow(n ? `${n} ${n === 1 ? 'extension installed' : 'extensions installed'}` : 'No extensions installed',
        'Extensions from the Chrome Web Store, per profile. Compatibility may vary.',
        stButton('Manage…', 'extensions') + stButton('Chrome Web Store', 'store', 'btn-primary')));
  },

  about() {
    const v = appInfo || {};
    const keys = [
      ['Ctrl+T', 'New tab'], ['Ctrl+W', 'Close tab'], ['Ctrl+L', 'Address bar'], ['Ctrl+Tab', 'Next tab'],
      ['Alt+Z', 'Sidebar'], ['Ctrl+D', 'Add page to Favorites'], ['Ctrl+Shift+D', 'Save to Reading List'],
      ['Ctrl+H', 'History'], ['Ctrl+J', 'Downloads'], ['Ctrl+Shift+N', 'Private browsing'], ['Ctrl+,', 'Settings'], ['Alt+V', 'All tabs'],
      ['Ctrl+F', 'Find in page'], ['Ctrl+Shift+R', 'Reader'], ['F11', 'Full screen'], ['Ctrl+Shift+T', 'Reopen closed tab'], ['Ctrl+ / Ctrl−', 'Zoom in / out'], ['Ctrl+0', 'Reset zoom'],
      ['Alt+← / Alt+→', 'Back / Forward'], ['Ctrl+P', 'Print'],
    ];
    return this.section('sobre', 'About Kona',
      stRow('<img class="st-logo" src="../assets/icon.svg" alt="" />Kona', `Version ${escapeHtml(v.version || '—')} · Electron ${escapeHtml(v.electron || '—')} · Chromium ${escapeHtml(v.chrome || '—')}`, '') +
      `<div class="st-keys">${keys.map(([k, d]) => `<div><kbd>${k}</kbd><span>${d}</span></div>`).join('')}</div>`);
  },
};

/* ───────────── Interações da página ───────────── */
function afterSetting(key) {
  saveSettings();
  if (key === 'zoom') for (const t of tabs) applyZoom(t);
  if (key === 'searchEngine' || key === 'suggestions') omnibox.cache.clear();
  if (key === 'offerPasswords') api?.pw.setOffer(settings.offerPasswords !== false);
  if (key === 'sounds') { applySections(); if (settings.sounds) sfx.play('select'); }
  settingsPage.refresh();
}

$('#st-main').addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.set) {
    settings[el.dataset.set] = el.dataset.set === 'zoom' ? Number(el.value) : el.value;
    afterSetting(el.dataset.set);
  } else if (el.dataset.perm) {
    settings.permissions[el.dataset.perm] = el.value;
    afterSetting('permissions');
  } else if (el.dataset.site) {
    settings.sites[el.dataset.site][el.dataset.kind] = el.value;
    afterSetting('sites');
  }
});

$('#st-main').addEventListener('click', async (e) => {
  const sw = e.target.closest('[data-toggle]');
  if (sw) { const k = sw.dataset.toggle; settings[k] = !settings[k]; afterSetting(k); return; }
  const th = e.target.closest('[data-theme-set]');
  if (th) { settings.theme = th.dataset.themeSet; saveSettings(); applyTheme(true); settingsPage.refresh(); return; }
  const b = e.target.closest('[data-do]');
  if (!b) return;
  switch (b.dataset.do) {
    case 'customize': newTab(START, false); requestAnimationFrame(() => toggleCustomize(true)); break;
    case 'clear-data': openClearSheet({ historyOnly: false }); break;
    case 'sites': openSitesSheet(); break;
    case 'import': openImport(); break;
    case 'pw-manage': openPasswordSheet(); break;
    case 'pw-import': importPasswords(); break;
    case 'pw-export': exportPasswords(); break;
    case 'pick-folder': {
      const dir = await api?.pickFolder();
      if (dir) { settings.downloadDir = dir; afterSetting('downloadDir'); }
      break;
    }
    case 'reset-folder': settings.downloadDir = null; afterSetting('downloadDir'); break;
    case 'site-forget': delete settings.sites[b.dataset.origin]; afterSetting('sites'); break;
    case 'profile-use': switchProfile(b.dataset.id); break;
    case 'profile-edit': openProfileSheet('edit', b.dataset.id); break;
    case 'profile-new': openProfileSheet('new'); break;
    case 'extensions': openExtensions(); break;
    case 'store': newTab(STORE_URL, false); break;
    default:
  }
});
$('#st-nav').addEventListener('click', (e) => {
  const b = e.target.closest('[data-go]');
  if (b) settingsPage.scrollTo(b.dataset.go);
});
$('#sb-settings').addEventListener('click', () => openSettings());

/* ───────────── Dados de sites ───────────── */
let siteData = [];
async function openSitesSheet() {
  openSheet('#sites-sheet');
  $('#sites-q').value = '';
  $('#sites-list').innerHTML = '<p class="st-empty">Loading…</p>';
  siteData = (await api?.sitesList(PROFILES.currentProfile().partition)) || [];
  renderSites();
}
function renderSites() {
  const q = $('#sites-q').value.trim().toLowerCase();
  const list = siteData.filter((s) => s.site.includes(q));
  $('#sites-count').textContent = `${siteData.length} ${siteData.length === 1 ? 'site' : 'sites'}`;
  $('#sites-list').innerHTML = list.length ? list.map((s) => `
    <div class="sb-row" data-site="${escapeHtml(s.site)}">
      <span class="sb-fav"><span class="mono">${escapeHtml(s.site[0].toUpperCase())}</span></span>
      <div class="sb-row-text"><b>${escapeHtml(s.site)}</b><span>${s.count} ${s.count === 1 ? 'cookie' : 'cookies'}</span></div>
      <button class="btn-link" data-remove-site="${escapeHtml(s.site)}">Remove</button>
    </div>`).join('')
    : `<p class="st-empty">${siteData.length ? 'No sites match your search.' : 'No sites store cookies in this profile.'}</p>`;
}
$('#sites-q').addEventListener('input', renderSites);
$('#sites-list').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-remove-site]');
  if (!b) return;
  await api?.sitesRemove(PROFILES.currentProfile().partition, b.dataset.removeSite);
  siteData = siteData.filter((s) => s.site !== b.dataset.removeSite);
  renderSites();
});
$('#sites-all').addEventListener('click', async () => {
  const yes = await ask({ title: 'Remove data for all sites?', text: 'You’ll be signed out of the accounts you’re signed in to in this profile.', ok: 'Remove all', danger: true });
  if (!yes) return;
  await api?.clearBrowsingData(PROFILES.currentProfile().partition, { cookies: true });
  siteData = [];
  renderSites();
  openSheet('#sites-sheet');
});
$('#sites-close').addEventListener('click', () => closeSheet('#sites-sheet'));

/* ───────────── Pedido de permissão de um site ───────────── */
const permQueue = [];
let permCurrent = null;
function nextPerm() {
  if (permCurrent || !permQueue.length) return;
  permCurrent = permQueue.shift();
  const { origin, kinds } = permCurrent;
  const host = origin.replace(/^https?:\/\//, '');
  $('#perm-icon').innerHTML = icon(PERM_INFO[kinds[0]]?.ic || 'info');
  $('#perm-title').textContent = `“${host}” wants to ${kinds.map((k) => PERM_INFO[k]?.verb || k).join(' and ')}`;
  $('#perm-text').textContent = permCurrent.private
    ? 'In private browsing, your answer only applies to this session.'
    : 'Kona remembers your answer. You can change it later in Settings › Site permissions.';
  openSheet('#perm-sheet');
}
function answerPerm(allow) {
  if (!permCurrent) return;
  const { id, origin, kinds } = permCurrent;
  api?.permReply(id, allow);
  if (!permCurrent.private) {
    settings.sites[origin] ||= {};
    for (const k of kinds) settings.sites[origin][k] = allow ? 'allow' : 'block';
    saveSettings();
    settingsPage.refresh();
  }
  permCurrent = null;
  closeSheet('#perm-sheet');
  setTimeout(nextPerm, 250);
}
api?.on('perm:ask', (req) => { permQueue.push(req); nextPerm(); });
$('#perm-yes').addEventListener('click', () => answerPerm(true));
$('#perm-no').addEventListener('click', () => answerPerm(false));

/* ───────────── Downloads ───────────── */
api?.on('download:start', ({ name }) => toast(`Downloading “${name}”…`));
api?.on('download:done', ({ name, path, state }) => {
  if (state === 'completed') toast(`“${name}” downloaded`, { label: 'Show in folder', run: () => api.showDownload(path) });
  else if (state === 'cancelled') toast('Download canceled');
  else toast(`Couldn’t download “${name}”`);
});

hydrateIcons($('#perm-sheet'));
if (active()?.url === SETTINGS) settingsPage.render();
