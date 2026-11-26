'use strict';
// Menu de contexto (botão direito) no estilo do Kona, com os itens do Chrome. Serve as páginas
// (aviso "ctx:page" do processo principal, com o que está sob o mouse) e a própria interface:
// barra de endereço, abas, favoritos da nova aba e campos de texto. Teclado: ↑/↓, Enter, Esc.

const ctx = { items: [], sel: -1, open: false, restore: null };
const menuEl = $('#ctx-menu');

/* ───────────── Componente ───────────── */
/**
 * items: [{ label, run, key?, disabled?, checked?, bold? } | '-' (separador)].
 * restore: função chamada ao fechar sem escolher (devolve o foco à página).
 */
function showMenu(items, x, y, restore = null) {
  // separadores só entre grupos (sem duplos, sem nas pontas)
  const list = items.filter((it, i, a) => it !== '-' || (i > 0 && a[i - 1] !== '-' && i < a.length - 1));
  if (!list.length) return;
  ctx.items = list;
  ctx.sel = -1;
  ctx.restore = restore;
  menuEl.innerHTML = list.map((it, i) => (it === '-'
    ? '<div class="ctx-sep" role="separator"></div>'
    : `<div class="ctx-item${it.disabled ? ' disabled' : ''}${it.bold ? ' bold' : ''}" role="menuitem" data-i="${i}"${it.disabled ? ' aria-disabled="true"' : ''}>
        <span class="ctx-check">${it.checked ? icon('check') : ''}</span>
        <span class="ctx-label">${escapeHtml(it.label)}</span>
        ${it.key ? `<span class="ctx-key">${escapeHtml(it.key)}</span>` : ''}
      </div>`)).join('');
  menuEl.classList.toggle('checks', list.some((it) => it.checked !== undefined));
  menuEl.style.left = '0px'; menuEl.style.top = '0px';
  menuEl.classList.add('show');
  ctx.open = true;
  // dentro da janela: abre para cima/esquerda se não couber
  const w = menuEl.offsetWidth, h = menuEl.offsetHeight;
  const left = x + w + 8 > innerWidth ? Math.max(8, x - w) : x;
  const top = y + h + 8 > innerHeight ? Math.max(8, y - h) : y;
  menuEl.style.left = `${left}px`; menuEl.style.top = `${top}px`;
  menuEl.style.transformOrigin = `${x - left}px ${y - top}px`;
  menuEl.focus({ preventScroll: true });
  sfx.play('open');
}

function closeMenu(chosen = false) {
  if (!ctx.open) return false;
  ctx.open = false;
  menuEl.classList.remove('show');
  const restore = ctx.restore;
  ctx.restore = null;
  if (!chosen) restore?.();
  return true;
}

function runItem(i) {
  const it = ctx.items[i];
  if (!it || it === '-' || it.disabled) return;
  closeMenu(true);
  sfx.play('select');
  Promise.resolve().then(() => it.run());
}

function moveSel(dir) {
  const n = ctx.items.length;
  for (let k = 1; k <= n; k++) {
    const i = (ctx.sel + dir * k + n * 2) % n;
    const it = ctx.items[i];
    if (it !== '-' && !it.disabled) { setSel(i); return; }
  }
}
function setSel(i) {
  ctx.sel = i;
  $$('.ctx-item', menuEl).forEach((el) => el.classList.toggle('sel', +el.dataset.i === i));
}

menuEl.addEventListener('mousemove', (e) => {
  const el = e.target.closest('.ctx-item');
  if (el && +el.dataset.i !== ctx.sel) { setSel(el.classList.contains('disabled') ? -1 : +el.dataset.i); if (!el.classList.contains('disabled')) sfx.play('tick'); }
});
menuEl.addEventListener('mouseleave', () => setSel(-1));
menuEl.addEventListener('click', (e) => { const el = e.target.closest('.ctx-item'); if (el) runItem(+el.dataset.i); });
menuEl.addEventListener('contextmenu', (e) => e.preventDefault());
menuEl.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') moveSel(1);
  else if (e.key === 'ArrowUp') moveSel(-1);
  else if (e.key === 'Home') { ctx.sel = -1; moveSel(1); }
  else if (e.key === 'End') { ctx.sel = 0; moveSel(-1); }
  else if (e.key === 'Enter' || e.key === ' ') { if (ctx.sel >= 0) runItem(ctx.sel); }
  else if (e.key === 'Escape' || e.key === 'Tab') closeMenu();
  else return;
  e.preventDefault();
  e.stopPropagation();
});
// Fecha ao clicar fora (na interface ou numa página), ao rolar, redimensionar ou a janela perder o foco
document.addEventListener('mousedown', (e) => { if (ctx.open && !e.target.closest('#ctx-menu')) closeMenu(); }, true);
document.addEventListener('wheel', (e) => { if (ctx.open && !e.target.closest('#ctx-menu')) closeMenu(); }, { capture: true, passive: true });
addEventListener('resize', () => closeMenu());
api?.on('page:mousedown', () => closeMenu());
api?.on('win:state', ({ focused }) => { if (!focused) closeMenu(); });

