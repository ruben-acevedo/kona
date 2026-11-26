'use strict';
// Ferramentas da página, como no Chrome: buscar na página (Ctrl+F), zoom por site (Ctrl+ / Ctrl− /
// Ctrl+0 / Ctrl+roda do mouse; aparece na barra de endereço quando não é o padrão) e reabrir a
// última aba fechada (Ctrl+Shift+T).

/* ───────────── Buscar na página ───────────── */
const findBar = {
  el: $('#find-bar'),
  input: $('#fb-input'),
  tab: null,
  open() {
    const t = active();
    if (!t?.wv) { toast(tl('Open a page to search in it')); return; }
    if (this.tab && this.tab !== t) this.close(false);
    this.tab = t;
    this.el.classList.add('show');
    this.input.focus();
    this.input.select();
    if (this.input.value) this.search(false);
    sfx.play('open');
  },
  isOpen() { return this.el.classList.contains('show'); },
  close(refocus = true) {
    if (!this.isOpen()) return false;
    this.el.classList.remove('show');
    try { this.tab?.wv?.stopFindInPage('keepSelection'); } catch { /* aba já fechada */ }
    if (refocus) this.tab?.wv?.focus();
    this.tab = null;
    this.setCount(null);
    sfx.play('close');
    return true;
  },
  search(next, forward = true) {
    const t = this.tab;
    const q = this.input.value;
    if (!t?.wv) return;
    if (!q) { t.wv.stopFindInPage('clearSelection'); this.setCount(null); return; }
    t.wv.findInPage(q, { forward, findNext: next });
  },
  setCount(r) {
    const c = $('#fb-count');
    this.el.classList.toggle('none', !!r && r.matches === 0);
    c.textContent = !r ? '' : r.matches ? tl('{i} of {n}', { i: r.activeMatchOrdinal, n: r.matches }) : tl('No results');
  },
  /** Chamado ao criar o webview de uma aba. */
  watch(t, wv) {
    wv.addEventListener('found-in-page', (e) => { if (this.tab === t && this.isOpen()) this.setCount(e.result); });
    wv.addEventListener('did-navigate', () => { if (this.tab === t) this.close(false); });
  },
};
findBar.input.addEventListener('input', () => findBar.search(false));
findBar.input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === 'F3') { e.preventDefault(); findBar.search(true, !e.shiftKey); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); findBar.close(); }
});
$('#fb-prev').addEventListener('click', () => findBar.search(true, false));
$('#fb-next').addEventListener('click', () => findBar.search(true, true));
$('#fb-close').addEventListener('click', () => findBar.close());
hydrateIcons(findBar.el);

/* ───────────── Zoom por site ───────────── */
const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
const zoomHost = (url) => { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.hostname : null; } catch { return null; } };
function zoomFor(url) {
  const h = zoomHost(url);
  return (h && settings.siteZoom?.[h]) || settings.zoom || 1;
}
/** Aplica o zoom guardado do site (ou o padrão) no webview da aba. */
function applyZoom(t) {
  try { t.wv?.setZoomFactor(zoomFor(t.url)); } catch { /* webview ainda não pronto */ }
}
function setSiteZoom(t, factor) {
  const h = zoomHost(t.url);
  if (!h || !t.wv) return;
  settings.siteZoom ||= {};
  factor = Math.min(5, Math.max(0.25, Math.round(factor * 100) / 100));
  if (Math.abs(factor - (settings.zoom || 1)) < 0.001) delete settings.siteZoom[h];
  else settings.siteZoom[h] = factor;
  saveSettings();
  for (const o of tabs) if (zoomHost(o.url) === h) applyZoom(o); // todas as abas do mesmo site, como no Chrome
  render();
  toast(tl('Zoom {n}%', { n: Math.round(factor * 100) }));
}
function zoomStep(dir) {
  const t = active();
  if (!zoomHost(t?.url) || !t.wv) return;
  const cur = zoomFor(t.url);
  const next = dir > 0 ? ZOOM_STEPS.find((z) => z > cur + 0.001) : [...ZOOM_STEPS].reverse().find((z) => z < cur - 0.001);
  if (next) setSiteZoom(t, next);
}
const zoomReset = () => { const t = active(); if (t) setSiteZoom(t, settings.zoom || 1); };

