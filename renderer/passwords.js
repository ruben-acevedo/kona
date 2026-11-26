'use strict';
// Gerenciador de senhas na interface (como o do Chrome): a lista de contas sob o campo de login da
// página (e a senha forte sugerida em cadastros), o balão "Save password?" e a tela de gerenciamento
// (Settings → Passwords). A interface nunca guarda senhas: só mostra o que o processo principal
// devolve, e mostrar/copiar/exportar passam pelo Windows Hello lá.

const pwState = { count: null, list: null, suggest: null, pressing: false, offer: null, revealed: new Map(), editing: null };

/* ───────────── Contas sob o campo (página) ───────────── */
function hideSuggest() {
  if (pwState.pressing) return;
  $('#pw-suggest').classList.remove('show');
  pwState.suggest = null;
}
api?.on('pw:suggest', (s) => {
  const t = active();
  let wcId = -1; try { wcId = t?.wv?.getWebContentsId(); } catch { /* sem webview */ }
  if (!t?.wv || s.wcId !== wcId) return;
  pwState.suggest = s;
  pwState.shownAt = Date.now();
  const box = $('#pw-suggest');
  const accounts = s.accounts.map((a) => `<div class="pw-opt" data-acc="${a.id}" role="option">
      <span class="pw-ic">${icon('key')}</span>
      <span class="pw-txt"><b>${escapeHtml(a.username || tl('(no username)'))}</b><small>${a.exact ? '••••••••' : tl('from {host}', { host: escapeHtml(a.host) })}</small></span>
    </div>`).join('');
  const gen = s.generate ? `<div class="pw-opt pw-gen" data-gen="1" role="option">
      <span class="pw-ic">${icon('key')}</span>
      <span class="pw-txt"><b>${tl('Use suggested strong password')}</b><small class="pw-mono">${escapeHtml(s.generate)}</small></span>
    </div><p class="pw-note">${tl('Kona saves this password for you. You can see it in Settings › Passwords.')}</p>` : '';
  box.innerHTML = gen + accounts + `<div class="pop-sep"></div><div class="pw-opt pw-manage" data-manage="1" role="option"><span class="pw-ic">${icon('gear')}</span><span class="pw-txt"><b>${tl('Manage passwords…')}</b></span></div>`;
  // posição: logo abaixo do campo (no frame principal); em iframes, no topo da página
  const r = t.wv.getBoundingClientRect();
  const f = s.top && s.rect ? s.rect : { x: 16, y: 8, width: 300, height: 0 };
  const zoom = typeof zoomFor === 'function' ? zoomFor(t.url) : 1;
  let x = r.left + f.x * zoom, y = r.top + (f.y + f.height) * zoom + 4;
  box.classList.add('show');
  box.style.minWidth = `${Math.max(260, Math.min(420, f.width * zoom))}px`;
  if (y + box.offsetHeight > innerHeight - 8) y = Math.max(r.top + 4, r.top + f.y * zoom - box.offsetHeight - 4);
  x = Math.min(x, innerWidth - box.offsetWidth - 8);
  box.style.left = `${Math.max(8, x)}px`; box.style.top = `${y}px`;
});
api?.on('pw:suggest-hide', () => setTimeout(hideSuggest, 120));
$('#pw-suggest').addEventListener('mousedown', () => { pwState.pressing = true; });
$('#pw-suggest').addEventListener('click', async (e) => {
  pwState.pressing = false;
  const s = pwState.suggest;
  const opt = e.target.closest('.pw-opt');
  if (!s || !opt) return;
  if (opt.dataset.manage) { hideSuggest(); openPasswordSheet(); return; }
  const ok = await api.pw.fill(s.id, opt.dataset.acc || null, opt.dataset.gen ? s.generate : null);
  sfx.play('select');
  hideSuggest();
  active()?.wv?.focus();
  if (!ok) toast(tl('Couldn’t fill in the password'));
});
document.addEventListener('mouseup', () => { setTimeout(() => { pwState.pressing = false; }, 0); });
document.addEventListener('mousedown', (e) => { if (!e.target.closest('#pw-suggest')) hideSuggest(); }, true);
// clique na página fecha a lista — mas não a que o próprio clique abriu (focar o campo a mostra)
api?.on('page:mousedown', () => {
  const at = Date.now();
  setTimeout(() => { if (!pwState.pressing && (pwState.shownAt || 0) < at) hideSuggest(); }, 150);
});

