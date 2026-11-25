'use strict';
// Biblioteca (por perfil): favoritos, lista de leitura, grupos de abas/sessão e modo privado.
// Carrega antes do app.js: aqui só há dados e funções; nada roda que dependa do app.js.

// Os sites que mais aparecem nas barras de favoritos dos outros navegadores (versões do Brasil)
const DEFAULT_BOOKMARKS = [
  ['YouTube', 'https://www.youtube.com'],
  ['Gmail', 'https://mail.google.com'],
  ['Amazon', 'https://www.amazon.com.br'],
  ['Mercado Livre', 'https://www.mercadolivre.com.br'],
  ['Netflix', 'https://www.netflix.com'],
  ['Instagram', 'https://www.instagram.com'],
  ['WhatsApp', 'https://web.whatsapp.com'],
  ['Wikipédia', 'https://pt.wikipedia.org'],
  ['ChatGPT', 'https://chatgpt.com'],
  ['Spotify', 'https://open.spotify.com'],
];
// Lista padrão antiga: perfis que nunca mexeram nela recebem a nova
const OLD_DEFAULT_URLS = ['https://pt.wikipedia.org', 'https://github.com', 'https://www.youtube.com', 'https://developer.mozilla.org',
  'https://www.figma.com', 'https://news.ycombinator.com', 'https://www.electronjs.org', 'https://www.openstreetmap.org'].join(' ');

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const readJSON = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const writeJSON = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch { return false; } };
const sameUrl = (a, b) => a.replace(/\/$/, '') === b.replace(/\/$/, '');

/* ───────────── Favoritos ───────────── */
const bookmarks = {
  list: [],
  load() {
    let saved = readJSON(profileKey('bookmarks'));
    if (Array.isArray(saved) && saved.map((b) => b.url).join(' ') === OLD_DEFAULT_URLS) saved = null;
    this.list = Array.isArray(saved) ? saved : DEFAULT_BOOKMARKS.map(([title, url]) => ({ id: uid(), title, url }));
    if (!saved) this.save();
  },
  save() { writeJSON(profileKey('bookmarks'), this.list); library.changed('bookmarks'); },
  find(url) { return this.list.find((b) => sameUrl(b.url, url)); },
  add(url, title) {
    if (this.find(url)) return false;
    this.list.push({ id: uid(), url, title: title || url });
    this.save();
    return true;
  },
  remove(id) { this.list = this.list.filter((b) => b.id !== id); this.save(); },
  rename(id, title) { const b = this.list.find((x) => x.id === id); if (b && title.trim()) { b.title = title.trim(); this.save(); } },
  /** Liga/desliga o favorito do endereço. Retorna true se ficou favoritado. */
  toggle(url, title) {
    const b = this.find(url);
    if (b) { this.remove(b.id); return false; }
    this.add(url, title);
    return true;
  },
};

/* ───────────── Lista de leitura ───────────── */
const readingList = {
  items: [],
  load() { const d = readJSON(profileKey('reading')); this.items = Array.isArray(d) ? d : []; },
  save() { writeJSON(profileKey('reading'), this.items); library.changed('reading'); },
  find(url) { return this.items.find((x) => sameUrl(x.url, url)); },
  add(url, title) {
    const old = this.find(url);
    if (old) this.items = this.items.filter((x) => x !== old);
    this.items.unshift({ id: uid(), url, title: title || url, t: Date.now(), read: false });
    this.save();
  },
  remove(id) { this.items = this.items.filter((x) => x.id !== id); this.save(); },
  setRead(id, read) { const x = this.items.find((i) => i.id === id); if (x) { x.read = read; this.save(); } },
  unread() { return this.items.filter((x) => !x.read).length; },
};

/* ───────────── Grupos de abas e sessão ─────────────
   "default" = as abas sem grupo. Cada grupo guarda as próprias abas (como no Safari):
   trocar de grupo troca o conjunto de abas da barra. */
