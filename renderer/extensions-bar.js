'use strict';
// Extensões na barra de ferramentas, como no Chrome: o botão de quebra-cabeça abre a lista de
// extensões do perfil; as fixadas aparecem direto na barra, com ícone e contador (o número de
// anúncios bloqueados, por exemplo). Clicar abre a janelinha (popup) da extensão; o botão direito
// traz Options, Pin/Unpin e Remove. Extensões novas já entram fixadas. A lógica de extensões
// (APIs chrome.*, popups) está no processo principal (extensions.js).

const extBar = { state: null, observed: new Set(), known: null };
const extPartition = () => (library.isPrivate() ? null : PROFILES.currentProfile().partition);
const activeWcId = () => { try { return active()?.wv?.getWebContentsId() ?? -1; } catch { return -1; } };

function extIconUrl(id, tabId) {
  const a = extBar.state?.actions.find((x) => x.id === id);
  const q = new URLSearchParams({ tabId: String(tabId), partition: extPartition() || '' });
  if (a?.iconModified) q.set('t', a.iconModified);
  return `crx://extension-icon/${id}/32/2?${q}`;
}
/** Título e contador da extensão na aba ativa. */
function extInfo(id) {
  const a = extBar.state?.actions.find((x) => x.id === id) || {};
  const t = a.tabs?.[activeWcId()] || {};
  return { title: t.title ?? a.title ?? '', text: t.text ?? a.text ?? '', color: t.color ?? a.color ?? '#5865f2' };
}
const pinnedIds = () => (settings.pinnedExt || []).filter((id) => extensions.some((e) => e.id === id));

/* ───────────── Estado ───────────── */
async function refreshExtActions() {
  const p = extPartition();
  if (!p) { extBar.state = null; renderExtBar(); return; }
  if (!extBar.observed.has(p)) { extBar.observed.add(p); api?.extActionObserve(p).catch(() => {}); }
  try { extBar.state = await api.extActionState(p); } catch { extBar.state = null; }
  renderExtBar();
}
// extensões novas (instaladas agora) entram fixadas; as que já existiam antes desta versão também
function autoPin() {
  const ids = extensions.map((e) => e.id);
  if (!settings.knownExt) { settings.pinnedExt = [...new Set([...(settings.pinnedExt || []), ...ids])]; }
  else for (const id of ids) if (!settings.knownExt.includes(id)) settings.pinnedExt = [...new Set([...(settings.pinnedExt || []), id])];
  settings.knownExt = ids;
  saveSettings();
}

/* ───────────── Barra ───────────── */
function renderExtBar() {
  const p = extPartition();
  const list = p ? extensions : [];
  $('#btn-ext').hidden = !list.length;
  const tab = activeWcId();
  $('#ext-pinned').innerHTML = p ? pinnedIds().map((id) => {
    const e = extensions.find((x) => x.id === id);
    const info = extInfo(id);
    return `<button class="tb ext-action" data-ext="${id}" title="${escapeHtml(info.title || e.name)}">
        <img src="${extIconUrl(id, tab)}" alt="" draggable="false" />
        ${info.text ? `<span class="ext-badge" style="background:${escapeHtml(info.color)}">${escapeHtml(info.text)}</span>` : ''}
      </button>`;
  }).join('') : '';
  if ($('#ext-pop').classList.contains('show')) renderExtPop();
}

function openExtPopup(id, anchorEl) {
  const p = extPartition();
  if (!p) return;
  const r = anchorEl.getBoundingClientRect();
  closeExtPop();
  sfx.play('open');
  api.extActionActivate(p, {
    eventType: 'click', extensionId: id, tabId: activeWcId(), alignment: 'bottom left',
    anchorRect: { x: r.left, y: r.top, width: r.width, height: r.height },
  }).catch(() => {});
}

function togglePin(id) {
  const pins = settings.pinnedExt || [];
  settings.pinnedExt = pins.includes(id) ? pins.filter((x) => x !== id) : [...pins, id];
  saveSettings();
  renderExtBar();
}

function extMenu(id, x, y) {
  const e = extensions.find((v) => v.id === id);
  if (!e) return;
  const pinned = pinnedIds().includes(id);
  showMenu([
    { label: e.name, disabled: true },
    '-',
    { label: 'Options', run: () => newTab(`chrome-extension://${id}/${e.options.replace(/^\//, '')}`, false), disabled: !e.options },
    { label: pinned ? 'Unpin from toolbar' : 'Pin to toolbar', run: () => togglePin(id) },
    '-',
    { label: 'Remove from Kona…', run: async () => {
      if (!await ask({ title: `Remove “${e.name}”?`, text: 'Its settings and data in Kona will be deleted.', ok: 'Remove', danger: true })) return;
      try { extensions = await api.extRemove(id); toast(`“${e.name}” removed`); } catch { toast('Couldn’t remove the extension'); }
      renderExtBar(); renderExtensions?.();
    } },
  ], x, y);
}

$('#ext-pinned').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ext]');
  if (b) openExtPopup(b.dataset.ext, b);
});
$('#ext-pinned').addEventListener('contextmenu', (e) => {
  const b = e.target.closest('[data-ext]');
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  extMenu(b.dataset.ext, e.clientX, e.clientY);
});

