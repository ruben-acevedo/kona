'use strict';
// Perfis: dados (carrega antes do app.js). Cada perfil tem sessão própria no Chromium
// (cookies, logins, extensões) e ajustes/histórico próprios no armazenamento local.

const AVATARS = [
  { id: 'aurora', name: 'Estrela', bg: 'linear-gradient(135deg, #7aa7ff, #b57bff)',
    glyph: '<path fill="#fff" d="M12 3.5l2.1 5.4 5.4 2.1-5.4 2.1L12 18.5l-2.1-5.4L4.5 11l5.4-2.1z"/>' },
  { id: 'montanha', name: 'Montanha', bg: 'linear-gradient(160deg, #6dd5c4, #2b74c4)',
    glyph: '<path fill="#fff" d="M3 18.5l5.5-8 3.5 5 2.3-3.2 6.7 6.2z"/><circle cx="16.5" cy="7" r="1.8" fill="#fff" opacity=".85"/>' },
  { id: 'onda', name: 'Onda', bg: 'linear-gradient(160deg, #5fd0ff, #2457d6)',
    glyph: '<path fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" d="M3.5 10c2.1-2.2 4.2-2.2 6.3 0s4.2 2.2 6.3 0 3.1-1.6 4.4-.9M3.5 15c2.1-2.2 4.2-2.2 6.3 0s4.2 2.2 6.3 0 3.1-1.6 4.4-.9"/>' },
  { id: 'sol', name: 'Sol', bg: 'linear-gradient(160deg, #ffd166, #ff7a59)',
    glyph: '<circle cx="12" cy="12" r="4" fill="#fff"/><path stroke="#fff" stroke-width="1.8" stroke-linecap="round" d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M5.6 18.4l1.6-1.6M16.8 7.2l1.6-1.6"/>' },
  { id: 'lua', name: 'Lua', bg: 'linear-gradient(160deg, #5a63b4, #1b1e45)',
    glyph: '<path fill="#fff" d="M15.2 4.3a8 8 0 1 0 4.5 12.4 6.6 6.6 0 0 1-4.5-12.4z"/><circle cx="6.8" cy="6.6" r=".9" fill="#fff"/><circle cx="19" cy="8.6" r=".7" fill="#fff"/>' },
  { id: 'folha', name: 'Folha', bg: 'linear-gradient(160deg, #9be15d, #2a9d63)',
    glyph: '<path fill="#fff" d="M18.8 5.2C10.6 4.6 5.4 9.4 5.4 15.6c0 1.1.2 2.1.5 3 0 0 1.3-4.9 6.8-7.4-4 2.9-5.4 6.4-5.4 6.4 7 .9 11.7-4.4 11.5-12.4z"/>' },
  { id: 'planeta', name: 'Planeta', bg: 'linear-gradient(160deg, #c29bff, #5b3fd6)',
    glyph: '<circle cx="12" cy="12" r="4.6" fill="#fff"/><ellipse cx="12" cy="12" rx="9" ry="3" fill="none" stroke="#fff" stroke-width="1.5" transform="rotate(-20 12 12)" opacity=".9"/>' },
  { id: 'raio', name: 'Raio', bg: 'linear-gradient(160deg, #ffe27a, #f59f00)',
    glyph: '<path fill="#fff" d="M13.2 3 5.8 13.4h5l-1 7.6 7.4-10.4h-5z"/>' },
  { id: 'cafe', name: 'Café', bg: 'linear-gradient(160deg, #d6a77a, #6b4226)',
    glyph: '<path fill="#fff" d="M5 9h11v5a4.5 4.5 0 0 1-4.5 4.5h-2A4.5 4.5 0 0 1 5 14z"/><path fill="none" stroke="#fff" stroke-width="1.6" d="M16 10.5h1.2a2 2 0 0 1 0 4H16"/><path fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" d="M8.5 4.5c-.6.8.6 1.2 0 2.2M12 4.5c-.6.8.6 1.2 0 2.2"/>' },
  { id: 'nota', name: 'Música', bg: 'linear-gradient(160deg, #ff9ec0, #e0456f)',
    glyph: '<path fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round" d="M9.2 16V6.6l8.6-1.9V14"/><ellipse cx="7.3" cy="16.4" rx="2.2" ry="1.8" fill="#fff"/><ellipse cx="15.9" cy="14.4" rx="2.2" ry="1.8" fill="#fff"/>' },
  { id: 'pata', name: 'Pata', bg: 'linear-gradient(160deg, #ffbe98, #d9734a)',
    glyph: '<ellipse cx="12" cy="15.5" rx="4" ry="3.3" fill="#fff"/><circle cx="7" cy="10.5" r="1.7" fill="#fff"/><circle cx="10" cy="7.3" r="1.8" fill="#fff"/><circle cx="14" cy="7.3" r="1.8" fill="#fff"/><circle cx="17" cy="10.5" r="1.7" fill="#fff"/>' },
  { id: 'flor', name: 'Flor', bg: 'linear-gradient(160deg, #ffc2dc, #c86dd7)',
    glyph: '<g fill="#fff"><circle cx="12" cy="7.2" r="2.8"/><circle cx="16.6" cy="10.5" r="2.8"/><circle cx="14.8" cy="15.8" r="2.8"/><circle cx="9.2" cy="15.8" r="2.8"/><circle cx="7.4" cy="10.5" r="2.8"/></g><circle cx="12" cy="12" r="2.2" fill="#f3a7c9"/>' },
  { id: 'inicial', name: 'Inicial', bg: 'linear-gradient(160deg, #98a2b8, #4a5568)', glyph: null },
];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** HTML do avatar: foto enviada, desenho pronto ou inicial do nome. */
function avatarHtml(avatar, name = '', cls = '') {
  if (avatar?.type === 'image' && avatar.data) {
    return `<span class="avatar ${cls}"><img src="${esc(avatar.data)}" alt="" draggable="false" /></span>`;
  }
  const a = AVATARS.find((x) => x.id === avatar?.id) || AVATARS[0];
  const inner = a.glyph
    ? `<svg viewBox="0 0 24 24" aria-hidden="true">${a.glyph}</svg>`
    : `<b>${esc((name.trim()[0] || '?').toUpperCase())}</b>`;
  return `<span class="avatar ${cls}" style="background:${a.bg}">${inner}</span>`;
}

const PROFILES = {
  KEY: 'kona:profiles',
  data: null,

  load() {
    try {
      const d = JSON.parse(localStorage.getItem(this.KEY));
      if (d?.list?.length) { this.data = d; return; }
    } catch { /* recria abaixo */ }
    // Primeiro uso: um perfil com a sessão original (mantém logins e extensões existentes)
    this.data = { current: 'default', list: [{ id: 'default', name: 'Pessoal', avatar: { type: 'preset', id: 'aurora' }, partition: 'persist:kona' }] };
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
};

/** Chave do armazenamento local de um tipo de dado do perfil atual. */
const profileKey = (kind) => `kona:${kind}:${PROFILES.current}`;

PROFILES.load();
