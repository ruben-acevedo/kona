'use strict';
// Menu lateral: abas do conjunto atual, modo privado, grupos de abas e biblioteca
// (favoritos, lista de leitura, histórico) em subtelas.

const sb = {
  view: null,            // subtela aberta: 'bookmarks' | 'reading' | 'history' | null
  editing: null,         // { kind: 'group'|'bookmark'|'newgroup', id }
  readingFilter: 'unread',
  historyQuery: '',
  pending: false,
};
const sidebarOpen = () => document.body.classList.contains('sidebar-open');

/* ───────────── Desenho (agrupado num quadro, só com o menu aberto) ───────────── */
function renderSidebar() {
  if (sb.pending) return;
  sb.pending = true;
  requestAnimationFrame(() => {
    sb.pending = false;
    if (!sidebarOpen()) return; // desenha ao abrir
    renderMain();
    if (sb.view) renderSub();
  });
}

function tabRows() {
  const rows = tabs.map((t) => `
    <div class="sb-tab${t.id === activeId ? ' active' : ''}" data-tab="${t.id}" title="${escapeHtml(t.title)}">
      <span class="sb-fav">${favHtml(t).html}</span>
      <span class="sb-tab-title">${escapeHtml(t.title)}</span>
      <button class="sb-act" data-act="close-tab" title="Fechar aba">${icon('x')}</button>
    </div>`).join('');
  return `<div class="sb-tabs">${rows}<button class="sb-tab new" data-act="new-tab">${icon('plus')}<span class="sb-tab-title">Nova aba</span></button></div>`;
}

function setRow({ key, ic, label, count, actions = '' }) {
  const current = library.currentKey() === key;
  const editing = sb.editing?.kind === 'group' && sb.editing.id === key;
  const name = editing
    ? `<input class="sb-edit" data-edit="group" value="${escapeHtml(label)}" maxlength="40" spellcheck="false" />`
    : `<span class="sb-label">${escapeHtml(label)}</span>`;
  return `<div class="sb-item set${current ? ' active' : ''}" data-set="${key}" role="button">
      <span data-icon="${ic}">${icon(ic)}</span>${name}
      ${count != null && !editing ? `<span class="sb-badge">${count}</span>` : ''}${editing ? '' : actions}
    </div>${current ? tabRows() : ''}`;
}

function renderMain() {
  const d = tabSets.data;
  const nDefault = library.currentKey() === 'default' ? tabs.length : d.default.tabs.length || 1;
  $('#sb-sets').innerHTML =
    setRow({ key: 'default', ic: 'tabs', label: `${nDefault} ${nDefault === 1 ? 'Aba' : 'Abas'}` }) +
    setRow({ key: 'private', ic: 'hand', label: 'Privado', count: library.isPrivate() ? tabs.length : null });

  const groupActions = `<span class="sb-acts">
      <button class="sb-act" data-act="rename-group" title="Renomear">${icon('pencil')}</button>
      <button class="sb-act" data-act="delete-group" title="Apagar grupo">${icon('x')}</button></span>`;
  $('#sb-groups').innerHTML = d.groups.map((g) => setRow({
    key: g.id, ic: 'folder', label: g.name,
    count: library.currentKey() === g.id ? tabs.length : g.tabs.length, actions: groupActions,
  })).join('') + (sb.editing?.kind === 'newgroup'
    ? `<div class="sb-item"><span data-icon="folder">${icon('folder')}</span><input class="sb-edit" data-edit="newgroup" placeholder="Nome do grupo" maxlength="40" spellcheck="false" /></div>`
    : `<button class="sb-item muted" data-act="new-group"><span data-icon="plus">${icon('plus')}</span><span class="sb-label">Novo Grupo de Abas</span></button>`);

  $('#sb-bm-count').textContent = bookmarks.list.length || '';
  $('#sb-rl-count').textContent = readingList.unread() || '';
  focusEditor();
}

function focusEditor() {
  const input = $('#sidebar .sb-edit');
  if (input && document.activeElement !== input) { input.focus(); input.select(); }
}

/* ───────────── Subtelas ───────────── */
const SUBVIEWS = {
  bookmarks: { title: 'Favoritos', action: 'Adicionar esta página aos Favoritos' },
  reading: { title: 'Lista de Leitura', action: 'Guardar esta página na Lista de Leitura' },
  history: { title: 'Histórico', action: null },
};

