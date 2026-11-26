'use strict';
// Importar de outro navegador (Chrome, Edge, Brave): favoritos com pastas, histórico e extensões.
// A leitura dos arquivos é feita no processo principal (importer.js); aqui ficam a janela e a
// aplicação no perfil em uso. Também oferecida no primeiro uso, quando o perfil ainda está vazio.

const imp = { sources: [], data: null, sel: null, phase: 'choose', busy: false };
const IMPORT_OFFERED = 'kona:import-offered';

async function openImport({ welcome = false } = {}) {
  imp.phase = 'choose';
  imp.data = null;
  imp.welcome = welcome;
  $('#imp-title').textContent = welcome ? tl('Welcome to Kona') : tl('Import from another browser');
  $('#imp-sub').textContent = welcome
    ? tl('Bring your favorites, history and extensions from the browser you used before.')
    : tl('Bring your favorites, history and extensions to Kona.');
  $('#imp-cancel').textContent = welcome ? tl('Not now') : tl('Cancel');
  $('#imp-body').innerHTML = `<p class="st-empty">${tl('Looking for browsers…')}</p>`;
  setImportFooter();
  openSheet('#import-sheet');
  imp.sources = (await api?.importSources()) || [];
  if (!imp.sources.length) {
    imp.phase = 'none';
    $('#imp-body').innerHTML = `<p class="st-empty">${tl('No Chrome, Edge or Brave profile was found on this computer.')}</p>`;
    setImportFooter();
    return;
  }
  await loadSource(imp.sel && imp.sources.some((s) => s.id === imp.sel) ? imp.sel : imp.sources[0].id);
}

async function loadSource(id) {
  imp.sel = id;
  imp.data = null;
  renderImport();
  const data = await api?.importRead(id);
  if (imp.sel !== id) return; // trocou de fonte enquanto lia
  // páginas de resultado de busca não entram como sites (as buscas já vêm à parte)
  if (data) data.history.visits = data.history.visits.filter((v) => !isSearchUrl(v.url));
  imp.data = data;
  imp.pick = {
    bookmarks: !!data?.bookmarkCount,
    history: !!data?.history.visits.length,
    extensions: new Set((data?.extensions || []).filter((e) => e.enabled && e.available !== false && !installedExtension(e.id)).map((e) => e.id)),
  };
  renderImport();
}

const installedExtension = (id) => typeof extensions !== 'undefined' && extensions.some((x) => x.id === id);

function renderImport() {
  const body = $('#imp-body');
  const from = imp.sources.length > 1
    ? `<label class="imp-from"><span>${tl('From')}</span><select class="st-select" id="imp-source">${imp.sources.map((s) =>
      `<option value="${escapeHtml(s.id)}"${s.id === imp.sel ? ' selected' : ''}>${escapeHtml(s.browser)} — ${escapeHtml(s.profile)}</option>`).join('')}</select></label>`
    : `<p class="imp-one">${tl('From {browser}', { browser: `<b>${escapeHtml(imp.sources[0].browser)}</b>` })} — ${escapeHtml(imp.sources[0].profile)}</p>`;
  const d = imp.data;
  if (!d) { body.innerHTML = from + `<p class="st-empty">${tl('Reading…')}</p>`; setImportFooter(); return; }
  const h = d.history;
  const replacing = bookmarks.isDefaultList();
  const exts = d.extensions.map((e) => {
    const have = installedExtension(e.id);
    const gone = e.available === false;
    return `<label class="imp-ext${have || gone ? ' have' : ''}">
        <input type="checkbox" data-ext="${e.id}"${imp.pick.extensions.has(e.id) ? ' checked' : ''}${have || gone ? ' disabled' : ''} />
        <span class="imp-eicon">${e.icon ? `<img src="${e.icon}" alt="" />` : icon('puzzle')}</span>
        <span class="imp-ename">${escapeHtml(e.name)}</span>
        ${have ? `<small>${tl('Already in Kona')}</small>` : gone ? `<small>${tl('No longer in the Web Store')}</small>` : e.enabled ? '' : `<small>${tl('Off in {browser}', { browser: escapeHtml(d.browser.replace(/^(Google|Microsoft) /, '')) })}</small>`}
      </label>`;
  }).join('');
  body.innerHTML = from + `
    <div class="check-list imp-list">
      <label${d.bookmarkCount ? '' : ' class="off"'}><input type="checkbox" data-pick="bookmarks"${imp.pick.bookmarks ? ' checked' : ''}${d.bookmarkCount ? '' : ' disabled'} />
        <span><b>${tl('Favorites')}</b><small>${d.bookmarkCount ? `${tln(d.bookmarkCount, '{n} favorite, with folders', '{n} favorites, with folders')}${replacing ? ` · ${tl('replaces Kona’s default favorites')}` : ` · ${tl('added after yours')}`}` : tl('None found')}</small></span></label>
      <label${h.visits.length ? '' : ' class="off"'}><input type="checkbox" data-pick="history"${imp.pick.history ? ' checked' : ''}${h.visits.length ? '' : ' disabled'} />
        <span><b>${tl('History')}</b><small>${h.visits.length ? `${tln(h.visits.length, 'Your most recent and visited site', 'Your {n} most recent and visited sites')} · ${tln(h.searches.length, '{n} search', '{n} searches')}` : tl('None found')}</small></span></label>
      <div class="imp-ext-head"><b>${tl('Extensions')}</b><small>${d.extensions.length ? tl('Installed again from the Chrome Web Store. Their own settings don’t come along.') : tl('None from the Chrome Web Store found')}</small></div>
      ${exts ? `<div class="imp-exts">${exts}</div>` : ''}
    </div>
    ${d.errors.length ? `<p class="imp-warn">${tl('Some data couldn’t be read ({errors}). If {browser} is open, close it and try again.', { errors: escapeHtml(d.errors.join('; ')), browser: escapeHtml(d.browser) })}</p>` : ''}`;
  setImportFooter();
}

