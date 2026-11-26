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
  /**
   * Autocompletar na própria barra (como o Chrome): o site já visitado mais de uma vez cujo endereço
   * começa com o que foi digitado. Sem "/", completa o site (meet.google.com); com "/", o endereço
   * completo já visitado. Entre vários, o mais visitado (e, empatando, o mais recente).
   */
  inlineFor(typed) {
    const q = typed.toLowerCase();
    if (!q || /\s/.test(q)) return null;
    const www = q.startsWith('www.');
    const strip = (s) => (www ? s : s.replace(/^www\./, ''));
    let best = null;
    const offer = (full, url, n, t) => {
      if (n < 2 || full.length <= q.length || !full.toLowerCase().startsWith(q)) return;
      if (!best || n > best.n || (n === best.n && t > best.t)) best = { full, url, n, t };
    };
    if (!q.includes('/')) {
      const hosts = new Map();
      for (const e of this.data.visits) {
        let u; try { u = new URL(e.url); } catch { continue; }
        const key = strip(u.host);
        const h = hosts.get(key) || { n: 0, t: 0, url: `${u.protocol}//${u.host}/` };
        h.n += e.n; h.t = Math.max(h.t, e.t);
        hosts.set(key, h);
      }
      for (const [host, h] of hosts) offer(host, h.url, h.n, h.t);
    } else {
      for (const e of this.data.visits) {
        const bare = strip(e.url.replace(/^https?:\/\//, '')).replace(/\/$/, '');
        offer(bare, e.url, e.n, e.t);
      }
    }
    return best && { full: best.full, url: best.url };
  },
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
    this.keyword = null;
    // abas das outras janelas, para "Ir para a aba" (o modo privado não vê nem é visto)
    this.otherTabs = [];
    if (!library.isPrivate()) api?.otherTabs?.().then((l) => { this.otherTabs = Array.isArray(l) ? l : []; }).catch(() => {});
    this.update(true);
  },
  close() {
    this.el.classList.remove('show');
    this.leaveKeyword(false);
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
    // atalho exato + espaço ("yt ", "@abas "): entra no modo de busca no site
    if (!this.keyword && !focusing && / $/.test(value) && keywordFor(value)?.exact) { this.enterKeyword(keywordFor(value)); return; }
    // autocompletar na barra: o resto do endereço aparece selecionado (não ao apagar, nem ao focar)
    this.inline = null;
    if (!this.keyword && !focusing && !this.deleting && value && this.input.selectionStart === value.length) {
      const c = browseHistory.inlineFor(value);
      if (c) {
        this.inline = { typed: value, ...c };
        this.input.value = value + c.full.slice(value.length);
        this.input.setSelectionRange(value.length, this.input.value.length);
      }
    }
    this.deleting = false;
    const q = value.trim();
    clearTimeout(this.timer);
    if (this.keyword) { const items = this.composeKeyword(q); this.render(items, items.length ? 0 : -1); return; }
    if (!q) {
      const recent = browseHistory.recentSearches(6).map((e) => ({ kind: 'search', from: 'history', text: e.q, query: e.q }));
      this.render(recent, -1, tl('Recent searches'));
      return;
    }
    const first = this.compose(q, this.cache.get(q.toLowerCase()) || []);
    this.render(first, this.defaultSel(first));
    if (this.cache.has(q.toLowerCase())) return;
    const mySeq = ++this.seq;
    this.timer = setTimeout(async () => {
      if (!settings.suggestions) return; // desligadas: nada é enviado (e nada vai para o cache)
      const list = await (api?.suggest(q, library.private, settings.searchEngine) ?? Promise.resolve([]));
      this.cache.set(q.toLowerCase(), list);
      if (this.cache.size > 200) this.cache.delete(this.cache.keys().next().value);
      if (mySeq !== this.seq || !this.input || this.input.value.trim() !== q) return; // já digitou outra coisa
      if (this.keyword) return; // entrou no modo de busca no site enquanto esperava
      const keep = this.items[this.sel];
      const items = this.compose(q, list);
      const idx = keep ? items.findIndex((x) => x.text === keep.text && x.kind === keep.kind) : -1;
      this.render(items, idx >= 0 ? idx : this.defaultSel(items));
    }, 160); // espera uma pausa na digitação: menos pedidos ao buscador (uma rajada parece robô)
  },

  /** O item do Enter: o primeiro que não é a resposta de uma conta (Enter continua pesquisando). */
  defaultSel(items) { const i = items.findIndex((x) => x.kind !== 'calc'); return i < 0 ? 0 : i; },

  /** Abas que batem com o texto, desta janela e das outras: [{ tabId, winId?, title, url }]. */
  matchTabs(q, max) {
    q = q.toLowerCase();
    const mine = tabs.filter((t) => t !== this.tab && /^https?:/.test(t.url)).map((t) => ({ tabId: t.id, title: t.title, url: t.url }));
    const others = (this.otherTabs || []).map((t) => ({ tabId: t.id, winId: t.winId, title: t.title, url: t.url }));
    return [...mine, ...others]
      .map((t) => ({ t, s: browseHistory.score(t.url.replace(/^https?:\/\/(www\.)?/, ''), q, 1, Date.now()) || (q ? browseHistory.score(t.title || '', q, 1, Date.now()) : 1) }))
      .filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, max).map((x) => x.t);
  },
  /** Favoritos que batem com o texto. */
  matchFavorites(q, max) {
    q = q.toLowerCase();
    return bookmarks.all()
      .map((b) => ({ b, s: q ? Math.max(browseHistory.score(b.title || '', q, 2, Date.now()), browseHistory.score(b.url.replace(/^https?:\/\/(www\.)?/, ''), q, 2, Date.now())) : 1 }))
      .filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, max).map((x) => x.b);
  },
  tabItem: (t) => ({ kind: 'tab', text: t.title || hostOf(t.url), url: t.url, tabId: t.tabId, winId: t.winId, sub: tl('Switch to this tab') }),
  favItem: (b) => ({ kind: 'fav', text: b.title || hostOf(b.url), url: b.url, sub: b.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') }),

  compose(q, suggestions) {
    const url = toUrl(q);
    const items = [];
    // contas: a resposta no topo (Enter continua pesquisando; escolher a resposta copia)
    const calc = calcAnswer(q);
    if (calc) items.push({ kind: 'calc', text: `= ${calc.text}`, value: calc.text, sub: q });
    // com o autocompletar na barra, o 1º item (o do Enter) é o site completado
    const inline = this.inline && this.inline.typed.trim() === q ? this.inline : null;
    if (inline) items.push({ kind: 'go', text: inline.full, url: inline.url, sub: tl('Go to site') });
    if (inline && url && !isSearchUrl(url)) { /* o digitado também é um endereço: o completado já cobre */ }
    else if (url && !isSearchUrl(url)) items.push({ kind: 'go', text: q, url, sub: tl('Go to site') });
    else items.push({ kind: 'search', from: 'typed', text: q, query: q, sub: tl('{engine} Search', { engine: engine().name }) });
    // "Pressione Tab para pesquisar no YouTube" (ou @abas, @favoritos, @histórico)
    const kw = keywordFor(q);
    if (kw) items.push({ kind: 'keyword', kw, text: kw.kind === 'site' ? tl('Search {name}', { name: kw.site.name }) : tl(kw.scope.label), sub: tl('press Tab') });
    const seen = new Set([q.toLowerCase()]);
    const shown = new Set();
    for (const t of this.matchTabs(q, 2)) { items.push(this.tabItem(t)); shown.add(t.url); }
    for (const b of this.matchFavorites(q, 2)) { if (shown.has(b.url)) continue; items.push(this.favItem(b)); shown.add(b.url); }
    for (const v of browseHistory.matchVisits(q, 3)) {
      if (shown.has(v.url)) continue;
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

  /* ── Modo "pesquisar no site" / só abas, favoritos ou histórico ── */
  enterKeyword(kw) {
    if (!this.input || !kw) return;
    this.keyword = kw;
    this.input.value = '';
    this.typed = '';
    this.inline = null;
    const form = this.input.closest('form');
    form?.querySelector('.kw-chip')?.remove();
    const chip = document.createElement('span');
    chip.className = 'kw-chip';
    chip.innerHTML = `${icon(kw.kind === 'site' ? 'search' : kw.scope.icon)}<span></span>`;
    chip.lastChild.textContent = kw.kind === 'site' ? kw.site.name : tl(kw.scope.label);
    form?.insertBefore(chip, this.input);
    form?.classList.add('kw-on');
    sfx.play('tick');
    this.update();
  },
  leaveKeyword(refresh = true) {
    if (!this.keyword) return false;
    this.keyword = null;
    const form = this.input?.closest('form');
    form?.querySelector('.kw-chip')?.remove();
    form?.classList.remove('kw-on');
    if (refresh && this.input) this.update();
    return true;
  },
  composeKeyword(q) {
    const kw = this.keyword;
    if (kw.kind === 'site') {
      const url = siteSearchUrl(kw.site, q);
      return url ? [{ kind: 'go', text: q || kw.site.name, url, sub: q ? tl('Search {name}', { name: kw.site.name }) : siteHost(kw.site) }] : [];
    }
    if (kw.scope.id === 'tabs') return this.matchTabs(q, 8).map((t) => this.tabItem(t));
    if (kw.scope.id === 'favorites') return this.matchFavorites(q, 8).map((b) => this.favItem(b));
    const visits = q ? browseHistory.matchVisits(q, 8) : browseHistory.data.visits.slice(0, 8);
    return visits.map((v) => ({ kind: 'visit', text: v.title || hostOf(v.url), url: v.url, sub: v.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') }));
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
      const ic = { visit: 'globe', go: this.keyword?.kind === 'site' ? 'search' : 'globe', calc: 'calc', tab: 'tabs', fav: 'star', keyword: 'search' }[it.kind]
        || (it.from === 'history' ? 'clock' : 'search');
      const removable = it.from === 'history' || it.kind === 'visit';
      const sub = it.sub ? `<span class="om-sub">— ${escapeHtml(it.sub)}</span>` : '';
      return `<div class="om-row${i === sel ? ' sel' : ''} om-${it.kind}" data-i="${i}" role="option">
        <span class="om-ic">${icon(ic)}</span>
        <span class="om-text">${this.highlight(it.text)}${sub}</span>
        ${removable ? `<button class="om-x" title="${tl('Remove from history')}" tabindex="-1">${icon('x')}</button>` : ''}
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
    const it = this.items[this.sel];
    // a linha "Pressione Tab…" e a resposta da conta não trocam o texto digitado
    if (it.kind === 'keyword' || it.kind === 'calc') { this.input.value = this.typed; return; }
    this.input.value = ['visit', 'tab', 'fav'].includes(it.kind) ? it.url : this.keyword?.kind === 'site' ? (this.typed || '') : it.text;
  },

  /** Teclado na barra: setas escolhem, Esc volta ao digitado / fecha. Retorna true se tratou. */
  key(e) {
    // Tab: entra no modo de busca no site (ou @abas…) sugerido pelo texto
    if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey && !this.keyword) {
      const kw = keywordFor(this.typed.trim());
      if (kw) { e.preventDefault(); this.enterKeyword(kw); return true; }
    }
    // Backspace com o campo vazio (ou Esc) sai do modo
    if (this.keyword && ((e.key === 'Backspace' && !this.input.value) || e.key === 'Escape')) { e.preventDefault(); this.leaveKeyword(); return true; }
    if (e.key === 'Enter' && this.isOpen() && this.items[this.sel]?.kind === 'keyword') { e.preventDefault(); this.enterKeyword(this.items[this.sel].kw); return true; }
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
// Apagar (Backspace/Delete) tira o autocompletar e não o traz de volta enquanto se apaga, como no Chrome;
// digitando com teclado de composição (acentos, IME), também não completa no meio da composição
document.addEventListener('beforeinput', (e) => {
  if (e.target !== omnibox.input) return;
  omnibox.deleting = !!e.inputType?.startsWith('delete') || e.isComposing;
}, true);

omnibox.el.addEventListener('mousedown', (e) => {
  e.preventDefault();
  const row = e.target.closest('.om-row');
  if (!row || !omnibox.input) return;
  const it = omnibox.items[+row.dataset.i];
  if (e.target.closest('.om-x')) { omnibox.forget(it); return; }
  if (it.kind === 'keyword') { omnibox.enterKeyword(it.kw); return; }
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
