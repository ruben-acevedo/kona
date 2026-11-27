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
let identitySent = ''; // o nome/avatar já enviado ao Kona (título e barra de tarefas; O7)
function renderProfileUI() {
  const p = PROFILES.currentProfile();
  $('#sb-profile').innerHTML = `${avatarHtml(p.avatar, p.name)}<span class="pf-name">${escapeHtml(p.name)}</span>${icon('chevron')}`;
  $('#sb-profile').title = `Profile: ${p.name}`;
  if (identitySent !== `${p.id}|${p.name}|${JSON.stringify(p.avatar)?.length}|${p.avatar?.id}`) { // nome/avatar mudou
    identitySent = `${p.id}|${p.name}|${JSON.stringify(p.avatar)?.length}|${p.avatar?.id}`;
    sendProfileIdentity();
  }
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
  if ($('#profile-sheet').classList.contains('show')) { if (draft?.mode !== 'welcome') closeSheet('#profile-sheet'); return true; }
  if ($('#profile-pop').classList.contains('show')) { toggleProfilePop(false); return true; }
  return false;
}

/* ───────────── Trocar de perfil ───────────── */
/**
 * Outro perfil (O7, como no Chrome): cada janela tem o seu. Se ele já tem uma janela aberta, ela vem
 * para a frente; senão abre uma janela nova dele. Só troca nesta mesma janela quando ela está
 * sozinha e vazia (só a nova aba), ou quando o perfil desta janela vai ser apagado (inPlace).
 */
async function switchProfile(id, { inPlace = false } = {}) {
  const p = PROFILES.byId(id);
  if (!p || id === PROFILES.current) return;
  if (!inPlace && !APP_MODE) {
    const alone = ((await api?.windowCount?.()) ?? 1) <= 1;
    const empty = !library.isPrivate() && tabs.every((t) => t.url === START);
    if (!(alone && empty)) {
      const r = await api?.profileOpenWindow(p.partition);
      if (r === false) toast(tl('Couldn’t open that profile'));
      return;
    }
  }
  const ok = await (api?.profileUse(p.partition, { name: p.name }) ?? Promise.resolve(true));
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
  sendProfileIdentity();
  toast(tl('Switched to “{name}”', { name: p.name }));
}