/* ───────────── Balão "Save password?" ───────────── */
function closeBubble() {
  const b = $('#pw-bubble');
  if (!b.classList.contains('show')) return false;
  b.classList.remove('show');
  if (pwState.offer) api?.pw.answer(pwState.offer.id, 'dismiss');
  pwState.offer = null;
  return true;
}
api?.on('pw:offer-save', (o) => {
  pwState.offer = o;
  const b = $('#pw-bubble');
  b.innerHTML = `<div class="pwb-head"><span class="pw-ic">${icon('key')}</span><div><h3 id="pwb-title">${o.update ? tl('Update password?') : tl('Save password?')}</h3><p>${escapeHtml(o.host)}</p></div>
      <button class="tb small" data-pwb="close" title="${tl('Close')}">${icon('x')}</button></div>
    <label class="pf-label" for="pwb-user">${tl('Username')}</label>
    <input id="pwb-user" class="pf-input" value="${escapeHtml(o.username)}" spellcheck="false" autocomplete="off" />
    <label class="pf-label">${tl('Password')}</label>
    <div class="pf-input pwb-pass">••••••••••</div>
    <div class="pwb-actions">
      ${o.update ? '' : `<button class="btn-secondary" data-pwb="never">${tl('Never')}</button>`}
      <span class="spacer"></span>
      <button class="btn-secondary" data-pwb="close">${tl('Not now')}</button>
      <button class="btn-primary" data-pwb="save">${o.update ? tl('Update') : tl('Save')}</button>
    </div>`;
  b.classList.add('show');
  sfx.play('open');
});
$('#pw-bubble').addEventListener('click', async (e) => {
  const act = e.target.closest('[data-pwb]')?.dataset.pwb;
  const o = pwState.offer;
  if (!act || !o) return;
  if (act === 'close') { closeBubble(); sfx.play('close'); return; }
  pwState.offer = null;
  $('#pw-bubble').classList.remove('show');
  const r = await api.pw.answer(o.id, act, $('#pwb-user').value.trim());
  sfx.play('select');
  if (r === 'saved' || r === 'updated') toast(r === 'saved' ? tl('Password saved') : tl('Password updated'));
  else if (r === 'never') toast(tl('Kona won’t offer to save passwords on {host}', { host: o.host }));
});
$('#pw-bubble').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); $('#pw-bubble [data-pwb="save"]')?.click(); }
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeBubble(); }
});
api?.on('pw:saved', ({ host }) => toast(tl('Password saved for {host}', { host })));