/* ───────────── Ajudas ───────────── */
const short = (s, n = 26) => { s = s.replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
const copyText = (text) => { api?.clipboardWrite(text); toast('Copied'); };

/** Abre um endereço numa aba nova, sem sair da aba atual (como no Chrome). */
function openInBackground(url) {
  const t = makeTab(url, { index: tabs.indexOf(active()) + 1 });
  ensureWebview(t);
  sfx.play('tabOpen');
  render();
  return t;
}
const tabOfWebContents = (id) => tabs.find((t) => { try { return t.wv?.getWebContentsId() === id; } catch { return false; } });

/* ───────────── Páginas ───────────── */
api?.on('ctx:page', ({ id, params: p }) => {
  const t = tabOfWebContents(id);
  if (!t?.wv) return;
  const r = t.wv.getBoundingClientRect();
  const doPage = (act, data = {}) => () => api.ctxDo(id, act, { x: p.x, y: p.y, ...data });
  const sections = [];
  const ef = p.editFlags || {};

  // corretor ortográfico (idiomas do Windows)
  if (p.isEditable && p.misspelledWord) {
    sections.push([
      ...(p.dictionarySuggestions.length
        ? p.dictionarySuggestions.map((w) => ({ label: w, bold: true, run: doPage('replace', { word: w }) }))
        : [{ label: 'No spelling suggestions', disabled: true }]),
      { label: 'Add to dictionary', run: doPage('learn', { word: p.misspelledWord }) },
    ]);
  }
  if (p.linkURL && /^(https?|mailto|ftp):/i.test(p.linkURL)) {
    const web = /^https?:/i.test(p.linkURL);
    sections.push([
      ...(web ? [
        { label: 'Open link in new tab', run: () => openInBackground(p.linkURL) },
        ...(library.isPrivate() ? [] : [{ label: 'Open link in new window', run: () => api?.newWindow(p.linkURL) }]),
      ] : []),
      { label: 'Copy link address', run: () => copyText(p.linkURL) },
      ...(web ? [
        { label: 'Save link as…', run: doPage('save', { url: p.linkURL }) },
        { label: 'Add link to Favorites', run: () => toast(bookmarks.add(p.linkURL, short(p.linkText || '', 80) || hostOf(p.linkURL)) ? 'Added to Favorites' : 'That link is already in your Favorites') },
      ] : []),
    ]);
  }
  if (p.mediaType === 'image' && p.srcURL) {
    const web = /^https?:/i.test(p.srcURL);
    sections.push([
      ...(web ? [{ label: 'Open image in new tab', run: () => openInBackground(p.srcURL) }] : []),
      { label: 'Save image as…', run: doPage('save', { url: p.srcURL }) },
      { label: 'Copy image', run: doPage('copyImage'), disabled: !p.hasImageContents },
      { label: 'Copy image address', run: () => copyText(p.srcURL) },
      ...(web ? [{ label: 'Search image with Google', run: () => openInBackground(`https://lens.google.com/uploadbyurl?url=${encodeURIComponent(p.srcURL)}`) }] : []),
    ]);
  }
  if ((p.mediaType === 'video' || p.mediaType === 'audio') && p.srcURL !== undefined) {
    const f = p.mediaFlags || {};
    const kind = p.mediaType === 'video' ? 'video' : 'audio';
    const web = /^https?:/i.test(p.srcURL || '');
    sections.push([
      { label: f.isPaused ? 'Play' : 'Pause', run: doPage('media', { what: 'play' }) },
      { label: f.isMuted ? 'Unmute' : 'Mute', run: doPage('media', { what: 'mute' }), disabled: f.hasAudio === false },
      { label: 'Loop', checked: !!f.isLooping, run: doPage('media', { what: 'loop' }) },
      { label: 'Show controls', checked: !!f.isControlsVisible, run: doPage('media', { what: 'controls' }), disabled: f.canToggleControls === false },
      ...(kind === 'video' ? [{ label: 'Picture in picture', checked: false, run: doPage('media', { what: 'pip' }), disabled: f.canShowPictureInPicture === false }] : []),
    ]);
    if (web) {
      sections.push([
        { label: `Open ${kind} in new tab`, run: () => openInBackground(p.srcURL) },
        { label: `Save ${kind} as…`, run: doPage('save', { url: p.srcURL }), disabled: f.canSave === false },
        { label: `Copy ${kind} address`, run: () => copyText(p.srcURL) },
      ]);
    }
  }
  if (p.isEditable) {
    sections.push([
      { label: 'Undo', key: 'Ctrl+Z', run: doPage('undo'), disabled: !ef.canUndo },
      { label: 'Redo', key: 'Ctrl+Y', run: doPage('redo'), disabled: !ef.canRedo },
    ], [
      { label: 'Cut', key: 'Ctrl+X', run: doPage('cut'), disabled: !ef.canCut },
      { label: 'Copy', key: 'Ctrl+C', run: doPage('copy'), disabled: !ef.canCopy },
      { label: 'Paste', key: 'Ctrl+V', run: doPage('paste'), disabled: !ef.canPaste },
      { label: 'Paste as plain text', key: 'Ctrl+Shift+V', run: doPage('pastePlain'), disabled: !ef.canPaste },
      { label: 'Select all', key: 'Ctrl+A', run: doPage('selectAll'), disabled: !ef.canSelectAll },
    ]);
  } else if (p.selectionText.trim()) {
    const q = p.selectionText.trim();
    sections.push([
      { label: 'Copy', key: 'Ctrl+C', run: doPage('copy') },
      { label: `Search ${engine().name} for “${short(q)}”`, run: () => openInBackground(searchUrl(q.slice(0, 500))) },
    ]);
  }
  // a página em si: quando o clique não foi num link, imagem, vídeo, texto ou campo
  if (!sections.length || (sections.length === 1 && p.misspelledWord && !p.isEditable)) {
    sections.push([
      { label: 'Back', key: 'Alt+←', run: () => goBack(), disabled: !(t.canBack || t.fromStart) },
      { label: 'Forward', key: 'Alt+→', run: () => t.wv?.goForward(), disabled: !t.canFwd },
      { label: 'Reload', key: 'Ctrl+R', run: () => t.wv?.reload() },
    ], [
      { label: 'Save page as…', key: 'Ctrl+S', run: doPage('savePage') },
      { label: 'Print…', key: 'Ctrl+P', run: doPage('print') },
    ], [
      { label: 'View page source', key: 'Ctrl+U', run: () => openInBackground(`view-source:${p.pageURL}`), disabled: !/^https?:/i.test(p.pageURL) },
    ]);
  }
  // itens das extensões (chrome.contextMenus): um nível, com o nome do grupo acima dos subitens
  if (p.extItems?.length) {
    const flat = [];
    for (const it of p.extItems) {
      if (it.sep) { flat.push('-'); continue; }
      if (it.submenu?.length) {
        flat.push({ label: it.label, disabled: true });
        for (const s of it.submenu) flat.push(s.sep ? '-' : { label: `   ${s.label}`, checked: s.checked, disabled: !s.enabled, run: () => api.extMenuClick(s.id) });
      } else flat.push({ label: it.label, checked: it.checked, disabled: !it.enabled, run: () => api.extMenuClick(it.id) });
    }
    sections.push(flat);
  }
  sections.push([{ label: 'Inspect', key: 'Ctrl+Shift+I', run: doPage('inspect') }]);
  const items = sections.flatMap((s) => ['-', ...s]);
  showMenu(items, r.left + p.x, r.top + p.y, () => t.wv?.focus());
});

/* ───────────── Abas e barra de endereço ───────────── */
function tabItems(t) {
  const web = /^https?:/i.test(t.url);
  const fav = web && !!bookmarks.find(t.url);
  return [
    { label: 'New tab', key: 'Ctrl+T', run: () => newTab() },
    { label: 'New window', key: 'Ctrl+N', run: () => api?.newWindow() },
    '-',
    { label: 'Reload', key: 'Ctrl+R', run: () => t.wv?.reload(), disabled: !t.wv },
    { label: 'Duplicate', run: () => (web ? openInBackground(t.url) : newTab(t.url, false)) },
    { label: fav ? 'Remove from Favorites' : 'Add to Favorites', key: 'Ctrl+D', run: () => toggleBookmark(t), disabled: !web },
    { label: t.muted ? 'Unmute tab' : 'Mute tab', run: () => toggleMute(t), disabled: !t.wv },
    '-',
    { label: 'Close tab', key: 'Ctrl+W', run: () => closeTab(t.id) },
    { label: 'Reopen closed tab', key: 'Ctrl+Shift+T', run: () => reopenClosedTab(), disabled: !closedTabs.length },
    { label: 'Close other tabs', run: () => { for (const o of [...tabs]) if (o.id !== t.id) closeTab(o.id); }, disabled: tabs.length < 2 },
  ];
}
async function pasteAndGo(t) {
  const text = ((await api?.clipboardRead()) || '').trim();
  if (!text) { toast('The clipboard is empty'); return; }
  $(`#tabs .tab[data-id="${t.id}"] input`)?.blur();
  go(t, { text });
}
async function tabMenu(t, x, y, onInput) {
  const input = $(`#tabs .tab[data-id="${t.id}"] input`);
  const editing = onInput && document.activeElement === input;
  if (editing) {
    // editando o endereço: menu de edição + colar e abrir
    const hasSel = input.selectionStart !== input.selectionEnd;
    showMenu([
      { label: 'Undo', key: 'Ctrl+Z', run: () => api.ctxUi('undo') },
      '-',
      { label: 'Cut', key: 'Ctrl+X', run: () => api.ctxUi('cut'), disabled: !hasSel },
      { label: 'Copy', key: 'Ctrl+C', run: () => api.ctxUi('copy'), disabled: !hasSel },
      { label: 'Paste', key: 'Ctrl+V', run: () => api.ctxUi('paste') },
      { label: 'Paste and go', run: () => pasteAndGo(t) },
      '-',
      { label: 'Select all', key: 'Ctrl+A', run: () => api.ctxUi('selectAll') },
    ], x, y, () => input.focus());
    return;
  }
  const web = /^https?:/i.test(t.url);
  const move = typeof moveItems === 'function' ? await moveItems(t) : [];
  if (!tabs.includes(t)) return;
  showMenu([
    ...(t.id === activeId ? [
      { label: 'Copy address', run: () => copyText(t.url), disabled: !web },
      { label: 'Paste and go', run: () => pasteAndGo(t) },
      '-',
    ] : []),
    ...tabItems(t),
    ...(move.length ? ['-', ...move] : []),
  ], x, y);
}

/* ───────────── Favoritos da nova aba (e do painel de pasta) ───────────── */
function renameFavorite(id) {
  closeFolderPop();
  openSidebarView('bookmarks');
  // abre as pastas até o favorito, para a edição aparecer
  let parentFolders = [];
  bookmarks.walk((b, _list, depth) => { parentFolders.length = depth; if (b.folder) parentFolders[depth] = b.id; if (b.id === id) return false; return true; });
  parentFolders.filter(Boolean).forEach((f) => { if (f !== id) sb.openFolders.add(f); });
  sb.editing = { kind: 'bookmark', id };
  renderSub();
  focusEditor();
}
document.addEventListener('contextmenu', (e) => {
  if (e.defaultPrevented) return;
  const tile = e.target.closest('#fav-grid .fav-item, #folder-pop .fav-item');
  if (tile && !tile.id) {
    e.preventDefault();
    if (tile.dataset.folder) {
      const id = tile.dataset.folder;
      const urls = bookmarks.all(bookmarks.get(id)?.children || []).map((b) => b.url);
      showMenu([
        { label: 'Open', run: () => openFolderPop(id, tile.closest('#folder-pop') ? null : tile) },
        { label: `Open all (${urls.length}) in new tabs`, run: () => urls.forEach((u) => openInBackground(u)), disabled: !urls.length },
        '-',
        { label: 'Rename…', run: () => renameFavorite(id) },
        { label: 'Delete folder', run: () => { closeFolderPop(); deleteFolder(id); } },
      ], e.clientX, e.clientY);
      return;
    }
    const url = tile.dataset.url;
    showMenu([
      { label: 'Open', run: () => { closeFolderPop(); navigate(active(), url); } },
      { label: 'Open in new tab', run: () => openInBackground(url) },
      '-',
      { label: 'Copy address', run: () => copyText(url) },
      { label: 'Rename…', run: () => renameFavorite(tile.dataset.bm) },
      { label: 'Remove from Favorites', run: () => { bookmarks.remove(tile.dataset.bm); toast('Removed from Favorites'); } },
    ], e.clientX, e.clientY);
    return;
  }
  // campos de texto da interface (buscas, configurações, nomes)
  const field = e.target.closest('input:not([type=checkbox]):not([type=radio]):not([type=color]):not([type=file]), textarea');
  if (field) {
    e.preventDefault();
    const hasSel = field.selectionStart !== field.selectionEnd;
    field.focus();
    showMenu([
      { label: 'Undo', key: 'Ctrl+Z', run: () => api.ctxUi('undo') },
      '-',
      { label: 'Cut', key: 'Ctrl+X', run: () => api.ctxUi('cut'), disabled: !hasSel || field.readOnly },
      { label: 'Copy', key: 'Ctrl+C', run: () => api.ctxUi('copy'), disabled: !hasSel },
      { label: 'Paste', key: 'Ctrl+V', run: () => api.ctxUi('paste'), disabled: field.readOnly },
      '-',
      { label: 'Select all', key: 'Ctrl+A', run: () => api.ctxUi('selectAll') },
    ], e.clientX, e.clientY, () => field.focus());
    return;
  }
  e.preventDefault(); // no resto da interface: nada (como antes)
});
