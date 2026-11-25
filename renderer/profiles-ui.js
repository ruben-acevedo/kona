'use strict';
// Perfis: menu na barra lateral, criar/editar/apagar, avatares e foto.

/* ───────────── Pergunta de confirmação (genérica) ───────────── */
let askResolve = null;
function ask({ title, text = '', ok = 'Confirmar', danger = false }) {
  if (askResolve) askResolve(false);
  $('#ask-title').textContent = title;
  $('#ask-text').textContent = text;
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
  $('#sb-profile').title = `Perfil: ${p.name}`;
}

function buildProfilePop() {
  $('#pf-list').innerHTML = PROFILES.list.map((p) => `
    <button class="pf-row${p.id === PROFILES.current ? ' current' : ''}" data-id="${p.id}">
      ${avatarHtml(p.avatar, p.name, 'md')}
      <span class="pf-row-name">${escapeHtml(p.name)}</span>
      ${p.id === PROFILES.current ? `<span class="pf-check">${icon('check')}</span>` : ''}
    </button>`).join('');
  $('#pf-edit-label').textContent = `Editar “${PROFILES.currentProfile().name}”`;
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
  const ok = await (api?.profileUse(p.partition) ?? Promise.resolve(true));
  if (ok === false) { toast('Não foi possível abrir esse perfil'); return; }
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
  toast(`Perfil “${p.name}”`);
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
    name: p?.name || `Perfil ${PROFILES.list.length + 1}`,
    avatar: p ? { ...p.avatar } : { type: 'preset', id: fresh.id },
    photo: p?.photo || (p?.avatar?.type === 'image' ? p.avatar.data : null), // a foto enviada (só uma)
  };
  $('#pf-title').textContent = mode === 'edit' ? 'Editar perfil' : 'Novo perfil';
  $('#pf-save').textContent = mode === 'edit' ? 'Salvar' : 'Criar perfil';
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
    `<button class="pf-tile upload" id="pf-upload" title="Enviar foto">${icon('camera')}<span>Foto</span></button>` +
    (draft.photo ? `<button class="pf-tile${photoSel ? ' sel' : ''}" data-photo="1" title="Sua foto">${avatarHtml({ type: 'image', data: draft.photo }, name, 'tile')}</button>` : '') +
    AVATARS.map((a) => `<button class="pf-tile${isSel(a) ? ' sel' : ''}" data-av="${a.id}" title="${a.name}">${avatarHtml({ type: 'preset', id: a.id }, name, 'tile')}</button>`).join('');
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
    toast('Não foi possível abrir essa imagem');
  }
});

async function saveProfile() {
  if (!draft) return;
  const name = $('#pf-name').value.trim().slice(0, 32) || draft.name;
  if (draft.mode === 'edit') {
    if (!PROFILES.update(draft.id, { name, avatar: draft.avatar, photo: draft.photo })) { toast('Não foi possível salvar: imagem grande demais'); return; }
    closeSheet('#profile-sheet');
    renderProfileUI();
    toast('Perfil atualizado');
  } else {
    const p = PROFILES.create({ name, avatar: draft.avatar, photo: draft.photo });
    if (!p) { toast('Não foi possível criar o perfil: imagem grande demais'); return; }
    closeSheet('#profile-sheet');
    await switchProfile(p.id);
  }
  draft = null;
}

async function deleteProfile(id) {
  const p = PROFILES.byId(id);
  if (!p || PROFILES.list.length < 2) return;
  const yes = await ask({
    title: `Apagar o perfil “${p.name}”?`,
    text: 'O histórico, os ajustes, os logins e as extensões deste perfil serão apagados deste computador. Isso não pode ser desfeito.',
    ok: 'Apagar perfil',
    danger: true,
  });
  if (!yes) return;
  closeSheet('#profile-sheet');
  if (id === PROFILES.current) await switchProfile(PROFILES.list.find((x) => x.id !== id).id);
  await api?.profileForget(p.partition);
  PROFILES.remove(id);
  renderProfileUI();
  toast(`Perfil “${p.name}” apagado`);
}

$('#pf-save').addEventListener('click', saveProfile);
$('#pf-cancel').addEventListener('click', () => { closeSheet('#profile-sheet'); draft = null; });
$('#pf-close').addEventListener('click', () => { closeSheet('#profile-sheet'); draft = null; });
$('#pf-delete').addEventListener('click', () => draft?.id && deleteProfile(draft.id));

hydrateIcons($('#profile-pop'));
hydrateIcons($('#profile-sheet'));
renderProfileUI();
