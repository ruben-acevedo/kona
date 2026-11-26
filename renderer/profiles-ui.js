'use strict';
// Perfis: menu na barra lateral, criar/editar/apagar, avatares e foto.

/* ───────────── Pergunta de confirmação (genérica) ───────────── */
let askResolve = null;
function ask({ title, text = '', ok = tl('Confirm'), cancel = tl('Cancel'), danger = false }) {
  if (askResolve) askResolve(false);
  $('#ask-title').textContent = title;
  $('#ask-text').textContent = text;
  $('#ask-no').textContent = cancel;
  const yes = $('#ask-yes');
  yes.textContent = ok;
  yes.classList.toggle('danger', danger);
  openSheet('#ask-sheet');
  yes.focus();
  return new Promise((resolve) => { askResolve = resolve; });
}
function answerAsk(value) {
  closeSheet('#ask-sheet');
  const r = askResolve;
  askResolve = null;
  r?.(value);
}
$('#ask-yes').addEventListener('click', () => answerAsk(true));
$('#ask-no').addEventListener('click', () => answerAsk(false));

/* ───────────── Barra lateral e menu de perfis ───────────── */
function renderProfileUI() {
  const p = PROFILES.currentProfile();
  $('#sb-profile').innerHTML = `${avatarHtml(p.avatar, p.name)}<span class="pf-name">${escapeHtml(p.name)}</span>${icon('chevron')}`;
  $('#sb-profile').title = `Profile: ${p.name}`;
}

function buildProfilePop() {
  $('#pf-list').innerHTML = PROFILES.list.map((p) => `
    <button class="pf-row${p.id === PROFILES.current ? ' current' : ''}" data-id="${p.id}">
      ${avatarHtml(p.avatar, p.name, 'md')}
      <span class="pf-row-name">${escapeHtml(p.name)}</span>
      ${p.id === PROFILES.current ? `<span class="pf-check">${icon('check')}</span>` : ''}
    </button>`).join('');
  $('#pf-edit-label').textContent = tl('Edit “{name}”', { name: PROFILES.currentProfile().name });
}

function toggleProfilePop(force) {
  const pop = $('#profile-pop');
  const show = force ?? !pop.classList.contains('show');
  if (show && !pop.classList.contains('show')) sfx.play('open');
  if (show) {
    buildProfilePop();
    const r = $('#sb-profile').getBoundingClientRect();
    pop.style.left = `${Math.round(r.left)}px`;
    pop.style.bottom = `${Math.round(innerHeight - r.top + 8)}px`;
  }
  pop.classList.toggle('show', show);
}

$('#sb-profile').addEventListener('click', () => toggleProfilePop());
$('#pf-list').addEventListener('click', (e) => {
  const row = e.target.closest('.pf-row');
  if (!row) return;
  toggleProfilePop(false);
  switchProfile(row.dataset.id);
});
$('#pf-edit').addEventListener('click', () => { toggleProfilePop(false); openProfileSheet('edit', PROFILES.current); });
$('#pf-new').addEventListener('click', () => { toggleProfilePop(false); openProfileSheet('new'); });
document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('#profile-pop, #sb-profile')) toggleProfilePop(false);
});

/** Esc fecha a camada de perfil que estiver por cima. Retorna true se fechou algo. */
function closeProfileLayers() {
  if ($('#ask-sheet').classList.contains('show')) { answerAsk(false); return true; }
  if ($('#profile-sheet').classList.contains('show')) { closeSheet('#profile-sheet'); return true; }
  if ($('#profile-pop').classList.contains('show')) { toggleProfilePop(false); return true; }
  return false;
}

/* ───────────── Trocar de perfil ───────────── */
async function switchProfile(id) {
  const p = PROFILES.byId(id);
  if (!p || id === PROFILES.current) return;
  // um perfil por vez em todas as janelas (cada janela de um perfil fica para depois)
  if ((await api?.windowCount?.()) > 1) { toast(tl('Close the other windows to switch profiles')); return; }
  const ok = await (api?.profileUse(p.partition) ?? Promise.resolve(true));
  if (ok === false) { toast(tl('Couldn’t open that profile')); return; }
  // As abas do perfil anterior ficam guardadas nele; o novo perfil reabre as dele
  await library.beforeProfileSwitch();
  PROFILES.setCurrent(id);
  reloadSettings();
  browseHistory.load();
  library.afterProfileSwitch();
  omnibox.cache.clear();
  applyTheme(true);
  buildCustomize();
  refreshExtensions();
  renderProfileUI();
  toast(tl('Switched to “{name}”', { name: p.name }));
}

/* ───────────── Criar / editar ───────────── */
let draft = null; // { mode, id, name, avatar, photo }