function openSidebarView(view) {
  if (!sidebarOpen()) toggleSidebar(true);
  sb.view = view;
  sb.editing = null;
  const v = SUBVIEWS[view];
  $('#sb-subtitle').textContent = v.title;
  $('#sb-subaction').hidden = !v.action;
  $('#sb-subaction').title = v.action || '';
  $('#sb-tools').innerHTML = view === 'reading'
    ? `<div class="seg mini" id="rl-filter"><button data-f="unread">Não lidos</button><button data-f="all">Todos</button></div>`
    : view === 'history'
      ? `<input class="sb-search" id="hist-q" placeholder="Pesquisar no histórico" spellcheck="false" value="${escapeHtml(sb.historyQuery)}" />`
      : '';
  $('#sb-subfoot').innerHTML = view === 'history' ? `<button class="btn-secondary wide" data-act="clear-history">Limpar histórico…</button>` : '';
  $('#sidebar').classList.add('sub-open');
  renderSub();
  if (view === 'history') requestAnimationFrame(() => $('#hist-q')?.focus());
}
function closeSidebarView() {
  sb.view = null;
  sb.editing = null;
  $('#sidebar').classList.remove('sub-open');
  renderMain();
}
/** Esc no menu: fecha editor/subtela antes de fechar o menu. Retorna true se tratou. */
function sidebarEscape() {
  if (sb.editing) { sb.editing = null; renderSidebar(); return true; }
  if (sb.view) { closeSidebarView(); return true; }
  return false;
}

const siteRowIcon = (url) => `<span class="sb-fav"><span class="mono">${escapeHtml((brandOf(url)[0] || '?').toUpperCase())}</span></span>`;

function renderSub() {
  const list = $('#sb-list');
  if (sb.view === 'bookmarks') {
    list.innerHTML = bookmarks.list.length ? bookmarks.list.map((b) => {
      const editing = sb.editing?.kind === 'bookmark' && sb.editing.id === b.id;
      return `<div class="sb-row" data-bm="${b.id}" data-url="${escapeHtml(b.url)}" title="${escapeHtml(b.url)}">
        ${siteRowIcon(b.url)}
        <div class="sb-row-text">${editing
          ? `<input class="sb-edit" data-edit="bookmark" value="${escapeHtml(b.title)}" maxlength="80" spellcheck="false" />`
          : `<b>${escapeHtml(b.title)}</b><span>${escapeHtml(hostOf(b.url))}</span>`}</div>
        ${editing ? '' : `<span class="sb-acts">
          <button class="sb-act" data-act="rename-bm" title="Renomear">${icon('pencil')}</button>
          <button class="sb-act" data-act="remove-bm" title="Remover dos Favoritos">${icon('x')}</button></span>`}
      </div>`;
    }).join('') : empty('star', 'Nenhum favorito ainda', 'Use a estrela na barra de endereço ou Ctrl+D numa página.');
  } else if (sb.view === 'reading') {
    $$('#rl-filter button').forEach((b) => b.classList.toggle('on', b.dataset.f === sb.readingFilter));
    const items = sb.readingFilter === 'unread' ? readingList.items.filter((x) => !x.read) : readingList.items;
    list.innerHTML = items.length ? items.map((x) => `
      <div class="sb-row${x.read ? ' read' : ''}" data-rl="${x.id}" data-url="${escapeHtml(x.url)}" title="${escapeHtml(x.url)}">
        <span class="unread-dot"></span>
        <div class="sb-row-text"><b>${escapeHtml(x.title)}</b><span>${escapeHtml(hostOf(x.url))}</span></div>
        <span class="sb-acts">
          <button class="sb-act" data-act="toggle-read" title="${x.read ? 'Marcar como não lido' : 'Marcar como lido'}">${icon(x.read ? 'glasses' : 'check')}</button>
          <button class="sb-act" data-act="remove-rl" title="Remover da lista">${icon('x')}</button>
        </span>
      </div>`).join('')
      : empty('glasses', sb.readingFilter === 'unread' ? 'Tudo lido' : 'Lista vazia', 'Guarde páginas para ler depois com Ctrl+Shift+D.');
  } else if (sb.view === 'history') {
    renderHistory(list);
  }
}

const empty = (ic, title, text) => `<div class="sb-empty"><span data-icon="${ic}">${icon(ic)}</span><b>${title}</b><p>${text}</p></div>`;

const dayFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
const timeFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
function dayLabel(t) {
  const d = new Date(t); d.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - d) / 864e5);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  const s = dayFmt.format(new Date(t));
  return s[0].toUpperCase() + s.slice(1);
}

