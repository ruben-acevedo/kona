'use strict';
// Menu lateral: abas do conjunto atual, modo privado, grupos de abas e biblioteca
// (favoritos, lista de leitura, histórico) em subtelas.

const sb = {
  view: null,            // subtela aberta: 'bookmarks' | 'reading' | 'history' | null
  editing: null,         // { kind: 'group'|'bookmark'|'newgroup'|'newfolder', id }
  openFolders: new Set(), // pastas de favoritos abertas (fechadas por padrão)
  drag: null,            // id do favorito/pasta sendo arrastado
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
      <button class="sb-act" data-act="close-tab" title="Close tab">${icon('x')}</button>
    </div>`).join('');
  return `<div class="sb-tabs">${rows}<button class="sb-tab new" data-act="new-tab">${icon('plus')}<span class="sb-tab-title">New tab</span></button></div>`;
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
  const own = library.primary ? d.default.tabs.length : library.ownTabs?.tabs.length;
  const nDefault = library.currentKey() === 'default' ? tabs.length : own || 1;
  $('#sb-sets').innerHTML =
    setRow({ key: 'default', ic: 'tabs', label: `${nDefault} ${nDefault === 1 ? 'Tab' : 'Tabs'}` }) +
    setRow({ key: 'private', ic: 'hand', label: 'Private', count: library.isPrivate() ? tabs.length : null });

  const groupActions = `<span class="sb-acts">
      <button class="sb-act" data-act="rename-group" title="Rename">${icon('pencil')}</button>
      <button class="sb-act" data-act="delete-group" title="Delete group">${icon('x')}</button></span>`;
  $('#sb-groups').innerHTML = d.groups.map((g) => setRow({
    key: g.id, ic: 'folder', label: g.name,
    count: library.currentKey() === g.id ? tabs.length : g.tabs.length, actions: groupActions,
  })).join('') + (sb.editing?.kind === 'newgroup'
    ? `<div class="sb-item"><span data-icon="folder">${icon('folder')}</span><input class="sb-edit" data-edit="newgroup" placeholder="Group name" maxlength="40" spellcheck="false" /></div>`
    : `<button class="sb-item muted" data-act="new-group"><span data-icon="plus">${icon('plus')}</span><span class="sb-label">New Tab Group</span></button>`);

  $('#sb-bm-count').textContent = bookmarks.count() || '';
  $('#sb-rl-count').textContent = readingList.unread() || '';
  $('#sb-dl-count').textContent = downloadsList.active().length || '';
  focusEditor();
}

function focusEditor() {
  const input = $('#sidebar .sb-edit');
  if (input && document.activeElement !== input) { input.focus(); input.select(); }
}

/* ───────────── Subtelas ───────────── */
const SUBVIEWS = {
  bookmarks: { title: 'Favorites', action: 'Add this page to Favorites' },
  reading: { title: 'Reading List', action: 'Save this page to Reading List' },
  downloads: { title: 'Downloads', action: null },
  history: { title: 'History', action: null },
};

function openSidebarView(view) {
  if (!sidebarOpen()) toggleSidebar(true);
  sb.view = view;
  sb.editing = null;
  const v = SUBVIEWS[view];
  $('#sb-subtitle').textContent = v.title;
  $('#sb-subaction').hidden = !v.action;
  $('#sb-subaction').title = v.action || '';
  $('#sb-tools').innerHTML = view === 'bookmarks'
    ? `<div class="sb-bm-tools"><button class="btn-link" data-act="new-folder">${icon('plus')}New folder</button></div>`
    : view === 'reading'
    ? `<div class="seg mini" id="rl-filter"><button data-f="unread">Unread</button><button data-f="all">All</button></div>`
    : view === 'history'
      ? `<input class="sb-search" id="hist-q" placeholder="Search history" spellcheck="false" value="${escapeHtml(sb.historyQuery)}" />`
      : '';
  $('#sb-subfoot').innerHTML = view === 'history' ? `<button class="btn-secondary wide" data-act="clear-history">Clear history…</button>`
    : view === 'downloads' ? '<button class="btn-secondary wide" data-act="clear-downloads">Clear list</button>' : '';
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

// o ícone do site, como na nova aba (ícone do app, ícone grande do site, favicon e, sem nenhum, a inicial)
const siteRowIcon = (url) => `<span class="sb-fav">${siteIcon(url)}</span>`;

function renderSub() {
  const list = $('#sb-list');
  if (sb.view === 'bookmarks') {
    const newFolder = sb.editing?.kind === 'newfolder'
      ? `<div class="sb-row bm-folder" style="--depth:0"><span class="sb-chev"></span><span class="sb-fav">${icon('folder')}</span>
          <div class="sb-row-text"><input class="sb-edit" data-edit="newfolder" placeholder="Folder name" maxlength="60" spellcheck="false" /></div></div>`
      : '';
    list.innerHTML = bookmarks.list.length || newFolder
      ? bmRows(bookmarks.list, 0) + newFolder + '<div class="bm-end" data-bm-end="1"></div>'
      : empty('star', 'No favorites yet', 'Use the star in the address bar, or press Ctrl+D on a page.');
  } else if (sb.view === 'reading') {
    $$('#rl-filter button').forEach((b) => b.classList.toggle('on', b.dataset.f === sb.readingFilter));
    const items = sb.readingFilter === 'unread' ? readingList.items.filter((x) => !x.read) : readingList.items;
    list.innerHTML = items.length ? items.map((x) => `
      <div class="sb-row${x.read ? ' read' : ''}" data-rl="${x.id}" data-url="${escapeHtml(x.url)}" title="${escapeHtml(x.url)}">
        <span class="unread-dot"></span>
        <div class="sb-row-text"><b>${escapeHtml(x.title)}</b><span>${escapeHtml(hostOf(x.url))}</span></div>
        <span class="sb-acts">
          <button class="sb-act" data-act="toggle-read" title="${x.read ? 'Mark as unread' : 'Mark as read'}">${icon(x.read ? 'glasses' : 'check')}</button>
          <button class="sb-act" data-act="remove-rl" title="Remove from list">${icon('x')}</button>
        </span>
      </div>`).join('')
      : empty('glasses', sb.readingFilter === 'unread' ? 'All caught up' : 'Your list is empty', 'Save pages to read later with Ctrl+Shift+D.');
  } else if (sb.view === 'history') {
    renderHistory(list);
  } else if (sb.view === 'downloads') {
    renderDownloads(list);
  }
}

/** Linhas da árvore de favoritos: pastas abrem e fecham; tudo pode ser arrastado. */
function bmRows(items, depth) {
  return items.map((b) => {
    const editing = sb.editing?.kind === 'bookmark' && sb.editing.id === b.id;
    const name = editing
      ? `<input class="sb-edit" data-edit="bookmark" value="${escapeHtml(b.title)}" maxlength="80" spellcheck="false" />`
      : null;
    if (b.folder) {
      const open = sb.openFolders.has(b.id);
      const n = bookmarks.count(b.children);
      const head = `<div class="sb-row bm-folder${open ? ' open' : ''}" data-bm="${b.id}" data-folder="1" draggable="${!editing}" style="--depth:${depth}" title="${escapeHtml(b.title)}">
        <span class="sb-chev">${icon('forward')}</span><span class="sb-fav">${icon('folder')}</span>
        <div class="sb-row-text">${name || `<b>${escapeHtml(b.title)}</b>`}</div>
        ${editing ? '' : `${n ? `<span class="sb-badge">${n}</span>` : ''}<span class="sb-acts">
          <button class="sb-act" data-act="rename-bm" title="Rename">${icon('pencil')}</button>
          <button class="sb-act" data-act="remove-folder" title="Delete folder">${icon('x')}</button></span>`}
      </div>`;
      if (!open) return head;
      const inner = b.children.length
        ? bmRows(b.children, depth + 1)
        : `<div class="sb-row bm-empty" data-bm-empty="${b.id}" style="--depth:${depth + 1}">Empty folder</div>`;
      return head + inner;
    }
    return `<div class="sb-row" data-bm="${b.id}" data-url="${escapeHtml(b.url)}" draggable="${!editing}" style="--depth:${depth}" title="${escapeHtml(b.url)}">
        <span class="sb-chev"></span>${siteRowIcon(b.url)}
        <div class="sb-row-text">${name || `<b>${escapeHtml(b.title)}</b><span>${escapeHtml(hostOf(b.url))}</span>`}</div>
        ${editing ? '' : `<span class="sb-acts">
          <button class="sb-act" data-act="rename-bm" title="Rename">${icon('pencil')}</button>
          <button class="sb-act" data-act="remove-bm" title="Remove from Favorites">${icon('x')}</button></span>`}
      </div>`;
  }).join('');
}

const empty = (ic, title, text) => `<div class="sb-empty"><span data-icon="${ic}">${icon(ic)}</span><b>${title}</b><p>${text}</p></div>`;

const dayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
function dayLabel(t) {
  const d = new Date(t); d.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - d) / 864e5);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  const s = dayFmt.format(new Date(t));
  return s[0].toUpperCase() + s.slice(1);
}

function renderHistory(list) {
  const q = sb.historyQuery.trim().toLowerCase();
  let items = [...browseHistory.data.visits].sort((a, b) => b.t - a.t);
  if (q) items = items.filter((v) => v.url.toLowerCase().includes(q) || (v.title || '').toLowerCase().includes(q));
  const MAX = 400;
  if (!items.length) {
    list.innerHTML = q ? empty('search', 'No results', `Nothing in your history matches “${escapeHtml(sb.historyQuery)}”.`)
      : empty('clock', 'No history', 'Pages you visit will show up here.');
    return;
  }
  let html = ''; let lastDay = '';
  for (const v of items.slice(0, MAX)) {
    const day = dayLabel(v.t);
    if (day !== lastDay) { html += `<div class="sb-day">${day}</div>`; lastDay = day; }
    html += `<div class="sb-row" data-hist="${escapeHtml(v.url)}" data-url="${escapeHtml(v.url)}" title="${escapeHtml(v.url)}">
      <span class="sb-time">${timeFmt.format(new Date(v.t))}</span>
      <div class="sb-row-text"><b>${escapeHtml(v.title || hostOf(v.url))}</b><span>${escapeHtml(hostOf(v.url))}</span></div>
      <span class="sb-acts"><button class="sb-act" data-act="remove-hist" title="Remove from history">${icon('x')}</button></span>
    </div>`;
  }
  if (items.length > MAX) html += `<p class="sb-more">Showing the ${MAX} most recent. Search to find the rest.</p>`;
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

  if (act === 'close-tab') { closeTab(+tabEl2.dataset.tab, { force: true }); return; }
  if (act === 'new-tab') { newTab(); return; }
  if (act === 'new-group') { sb.editing = { kind: 'newgroup' }; renderMain(); return; }
  if (act === 'rename-group') { sb.editing = { kind: 'group', id: setEl.dataset.set }; renderMain(); return; }
  if (act === 'delete-group') { deleteGroup(setEl.dataset.set); return; }
  if (act === 'rename-bm') { sb.editing = { kind: 'bookmark', id: row.dataset.bm }; renderSub(); focusEditor(); return; }
  if (act === 'remove-bm') { bookmarks.remove(row.dataset.bm); toast('Removed from Favorites'); return; }
  if (act === 'remove-folder') { deleteFolder(row.dataset.bm); return; }
  if (act === 'new-folder') { sb.editing = { kind: 'newfolder' }; renderSub(); focusEditor(); return; }
  if (row?.dataset.folder) {
    const id = row.dataset.bm;
    if (sb.openFolders.has(id)) sb.openFolders.delete(id); else sb.openFolders.add(id);
    sfx.play('tick');
    renderSub();
    return;
  }
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
    if (!t || !/^https?:/.test(t.url)) { toast('Open a page to add it to Favorites'); return; }
    toast(bookmarks.add(t.url, t.title) ? 'Added to Favorites' : 'This page is already in Favorites');
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
  if (e.target.closest('[data-act="clear-downloads"]')) { downloadsList.clear(); sfx.play('close'); }
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
    toast(`Group “${g.name}” created`);
  } else if (ed.kind === 'group' && v) {
    tabSets.renameGroup(ed.id, v);
  } else if (ed.kind === 'bookmark' && v) {
    bookmarks.rename(ed.id, v);
  } else if (ed.kind === 'newfolder' && v) {
    bookmarks.addFolder(v);
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
    title: `Delete the group “${g.name}”?`,
    text: n ? `${n === 1 ? 'The tab' : `All ${n} tabs`} in this group will be closed.` : 'The group is empty.',
    ok: 'Delete group',
    danger: true,
  });
  if (!yes) return;
  if (library.currentKey() === id) await library.switchTo('default');
  tabSets.removeGroup(id);
  renderSidebar();
  toast(`Group “${g.name}” deleted`);
}

async function deleteFolder(id) {
  const f = bookmarks.get(id);
  if (!f) return;
  const n = bookmarks.count(f.children);
  if (f.children.length) {
    const yes = await ask({
      title: `Delete the folder “${f.title}”?`,
      text: n ? `${n === 1 ? 'The favorite' : `All ${n} favorites`} inside it will be deleted too.` : 'The folders inside it will be deleted too.',
      ok: 'Delete folder',
      danger: true,
    });
    if (!yes) return;
  }
  sb.openFolders.delete(id);
  bookmarks.remove(id);
  toast(`Folder “${f.title}” deleted`);
}

/* ───────────── Arrastar favoritos (reordenar e mover entre pastas) ───────────── */
function dropTarget(e) {
  const end = e.target.closest('[data-bm-end]');
  if (end) return { id: null, where: 'end', el: end };
  const emptyRow = e.target.closest('[data-bm-empty]');
  if (emptyRow) return { id: emptyRow.dataset.bmEmpty, where: 'inside', el: emptyRow };
  const row = e.target.closest('.sb-row[data-bm]');
  if (!row) return null;
  const r = row.getBoundingClientRect();
  const y = (e.clientY - r.top) / r.height;
  const where = row.dataset.folder
    ? (y < 0.28 ? 'before' : y > 0.72 && !row.classList.contains('open') ? 'after' : 'inside')
    : (y < 0.5 ? 'before' : 'after');
  return { id: row.dataset.bm, where, el: row };
}
function clearDropMarks() {
  $$('#sb-list .drop-before, #sb-list .drop-after, #sb-list .drop-inside, #sb-list .drop-end')
    .forEach((el) => el.classList.remove('drop-before', 'drop-after', 'drop-inside', 'drop-end'));
}
let hoverOpenTimer = null;
const sbList = $('#sb-list');
sbList.addEventListener('dragstart', (e) => {
  const row = e.target.closest?.('.sb-row[data-bm]');
  if (sb.view !== 'bookmarks' || !row) return;
  sb.drag = row.dataset.bm;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', row.dataset.url || row.dataset.bm);
  requestAnimationFrame(() => row.classList.add('dragging'));
});
sbList.addEventListener('dragover', (e) => {
  if (!sb.drag) return;
  const t = dropTarget(e);
  clearDropMarks();
  if (!t || (t.id && (t.id === sb.drag || bookmarks.contains(sb.drag, t.id)))) { clearTimeout(hoverOpenTimer); hoverOpenTimer = null; return; }
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  t.el.classList.add(t.where === 'end' ? 'drop-end' : `drop-${t.where}`);
  // segurar sobre uma pasta fechada abre a pasta
  if (t.where === 'inside' && t.el.dataset.folder && !sb.openFolders.has(t.id)) {
    if (hoverOpenTimer?.id !== t.id) {
      clearTimeout(hoverOpenTimer);
      const timer = setTimeout(() => { sb.openFolders.add(t.id); renderSub(); }, 650);
      hoverOpenTimer = timer; hoverOpenTimer.id = t.id;
    }
  } else { clearTimeout(hoverOpenTimer); hoverOpenTimer = null; }
});
sbList.addEventListener('dragleave', (e) => { if (!sbList.contains(e.relatedTarget)) clearDropMarks(); });
sbList.addEventListener('drop', (e) => {
  if (!sb.drag) return;
  e.preventDefault();
  const t = dropTarget(e);
  const id = sb.drag;
  sb.drag = null;
  clearDropMarks();
  clearTimeout(hoverOpenTimer); hoverOpenTimer = null;
  if (!t) return;
  if (t.where === 'inside') sb.openFolders.add(t.id);
  if (bookmarks.move(id, t.id, t.where === 'end' ? null : t.where)) sfx.play('select');
});
sbList.addEventListener('dragend', () => {
  sb.drag = null;
  clearDropMarks();
  clearTimeout(hoverOpenTimer); hoverOpenTimer = null;
  $$('#sb-list .dragging').forEach((el) => el.classList.remove('dragging'));
});

/* ───────────── Limpar histórico / dados ───────────── */
function openClearSheet({ historyOnly = false } = {}) {
  $('#clear-title').textContent = historyOnly ? 'Clear history' : 'Clear browsing data';
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
  toast(historyOnly ? 'History cleared' : 'Browsing data cleared');
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