const tabSets = {
  data: null,
  load() {
    const d = readJSON(profileKey('tabsets'));
    this.data = d?.default ? d : { current: 'default', default: { tabs: [], active: 0 }, groups: [] };
    if (this.data.current !== 'default' && !this.group(this.data.current)) this.data.current = 'default';
  },
  save() { writeJSON(profileKey('tabsets'), this.data); },
  group(id) { return this.data.groups.find((g) => g.id === id); },
  snapshotOf(id) { return id === 'default' ? this.data.default : this.group(id); },
  createGroup(name) {
    const g = { id: uid(), name: name.trim().slice(0, 40) || 'Grupo sem nome', tabs: [], active: 0 };
    this.data.groups.push(g);
    this.save();
    return g;
  },
  renameGroup(id, name) { const g = this.group(id); if (g && name.trim()) { g.name = name.trim().slice(0, 40); this.save(); } },
  removeGroup(id) { this.data.groups = this.data.groups.filter((g) => g.id !== id); this.save(); },
};

/* ───────────── Orquestração (usa o app.js, chamado depois que tudo carregou) ───────────── */
const library = {
  private: null, // partição da sessão privada ativa (ou null)
  listeners: new Set(),

  isPrivate() { return !!this.private; },
  /** Sessão onde as abas novas abrem: a privada (se ativa) ou a do perfil. */
  partition() { return this.private || PROFILES.currentProfile().partition; },
  currentKey() { return this.private ? 'private' : tabSets.data.current; },
  onChange(fn) { this.listeners.add(fn); },
  changed(what) { for (const fn of this.listeners) fn(what); },

  loadProfileData() {
    bookmarks.load();
    readingList.load();
    tabSets.load();
  },

  snapshot() {
    return {
      tabs: tabs.filter((t) => t.url).map((t) => ({ url: t.url, title: t.title })),
      active: Math.max(0, tabs.indexOf(active())),
    };
  },
  /** Guarda as abas do conjunto atual (nunca as do modo privado). */
  saveCurrent() {
    if (this.private || !tabs.length) return;
    const snap = this.snapshot();
    const cur = tabSets.data.current;
    if (cur === 'default') tabSets.data.default = snap;
    else Object.assign(tabSets.group(cur) || {}, snap);
    tabSets.save();
  },
  onTabsChanged() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveCurrent(), 400);
    this.changed('tabs');
  },

  closeAllLive() {
    for (const t of tabs) { t.wv?.remove(); discardParked(t); }
    tabs.length = 0;
    mru = [];
  },
  openSnapshot(snap) {
    this.closeAllLive();
    const list = snap?.tabs?.length ? snap.tabs : [{ url: START }];
    for (const s of list) makeTab(s.url, { title: s.title });
    activate(tabs[Math.min(snap?.active || 0, tabs.length - 1)].id);
    prewarmTabs();
  },

  /** Troca o conjunto de abas: 'default', id de um grupo ou 'private'. */
  async switchTo(target) {
    if (target === this.currentKey()) return;
    if (!this.private) this.saveCurrent();
    if (target === 'private') {
      this.private = (await api?.privateOpen()) || `kona-private-${'0'.repeat(12)}`;
      document.body.classList.add('private');
      this.openSnapshot(null);
    } else {
      if (this.private) await this.leavePrivate();
      tabSets.data.current = target;
      tabSets.save();
      this.openSnapshot(tabSets.snapshotOf(target));
    }
    this.changed('sets');
  },
  /** Sai do modo privado apagando os dados daquela sessão. */
  async leavePrivate() {
    const p = this.private;
    this.private = null;
    document.body.classList.remove('private');
    this.closeAllLive();
    await api?.privateClose(p);
  },

  /** Abertura do app: retoma o grupo atual; as abas sem grupo dependem do ajuste “Ao abrir”. */
  boot() {
    this.loadProfileData();
    const cur = tabSets.data.current;
    if (cur !== 'default') this.openSnapshot(tabSets.group(cur));
    else if (settings.startup === 'restore' && tabSets.data.default.tabs.length) this.openSnapshot(tabSets.data.default);
    else this.openSnapshot(null);
  },

  /** Troca de perfil: guarda as abas do perfil anterior e abre as do novo. */
  async beforeProfileSwitch() {
    if (this.private) await this.leavePrivate();
    else this.saveCurrent();
  },
  afterProfileSwitch() {
    this.loadProfileData();
    const snap = tabSets.snapshotOf(tabSets.data.current);
    this.openSnapshot(snap);
    this.changed('profile');
  },
};