function openProfileSheet(mode, id) {
  const p = mode === 'edit' ? PROFILES.byId(id) : null;
  const used = new Set(PROFILES.list.map((x) => x.avatar?.id));
  const fresh = AVATARS.find((a) => a.glyph && !used.has(a.id)) || AVATARS[1];
  draft = {
    mode,
    id: p?.id,
    name: p?.name || tl('Profile {n}', { n: PROFILES.list.length + 1 }),
    avatar: p ? { ...p.avatar } : { type: 'preset', id: fresh.id },
    photo: p?.photo || (p?.avatar?.type === 'image' ? p.avatar.data : null), // a foto enviada (só uma)
  };
  $('#pf-title').textContent = mode === 'edit' ? tl('Edit profile') : tl('New profile');
  $('#pf-save').textContent = mode === 'edit' ? tl('Save') : tl('Create profile');
  $('#pf-delete').hidden = mode !== 'edit' || PROFILES.list.length < 2;
  $('#pf-name').value = draft.name;
  renderProfileSheet();
  openSheet('#profile-sheet');
  requestAnimationFrame(() => { $('#pf-name').focus(); $('#pf-name').select(); });
}

function renderProfileSheet() {
  const name = $('#pf-name').value.trim() || draft.name;
  $('#pf-preview').innerHTML = avatarHtml(draft.avatar, name, 'lg');
  const isSel = (a) => draft.avatar.type === 'preset' && draft.avatar.id === a.id;
  const photoSel = draft.avatar.type === 'image';
  $('#pf-grid').innerHTML =
    `<button class="pf-tile upload" id="pf-upload" title="${tl('Upload photo')}">${icon('camera')}<span>${tl('Photo')}</span></button>` +
    (draft.photo ? `<button class="pf-tile${photoSel ? ' sel' : ''}" data-photo="1" title="${tl('Your photo')}">${avatarHtml({ type: 'image', data: draft.photo }, name, 'tile')}</button>` : '') +
    AVATARS.map((a) => `<button class="pf-tile${isSel(a) ? ' sel' : ''}" data-av="${a.id}" title="${tl(a.name)}">${avatarHtml({ type: 'preset', id: a.id }, name, 'tile')}</button>`).join('');
}

$('#pf-name').addEventListener('input', () => renderProfileSheet());
$('#pf-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveProfile(); } });
$('#pf-grid').addEventListener('click', (e) => {
  const tile = e.target.closest('.pf-tile');
  if (!tile) return;
  if (tile.id === 'pf-upload') { $('#avatar-file').click(); return; }
  draft.avatar = tile.dataset.photo ? { type: 'image', data: draft.photo } : { type: 'preset', id: tile.dataset.av };
  renderProfileSheet();
});

/** Foto enviada: recorte quadrado no centro, 256×256, JPEG leve (cabe no armazenamento local). */
async function processAvatarFile(file) {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 256, 256);
  return c.toDataURL('image/jpeg', 0.88);
}

$('#avatar-file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file || !draft) return;
  try {
    draft.photo = await processAvatarFile(file); // substitui a foto anterior
    draft.avatar = { type: 'image', data: draft.photo };
    renderProfileSheet();
  } catch {
    toast(tl('Couldn’t open that image'));
  }
});

async function saveProfile() {
  if (!draft) return;
  const name = $('#pf-name').value.trim().slice(0, 32) || draft.name;
  if (draft.mode === 'edit') {
    if (!PROFILES.update(draft.id, { name, avatar: draft.avatar, photo: draft.photo })) { toast(tl('Couldn’t save: the image is too large')); return; }
    closeSheet('#profile-sheet');
    renderProfileUI();
    toast(tl('Profile updated'));
  } else {
    const p = PROFILES.create({ name, avatar: draft.avatar, photo: draft.photo });
    if (!p) { toast(tl('Couldn’t create the profile: the image is too large')); return; }
    closeSheet('#profile-sheet');
    await switchProfile(p.id);
  }
  draft = null;
}

async function deleteProfile(id) {
  const p = PROFILES.byId(id);
  if (!p || PROFILES.list.length < 2) return;
  const yes = await ask({
    title: tl('Delete the profile “{name}”?', { name: p.name }),
    text: tl('This profile’s history, settings, sign-ins and extensions will be deleted from this computer. This can’t be undone.'),
    ok: tl('Delete profile'),
    danger: true,
  });
  if (!yes) return;
  closeSheet('#profile-sheet');
  if (id === PROFILES.current) await switchProfile(PROFILES.list.find((x) => x.id !== id).id);
  await api?.profileForget(p.partition);
  PROFILES.remove(id);
  renderProfileUI();
  toast(tl('Profile “{name}” deleted', { name: p.name }));
}

$('#pf-save').addEventListener('click', saveProfile);
$('#pf-cancel').addEventListener('click', () => { closeSheet('#profile-sheet'); draft = null; });
$('#pf-close').addEventListener('click', () => { closeSheet('#profile-sheet'); draft = null; });
$('#pf-delete').addEventListener('click', () => draft?.id && deleteProfile(draft.id));

hydrateIcons($('#profile-pop'));
hydrateIcons($('#profile-sheet'));
renderProfileUI();