/** O avatar do perfil numa imagem PNG pequena e redonda (para o ícone da janela na barra de tarefas). */
function profileBadge(p) {
  const src = p.avatar?.type === 'image' && p.avatar.data ? p.avatar.data
    : avatarSrc(AVATARS.find((x) => x.id === p.avatar?.id) || AVATARS.find((x) => x.id === DEFAULT_AVATAR));
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 32;
      const g = c.getContext('2d');
      g.beginPath(); g.arc(16, 16, 16, 0, Math.PI * 2); g.clip();
      g.drawImage(img, 0, 0, 32, 32);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
/** Diz ao Kona o nome e o avatar do perfil desta janela (título e barra de tarefas, com mais de um perfil aberto). */
async function sendProfileIdentity() {
  if (APP_MODE) return;
  const p = PROFILES.currentProfile();
  api?.profileIdentity({ name: p.name, badge: await profileBadge(p) });
}

/* ───────────── Criar / editar ───────────── */
let draft = null; // { mode, id, name, avatar, photo }

/** mode: 'new', 'edit' ou 'welcome' (primeira abertura: o primeiro perfil, sem cancelar). */
function openProfileSheet(mode, id) {
  const welcome = mode === 'welcome';
  const p = mode === 'edit' ? PROFILES.byId(id) : welcome ? PROFILES.currentProfile() : null;
  // perfil novo: a imagem principal de um grupo que nenhum perfil usa ainda
  const used = new Set(PROFILES.list.map((x) => groupOf(x.avatar?.id)));
  const fresh = (AVATAR_GROUPS.find((g) => !used.has(g.id)) || AVATAR_GROUPS[0]).items[0];
  draft = {
    mode,
    id: p?.id,
    name: p?.name || tl('Profile {n}', { n: PROFILES.list.length + 1 }),
    avatar: p ? { ...p.avatar } : { type: 'preset', id: fresh.id },
    photo: p?.photo || (p?.avatar?.type === 'image' ? p.avatar.data : null), // a foto enviada (só uma)
  };
  $('#pf-title').textContent = welcome ? tl('Create your profile') : mode === 'edit' ? tl('Edit profile') : tl('New profile');
  $('#pf-save').textContent = welcome ? tl('Get started') : mode === 'edit' ? tl('Save') : tl('Create profile');
  $('#pf-delete').hidden = mode !== 'edit' || PROFILES.list.length < 2;
  // primeira abertura: não dá para pular (só "Começar"); o nome começa vazio, com uma dica
  $('#pf-cancel').hidden = $('#pf-close').hidden = welcome;
  $('#pf-name').placeholder = welcome ? tl('Your name') : '';
  $('#pf-name').value = welcome ? '' : draft.name;
  renderProfileSheet();
  openSheet('#profile-sheet');
  requestAnimationFrame(() => { $('#pf-name').focus(); $('#pf-name').select(); });
}

const groupOf = (id) => AVATARS.find((a) => a.id === id)?.group;
let shownGroup = null; // grupo cuja fileira de opções está aberta (anima só ao trocar de grupo)

/** Grade: foto e os 10 grupos (cada um mostra a opção escolhida dele). Escolher um grupo
    abre, logo abaixo, a fileira com as 4 opções dele (a principal e 3 variações). */
function renderProfileSheet() {
  const name = $('#pf-name').value.trim() || draft.name;
  $('#pf-preview').innerHTML = avatarHtml(draft.avatar, name, 'lg');
  const sel = draft.avatar.type === 'preset' ? draft.avatar.id : null;
  const group = AVATAR_GROUPS.find((g) => g.id === groupOf(sel));
  const tile = (attrs, on, label, inner) => `<button class="pf-tile${on ? ' sel' : ''}" ${attrs} title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" aria-pressed="${on}">${inner}</button>`;
  $('#pf-grid').innerHTML =
    `<button class="pf-tile upload" id="pf-upload" title="${tl('Upload photo')}">${icon('camera')}<span>${tl('Photo')}</span></button>` +
    (draft.photo ? tile('data-photo="1"', draft.avatar.type === 'image', tl('Your photo'), avatarHtml({ type: 'image', data: draft.photo }, name, 'tile')) : '') +
    AVATAR_GROUPS.map((g) => {
      const shown = g === group ? sel : g.items[0].id;
      return tile(`data-group="${g.id}"`, g === group, tl(g.name), avatarHtml({ type: 'preset', id: shown }, name, 'tile'));
    }).join('');
  const row = $('#pf-variants');
  row.hidden = !group;
  if (group) {
    row.setAttribute('aria-label', tl(group.name));
    row.innerHTML = `<span class="pf-var-label">${escapeHtml(tl(group.name))}</span>` +
      group.items.map((a) => tile(`data-av="${a.id}"`, a.id === sel, tl(a.name), avatarHtml({ type: 'preset', id: a.id }, name, 'tile'))).join('');
    if (shownGroup !== group.id) { row.classList.remove('enter'); void row.offsetWidth; row.classList.add('enter'); }
  }
  shownGroup = group?.id || null;
}

$('#pf-name').addEventListener('input', () => renderProfileSheet());
$('#pf-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveProfile(); } });
function pickAvatar(e) {
  const tile = e.target.closest('.pf-tile');
  if (!tile) return;
  if (tile.id === 'pf-upload') { $('#avatar-file').click(); return; }
  if (tile.dataset.photo) draft.avatar = { type: 'image', data: draft.photo };
  else if (tile.dataset.group) {
    // outro grupo: começa pela principal; o mesmo grupo mantém a opção escolhida
    const cur = draft.avatar.type === 'preset' ? draft.avatar.id : null;
    if (groupOf(cur) !== tile.dataset.group) draft.avatar = { type: 'preset', id: AVATAR_GROUPS.find((g) => g.id === tile.dataset.group).items[0].id };
  } else draft.avatar = { type: 'preset', id: tile.dataset.av };
  // o teclado não perde o lugar depois de redesenhar: o mesmo botão, na mesma fileira
  const where = document.activeElement === tile
    ? `#${tile.parentElement.id} .pf-tile${tile.dataset.group ? `[data-group="${tile.dataset.group}"]` : tile.dataset.av ? `[data-av="${tile.dataset.av}"]` : '[data-photo]'}`
    : null;
  renderProfileSheet();
  if (where) $(where)?.focus();
}
$('#pf-grid').addEventListener('click', pickAvatar);
$('#pf-variants').addEventListener('click', pickAvatar);

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
  if (draft.mode === 'edit' || draft.mode === 'welcome') {
    if (!PROFILES.update(draft.id, { name, avatar: draft.avatar, photo: draft.photo })) { toast(tl('Couldn’t save: the image is too large')); return; }
    closeSheet('#profile-sheet');
    renderProfileUI();
    if (draft.mode === 'welcome') { PROFILES.finishSetup(); profileSetupDone(); } else toast(tl('Profile updated'));
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
  if (id === PROFILES.current) await switchProfile(PROFILES.list.find((x) => x.id !== id).id, { inPlace: true });
  // outra janela ainda usa o perfil: ele não pode ser apagado agora (O7)
  if (!(await api?.profileForget(p.partition) ?? true)) { toast(tl('Close the windows of “{name}” to delete it', { name: p.name })); return; }
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

/* Os avatares são imagens SVG: a primeira vez que um aparece, o Chromium o decodifica, e isso custava
   um quadro ao abrir o menu de perfis. Depois da abertura, sem pressa, decodifica antes: primeiro os
   dos perfis, depois os outros (a tela de escolher). */
const avatarCache = [];
function predecodeAvatars() {
  const mine = new Set(PROFILES.list.map((p) => p.avatar?.id));
  const queue = AVATARS.filter((a) => a.svg).sort((a, b) => mine.has(b.id) - mine.has(a.id));
  const next = (deadline) => {
    while (queue.length && deadline.timeRemaining() > 4) {
      const img = new Image();
      img.src = avatarSrc(queue.shift());
      img.decode().catch(() => {});
      avatarCache.push(img);
    }
    if (queue.length) requestIdleCallback(next, { timeout: 3000 });
  };
  setTimeout(() => requestIdleCallback(next, { timeout: 3000 }), 1500);
}
predecodeAvatars();

/* Primeira abertura: "Crie seu perfil" (nome e avatar) antes de tudo; a oferta de importar
   (import.js) espera por isto. Janelas secundárias, testes e o modo privado não perguntam. */
let profileSetupDone = () => {};
const profileSetup = new Promise((resolve) => {
  if (!PROFILES.needsSetup || params.get('nowelcome') || library.isPrivate?.()) { resolve(); return; }
  profileSetupDone = resolve;
  setTimeout(() => openProfileSheet('welcome'), 900);
});

// o Kona já sabe o perfil desta janela: manda o nome e o avatar (título e barra de tarefas; O7)
profileReady.then(() => { identitySent = ''; renderProfileUI(); });