function setImportFooter() {
  const go = $('#imp-go'), cancel = $('#imp-cancel'), hint = $('#imp-hint');
  hint.textContent = '';
  $('#imp-close').hidden = imp.phase === 'working'; // sem fechar no meio da importação
  if (imp.phase === 'done' || imp.phase === 'none') {
    cancel.hidden = true; go.hidden = false; go.disabled = false; go.textContent = tl('Done');
    return;
  }
  // importando: sem botões (só o progresso); voltam no fim como tl("Done")
  if (imp.phase === 'working') { cancel.hidden = true; go.hidden = true; hint.textContent = tl('This may take a moment. Keep Kona open.'); return; }
  cancel.hidden = false; go.hidden = false; go.textContent = tl('Import');
  const p = imp.pick;
  go.disabled = imp.busy || !imp.data || !(p.bookmarks || p.history || p.extensions.size);
  if (imp.phase === 'choose' && imp.data) hint.textContent = tl('Passwords and sign-ins can’t be imported.');
}

$('#imp-body').addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'imp-source') { loadSource(t.value); return; }
  if (t.dataset.pick) imp.pick[t.dataset.pick] = t.checked;
  if (t.dataset.ext) { if (t.checked) imp.pick.extensions.add(t.dataset.ext); else imp.pick.extensions.delete(t.dataset.ext); }
  setImportFooter();
});

async function runImport() {
  const d = imp.data, p = imp.pick;
  imp.busy = true;
  imp.phase = 'working';
  setImportFooter();
  const done = [];
  const failed = [];
  const step = (text) => { $('#imp-body').innerHTML = `<div class="imp-progress"><span class="imp-spin"></span><span>${escapeHtml(text)}</span></div>`; };
  if (p.bookmarks) {
    step(tl('Importing favorites…'));
    const n = bookmarks.importTree(d.bookmarks);
    done.push(tln(n, '{n} favorite', '{n} favorites'));
  }
  if (p.history) {
    step(tl('Importing history…'));
    browseHistory.merge(d.history);
    done.push(`${tln(d.history.visits.length, '{n} site in history', '{n} sites in history')} · ${tln(d.history.searches.length, '{n} search', '{n} searches')}`);
  }
  const ids = [...p.extensions];
  let ok = 0;
  for (let i = 0; i < ids.length; i++) {
    const e = d.extensions.find((x) => x.id === ids[i]);
    step(tl('Installing {name} ({i} of {n})…', { name: e.name, i: i + 1, n: ids.length }));
    if (await api?.importExtension(ids[i])) ok++; else failed.push(e.name);
  }
  if (ids.length) done.push(tln(ok, '{n} extension', '{n} extensions'));
  imp.busy = false;
  imp.phase = 'done';
  sfx.play('select');
  renderStartContent();
  renderSidebar();
  if (typeof refreshExtensions === 'function') refreshExtensions();
  $('#imp-body').innerHTML = `<div class="imp-done">
      <span class="imp-check">${icon('check')}</span>
      <b>${tl('Imported from {browser}', { browser: escapeHtml(d.browser) })}</b>
      <p>${escapeHtml(done.join(' · ') || tl('Nothing was selected.'))}</p>
      ${failed.length ? `<p class="imp-warn">${tl('Couldn’t install: {names}. You can add them from the Chrome Web Store.', { names: escapeHtml(failed.join(', ')) })}</p>` : ''}
    </div>`;
  setImportFooter();
}

function closeImport() {
  if (imp.busy) return;
  closeSheet('#import-sheet');
}
$('#imp-go').addEventListener('click', () => {
  if (imp.phase === 'done' || imp.phase === 'none') closeImport();
  else if (!$('#imp-go').disabled) runImport();
});
$('#imp-cancel').addEventListener('click', closeImport);
$('#imp-close').addEventListener('click', closeImport);
hydrateIcons($('#import-sheet'));

/* Primeiro uso: perfil ainda vazio (favoritos padrão e quase nenhum histórico) e um navegador para importar */
(async () => {
  if (localStorage.getItem(IMPORT_OFFERED) || library.isPrivate?.() || params.get('nowelcome')) return;
  localStorage.setItem(IMPORT_OFFERED, '1');
  if (!bookmarks.isDefaultList() || browseHistory.data.visits.length > 5) return;
  const list = (await api?.importSources()) || [];
  if (!list.length) return;
  setTimeout(() => openImport({ welcome: true }), 1200);
})();