function renderHistory(list) {
  const q = sb.historyQuery.trim().toLowerCase();
  let items = [...browseHistory.data.visits].sort((a, b) => b.t - a.t);
  if (q) items = items.filter((v) => v.url.toLowerCase().includes(q) || (v.title || '').toLowerCase().includes(q));
  const MAX = 400;
  if (!items.length) {
    list.innerHTML = q ? empty('search', 'Nada encontrado', `Nenhuma página do histórico combina com “${escapeHtml(sb.historyQuery)}”.`)
      : empty('clock', 'Histórico vazio', 'As páginas que você visitar aparecem aqui.');
    return;
  }
  let html = ''; let lastDay = '';
  for (const v of items.slice(0, MAX)) {
    const day = dayLabel(v.t);
    if (day !== lastDay) { html += `<div class="sb-day">${day}</div>`; lastDay = day; }
    html += `<div class="sb-row" data-hist="${escapeHtml(v.url)}" data-url="${escapeHtml(v.url)}" title="${escapeHtml(v.url)}">
      <span class="sb-time">${timeFmt.format(new Date(v.t))}</span>
      <div class="sb-row-text"><b>${escapeHtml(v.title || hostOf(v.url))}</b><span>${escapeHtml(hostOf(v.url))}</span></div>
      <span class="sb-acts"><button class="sb-act" data-act="remove-hist" title="Remover do histórico">${icon('x')}</button></span>
    </div>`;
  }
  if (items.length > MAX) html += `<p class="sb-more">Mostrando as ${MAX} mais recentes. Pesquise para encontrar as outras.</p>`;
  list.innerHTML = html;
}

/* ───────────── Interações ───────────── */
$('#sidebar').addEventListener('click', async (e) => {
  const actBtn = e.target.closest('[data-act]');
  const act = actBtn?.dataset.act;
  const setEl = e.target.closest('[data-set]');
  const tabEl2 = e.target.closest('[data-tab]');
  const row = e.target.closest('.sb-row');
  if (e.target.closest('.sb-edit')) return;

  if (act === 'close-tab') { closeTab(+tabEl2.dataset.tab); return; }
  if (act === 'new-tab') { newTab(); return; }
  if (act === 'new-group') { sb.editing = { kind: 'newgroup' }; renderMain(); return; }
  if (act === 'rename-group') { sb.editing = { kind: 'group', id: setEl.dataset.set }; renderMain(); return; }
  if (act === 'delete-group') { deleteGroup(setEl.dataset.set); return; }
  if (act === 'rename-bm') { sb.editing = { kind: 'bookmark', id: row.dataset.bm }; renderSub(); focusEditor(); return; }
  if (act === 'remove-bm') { bookmarks.remove(row.dataset.bm); toast('Removido dos Favoritos'); return; }
  if (act === 'toggle-read') { const x = readingList.items.find((i) => i.id === row.dataset.rl); readingList.setRead(x.id, !x.read); return; }
  if (act === 'remove-rl') { readingList.remove(row.dataset.rl); return; }
  if (act === 'remove-hist') { browseHistory.remove('visit', row.dataset.hist); renderSub(); return; }
  if (act === 'clear-history') { openClearSheet({ historyOnly: true }); return; }

  if (tabEl2) { activate(+tabEl2.dataset.tab); return; }
  if (setEl) { library.switchTo(setEl.dataset.set); return; }
  if (row?.dataset.url) {
    if (row.dataset.rl) readingList.setRead(row.dataset.rl, true);
    if (e.ctrlKey || e.metaKey) newTab(row.dataset.url, false);
    else navigate(active(), row.dataset.url);
    return;
  }
  const viewBtn = e.target.closest('[data-view]');
  if (viewBtn) openSidebarView(viewBtn.dataset.view);
});
// Botão do meio: abre o item numa nova aba
$('#sidebar').addEventListener('auxclick', (e) => {
  const row = e.target.closest('.sb-row');
  if (e.button === 1 && row?.dataset.url) { e.preventDefault(); newTab(row.dataset.url, false); }
});

