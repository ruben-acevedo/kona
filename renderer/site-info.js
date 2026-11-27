'use strict';
// Configurações por site (N17) e o painel do cadeado da barra de endereço.
// As escolhas valem para o site inteiro (domínio registrável, com subdomínios): JavaScript, pop-ups
// e cookies. Quem aplica é o processo principal (session-policy.js e o bloqueio de pop-ups em main.js).
// Nas janelas privadas, o que se muda vale só até a janela fechar (fica na memória desta janela).

const SITE_KINDS = [
  ['js', /*i18n*/'JavaScript', 'code'],
  ['popups', /*i18n*/'Pop-ups', 'popupBlocked'],
  ['cookies', /*i18n*/'Cookies', 'cookie'],
];
const RELOAD_KINDS = new Set(['js', 'cookies']); // só valem depois de recarregar a página
const privateSiteRules = {}; // partição privada → { site: { js, popups, cookies } }

function siteRulesStore() {
  return library.isPrivate() ? (privateSiteRules[library.partition()] ||= {}) : settings.siteRules;
}
/** A escolha guardada para o site: 'allow' | 'block' | '' (o padrão). */
function getSiteRule(site, kind) {
  if (!site) return '';
  const priv = library.isPrivate() ? privateSiteRules[library.partition()]?.[site]?.[kind] : null;
  return priv || settings.siteRules[site]?.[kind] || '';
}
/** Guarda (ou apaga, com value vazio) a escolha do site e avisa o processo principal. */
function setSiteRule(site, kind, value, { profile = false } = {}) {
  if (!site) return;
  const store = profile ? settings.siteRules : siteRulesStore();
  const r = { ...(store[site] || {}) };
  if (value) r[kind] = value; else delete r[kind];
  if (Object.keys(r).length) store[site] = r; else delete store[site];
  if (store !== settings.siteRules) api?.setPrivateSiteRules(library.partition(), store);
  else { saveSettings(); settingsPage.refresh?.(); }
}

// Os sites com "sempre permitir pop-ups" de antes (guardados por origem) viram configurações por site
async function migratePopupsAllowed() {
  const list = settings.popupsAllowed || [];
  if (!list.length || !api) return;
  for (const origin of list) {
    const site = await api.siteKey(origin);
    if (site) settings.siteRules[site] = { ...(settings.siteRules[site] || {}), popups: 'allow' };
  }
  settings.popupsAllowed = [];
  saveSettings();
}
migratePopupsAllowed();
library.onChange((what) => { if (what === 'profile') migratePopupsAllowed(); });

// JavaScript bloqueado: o processo principal avisa quando a página chega com a regra aplicada
api?.on('site:jsblocked', ({ id, url }) => {
  const t = tabs.find((x) => { try { return x.wv?.getWebContentsId() === id; } catch { return false; } });
  if (!t) return;
  t.jsBlockedFor = url;
  render();
});

/* ───────────── Painel do cadeado ───────────── */
const sitePop = $('#site-pop');
const sp = { open: false, t: null, site: '', url: '', origin: '', loaded: {} };