/* ───────────── Lista (quebra-cabeça) ───────────── */
function renderExtPop() {
  const tab = activeWcId();
  const pins = pinnedIds();
  $('#ext-pop').innerHTML = `<div class="pp-head">Extensions</div>
    <div class="ext-pop-list">${extensions.map((e) => {
      const info = extInfo(e.id);
      const on = pins.includes(e.id);
      return `<div class="ext-pop-row" data-ext="${e.id}" role="menuitem" title="${escapeHtml(info.title || e.name)}">
          <span class="ext-pop-icon"><img src="${extIconUrl(e.id, tab)}" alt="" draggable="false" />${info.text ? `<span class="ext-badge" style="background:${escapeHtml(info.color)}">${escapeHtml(info.text)}</span>` : ''}</span>
          <span class="ext-pop-name">${escapeHtml(e.name)}</span>
          <button class="ext-pin${on ? ' on' : ''}" data-pin="${e.id}" title="${on ? 'Unpin from toolbar' : 'Pin to toolbar'}">${icon('thumbtack')}</button>
        </div>`;
    }).join('')}</div>
    <div class="pop-sep"></div>
    <button class="pop-item" data-manage><span data-icon="puzzle">${icon('puzzle')}</span>Manage extensions</button>
    <button class="pop-item" data-store><span data-icon="store">${icon('store')}</span>Chrome Web Store</button>`;
}
function openExtPop() {
  renderExtPop();
  const pop = $('#ext-pop');
  const r = $('#btn-ext').getBoundingClientRect();
  pop.classList.add('show');
  pop.style.top = `${r.bottom + 8}px`;
  pop.style.left = `${Math.min(innerWidth - pop.offsetWidth - 12, Math.max(12, r.right - pop.offsetWidth))}px`;
  $('#btn-ext').classList.add('on');
  sfx.play('open');
}
function closeExtPop() {
  const pop = $('#ext-pop');
  if (!pop.classList.contains('show')) return false;
  pop.classList.remove('show');
  $('#btn-ext').classList.remove('on');
  return true;
}
$('#btn-ext').addEventListener('click', () => { if (!closeExtPop()) openExtPop(); });
$('#ext-pop').addEventListener('click', (e) => {
  const pin = e.target.closest('[data-pin]');
  if (pin) { e.stopPropagation(); togglePin(pin.dataset.pin); sfx.play('tick'); return; }
  if (e.target.closest('[data-manage]')) { closeExtPop(); openExtensions(); return; }
  if (e.target.closest('[data-store]')) { closeExtPop(); newTab(STORE_URL, false); return; }
  const row = e.target.closest('[data-ext]');
  if (row) openExtPopup(row.dataset.ext, pinnedIds().includes(row.dataset.ext) ? $(`#ext-pinned [data-ext="${row.dataset.ext}"]`) || $('#btn-ext') : $('#btn-ext'));
});
$('#ext-pop').addEventListener('contextmenu', (e) => {
  const row = e.target.closest('[data-ext]');
  e.preventDefault();
  if (row) { e.stopPropagation(); extMenu(row.dataset.ext, e.clientX, e.clientY); }
});
document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('#ext-pop, #btn-ext, #ctx-menu')) closeExtPop();
}, true);
api?.on('page:mousedown', () => closeExtPop());
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && closeExtPop()) e.stopPropagation(); }, true);

/* ───────────── Abas pedidas pelas extensões (chrome.tabs) ───────────── */
api?.on('ext:tab-create', ({ id, url, active: focus }) => {
  const target = /^(https?|chrome-extension):/i.test(url) ? url : 'about:blank';
  const t = makeTab(target, { index: tabs.indexOf(active()) + 1 });
  ensureWebview(t);
  if (focus) activate(t.id); else render();
  const reply = () => { try { api.extTabCreated(id, t.wv.getWebContentsId()); } catch { /* aba fechada */ } };
  t.wv?.addEventListener('did-attach', reply, { once: true });
});
const tabByWc = (wcId) => tabs.find((t) => { try { return t.wv?.getWebContentsId() === wcId; } catch { return false; } });
api?.on('ext:tab-select', (wcId) => { const t = tabByWc(wcId); if (t) activate(t.id); });
api?.on('ext:tab-remove', (wcId) => { const t = tabByWc(wcId); if (t) closeTab(t.id); });

/* ───────────── Ligações ───────────── */
api?.on('browserAction.update', () => refreshExtActions());
api?.on('ext:changed', () => { setTimeout(async () => { await refreshExtensions(); autoPin(); refreshExtActions(); }, 50); });
library.onChange((what) => { if (what === 'profile' || what === 'sets') { extBar.observed.clear(); setTimeout(refreshExtActions, 300); } });
/** Chamado ao trocar de aba: contador por aba e a aba ativa para as extensões. */
function extTabChanged() {
  const id = activeWcId();
  if (id >= 0) api?.extTabSelected(id).catch(() => {});
  renderExtBar();
}
(async () => { await refreshExtensions(); autoPin(); refreshExtActions(); })();
