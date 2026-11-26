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
const copyText = (text) => { api?.clipboardWrite(text); toast(tl('Copied')); };

/** Abre um endereço numa aba nova, sem sair da aba atual (como no Chrome). */
function openInBackground(url) {
  if (APP_MODE) { api?.apps.toBrowser(url); return active(); } // janela de app: vai para o navegador
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
        : [{ label: tl('No spelling suggestions'), disabled: true }]),
      { label: tl('Add to dictionary'), run: doPage('learn', { word: p.misspelledWord }) },
    ]);
  }
  if (p.linkURL && /^(https?|mailto|ftp):/i.test(p.linkURL)) {
    const web = /^https?:/i.test(p.linkURL);
    sections.push([
      ...(web ? [
        { label: tl('Open link in new tab'), run: () => openInBackground(p.linkURL) },
        ...(library.isPrivate() ? [] : [{ label: tl('Open link in new window'), run: () => api?.newWindow(p.linkURL) }]),
      ] : []),
      { label: tl('Copy link address'), run: () => copyText(p.linkURL) },
      ...(web ? [
        { label: tl('Save link as…'), run: doPage('save', { url: p.linkURL }) },
        { label: tl('Add link to Favorites'), run: () => toast(bookmarks.add(p.linkURL, short(p.linkText || '', 80) || hostOf(p.linkURL)) ? tl('Added to Favorites') : tl('That link is already in your Favorites')) },
      ] : []),
    ]);
  }
  if (p.mediaType === 'image' && p.srcURL) {
    const web = /^https?:/i.test(p.srcURL);
    sections.push([
      ...(web ? [{ label: tl('Open image in new tab'), run: () => openInBackground(p.srcURL) }] : []),
      { label: tl('Save image as…'), run: doPage('save', { url: p.srcURL }) },
      { label: tl('Copy image'), run: doPage('copyImage'), disabled: !p.hasImageContents },
      { label: tl('Copy image address'), run: () => copyText(p.srcURL) },
      ...(web ? [{ label: tl('Search image with Google'), run: () => openInBackground(`https://lens.google.com/uploadbyurl?url=${encodeURIComponent(p.srcURL)}`) }] : []),
    ]);
  }
  if ((p.mediaType === 'video' || p.mediaType === 'audio') && p.srcURL !== undefined) {
    const f = p.mediaFlags || {};
    const kind = p.mediaType === 'video' ? 'video' : 'audio';
    const web = /^https?:/i.test(p.srcURL || '');
    sections.push([
      { label: f.isPaused ? tl('Play') : tl('Pause'), run: doPage('media', { what: 'play' }) },
      { label: f.isMuted ? tl('Unmute') : tl('Mute'), run: doPage('media', { what: 'mute' }), disabled: f.hasAudio === false },
      { label: tl('Loop'), checked: !!f.isLooping, run: doPage('media', { what: 'loop' }) },
      { label: tl('Show controls'), checked: !!f.isControlsVisible, run: doPage('media', { what: 'controls' }), disabled: f.canToggleControls === false },
      ...(kind === 'video' ? [{ label: tl('Picture in picture'), checked: false, run: doPage('media', { what: 'pip' }), disabled: f.canShowPictureInPicture === false }] : []),
    ]);
    if (web) {
      sections.push([
        { label: (kind === 'video' ? tl('Open video in new tab') : tl('Open audio in new tab')), run: () => openInBackground(p.srcURL) },
        { label: (kind === 'video' ? tl('Save video as…') : tl('Save audio as…')), run: doPage('save', { url: p.srcURL }), disabled: f.canSave === false },
        { label: (kind === 'video' ? tl('Copy video address') : tl('Copy audio address')), run: () => copyText(p.srcURL) },
      ]);
    }
  }
  if (p.isEditable) {
    sections.push([
      { label: tl('Undo'), key: 'Ctrl+Z', run: doPage('undo'), disabled: !ef.canUndo },
      { label: tl('Redo'), key: 'Ctrl+Y', run: doPage('redo'), disabled: !ef.canRedo },
    ], [
      { label: tl('Cut'), key: 'Ctrl+X', run: doPage('cut'), disabled: !ef.canCut },
      { label: tl('Copy'), key: 'Ctrl+C', run: doPage('copy'), disabled: !ef.canCopy },
      { label: tl('Paste'), key: 'Ctrl+V', run: doPage('paste'), disabled: !ef.canPaste },
      { label: tl('Paste as plain text'), key: 'Ctrl+Shift+V', run: doPage('pastePlain'), disabled: !ef.canPaste },
      { label: tl('Select all'), key: 'Ctrl+A', run: doPage('selectAll'), disabled: !ef.canSelectAll },
    ]);
  } else if (p.selectionText.trim()) {
    const q = p.selectionText.trim();
    sections.push([
      { label: tl('Copy'), key: 'Ctrl+C', run: doPage('copy') },
      { label: tl('Search {engine} for “{q}”', { engine: engine().name, q: short(q) }), run: () => openInBackground(searchUrl(q.slice(0, 500))) },
    ]);
  }
  // a página em si: quando o clique não foi num link, imagem, vídeo, texto ou campo
  if (!sections.length || (sections.length === 1 && p.misspelledWord && !p.isEditable)) {
    sections.push([
      { label: tl('Back'), key: 'Alt+←', run: () => goBack(), disabled: !(t.canBack || t.fromStart) },
      { label: tl('Forward'), key: 'Alt+→', run: () => t.wv?.goForward(), disabled: !t.canFwd },
      { label: tl('Reload'), key: 'Ctrl+R', run: () => t.wv?.reload() },
    ], [
      { label: tl('Save page as…'), key: 'Ctrl+S', run: doPage('savePage') },
      { label: tl('Print…'), key: 'Ctrl+P', run: () => openPrint(t) },
      ...appMenuItems(t),
    ], [
      { label: tl('View page source'), key: 'Ctrl+U', run: () => openInBackground(`view-source:${p.pageURL}`), disabled: !/^https?:/i.test(p.pageURL) },
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
  sections.push([{ label: tl('Inspect'), key: 'Ctrl+Shift+I', run: doPage('inspect') }]);
  const items = sections.flatMap((s) => ['-', ...s]);
  showMenu(items, r.left + p.x, r.top + p.y, () => t.wv?.focus());
});

/* ───────────── Abas e barra de endereço ───────────── */
function tabItems(t) {
  const web = /^https?:/i.test(t.url);
  const fav = web && !!bookmarks.find(t.url);
  return [
    { label: tl('New tab'), key: 'Ctrl+T', run: () => newTab() },
    { label: tl('New window'), key: 'Ctrl+N', run: () => api?.newWindow() },
    '-',
    { label: tl('Reload'), key: 'Ctrl+R', run: () => t.wv?.reload(), disabled: !t.wv },
    { label: tl('Duplicate'), run: () => (web ? openInBackground(t.url) : newTab(t.url, false)) },
    { label: fav ? tl('Remove from Favorites') : tl('Add to Favorites'), key: 'Ctrl+D', run: () => toggleBookmark(t), disabled: !web },
    { label: t.muted ? tl('Unmute tab') : tl('Mute tab'), run: () => toggleMute(t), disabled: !t.wv },
    ...(library.isPrivate() ? [] : [{ label: t.pinned ? tl('Unpin tab') : tl('Pin tab'), run: () => { if (t.pinned) library.unpin(t); else library.pin(t); render(); library.onTabsChanged(); } }]),
    '-',
    { label: tl('Close tab'), key: t.pinned ? '' : 'Ctrl+W', run: () => closeTab(t.id, { force: true }) },
    { label: tl('Reopen closed tab'), key: 'Ctrl+Shift+T', run: () => reopenClosedTab(), disabled: !closedTabs.length },
    { label: tl('Close other tabs'), run: () => { for (const o of [...tabs]) if (o.id !== t.id && !o.pinned) closeTab(o.id); }, disabled: !tabs.some((o) => o.id !== t.id && !o.pinned) },
  ];
}
async function pasteAndGo(t) {
  const text = ((await api?.clipboardRead()) || '').trim();
  if (!text) { toast(tl('The clipboard is empty')); return; }
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
      { label: tl('Undo'), key: 'Ctrl+Z', run: () => api.ctxUi('undo') },
      '-',
      { label: tl('Cut'), key: 'Ctrl+X', run: () => api.ctxUi('cut'), disabled: !hasSel },
      { label: tl('Copy'), key: 'Ctrl+C', run: () => api.ctxUi('copy'), disabled: !hasSel },
      { label: tl('Paste'), key: 'Ctrl+V', run: () => api.ctxUi('paste') },
      { label: tl('Paste and go'), run: () => pasteAndGo(t) },
      '-',
      { label: tl('Select all'), key: 'Ctrl+A', run: () => api.ctxUi('selectAll') },
    ], x, y, () => input.focus());
    return;
  }
  const web = /^https?:/i.test(t.url);
  const move = typeof moveItems === 'function' ? await moveItems(t) : [];
  if (!tabs.includes(t)) return;
  showMenu([
    ...(t.id === activeId ? [
      { label: tl('Copy address'), run: () => copyText(t.url), disabled: !web },
      { label: tl('Paste and go'), run: () => pasteAndGo(t) },
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
        { label: tl('Open'), run: () => openFolderPop(id, tile.closest('#folder-pop') ? null : tile) },
        { label: tl('Open all ({n}) in new tabs', { n: urls.length }), run: () => urls.forEach((u) => openInBackground(u)), disabled: !urls.length },
        '-',
        { label: tl('Rename…'), run: () => renameFavorite(id) },
        { label: tl('Delete folder'), run: () => { closeFolderPop(); deleteFolder(id); } },
      ], e.clientX, e.clientY);
      return;
    }
    const url = tile.dataset.url;
    showMenu([
      { label: tl('Open'), run: () => { closeFolderPop(); navigate(active(), url); } },
      { label: tl('Open in new tab'), run: () => openInBackground(url) },
      '-',
      { label: tl('Copy address'), run: () => copyText(url) },
      { label: tl('Rename…'), run: () => renameFavorite(tile.dataset.bm) },
      { label: tl('Remove from Favorites'), run: () => { bookmarks.remove(tile.dataset.bm); toast(tl('Removed from Favorites')); } },
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
      { label: tl('Undo'), key: 'Ctrl+Z', run: () => api.ctxUi('undo') },
      '-',
      { label: tl('Cut'), key: 'Ctrl+X', run: () => api.ctxUi('cut'), disabled: !hasSel || field.readOnly },
      { label: tl('Copy'), key: 'Ctrl+C', run: () => api.ctxUi('copy'), disabled: !hasSel },
      { label: tl('Paste'), key: 'Ctrl+V', run: () => api.ctxUi('paste'), disabled: field.readOnly },
      '-',
      { label: tl('Select all'), key: 'Ctrl+A', run: () => api.ctxUi('selectAll') },
    ], e.clientX, e.clientY, () => field.focus());
    return;
  }
  e.preventDefault(); // no resto da interface: nada (como antes)
});
