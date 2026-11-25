'use strict';
// Biblioteca (por perfil): favoritos, lista de leitura, grupos de abas/sessão e modo privado.
// Carrega antes do app.js: aqui só há dados e funções; nada roda que dependa do app.js.

// Os sites que mais aparecem nas barras de favoritos dos outros navegadores (versões internacionais)
const DEFAULT_BOOKMARKS = [
  ['YouTube', 'https://www.youtube.com'],
  ['Gmail', 'https://mail.google.com'],
  ['Amazon', 'https://www.amazon.com'],
  ['Reddit', 'https://www.reddit.com'],
  ['Netflix', 'https://www.netflix.com'],
  ['Instagram', 'https://www.instagram.com'],
  ['WhatsApp', 'https://web.whatsapp.com'],
  ['Wikipedia', 'https://en.wikipedia.org'],
  ['ChatGPT', 'https://chatgpt.com'],
  ['Spotify', 'https://open.spotify.com'],
];
// Listas padrão antigas: perfis que nunca mexeram nelas recebem a nova
const OLD_DEFAULT_URLS = [
  ['https://pt.wikipedia.org', 'https://github.com', 'https://www.youtube.com', 'https://developer.mozilla.org',
    'https://www.figma.com', 'https://news.ycombinator.com', 'https://www.electronjs.org', 'https://www.openstreetmap.org'],
  ['https://www.youtube.com', 'https://mail.google.com', 'https://www.amazon.com.br', 'https://www.mercadolivre.com.br',
    'https://www.netflix.com', 'https://www.instagram.com', 'https://web.whatsapp.com', 'https://pt.wikipedia.org',
    'https://chatgpt.com', 'https://open.spotify.com'],
].map((l) => l.join(' '));

// Endereços internos antigos (antes da tradução) que ainda podem estar em sessões salvas
const LEGACY_URLS = { 'kona://inicio': 'kona://start', 'kona://configuracoes': 'kona://settings' };

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const readJSON = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const writeJSON = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch { return false; } };
const sameUrl = (a, b) => a.replace(/\/$/, '') === b.replace(/\/$/, '');

/* ───────────── Favoritos ─────────────
   Árvore: cada item é um favorito { id, title, url } ou uma pasta { id, title, folder: true, children: [] }.
   As listas antigas (sem pastas) já são uma árvore válida. */
const bookmarks = {
  list: [],
  load() {
    let saved = readJSON(profileKey('bookmarks'));
    if (Array.isArray(saved) && !saved.some((b) => b.folder) && OLD_DEFAULT_URLS.includes(saved.map((b) => b.url).join(' '))) saved = null;
    this.list = Array.isArray(saved) ? saved : this.defaults();
    if (!saved) this.save();
  },
  defaults() { return DEFAULT_BOOKMARKS.map(([title, url]) => ({ id: uid(), title, url })); },
  /** Lista ainda intocada (a padrão atual ou uma das antigas)? */
  isDefaultList(list = this.list) {
    if (list.some((b) => b.folder)) return false;
    const urls = list.map((b) => b.url).join(' ');
    return OLD_DEFAULT_URLS.includes(urls) || urls === DEFAULT_BOOKMARKS.map(([, u]) => u).join(' ');
  },
  save() { writeJSON(profileKey('bookmarks'), this.list); library.changed('bookmarks'); },

  /** Percorre a árvore: fn(item, parentList, depth). */
  walk(fn, list = this.list, depth = 0) {
    for (const b of list) {
      if (fn(b, list, depth) === false) return false;
      if (b.folder && this.walk(fn, b.children, depth + 1) === false) return false;
    }
    return true;
  },
  /** { item, parent (lista que o contém) } pelo id. */
  locate(id) {
    let hit = null;
    this.walk((b, parent) => { if (b.id === id) { hit = { item: b, parent }; return false; } return true; });
    return hit;
  },
  get(id) { return this.locate(id)?.item || null; },
  /** Todos os favoritos (sem as pastas), em ordem. */
  all(list = this.list) { const out = []; this.walk((b) => { if (!b.folder) out.push(b); }, list); return out; },
  count(list = this.list) { return this.all(list).length; },
  find(url) { return this.all().find((b) => sameUrl(b.url, url)); },

  add(url, title) {
    if (this.find(url)) return false;
    this.list.push({ id: uid(), url, title: title || url });
    this.save();
    return true;
  },
  addFolder(title, parentId = null) {
    const f = { id: uid(), title: (title || '').trim().slice(0, 60) || 'New folder', folder: true, children: [] };
    const target = parentId ? this.get(parentId)?.children : this.list;
    (target || this.list).push(f);
    this.save();
    return f;
  },
  remove(id) {
    const hit = this.locate(id);
    if (!hit) return;
    hit.parent.splice(hit.parent.indexOf(hit.item), 1);
    this.save();
  },
  rename(id, title) { const b = this.get(id); if (b && title.trim()) { b.title = title.trim(); this.save(); } },
  /** Pasta `ancestorId` contém `id` (ou é o próprio)? Impede mover uma pasta para dentro dela mesma. */
  contains(ancestorId, id) {
    const a = this.get(ancestorId);
    if (!a) return false;
    if (a.id === id) return true;
    let found = false;
    if (a.folder) this.walk((b) => { if (b.id === id) { found = true; return false; } return true; }, a.children);
    return found;
  },
  /**
   * Move um item: para dentro de uma pasta (where = 'inside', no fim) ou antes/depois de outro
   * item (where = 'before' | 'after'). targetId null = fim da lista principal.
   */
  move(id, targetId, where) {
    if (id === targetId) return false;
    const src = this.locate(id);
    if (!src) return false;
    if (targetId && src.item.folder && this.contains(id, targetId)) return false;
    src.parent.splice(src.parent.indexOf(src.item), 1);
    if (!targetId) this.list.push(src.item);
    else {
      const dst = this.locate(targetId);
      if (!dst) { src.parent.push(src.item); return false; }
      if (where === 'inside' && dst.item.folder) dst.item.children.push(src.item);
      else dst.parent.splice(dst.parent.indexOf(dst.item) + (where === 'after' ? 1 : 0), 0, src.item);
    }
    this.save();
    return true;
  },
  /** Troca a lista inteira (importação). */
  replace(list) { this.list = list; this.save(); },
  /**
   * Favoritos importados: substituem a lista padrão do Kona; numa lista já personalizada, entram
   * no fim, sem repetir endereços (pastas que ficariam vazias não entram). Retorna quantos entraram.
   */
  importTree(tree) {
    if (this.isDefaultList()) { this.replace(tree); return this.count(tree); }
    const have = new Set(this.all().map((b) => b.url.replace(/\/$/, '')));
    const prune = (list) => list.map((b) => {
      if (!b.folder) return have.has(b.url.replace(/\/$/, '')) ? null : (have.add(b.url.replace(/\/$/, '')), b);
      const children = prune(b.children);
      return children.length ? { ...b, children } : null;
    }).filter(Boolean);
    const fresh = prune(tree);
    this.list.push(...fresh);
    this.save();
    return this.count(fresh);
  },
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
    const g = { id: uid(), name: name.trim().slice(0, 40) || 'Untitled group', tabs: [], active: 0 };
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
    for (const s of list) makeTab(LEGACY_URLS[s.url] || s.url, { title: LEGACY_URLS[s.url] ? '' : s.title });
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
