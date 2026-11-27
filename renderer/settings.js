'use strict';
// Configurações (kona://settings), pedido de permissão dos sites e avisos de download.

const PERMS = [
  ['camera', /*i18n*/'Camera', 'camera', /*i18n*/'use your camera'],
  ['microphone', /*i18n*/'Microphone', 'mic', /*i18n*/'use your microphone'],
  ['location', /*i18n*/'Location', 'pin', /*i18n*/'know your location'],
  ['notifications', /*i18n*/'Notifications', 'bell', /*i18n*/'show notifications'],
  ['clipboard', /*i18n*/'Read the clipboard', 'clipboard', /*i18n*/'read your clipboard'],
  ['apps', /*i18n*/'Open external apps', 'external', /*i18n*/'open an app on your computer'],
];
const PERM_INFO = Object.fromEntries(PERMS.map(([k, label, ic, verb]) => [k, { label, ic, verb }]));

const ST_SECTIONS = [
  ['geral', /*i18n*/'General', 'gear'],
  ['aparencia', /*i18n*/'Appearance', 'palette'],
  ['desempenho', /*i18n*/'Performance', 'gauge'],
  ['senhas', /*i18n*/'Passwords', 'key'],
  ['enderecos', /*i18n*/'Addresses and cards', 'card'],
  ['privacidade', /*i18n*/'Privacy and security', 'shield'],
  ['permissoes', /*i18n*/'Site permissions', 'hand'],
  ['downloads', /*i18n*/'Downloads', 'download'],
  ['perfis', /*i18n*/'Profiles', 'user'],
  ['extensoes', /*i18n*/'Extensions', 'puzzle'],
  ['apps', /*i18n*/'Apps', 'installApp'],
  ['sobre', /*i18n*/'About Kona', 'info'],
];

/* ───────────── Controles ───────────── */
/** Leitores de tela: o controle da linha (interruptor, lista, campo) leva o título da linha como nome. */
const named = (control, label) => control.replace(/<(select|input)\b(?![^>]*aria-label)|role="switch"(?![^>]*aria-label)/,
  (m) => `${m} aria-label="${String(label).replace(/<[^>]*>/g, '').replace(/"/g, '&quot;')}"`);
const stRow = (label, desc, control, extra = '') => `
  <div class="st-row${extra}">
    <div class="st-text"><b>${label}</b>${desc ? `<p>${desc}</p>` : ''}</div>
    <div class="st-ctrl">${named(control, label)}</div>
  </div>`;