/* ───────────── Reabrir aba fechada ───────────── */
const closedTabs = [];
function rememberClosed(t, index) {
  if (library.isPrivate() || isInternal(t.url) || !t.url) return;
  closedTabs.push({ url: t.url, title: t.title, index });
  if (closedTabs.length > 25) closedTabs.shift();
}
function reopenClosedTab() {
  const c = closedTabs.pop();
  if (!c) { toast(tl('No recently closed tabs')); return; }
  const t = makeTab(c.url, { title: c.title, index: Math.min(c.index, tabs.length) });
  sfx.play('tabOpen');
  activate(t.id);
}
// trocar de grupo, de perfil ou entrar no modo privado: a lista é daquele conjunto de abas
library.onChange((what) => { if (what === 'sets' || what === 'profile') closedTabs.length = 0; });

/* ───────────── Som nas abas ───────────── */
api?.on('tab:audio', ({ id, audible }) => {
  const t = tabs.find((x) => { try { return x.wv?.getWebContentsId() === id; } catch { return false; } });
  if (!t) return;
  t.audible = audible;
  render();
});
/** Silenciar/reativar o som da aba (🔊 na aba, menu da aba). */
function toggleMute(t) {
  if (!t?.wv) return;
  t.muted = !t.muted;
  try { t.wv.setAudioMuted(t.muted); } catch { /* webview fechando */ }
  sfx.play('tick');
  render();
}

/* ───────────── Tela cheia (F11): a barra aparece ao levar o mouse ao topo ───────────── */
const peekZone = document.createElement('div');
peekZone.id = 'peek-zone';
document.body.appendChild(peekZone);
let peekTimer = null;
const peek = (on) => {
  clearTimeout(peekTimer);
  if (on) document.body.classList.add('peek');
  else peekTimer = setTimeout(() => {
    // fica enquanto o endereço está sendo editado ou um menu está aberto
    if (document.activeElement?.closest?.('#toolbar') || ctx?.open) return;
    document.body.classList.remove('peek');
  }, 450);
};
peekZone.addEventListener('mouseenter', () => peek(true));
// a barra desliza por baixo do mouse (sem "entrar" nela): sair da faixa do topo também esconde,
// a não ser que o mouse esteja sobre a barra (aí o mouseenter dela cancela o tempo)
peekZone.addEventListener('mouseleave', () => peek(false));
document.addEventListener('mousemove', (e) => { if (document.body.classList.contains('peek') && e.target.closest?.('#toolbar')) peek(true); });
api?.on('page:mousedown', () => { if (document.body.classList.contains('peek')) { clearTimeout(peekTimer); document.body.classList.remove('peek'); } });
$('#toolbar').addEventListener('mouseenter', () => { if (document.body.classList.contains('win-fullscreen')) peek(true); });
$('#toolbar').addEventListener('mouseleave', () => peek(false));
$('#toolbar').addEventListener('focusin', () => { if (document.body.classList.contains('win-fullscreen')) peek(true); });
$('#toolbar').addEventListener('focusout', () => peek(false));

/* ───────────── Pop-ups bloqueados (como o Chrome) ───────────── */
const popupHost = (o) => { try { return new URL(o).host; } catch { return o; } };
api?.on('popup:blocked', ({ id, url, origin }) => {
  const t = tabs.find((x) => { try { return x.wv?.getWebContentsId() === id; } catch { return false; } });
  if (!t) return;
  t.blockedPopups ||= [];
  t.blockedPopupsOrigin = origin;
  if (!t.blockedPopups.includes(url)) t.blockedPopups.push(url);
  if (t.blockedPopups.length === 1 && t === active()) toast('Pop-up blocked');
  render();
});
function popupMenu(t, x, y) {
  const list = t.blockedPopups || [];
  const host = popupHost(t.blockedPopupsOrigin || '');
  showMenu([
    { label: tl('Pop-ups blocked on {host}', { host }), disabled: true },
    '-',
    ...list.slice(-8).map((u) => ({ label: u.replace(/^https?:\/\//, '').slice(0, 60), run: () => { t.blockedPopups = t.blockedPopups.filter((x) => x !== u); newTab(u, false); } })),
    '-',
    { label: tl('Always allow pop-ups from {host}', { host }), run: () => {
      settings.popupsAllowed = [...new Set([...(settings.popupsAllowed || []), t.blockedPopupsOrigin])];
      saveSettings(); api?.setPopupsAllowed(settings.popupsAllowed);
      t.blockedPopups = null; render();
      toast(`Pop-ups allowed on ${host}`);
    } },
  ], x, y);
}
api?.setPopupsAllowed(settings.popupsAllowed || []);
library.onChange((what) => { if (what === 'profile') api?.setPopupsAllowed(settings.popupsAllowed || []); });