/* ───────────── Gerenciamento (Settings → Passwords) ───────────── */
async function loadPasswords() {
  const d = await api?.pw.list();
  pwState.list = d || { entries: [], never: [] };
  pwState.count = pwState.list.entries.length;
  return pwState.list;
}
function renderPasswordSheet() {
  const d = pwState.list;
  if (!d) return;
  const q = $('#pw-q').value.trim().toLowerCase();
  const rows = d.entries.filter((e) => !q || e.host.includes(q) || e.username.toLowerCase().includes(q));
  $('#pw-count').textContent = `${tln(d.entries.length, '{n} password', '{n} passwords')}${d.encryption ? '' : ` · ${tl('encryption unavailable')}`}`;
  const row = (e) => {
    const ed = pwState.editing === e.id;
    const shown = pwState.revealed.get(e.id);
    return `<div class="pw-row${ed ? ' editing' : ''}" data-pw="${e.id}">
      <span class="sb-fav"><span class="mono">${escapeHtml((e.host.replace(/^www\./, '')[0] || '?').toUpperCase())}</span></span>
      ${ed ? `<div class="pw-edit">
          <input class="pf-input" data-f="username" value="${escapeHtml(e.username)}" placeholder="${tl('Username')}" spellcheck="false" autocomplete="off" />
          <input class="pf-input" data-f="password" type="password" placeholder="${tl('New password (leave empty to keep)')}" autocomplete="new-password" />
          <div class="pw-edit-acts"><button class="btn-secondary" data-act="cancel">${tl('Cancel')}</button><button class="btn-primary" data-act="save">${tl('Save')}</button></div>
        </div>`
        : `<div class="sb-row-text"><b>${escapeHtml(e.host.replace(/^www\./, ''))}</b><span>${escapeHtml(e.username || tl('(no username)'))}</span></div>
        <span class="pw-secret${shown ? ' shown' : ''}">${shown ? escapeHtml(shown) : '••••••••'}</span>
        <span class="pw-acts">
          <button class="sb-act" data-act="reveal" title="${shown ? tl('Hide') : tl('Show password')}">${icon(shown ? 'eyeOff' : 'eye')}</button>
          <button class="sb-act" data-act="copy" title="${tl('Copy password')}">${icon('copy')}</button>
          <button class="sb-act" data-act="edit" title="${tl('Edit')}">${icon('pencil')}</button>
          <button class="sb-act" data-act="delete" title="${tl('Delete')}">${icon('x')}</button>
        </span>`}
    </div>`;
  };
  $('#pw-list').innerHTML = (rows.length ? rows.map(row).join('')
    : `<p class="st-empty">${d.entries.length ? tl('No passwords match your search.') : tl('No saved passwords yet. Kona offers to save them when you sign in to a site.')}</p>`)
    + (d.never.length && !q ? `<h4 class="pw-sub">${tl('Never saved')}</h4>${d.never.map((o) => `<div class="pw-row never"><div class="sb-row-text"><b>${escapeHtml(o.replace(/^https?:\/\//, ''))}</b></div><button class="btn-link" data-never="${escapeHtml(o)}">${tl('Remove')}</button></div>`).join('')}` : '');
}
async function openPasswordSheet() {
  pwState.revealed.clear(); pwState.editing = null;
  $('#pw-q').value = '';
  await loadPasswords();
  renderPasswordSheet();
  openSheet('#pw-sheet');
  settingsPage.refresh?.();
}
$('#pw-q').addEventListener('input', renderPasswordSheet);
$('#pw-close').addEventListener('click', () => { pwState.revealed.clear(); closeSheet('#pw-sheet'); });
$('#pw-list').addEventListener('click', async (e) => {
  const nv = e.target.closest('[data-never]');
  if (nv) { await api.pw.neverRemove(nv.dataset.never); await loadPasswords(); renderPasswordSheet(); return; }
  const act = e.target.closest('[data-act]')?.dataset.act;
  const rowEl = e.target.closest('[data-pw]');
  if (!act || !rowEl) return;
  const id = rowEl.dataset.pw;
  if (act === 'reveal') {
    if (pwState.revealed.has(id)) pwState.revealed.delete(id);
    else { const p = await api.pw.reveal(id); if (p == null) { toast(tl('Windows Hello didn’t confirm it’s you')); return; } pwState.revealed.set(id, p); }
  } else if (act === 'copy') {
    toast((await api.pw.copy(id)) ? tl('Password copied') : tl('Windows Hello didn’t confirm it’s you'));
    return;
  } else if (act === 'edit') pwState.editing = id;
  else if (act === 'cancel') pwState.editing = null;
  else if (act === 'save') {
    const username = $('[data-f="username"]', rowEl).value.trim();
    const password = $('[data-f="password"]', rowEl).value;
    if (!(await api.pw.edit(id, { username, password }))) { toast(tl('Windows Hello didn’t confirm it’s you')); return; }
    pwState.editing = null; pwState.revealed.delete(id);
    await loadPasswords(); toast(tl('Password updated'));
  } else if (act === 'delete') {
    const entry = pwState.list.entries.find((x) => x.id === id);
    if (!await ask({ title: tl('Delete the password for {host}?', { host: entry?.host.replace(/^www\./, '') }), text: entry?.username ? tl('Account: {name}', { name: entry.username }) : '', ok: tl('Delete'), danger: true })) return;
    await api.pw.remove(id); await loadPasswords(); toast(tl('Password deleted'));
    openSheet('#pw-sheet');
  }
  renderPasswordSheet();
});
async function importPasswords() {
  const r = await api?.pw.importCsv();
  if (!r) return;
  if (r.error) { toast(r.error); return; }
  toast(`${r.added} added · ${r.updated} updated${r.skipped ? ` · ${r.skipped} skipped` : ''}`);
  await loadPasswords(); settingsPage.refresh?.();
}
async function exportPasswords() {
  if (!await ask({ title: tl('Export passwords?'), text: tl('The file isn’t encrypted: anyone who opens it can read all your passwords. Keep it safe and delete it when you’re done.'), ok: tl('Export') })) return;
  const r = await api?.pw.exportCsv();
  if (!r) return;
  if (r.error === 'auth') { toast(tl('Windows Hello didn’t confirm it’s you')); return; }
  toast(`${r.count} ${r.count === 1 ? 'password' : 'passwords'} exported`);
}
api?.on('pw:changed', async () => {
  await loadPasswords();
  if ($('#pw-sheet').classList.contains('show')) renderPasswordSheet();
  if (active()?.url === SETTINGS) settingsPage.refresh?.();
});

// Escape fecha a lista e o balão; trocar de aba também
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && (closeBubble() | ($('#pw-suggest').classList.contains('show') && (hideSuggest(), true)))) e.stopPropagation(); }, true);
library.onChange(() => { hideSuggest(); });
hydrateIcons($('#pw-sheet'));
api?.pw.setOffer(settings.offerPasswords !== false);
loadPasswords().then(() => { if (active()?.url === SETTINGS) settingsPage.refresh?.(); });