const stSelect = (key, options, value = settings[key], attr = `data-set="${key}"`) => `
  <select class="st-select" ${attr}>${options.map(([v, l]) => `<option value="${v}"${String(v) === String(value) ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
const stSwitch = (key, on = !!settings[key]) => `<button class="sw${on ? ' on' : ''}" role="switch" aria-checked="${on}" data-toggle="${key}"><span></span></button>`;
const stButton = (label, act, cls = 'btn-secondary', data = '') => `<button class="${cls}" data-do="${act}" ${data}>${label}</button>`;

let appInfo = null;
// DNS seguro: geral, guardado no processo principal (vale para todos os perfis)
let globalDns = settings.secureDns !== false;
api?.dnsGet?.().then((v) => { if (typeof v === 'boolean' && v !== globalDns) { globalDns = v; if (active()?.url === SETTINGS) settingsPage.refresh(); } });
api?.on('dns:changed', (v) => { globalDns = !!v; if (active()?.url === SETTINGS) settingsPage.refresh(); });
const safeInfo = { asked: false, updated: 0, entries: 0 };

const settingsPage = {
  built: false,

  render() {
    if (!this.built) this.build();
  },

  build() {
    this.built = true;
    $('#st-nav').innerHTML = ST_SECTIONS.map(([id, label, ic]) =>
      `<button class="st-nav-item" data-go="${id}"><span data-icon="${ic}">${icon(ic)}</span>${tl(label)}</button>`).join('');
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
    // o teclado não perde o lugar: o mesmo controle volta a ter o foco depois de redesenhar
    const main = $('#st-main'), had = main.contains(document.activeElement) ? document.activeElement : null;
    const sig = (el) => el.tagName + [...el.attributes].filter((a) => a.name === 'id' || a.name === 'name' || a.name.startsWith('data-')).map((a) => `${a.name}=${a.value}`).join('|');
    const focusSig = had && sig(had), focusIdx = had ? $$('button, input, select, textarea, [tabindex]', main).indexOf(had) : -1;
    if (had) queueMicrotask(() => {
      const list = $$('button, input, select, textarea, [tabindex]', main);
      (list.find((el) => sig(el) === focusSig) || list[focusIdx])?.focus({ preventScroll: true });
    });
    main.innerHTML = [
      this.general(), this.appearance(), this.performance(), this.passwords(), typeof afSettingsSection === 'function' ? afSettingsSection() : '', this.privacy(), this.permissions(),
      this.downloads(), this.profiles(), this.extensions(), typeof appsSettingsSection === 'function' ? appsSettingsSection() : '', this.about(),
    ].join('');
    $('#st-scroll').scrollTop = scroll;
  },

  section(id, title, body, intro = '') {
    return `<section class="st-sec" id="st-${id}"><h2>${tl(title)}</h2>${intro ? `<p class="st-intro">${intro}</p>` : ''}<div class="st-card">${body}</div></section>`;
  },

  general() {
    return this.section('geral', /*i18n*/'General',
      stRow(tl('Language'), tl('Kona’s menus and messages. Follows Windows unless you pick one.'),
        stSelect(null, [['auto', `${tl('Automatic')} (${LANGUAGES.find(([c]) => c === matchLanguage(i18n.system))[1]})`], ...LANGUAGES], i18n.choice, 'data-lang="1"')) +
      stRow(tl('When Kona starts'), tl('Tabs in groups are always kept.'),
        stSelect('startup', [['newtab', tl('Open a new tab')], ['restore', tl('Restore tabs from last session')]])) +
      stRow(tl('Search engine'), tl('Used in the address bar.'),
        stSelect('searchEngine', Object.entries(ENGINES).map(([k, e]) => [k, e.name]))) +
      stRow(tl('Site search'), tl('Type a shortcut like “yt” and press Tab to search right on that site. @tabs, @favorites and @history search only there.'),
        stButton(tl('Manage…'), 'site-search')) +
      stRow(tl('Search suggestions'), tl('As you type in the address bar, your text is sent to {engine} to suggest searches.', { engine: escapeHtml(engine().name) }),
        stSwitch('suggestions')) +
      stRow(tl('Save browsing history'), tl('Visited sites and searches stay on this computer, in the current profile.'),
        stSwitch('saveHistory')) +
      stRow(tl('Import from another browser'), tl('Bring your favorites, history and extensions from Chrome, Edge or Brave.'),
        stButton(tl('Import…'), 'import')));
  },

  appearance() {
    const theme = settings.theme;
    const seg = ['light', 'dark', 'system'].map((t) =>
      `<button class="${t === theme ? 'on' : ''}" data-theme-set="${t}">${{ light: tl('Light'), dark: tl('Dark'), system: tl('System') }[t]}</button>`).join('');
    return this.section('aparencia', /*i18n*/'Appearance',
      stRow(tl('Theme'), tl('Applies to Kona and to pages that follow the system theme.'), `<div class="seg st-seg">${seg}</div>`) +
      stRow(tl('New tab background and sections'), tl('Pick a background, a color or your own photo, and choose what appears on the new tab.'),
        stButton(tl('Customize…'), 'customize')) +
      stRow(tl('Interface sounds'), tl('Short sounds when you open menus, move between tabs and hover over favorites.'), stSwitch('sounds')) +
      stRow(tl('Default page zoom'), null,
        stSelect('zoom', [[0.75, '75%'], [0.9, '90%'], [1, '100%'], [1.1, '110%'], [1.25, '125%'], [1.5, '150%']])));
  },

  /** Economia de memória (O1): liga/desliga, modo (como no Chrome) e sites sempre ativos. */
  performance() {
    const keep = settings.keepActive || [];
    const list = keep.length
      ? keep.map((h) => `<div class="st-keep-row"><span class="st-keep-host">${escapeHtml(h)}</span><button class="sb-act" data-do="keep-remove" data-host="${escapeHtml(h)}" title="${tl('Remove')}" aria-label="${tl('Remove')} ${escapeHtml(h)}">${icon('x')}</button></div>`).join('')
      : `<p class="st-empty">${tl('No sites yet.')}</p>`;
    return this.section('desempenho', /*i18n*/'Performance',
      stRow(tl('Memory saver'), tl('Frees memory from tabs you haven’t used for a while. They reload, in the same place, when you go back to them.'), stSwitch('memorySaver')) +
      (settings.memorySaver ? stRow(tl('Mode'), {
        moderate: tl('Tabs become inactive after 2 hours, or sooner if Windows is running out of memory.'),
        balanced: tl('Tabs become inactive after 1 hour, or sooner if Windows is low on memory. Recommended.'),
        maximum: tl('Tabs become inactive after 15 minutes. Frees the most memory.'),
      }[settings.memorySaverMode] || '', stSelect('memorySaverMode', [['moderate', tl('Moderate')], ['balanced', tl('Balanced')], ['maximum', tl('Maximum')]])) : '') +
      stRow(tl('Always keep these sites active'), tl('Tabs playing sound, sharing the screen, using the camera or microphone, with a form you started filling in, or from sites allowed to show notifications are never made inactive.'),
        `<div class="st-keep"><input class="pf-input st-keep-input" id="keep-host" placeholder="${tl('Site, e.g. web.whatsapp.com')}" spellcheck="false" aria-label="${tl('Site to keep active')}" /><button class="btn-secondary" data-do="keep-add">${tl('Add')}</button></div>`) +
      `<div class="st-keep-list">${list}</div>`);
  },

  passwords() {
    const n = typeof pwState !== 'undefined' ? pwState.count : null;
    return this.section('senhas', /*i18n*/'Passwords',
      stRow(tl('Offer to save passwords'), tl('Kona asks to save the password when you sign in to a site, and fills it in next time.'), stSwitch('offerPasswords', settings.offerPasswords !== false)) +
      stRow(tl('Saved passwords'), n == null ? tl('Stored on this computer, encrypted by Windows.') : tln(n, '{n} password · stored on this computer, encrypted by Windows.', '{n} passwords · stored on this computer, encrypted by Windows.'),
        stButton(tl('Manage…'), 'pw-manage')) +
      stRow(tl('Import passwords'), tl('From a CSV file exported by Chrome, Edge, Firefox, Bitwarden or another password manager.'), stButton(tl('Import…'), 'pw-import')) +
      stRow(tl('Export passwords'), tl('Saves all your passwords to a CSV file. Anyone with the file can read them.'), stButton(tl('Export…'), 'pw-export')));
  },

  privacy() {
    // proteção contra golpes e malware (O2): estado das listas (chega do processo principal)
    if (!safeInfo.asked) { safeInfo.asked = true; api?.safeStatus?.().then((s) => { Object.assign(safeInfo, s); this.refresh(); }); }
    const fmt = new Intl.NumberFormat(document.documentElement.lang || 'en');
    const when = safeInfo.updated ? new Intl.DateTimeFormat(document.documentElement.lang || 'en', { dateStyle: 'short', timeStyle: 'short' }).format(safeInfo.updated) : null;
    const safeDesc = tl('Warns you before you open a scam site or a site that spreads malware, and blocks downloads from them. Uses open lists (URLhaus, OpenPhish, Phishing.Database), checked on this computer: the sites you visit aren’t sent anywhere.')
      + (settings.safeBrowsing ? ` <span class="st-safe-status">${when ? tl('Lists updated {when} · {n} sites.', { when, n: fmt.format(safeInfo.entries || 0) }) : tl('Downloading the lists…')}</span>` : '');
    return this.section('privacidade', /*i18n*/'Privacy and security',
      stRow(tl('Protection against scams and malware'), safeDesc, stSwitch('safeBrowsing')) +
      (settings.safeBrowsing ? stRow(tl('Google Safe Browsing key (optional)'), tl('With your own free key from Google, Google also checks the pages you open (their address is sent to Google). Leave empty to use only the open lists.'),
        `<input class="pf-input st-key" data-set="safeBrowsingKey" value="${escapeHtml(settings.safeBrowsingKey || '')}" placeholder="AIza…" spellcheck="false" autocomplete="off" />`) : '') +
      stRow(tl('Cookies'), {
        allow: tl('All sites can save and read cookies.'),
        'block-third-party': tl('Recommended. Blocks cookies that other sites (ads, trackers) use inside the page you’re viewing.'),
        'block-all': tl('No site can save cookies sent over the network. Sign-ins and shopping carts will stop working.'),
      }[settings.cookies], stSelect('cookies', [['allow', tl('Allow all')], ['block-third-party', tl('Block third-party')], ['block-all', tl('Block all')]])) +
      stRow(tl('Delete cookies and site data when Kona closes'), tl('You’ll be signed out of every account each time you close Kona.'), stSwitch('clearOnExit')) +
      stRow(tl('Ask sites not to sell or share your data'), tl('Sends the Global Privacy Control (GPC) signal. Some places require sites by law to honor it.'), stSwitch('gpc')) +
      stRow(tl('Always use secure connections'), tl('Opens sites over HTTPS. If a site doesn’t support HTTPS, it loads normally without encryption.'), stSwitch('httpsFirst')) +
      stRow(tl('Secure DNS'), `${tl('Encrypts DNS lookups (Quad9) and blocks known scam and malware sites. Turn it off if an address on your company network won’t open.')} ${tl('Applies to all profiles.')}`, stSwitch('secureDns', globalDns)) +
      stRow(tl('Site data'), tl('See which sites store cookies in this profile and delete the ones you want.'), stButton(tl('View site data…'), 'sites')) +
      stRow(tl('Clear browsing data'), tl('History, cookies and cached files.'), stButton(tl('Clear…'), 'clear-data')),
      tl('These options apply to the current profile. Private browsing follows the same rules and also deletes everything when you leave it.'));
  },

  permissions() {
    const rows = PERMS.map(([k, label, ic]) => stRow(
      `<span class="st-ic">${icon(ic)}</span>${tl(label)}`, null,
      stSelect(null, [['ask', tl('Ask')], ['allow', tl('Allow')], ['block', tl('Block')]], settings.permissions[k], `data-perm="${k}"`),
    )).join('');
    const sites = Object.entries(settings.sites).filter(([, d]) => Object.keys(d).length);
    const list = sites.length
      ? sites.map(([origin, d]) => `
        <div class="st-site">
          <div class="st-site-head"><b>${escapeHtml(origin.replace(/^https?:\/\//, ''))}</b>${stButton(tl('Forget'), 'site-forget', 'btn-link', `data-origin="${escapeHtml(origin)}"`)}</div>
          <div class="st-site-perms">${Object.entries(d).map(([k, v]) => `
            <label class="st-chip"><span>${icon(PERM_INFO[k]?.ic || 'info')}${PERM_INFO[k] ? tl(PERM_INFO[k].label) : k}</span>
              ${stSelect(null, [['allow', tl('Allow')], ['block', tl('Block')]], v, `data-site="${escapeHtml(origin)}" data-kind="${k}"`)}</label>`).join('')}
          </div>
        </div>`).join('')
      : `<p class="st-empty">${tl('No saved choices yet. When a site asks for a permission, your answer will show up here.')}</p>`;
    // os cartões "por site" ficam dentro da seção (o espaço até a próxima vem dela)
    return this.section('permissoes', /*i18n*/'Site permissions', rows,
      tl('What sites can do without asking. Screen sharing always asks what to share.')).replace(/<\/section>$/,
      `<div class="st-card st-sites"><h3>${tl('Choices by site')}</h3>${list}</div>${this.siteRules()}</section>`);
  },

  // Configurações por site (N17): JavaScript, pop-ups e cookies, pelo site inteiro
  siteRules() {
    const entries = Object.entries(settings.siteRules || {}).sort(([a], [b]) => a.localeCompare(b));
    const opts = (k) => (k === 'js' ? [['', tl('Default')], ['block', tl('Block')]] : [['', tl('Default')], ['allow', tl('Allow')], ['block', tl('Block')]]);
    const list = entries.length
      ? entries.map(([site, r]) => `
        <div class="st-site" data-rule-row="${escapeHtml(site)}">
          <div class="st-site-head"><b>${escapeHtml(site)}</b>${stButton(tl('Forget'), 'rule-forget', 'btn-link', `data-site="${escapeHtml(site)}"`)}</div>
          <div class="st-site-perms">${SITE_KINDS.map(([k, label, ic]) => `
            <label class="st-chip"><span>${icon(ic)}${tl(label)}</span>
              ${stSelect(null, opts(k), r[k] || '', `data-rule-site="${escapeHtml(site)}" data-rule-kind="${k}"`)}</label>`).join('')}
          </div>
        </div>`).join('')
      : `<p class="st-empty">${tl('No site settings yet. Click the lock in the address bar to choose JavaScript, pop-ups and cookies for a site.')}</p>`;
    const search = entries.length > 5 ? `<input class="sb-search st-rules-q" id="st-rules-q" placeholder="${tl('Search sites')}" spellcheck="false" />` : '';
    return `<div class="st-card st-sites"><h3>${tl('JavaScript, pop-ups and cookies by site')}</h3>${search}${list}</div>`;
  },

  downloads() {
    const dir = settings.downloadDir || appInfo?.downloads || tl('System Downloads folder');
    return this.section('downloads', /*i18n*/'Downloads',
      stRow(tl('Save files to'), `<span class="st-path">${escapeHtml(dir)}</span>`,
        stButton(tl('Change…'), 'pick-folder') + (settings.downloadDir ? stButton(tl('Default'), 'reset-folder', 'btn-link') : '')) +
      stRow(tl('Ask where to save each file'), null, stSwitch('downloadAsk')));
  },

  profiles() {
    const rows = PROFILES.list.map((p) => `
      <div class="st-row">
        <div class="st-text st-profile">${avatarHtml(p.avatar, p.name, 'md')}<b>${escapeHtml(p.name)}</b>${p.id === PROFILES.current ? `<span class="st-tag">${tl('in use')}</span>` : ''}</div>
        <div class="st-ctrl">${p.id !== PROFILES.current ? stButton(tl('Open'), 'profile-use', 'btn-secondary', `data-id="${p.id}"`) : ''}${stButton(tl('Edit…'), 'profile-edit', 'btn-secondary', `data-id="${p.id}"`)}</div>
      </div>`).join('');
    return this.section('perfis', /*i18n*/'Profiles', rows + `<div class="st-row"><div class="st-text"></div><div class="st-ctrl">${stButton(tl('New profile'), 'profile-new', 'btn-primary')}</div></div>`,
      tl('Each profile has its own history, favorites, settings, sign-ins and extensions.'));
  },

  extensions() {
    const n = typeof extensions !== 'undefined' ? extensions.length : 0;
    return this.section('extensoes', /*i18n*/'Extensions',
      stRow(n ? tln(n, '{n} extension installed', '{n} extensions installed') : tl('No extensions installed'),
        tl('Extensions from the Chrome Web Store, per profile. Compatibility may vary.'),
        stButton(tl('Manage…'), 'extensions') + stButton('Chrome Web Store', 'store', 'btn-primary')));
  },

  about() {
    const v = appInfo || {};
    const keys = [
      ['Ctrl+T', /*i18n*/'New tab'], ['Ctrl+N', /*i18n*/'New window'], ['Ctrl+W', /*i18n*/'Close tab'], ['Ctrl+L', /*i18n*/'Address bar'], ['Ctrl+Tab', /*i18n*/'Next tab'], ['Ctrl+1…8 / Ctrl+9', /*i18n*/'Go to tab / last tab'],
      ['Ctrl+PgUp / PgDn', /*i18n*/'Previous / next tab'], ['Ctrl+Shift+PgUp / PgDn', /*i18n*/'Move tab left / right'],
      ['Alt+Z', /*i18n*/'Sidebar'], ['Ctrl+D', /*i18n*/'Add page to Favorites'], ['Ctrl+Shift+D', /*i18n*/'Save to Reading List'],
      ['Ctrl+H', /*i18n*/'History'], ['Ctrl+J', /*i18n*/'Downloads'], ['Ctrl+Shift+N', /*i18n*/'Private browsing'], ['Ctrl+,', /*i18n*/'Settings'], ['Alt+V', /*i18n*/'All tabs'],
      ['Ctrl+F', /*i18n*/'Find in page'], ['Ctrl+Shift+R', /*i18n*/'Reader'], ['F11', /*i18n*/'Full screen'], ['Ctrl+Shift+T', /*i18n*/'Reopen closed tab'], ['Ctrl+ / Ctrl−', /*i18n*/'Zoom in / out'], ['Ctrl+0', /*i18n*/'Reset zoom'],
      ['Alt+← / Alt+→', /*i18n*/'Back / Forward'], ['Ctrl+P', /*i18n*/'Print'],
    ];
    return this.section('sobre', /*i18n*/'About Kona',
      stRow('<img class="st-logo" src="../assets/icon.svg" alt="" />Kona', `${tl('Version')} ${escapeHtml(v.version || '—')} · Electron ${escapeHtml(v.electron || '—')} · Chromium ${escapeHtml(v.chrome || '—')}`, '') +
      stRow(tl('Report a problem'), tl('Opens a new issue on GitHub with your Kona and Windows versions filled in. Nothing is sent until you post it.'),
        stButton(tl('Report a problem…'), 'report')) +
      stRow(tl('Open-source licenses'), tl('Kona is open source (MIT) and built on Chromium, Electron and other projects.'),
        stButton(tl('View…'), 'licenses')) +
      `<div class="st-keys">${keys.map(([k, d]) => `<div><kbd>${k}</kbd><span>${tl(d)}</span></div>`).join('')}</div>`);
  },
};

/* ───────────── Interações da página ───────────── */
function afterSetting(key) {
  saveSettings();
  if (key === 'zoom') for (const t of tabs) applyZoom(t);
  if (key === 'searchEngine' || key === 'suggestions') omnibox.cache.clear();
  if (key === 'offerPasswords') api?.pw.setOffer(settings.offerPasswords !== false);
  if ((key === 'autofillAddresses' || key === 'autofillCards') && typeof syncAfPrefs === 'function') syncAfPrefs();
  if (key === 'sounds') { applySections(); if (settings.sounds) sfx.play('select'); }
  if (key === 'safeBrowsing') safeInfo.asked = false; // ligou de novo: busca o estado das listas
  settingsPage.refresh();
}

/** "web.whatsapp.com", "https://x.com/abc" → host sem "www." (para a lista de sites sempre ativos). */
function keepHostOf(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return '';
  try { return new URL(/^[a-z]+:\/\//.test(t) ? t : `https://${t}`).hostname.replace(/^www\./, ''); } catch { return ''; }
}
$('#st-main').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'keep-host') { e.preventDefault(); $('#st-main [data-do="keep-add"]').click(); }
});
$('#st-main').addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.lang) { setLanguage(el.value); return; }
  if (el.dataset.set) {
    settings[el.dataset.set] = el.dataset.set === 'zoom' ? Number(el.value) : el.value;
    afterSetting(el.dataset.set);
  } else if (el.dataset.perm) {
    settings.permissions[el.dataset.perm] = el.value;
    afterSetting('permissions');
  } else if (el.dataset.ruleSite) {
    setSiteRule(el.dataset.ruleSite, el.dataset.ruleKind, el.value, { profile: true });
  } else if (el.dataset.site) {
    settings.sites[el.dataset.site][el.dataset.kind] = el.value;
    afterSetting('sites');
  }
});

