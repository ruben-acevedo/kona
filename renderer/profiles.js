'use strict';
// Perfis: dados (carrega antes do app.js). Cada perfil tem sessão própria no Chromium
// (cookies, logins, extensões) e ajustes/histórico próprios no armazenamento local.

// Avatares prontos: os desenhos ficam em avatars.js (AVATAR_GROUPS, gerado). Aqui viram uma lista
// só, com o grupo de cada um.
const AVATARS = [
  ...AVATAR_GROUPS.flatMap((g) => g.items.map((a) => ({ ...a, group: g.id }))),
];
const DEFAULT_AVATAR = 'pine-glasses';
// cada desenho vira uma imagem isolada (os degradês de dois avatares iguais na tela não se misturam)
const avatarSrc = (a) => (a.src ||= `data:image/svg+xml,${encodeURIComponent(a.svg)}`);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** HTML do avatar: foto enviada ou desenho pronto. */
function avatarHtml(avatar, name = '', cls = '') {
  if (avatar?.type === 'image' && avatar.data) {
    return `<span class="avatar ${cls}"><img src="${esc(avatar.data)}" alt="" draggable="false" /></span>`;
  }
  // os avatares antigos (Estrela, Montanha, a inicial…) deixaram de existir: viram o abacaxi de óculos
  const a = AVATARS.find((x) => x.id === avatar?.id) || AVATARS.find((x) => x.id === DEFAULT_AVATAR);
  return `<span class="avatar art ${cls}"><img src="${avatarSrc(a)}" alt="" draggable="false" /></span>`;
}

const PROFILES = {
  KEY: 'kona:profiles',
  data: null,

  load() {
    try {
      const d = JSON.parse(localStorage.getItem(this.KEY));
      if (d?.list?.length) { this.data = d; return; }
    } catch { /* recria abaixo */ }
    // Primeiro uso: um perfil com a sessão original (mantém logins e extensões existentes). "setup":
    // na abertura aparece "Crie seu perfil" (nome e avatar) para a pessoa fazer o dela.
    this.data = { current: 'default', setup: true, list: [{ id: 'default', name: tl('Personal'), avatar: { type: 'preset', id: DEFAULT_AVATAR }, partition: 'persist:kona' }] };
    this.save();
  },
  save() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); return true; } catch { return false; }
  },
  get list() { return this.data.list; },
  get current() { return this.data.current; },
  currentProfile() { return this.byId(this.data.current) || this.data.list[0]; },
  byId(id) { return this.data.list.find((p) => p.id === id); },

  // photo: a única foto enviada do perfil (fica guardada mesmo com um avatar pronto escolhido;
  // enviar outra substitui). avatar: o que aparece (pronto ou a foto).
  create({ name, avatar, photo = null }) {
    const id = (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).toLowerCase();
    const p = { id, name, avatar, photo, partition: `persist:kona-${id}` };
    this.data.list.push(p);
    if (!this.save()) { this.data.list.pop(); return null; }
    return p;
  },
  update(id, patch) {
    const p = this.byId(id);
    const before = { ...p };
    Object.assign(p, patch);
    if (!this.save()) { Object.assign(p, before); return false; }
    return true;
  },
  remove(id) {
    this.data.list = this.data.list.filter((p) => p.id !== id);
    for (const kind of ['settings', 'history']) localStorage.removeItem(`kona:${kind}:${id}`);
    this.save();
  },
  setCurrent(id) { this.data.current = id; this.save(); },
  get needsSetup() { return !!this.data.setup; },
  finishSetup() { delete this.data.setup; this.save(); },
};

/** Chave do armazenamento local de um tipo de dado do perfil atual. */
const profileKey = (kind) => `kona:${kind}:${PROFILES.current}`;

PROFILES.load();