$('#sb-back').addEventListener('click', closeSidebarView);
$('#sb-subaction').addEventListener('click', () => {
  if (sb.view === 'bookmarks') {
    const t = active();
    if (!t || !/^https?:/.test(t.url)) { toast('Abra uma página para adicionar aos Favoritos'); return; }
    toast(bookmarks.add(t.url, t.title) ? 'Adicionado aos Favoritos' : 'Esta página já está nos Favoritos');
  } else if (sb.view === 'reading') {
    addToReadingList();
  }
});
$('#sb-tools').addEventListener('click', (e) => {
  const f = e.target.closest('[data-f]');
  if (f) { sb.readingFilter = f.dataset.f; renderSub(); }
});
$('#sb-tools').addEventListener('input', (e) => {
  if (e.target.id === 'hist-q') { sb.historyQuery = e.target.value; renderSub(); }
});
$('#sb-subfoot').addEventListener('click', (e) => {
  if (e.target.closest('[data-act="clear-history"]')) openClearSheet({ historyOnly: true });
});

// Edição em linha (novo grupo, renomear grupo/favorito): Enter salva, Esc cancela, sair do campo salva
function commitEdit(input) {
  const ed = sb.editing;
  if (!ed) return;
  sb.editing = null;
  const v = input.value.trim();
  if (ed.kind === 'newgroup' && v) {
    const g = tabSets.createGroup(v);
    library.switchTo(g.id);
    toast(`Grupo “${g.name}” criado`);
  } else if (ed.kind === 'group' && v) {
    tabSets.renameGroup(ed.id, v);
  } else if (ed.kind === 'bookmark' && v) {
    bookmarks.rename(ed.id, v);
  }
  renderMain();
  if (sb.view) renderSub();
}
$('#sidebar').addEventListener('keydown', (e) => {
  if (!e.target.classList.contains('sb-edit')) return;
  if (e.key === 'Enter') { e.preventDefault(); commitEdit(e.target); }
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); sb.editing = null; renderMain(); if (sb.view) renderSub(); }
});
$('#sidebar').addEventListener('focusout', (e) => {
  if (e.target.classList?.contains('sb-edit') && sb.editing) commitEdit(e.target);
});

async function deleteGroup(id) {
  const g = tabSets.group(id);
  if (!g) return;
  const n = library.currentKey() === id ? tabs.length : g.tabs.length;
  const yes = await ask({
    title: `Apagar o grupo “${g.name}”?`,
    text: n ? `${n === 1 ? 'A aba' : `As ${n} abas`} deste grupo ${n === 1 ? 'será fechada' : 'serão fechadas'}.` : 'O grupo está vazio.',
    ok: 'Apagar grupo',
    danger: true,
  });
  if (!yes) return;
  if (library.currentKey() === id) await library.switchTo('default');
  tabSets.removeGroup(id);
  renderSidebar();
  toast(`Grupo “${g.name}” apagado`);
}

/* ───────────── Limpar histórico / dados ───────────── */
function openClearSheet({ historyOnly = false } = {}) {
  $('#clear-title').textContent = historyOnly ? 'Limpar histórico' : 'Limpar dados de navegação';
  $('#clear-data').hidden = historyOnly;
  $$('#clear-data input').forEach((c) => { c.checked = c.value === 'history'; });
  openSheet('#clear-sheet');
}
function periodStart(p) {
  const now = Date.now();
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  return { hour: now - 36e5, today: +midnight, '2days': +midnight - 864e5, all: 0 }[p] ?? +midnight;
}
$('#clear-no').addEventListener('click', () => closeSheet('#clear-sheet'));
$('#clear-yes').addEventListener('click', async () => {
  const period = $('#clear-period input:checked')?.value || 'today';
  const historyOnly = $('#clear-data').hidden;
  const what = historyOnly ? ['history'] : $$('#clear-data input:checked').map((c) => c.value);
  closeSheet('#clear-sheet');
  if (what.includes('history')) browseHistory.clearSince(periodStart(period));
  if (what.includes('cookies') || what.includes('cache')) {
    await api?.clearBrowsingData?.(PROFILES.currentProfile().partition, { cookies: what.includes('cookies'), cache: what.includes('cache') });
  }
  renderSidebar();
  toast(historyOnly ? 'Histórico limpo' : 'Dados de navegação limpos');
});

/* ───────────── Ligações ───────────── */
library.onChange((what) => {
  if (what === 'bookmarks' || what === 'reading') {
    if ($('#start').classList.contains('show')) renderStartContent();
    render(); // estrela da aba ativa
  }
  renderSidebar();
});
new MutationObserver(() => { if (sidebarOpen()) renderSidebar(); else if (sb.editing) sb.editing = null; })
  .observe(document.body, { attributes: true, attributeFilter: ['class'] });

hydrateIcons($('#sidebar'));
renderStartContent();