$('#st-main').addEventListener('input', (e) => {
  if (e.target.id !== 'st-rules-q') return;
  const q = e.target.value.trim().toLowerCase();
  $$('[data-rule-row]', $('#st-main')).forEach((row) => { row.hidden = !!q && !row.dataset.ruleRow.includes(q); });
});
$('#st-main').addEventListener('click', async (e) => {
  const sw = e.target.closest('[data-toggle]');
  // DNS seguro: um ajuste do Kona inteiro (o Chromium tem um DNS só), não do perfil (O7)
  if (sw?.dataset.toggle === 'secureDns') { globalDns = !globalDns; api?.dnsSet(globalDns); settingsPage.refresh(); return; }
  if (sw) { const k = sw.dataset.toggle; settings[k] = !settings[k]; afterSetting(k); return; }
  const th = e.target.closest('[data-theme-set]');
  if (th) { settings.theme = th.dataset.themeSet; saveSettings(); applyTheme(true); settingsPage.refresh(); return; }
  const b = e.target.closest('[data-do]');
  if (!b) return;
  switch (b.dataset.do) {
    case 'customize': newTab(START, false); requestAnimationFrame(() => toggleCustomize(true)); break;
    case 'clear-data': openClearSheet({ historyOnly: false }); break;
    case 'keep-add': {
      const h = keepHostOf($('#keep-host').value);
      if (!h) { $('#keep-host').focus(); break; }
      settings.keepActive = [...new Set([...(settings.keepActive || []), h])];
      afterSetting('keepActive');
      requestAnimationFrame(() => $('#keep-host')?.focus());
      break;
    }
    case 'keep-remove':
      settings.keepActive = (settings.keepActive || []).filter((x) => x !== b.dataset.host);
      afterSetting('keepActive');
      break;
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
    case 'app-open': api?.apps.open(b.dataset.app); break;
    case 'app-uninstall': uninstallApp(b.dataset.app); break;
    case 'rule-forget': delete settings.siteRules[b.dataset.site]; afterSetting('siteRules'); break;
    case 'profile-use': switchProfile(b.dataset.id); break;
    case 'profile-edit': openProfileSheet('edit', b.dataset.id); break;
    case 'profile-new': openProfileSheet('new'); break;
    case 'extensions': openExtensions(); break;
    case 'store': newTab(STORE_URL, false); break;
    case 'site-search': openSiteSearchSheet(); break;
    case 'report': reportProblem(); break;
    case 'licenses': openLicenses(); break;
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
  $('#sites-list').innerHTML = `<p class="st-empty">${tl('Loading…')}</p>`;
  siteData = (await api?.sitesList(PROFILES.currentProfile().partition)) || [];
  renderSites();
}
function renderSites() {
  const q = $('#sites-q').value.trim().toLowerCase();
  const list = siteData.filter((s) => s.site.includes(q));
  $('#sites-count').textContent = tln(siteData.length, '{n} site', '{n} sites');
  $('#sites-list').innerHTML = list.length ? list.map((s) => `
    <div class="sb-row" data-site="${escapeHtml(s.site)}">
      <span class="sb-fav"><span class="mono">${escapeHtml(s.site[0].toUpperCase())}</span></span>
      <div class="sb-row-text"><b>${escapeHtml(s.site)}</b><span>${tln(s.count, '{n} cookie', '{n} cookies')}</span></div>
      <button class="btn-link" data-remove-site="${escapeHtml(s.site)}">${tl('Remove')}</button>
    </div>`).join('')
    : `<p class="st-empty">${siteData.length ? tl('No sites match your search.') : tl('No sites store cookies in this profile.')}</p>`;
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
  const yes = await ask({ title: tl('Remove data for all sites?'), text: tl('You’ll be signed out of the accounts you’re signed in to in this profile.'), ok: tl('Remove all'), danger: true });
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
  $('#perm-title').textContent = tl('“{host}” wants to {what}', { host, what: kinds.map((k) => tl(PERM_INFO[k]?.verb || k)).join(tl(' and ')) });
  $('#perm-text').textContent = permCurrent.private
    ? tl('In private browsing, your answer only applies to this session.')
    : tl('Kona remembers your answer. You can change it later in Settings › Site permissions.');
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
api?.on('download:start', ({ name }) => toast(tl('Downloading “{name}”…', { name })));
api?.on('download:done', ({ name, path, state, discarded }) => {
  if (discarded) return; // "Descartar": a lista já avisa
  if (state === 'dangerous') toast(tl('“{name}” may be dangerous. Keep it?', { name }), { label: tl('Review'), run: () => openSidebarView('downloads') });
  else if (state === 'blocked') toast(tl('Windows blocked “{name}”: virus or unwanted program detected', { name }));
  else if (state === 'completed') toast(tl('“{name}” downloaded', { name }), { label: tl('Show in folder'), run: () => api.showDownload(path) });
  else if (state === 'cancelled') toast(tl('Download canceled'));
  else toast(tl('Couldn’t download “{name}”', { name }));
});

hydrateIcons($('#perm-sheet'));
if (active()?.url === SETTINGS) settingsPage.render();

/* ───────────── Busca em sites (atalhos da barra de endereço, N12) ───────────── */
let ssDraft = [];
function openSiteSearchSheet() {
  ssDraft = siteSearches().map((x) => ({ ...x }));
  renderSiteSearchSheet();
  openSheet('#ss-sheet');
}
function renderSiteSearchSheet() {
  $('#ss-list').innerHTML = ssDraft.map((x, i) => `<div class="ss-row" data-i="${i}">
      <input class="pf-input ss-name" data-f="name" value="${escapeHtml(x.name)}" placeholder="${tl('Name')}" spellcheck="false" />
      <input class="pf-input ss-key" data-f="keyword" value="${escapeHtml(x.keyword)}" placeholder="${tl('Shortcut')}" spellcheck="false" />
      <input class="pf-input ss-url" data-f="url" value="${escapeHtml(x.url)}" placeholder="https://example.com/search?q=%s" spellcheck="false" />
      <button class="sb-act" data-ss-del="${i}" title="${tl('Delete')}">${icon('x')}</button>
    </div>`).join('') || `<p class="st-empty">${tl('No site searches.')}</p>`;
}
$('#ss-list').addEventListener('input', (e) => {
  const row = e.target.closest('.ss-row');
  if (row && e.target.dataset.f) ssDraft[+row.dataset.i][e.target.dataset.f] = e.target.value;
});
$('#ss-list').addEventListener('click', (e) => {
  const d = e.target.closest('[data-ss-del]');
  if (!d) return;
  ssDraft.splice(+d.dataset.ssDel, 1);
  renderSiteSearchSheet();
});
$('#ss-add').addEventListener('click', () => {
  ssDraft.push({ id: Date.now().toString(36), name: '', keyword: '', url: '' });
  renderSiteSearchSheet();
  $$('#ss-list .ss-name').pop()?.focus();
});
$('#ss-reset').addEventListener('click', () => { ssDraft = defaultSiteSearches(); renderSiteSearchSheet(); });
$('#ss-cancel').addEventListener('click', () => closeSheet('#ss-sheet'));
$('#ss-save').addEventListener('click', () => {
  const clean = ssDraft.map((x) => ({ id: x.id || Date.now().toString(36), name: x.name.trim(), keyword: x.keyword.trim().replace(/\s+/g, '').toLowerCase(), url: x.url.trim() }))
    .filter((x) => x.name || x.keyword || x.url);
  const bad = clean.find((x) => !x.name || !x.keyword || !/^https?:\/\/.+%s/.test(x.url));
  if (bad) { toast(tl('Each site needs a name, a shortcut and an address with %s where the search goes')); return; }
  const dup = clean.find((x, i) => clean.findIndex((y) => y.keyword === x.keyword) !== i);
  if (dup) { toast(tl('The shortcut “{k}” is used twice', { k: dup.keyword })); return; }
  settings.siteSearch = clean;
  saveSettings();
  closeSheet('#ss-sheet');
  toast(tl('Site search saved'));
});