function siteSelect(kind, value) {
  const opts = kind === 'js'
    ? [['', tl('Default')], ['block', tl('Block')]]
    : [['', tl('Default')], ['allow', tl('Allow')], ['block', tl('Block')]];
  return `<select class="st-select" data-kind="${kind}">${opts.map(([v, l]) => `<option value="${v}"${v === value ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
}
const DEFAULT_HINT = {
  js: /*i18n*/'Default: on',
  popups: /*i18n*/'Default: only after you click',
  cookies: { allow: /*i18n*/'Default: allowed', 'block-third-party': /*i18n*/'Default: third-party blocked', 'block-all': /*i18n*/'Default: blocked' },
};

function renderSitePop() {
  if (!sp.open) return;
  const secure = sp.url.startsWith('https://');
  const host = hostOf(sp.url);
  const priv = library.isPrivate();
  const rows = SITE_KINDS.map(([k, label, ic]) => {
    const hint = k === 'cookies' ? DEFAULT_HINT.cookies[settings.cookies] : DEFAULT_HINT[k];
    return `<div class="si-row"><span class="si-ic">${icon(ic)}</span>
      <span class="si-label">${tl(label)}${hint && !getSiteRule(sp.site, k) ? `<small>${tl(hint)}</small>` : ''}</span>
      ${siteSelect(k, getSiteRule(sp.site, k))}</div>`;
  }).join('');
  // permissões já respondidas para este endereço (câmera, microfone…): pela origem exata
  const perms = priv ? {} : (settings.sites[sp.origin] || {});
  const permRows = Object.entries(perms).map(([k, v]) => `<div class="si-row"><span class="si-ic">${icon(PERM_INFO[k]?.ic || 'info')}</span>
      <span class="si-label">${PERM_INFO[k] ? tl(PERM_INFO[k].label) : escapeHtml(k)}</span>
      <select class="st-select" data-perm-kind="${k}">${[['allow', tl('Allow')], ['block', tl('Block')], ['', tl('Ask')]].map(([o, l]) => `<option value="${o}"${o === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>`).join('');
  const changed = [...RELOAD_KINDS].some((k) => getSiteRule(sp.site, k) !== sp.loaded[k]);
  sitePop.innerHTML = `
    <div class="si-head"><span class="si-fav">${siteIcon(sp.url)}</span>
      <div class="si-title"><b>${escapeHtml(host)}</b>
        <span class="si-conn ${secure ? 'ok' : 'bad'}">${icon(secure ? 'lock' : 'info')}${secure ? tl('Connection is secure') : tl('Connection is not secure')}</span></div></div>
    ${secure ? '' : `<p class="si-note">${tl('Don’t enter passwords or card numbers on this site: what you send can be seen on the way.')}</p>`}
    <div class="si-sep"></div>
    ${rows}${permRows}
    ${changed ? `<div class="si-reload"><span>${tl('Reload to apply your changes')}</span><button class="btn-primary small" data-si="reload">${tl('Reload')}</button></div>` : ''}
    ${priv ? `<p class="si-note">${tl('In private browsing, these choices only last until you close this window.')}</p>` : ''}
    ${settings.memorySaver ? (() => { // economia de memória: este site nunca fica inativo
      const on = (settings.keepActive || []).includes(keepHostOf(sp.url));
      return `<button class="si-keep" data-si="keep" role="switch" aria-checked="${on}"><span data-icon="gauge"></span><span class="si-keep-label">${tl('Always keep this site active')}</span><span class="sw${on ? ' on' : ''}"><span></span></span></button>`;
    })() : ''}
    <div class="si-sep"></div>
    <div class="si-foot"><span class="si-cookies">${icon('cookie')}<span id="si-cookie-count">…</span></span>
      <button class="btn-link" data-si="clear">${tl('Clear site data')}</button></div>
    ${priv ? '' : `<button class="pop-item" data-si="settings"><span data-icon="gear"></span>${tl('Site settings')}</button>`}`;
  hydrateIcons(sitePop);
  $$('img', sitePop).forEach((img) => { img.onerror = () => img.remove(); });
  api?.siteInfo(library.partition(), sp.url).then((info) => {
    const el = $('#si-cookie-count');
    if (el && info) el.textContent = tln(info.cookies, '{n} cookie in use', '{n} cookies in use');
  });
}

function toggleSitePop(t, anchor, force) {
  const show = force ?? !(sp.open && sp.t === t);
  if (!show) {
    if (!sp.open) return;
    sp.open = false;
    sitePop.classList.remove('show');
    sfx.play('close');
    return;
  }
  if (!t || !/^https?:\/\//.test(t.url) || !anchor) return;
  sp.t = t; sp.url = t.url; sp.origin = (() => { try { return new URL(t.url).origin; } catch { return ''; } })();
  api?.siteKey(t.url).then((site) => {
    if (sp.t !== t) return;
    sp.site = site;
    sp.loaded = t.siteRulesLoaded?.url === t.url ? t.siteRulesLoaded.rules : Object.fromEntries([...RELOAD_KINDS].map((k) => [k, getSiteRule(site, k)]));
    t.siteRulesLoaded = { url: t.url, rules: sp.loaded };
    const wasOpen = sp.open;
    sp.open = true;
    renderSitePop();
    const r = anchor.getBoundingClientRect();
    sitePop.style.top = `${Math.round(r.bottom + 10)}px`;
    sitePop.style.left = `${Math.round(Math.max(8, Math.min(r.left - 16, innerWidth - 348)))}px`;
    sitePop.classList.add('show');
    if (!wasOpen) sfx.play('open');
  });
}

sitePop.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.kind) setSiteRule(sp.site, el.dataset.kind, el.value);
  else if (el.dataset.permKind) {
    const d = settings.sites[sp.origin] ||= {};
    if (el.value) d[el.dataset.permKind] = el.value; else delete d[el.dataset.permKind];
    if (!Object.keys(d).length) delete settings.sites[sp.origin];
    saveSettings(); settingsPage.refresh?.();
  }
  if (el.dataset.kind === 'popups' && el.value === 'allow' && sp.t) { sp.t.blockedPopups = null; render(); }
  renderSitePop();
});
sitePop.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-si]');
  if (!b) return;
  const t = sp.t;
  if (b.dataset.si === 'reload') { toggleSitePop(null, null, false); t?.wv?.reload(); }
  else if (b.dataset.si === 'keep') {
    const h = keepHostOf(sp.url);
    const list = settings.keepActive || [];
    settings.keepActive = list.includes(h) ? list.filter((x) => x !== h) : [...list, h];
    saveSettings(); settingsPage.refresh?.();
    renderSitePop();
    $('#site-pop [data-si="keep"]')?.focus();
  }
  else if (b.dataset.si === 'settings') { toggleSitePop(null, null, false); openSettings('permissoes'); }
  else if (b.dataset.si === 'clear') {
    const yes = await ask({ title: tl('Clear data for {site}?', { site: sp.site }), text: tl('You’ll be signed out of this site.'), ok: tl('Clear'), danger: true });
    if (!yes) return;
    await api?.sitesRemove(library.partition(), sp.site);
    toast(tl('Data for {site} cleared', { site: sp.site }));
    if (sp.open) renderSitePop();
  }
});
document.addEventListener('mousedown', (e) => { if (sp.open && !e.target.closest('#site-pop, .tab .lock, .tab .jsind, #confirm-sheet, #scrim')) toggleSitePop(null, null, false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sp.open) { toggleSitePop(null, null, false); e.stopPropagation(); } }, true);
api?.on('page:mousedown', () => toggleSitePop(null, null, false));
