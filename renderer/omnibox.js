'use strict';
// Barra de endereço inteligente: histórico de buscas e visitas (por perfil) + sugestões do Google.

/* ───────────── Histórico ───────────── */
const browseHistory = {
  data: { searches: [], visits: [] },
  saveTimer: null,

  load() {
    try {
      const d = JSON.parse(localStorage.getItem(profileKey('history')));
      this.data = { searches: d?.searches || [], visits: d?.visits || [] };
    } catch {
      this.data = { searches: [], visits: [] };
    }
  },
  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try { localStorage.setItem(profileKey('history'), JSON.stringify(this.data)); } catch { /* cheio: ignora */ }
    }, 250);
  },
  addSearch(q) {
    q = (q || '').trim();
    if (!q || library.isPrivate() || !settings.saveHistory) return; // modo privado não guarda histórico
    const list = this.data.searches;
    const i = list.findIndex((x) => x.q.toLowerCase() === q.toLowerCase());
    const e = i >= 0 ? list.splice(i, 1)[0] : { q, n: 0 };
    Object.assign(e, { q, n: e.n + 1, t: Date.now() });
    list.unshift(e);
    list.length = Math.min(list.length, 300);
    this.save();
  },
  addVisit(url, title) {
    if (library.isPrivate() || !settings.saveHistory) return;
    if (!/^https?:/.test(url) || isSearchUrl(url)) return; // a busca já fica em "searches"
    const list = this.data.visits;
    const i = list.findIndex((x) => x.url === url);
    const e = i >= 0 ? list.splice(i, 1)[0] : { url, title: '', n: 0 };
    Object.assign(e, { n: e.n + 1, t: Date.now() });
    if (title && title !== hostOf(url)) e.title = title;
    list.unshift(e);
    list.length = Math.min(list.length, 600);
    this.save();
  },
  updateTitle(url, title) {
    const e = this.data.visits.find((x) => x.url === url);
    if (e && title) { e.title = title; this.save(); }
  },
  remove(kind, key) {
    if (kind === 'search') this.data.searches = this.data.searches.filter((x) => x.q !== key);
    else this.data.visits = this.data.visits.filter((x) => x.url !== key);
    this.save();
  },
  clear() { this.data = { searches: [], visits: [] }; this.save(); },
  /** Junta um histórico importado (de outro navegador) ao atual, dentro dos mesmos limites. */
  merge({ visits = [], searches = [] }) {
    const join = (mine, theirs, key, max) => {
      const by = new Map(mine.map((e) => [e[key], { ...e }]));
      for (const e of theirs) {
        const k = key === 'q' ? e.q.toLowerCase() : e.url;
        const old = key === 'q' ? [...by.values()].find((x) => x.q.toLowerCase() === k) : by.get(k);
        if (old) { old.n += e.n; old.t = Math.max(old.t, e.t); if (!old.title && e.title) old.title = e.title; }
        else by.set(e[key], { ...e });
      }
      return [...by.values()].sort((a, b) => b.t - a.t).slice(0, max);
    };
    this.data.visits = join(this.data.visits, visits.filter((v) => !isSearchUrl(v.url)), 'url', 600);
    this.data.searches = join(this.data.searches, searches, 'q', 300);
    this.save();
  },
  /** Apaga o que foi visitado/pesquisado a partir de um instante (0 = tudo). */
  clearSince(t) {
    this.data.searches = t ? this.data.searches.filter((x) => x.t < t) : [];
    this.data.visits = t ? this.data.visits.filter((x) => x.t < t) : [];
    this.save();
  },

  /** Pontuação: começo do texto > começo de palavra > contém; frequência e recência desempatam. */
  score(text, q, n, t) {
    const s = text.toLowerCase();
    let base;
    if (s.startsWith(q)) base = 3;
    else if (s.includes(' ' + q) || s.includes('.' + q) || s.includes('/' + q)) base = 2;
    else if (s.includes(q)) base = 1;
    else return 0;
    const days = (Date.now() - t) / 864e5;
    return base * 10 + Math.log2(1 + n) * 2 + Math.max(0, 3 - days / 7);
  },
  matchSearches(q, max) {
    q = q.toLowerCase();
    return this.data.searches
      .map((e) => ({ e, s: this.score(e.q, q, e.n, e.t) }))
      .filter((x) => x.s > 0 && x.e.q.toLowerCase() !== q)
      .sort((a, b) => b.s - a.s).slice(0, max).map((x) => x.e);
  },
  matchVisits(q, max) {
    q = q.toLowerCase();
    return this.data.visits
      .map((e) => {
        const bare = e.url.replace(/^https?:\/\/(www\.)?/, '');
        return { e, s: Math.max(this.score(bare, q, e.n, e.t), this.score(e.title || '', q, e.n, e.t) - 5) };
      })
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s).slice(0, max).map((x) => x.e);
  },
  recentSearches(max) { return this.data.searches.slice(0, max); },
};
browseHistory.load();

/* ───────────── Lista de sugestões ───────────── */
const omnibox = {
  el: document.getElementById('omnibox'),
  input: null,
  tab: null,
  typed: '',
  items: [],
  sel: -1,
  seq: 0,
  cache: new Map(),
  timer: null,

  open(input, tab) {
    this.input = input;
    this.tab = tab;
    this.typed = '';
    this.sel = -1;
    this.update(true);
  },
  close() {
    this.el.classList.remove('show');
    this.input = null;
    this.items = [];
    this.sel = -1;
    clearTimeout(this.timer);
  },
  isOpen() { return this.el.classList.contains('show'); },

  /** O que o Enter deve abrir: a sugestão selecionada (se houver). */
  choice() {
    if (!this.isOpen() || this.sel < 0) return null;
    return this.items[this.sel] || null;
  },

  update(focusing = false) {
    if (!this.input) return;
    // Ao focar, o campo mostra o endereço atual (selecionado): não filtra por ele
    const value = focusing && this.tab.url !== START ? '' : this.input.value;
    this.typed = value;
    const q = value.trim();
    clearTimeout(this.timer);
    if (!q) {
      const recent = browseHistory.recentSearches(6).map((e) => ({ kind: 'search', from: 'history', text: e.q, query: e.q }));
      this.render(recent, -1, 'Recent searches');
      return;
    }
    this.render(this.compose(q, this.cache.get(q.toLowerCase()) || []), 0);
    if (this.cache.has(q.toLowerCase())) return;
    const mySeq = ++this.seq;
    this.timer = setTimeout(async () => {
      if (!settings.suggestions) return; // desligadas: nada é enviado (e nada vai para o cache)
      const list = await (api?.suggest(q, library.private, settings.searchEngine) ?? Promise.resolve([]));
      this.cache.set(q.toLowerCase(), list);
      if (this.cache.size > 200) this.cache.delete(this.cache.keys().next().value);
      if (mySeq !== this.seq || !this.input || this.input.value.trim() !== q) return; // já digitou outra coisa
      const keep = this.items[this.sel];
      const items = this.compose(q, list);
      const idx = keep ? items.findIndex((x) => x.text === keep.text && x.kind === keep.kind) : 0;
      this.render(items, idx >= 0 ? idx : 0);
    }, 160); // espera uma pausa na digitação: menos pedidos ao buscador (uma rajada parece robô)
  },

  compose(q, suggestions) {
    const url = toUrl(q);
    const items = [];
    if (url && !isSearchUrl(url)) items.push({ kind: 'go', text: q, url, sub: 'Go to site' });
    else items.push({ kind: 'search', from: 'typed', text: q, query: q, sub: `${engine().name} Search` });
    const seen = new Set([q.toLowerCase()]);
    for (const v of browseHistory.matchVisits(q, 3)) {
      items.push({ kind: 'visit', text: v.title || hostOf(v.url), url: v.url, sub: v.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') });
    }
    for (const s of browseHistory.matchSearches(q, 3)) {
      seen.add(s.q.toLowerCase());
      items.push({ kind: 'search', from: 'history', text: s.q, query: s.q });
    }
    for (const s of suggestions) {
      if (items.length >= 9) break;
      if (seen.has(s.toLowerCase())) continue;
      seen.add(s.toLowerCase());
      items.push({ kind: 'search', from: 'suggest', text: s, query: s });
    }
    return items;
  },

  /** Destaca em negrito o trecho que completa o que foi digitado (como no Chrome). */
  highlight(text) {
    const q = this.typed.trim();
    if (q && text.toLowerCase().startsWith(q.toLowerCase()) && text.length > q.length) {
      return `${escapeHtml(text.slice(0, q.length))}<b>${escapeHtml(text.slice(q.length))}</b>`;
    }
    return escapeHtml(text);
  },

  render(items, sel, heading = '') {
    this.items = items;
    this.sel = sel;
    if (!items.length || !this.input) { this.el.classList.remove('show'); return; }
    const rows = items.map((it, i) => {
      const ic = it.kind === 'visit' ? 'globe' : it.kind === 'go' ? 'globe' : it.from === 'history' ? 'clock' : 'search';
      const removable = it.from === 'history' || it.kind === 'visit';
      const sub = it.sub ? `<span class="om-sub">— ${escapeHtml(it.sub)}</span>` : '';
      return `<div class="om-row${i === sel ? ' sel' : ''}" data-i="${i}" role="option">
        <span class="om-ic">${icon(ic)}</span>
        <span class="om-text">${this.highlight(it.text)}${sub}</span>
        ${removable ? `<button class="om-x" title="Remove from history" tabindex="-1">${icon('x')}</button>` : ''}
      </div>`;
    }).join('');
    this.el.innerHTML = (heading ? `<div class="om-head">${heading}</div>` : '') + rows;
    this.place();
    this.el.classList.add('show');
  },

  place() {
    const tab = this.input?.closest('.tab');
    if (!tab) return;
    const r = tab.getBoundingClientRect();
    const width = Math.min(Math.max(r.width, 520), innerWidth - 16);
    const left = Math.max(8, Math.min(r.left, innerWidth - width - 8));
    this.el.style.left = `${left}px`;
    this.el.style.width = `${width}px`;
    this.el.style.top = `${r.bottom + 6}px`;
  },

  select(i) {
    if (!this.items.length) return;
    const prev = this.sel;
    this.sel = (i + this.items.length) % this.items.length;
    if (this.sel !== prev) sfx.play('tick');
    $$('.om-row', this.el).forEach((row, j) => row.classList.toggle('sel', j === this.sel));
    this.input.value = this.items[this.sel].kind === 'visit' ? this.items[this.sel].url : this.items[this.sel].text;
  },

  /** Teclado na barra: setas escolhem, Esc volta ao digitado / fecha. Retorna true se tratou. */
  key(e) {
    if (!this.isOpen()) return false;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      this.select(this.sel + (e.key === 'ArrowDown' ? 1 : -1));
      return true;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (this.typed && this.input.value !== this.typed) {
        this.input.value = this.typed; // volta ao que foi digitado
        this.sel = 0;
        $$('.om-row', this.el).forEach((row, j) => row.classList.toggle('sel', j === 0));
      } else {
        this.el.classList.remove('show');
      }
      return true;
    }
    if (e.key === 'Delete' && e.shiftKey && this.sel >= 0) {
      const it = this.items[this.sel];
      if (it.from === 'history' || it.kind === 'visit') { e.preventDefault(); this.forget(it); return true; }
    }
    return false;
  },

  forget(it) {
    if (it.kind === 'visit') browseHistory.remove('visit', it.url);
    else browseHistory.remove('search', it.text);
    const keepTyped = this.typed;
    this.input.value = keepTyped;
    this.update(!keepTyped && this.tab.url !== START);
  },
};

// Mouse: escolher sem tirar o foco da barra; remover item do histórico
omnibox.el.addEventListener('mousedown', (e) => {
  e.preventDefault();
  const row = e.target.closest('.om-row');
  if (!row || !omnibox.input) return;
  const it = omnibox.items[+row.dataset.i];
  if (e.target.closest('.om-x')) { omnibox.forget(it); return; }
  const { input, tab } = omnibox;
  sfx.play('select');
  input.blur();
  go(tab, it);
});
omnibox.el.addEventListener('mousemove', (e) => {
  const row = e.target.closest('.om-row');
  if (!row) return;
  const i = +row.dataset.i;
  if (i !== omnibox.sel) {
    omnibox.sel = i;
    $$('.om-row', omnibox.el).forEach((r, j) => r.classList.toggle('sel', j === i));
  }
});
window.addEventListener('resize', () => omnibox.isOpen() && omnibox.place());
