'use strict';
// Barra de endereço mais esperta (N12): contas, busca dentro de sites (atalhos com Tab) e os atalhos
// do Kona (@abas, @favoritos, @histórico). Aqui ficam as partes puras; a lista em si é o omnibox.js.

/* ───────────── Contas ─────────────
   Calculadora própria (nada do que se digita é executado como código): + − × ÷ ^ %, parênteses,
   "15% de 80". Vírgula decimal nos idiomas que a usam. */
function calcAnswer(input) {
  let s = String(input || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s || s.length > 120) return null;
  s = s.replace(/^=\s*/, '').replace(/=$/, '');
  // "15% de 80", "15% of 80", "15% del 80"
  const pct = /^(-?[\d.,]+)\s*%\s*(?:de|do|da|of|del)\s+(-?[\d.,]+)$/.exec(s);
  if (pct) s = `(${pct[1]})/100*(${pct[2]})`;
  // "200 + 10%" = 220, "200 - 10%" = 180 (como as calculadoras)
  const plusPct = !pct && /^(.+?)\s*([+-])\s*([\d.,]+)\s*%$/.exec(s);
  if (plusPct) s = `(${plusPct[1]})*(1${plusPct[2]}(${plusPct[3]})/100)`;
  if (!/^[\d\s.,+\-*/x×÷^()%]+$/.test(s)) return null;
  // precisa de uma conta de verdade: um número sozinho (ou "50%") não vira resposta
  if (!pct && !/[+\-*/x×÷^]/.test(s.replace(/^\s*-/, ''))) return null;
  const commaDecimal = i18n.lang !== 'en';
  const num = (t) => {
    let x = t;
    if (commaDecimal) x = x.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'); // 1.234,5 → 1234.5
    else x = x.replace(/,(?=\d{3}(\D|$))/g, ''); // 1,234.5 → 1234.5
    return /^\d*\.?\d+$|^\d+\.$/.test(x) ? Number(x) : NaN;
  };
  // tokens
  const tokens = [];
  const re = /\s*([\d.,]+|[+\-*/x×÷^()%])/gy;
  let m;
  let end = 0; // até onde o texto foi lido (a busca "grudada" volta a 0 quando termina)
  while ((m = re.exec(s))) {
    end = re.lastIndex;
    const t = m[1];
    if (/^[\d.,]+$/.test(t)) { const v = num(t); if (Number.isNaN(v)) return null; tokens.push({ v }); }
    else tokens.push({ op: { x: '*', '×': '*', '÷': '/' }[t] || t });
  }
  if (s.slice(end).trim()) return null;
  // análise descendente: expr = termo (± termo)*; termo = fator (×÷ fator)*; fator = base (^ fator)?; base = ±base | número% | (expr)
  let i = 0;
  const peek = () => tokens[i]?.op;
  function expr() {
    let v = term();
    while (peek() === '+' || peek() === '-') { const o = tokens[i++].op; const r = term(); v = o === '+' ? v + r : v - r; }
    return v;
  }
  function term() {
    let v = factor();
    while (peek() === '*' || peek() === '/') { const o = tokens[i++].op; const r = factor(); v = o === '*' ? v * r : v / r; }
    return v;
  }
  function factor() {
    const b = base();
    if (peek() === '^') { i++; return b ** factor(); }
    return b;
  }
  function base() {
    const t = tokens[i];
    if (!t) throw new Error('end');
    if (t.op === '-') { i++; return -base(); }
    if (t.op === '+') { i++; return base(); }
    if (t.op === '(') { i++; const v = expr(); if (tokens[i]?.op !== ')') throw new Error(')'); i++; return pctOf(v); }
    if (t.v !== undefined) { i++; return pctOf(t.v); }
    throw new Error('token');
  }
  const pctOf = (v) => { if (peek() === '%') { i++; return v / 100; } return v; };
  let value;
  try { value = expr(); } catch { return null; }
  if (i !== tokens.length || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 1e10) / 1e10;
  return {
    value: rounded,
    text: rounded.toLocaleString(i18n.locale, { maximumFractionDigits: 10, useGrouping: Math.abs(rounded) >= 10000 }),
  };
}

/* ───────────── Busca dentro de sites ─────────────
   Cada atalho: { id, name, keyword, url (com %s no lugar do texto) }. A lista pronta acompanha o
   idioma; editar nas Configurações guarda a lista da pessoa (settings.siteSearch). */
function defaultSiteSearches() {
  const lang = i18n.lang;
  const wiki = lang === 'pt-BR' ? 'pt' : lang === 'es' ? 'es' : 'en';
  const list = [
    { id: 'youtube', name: 'YouTube', keyword: 'yt', url: 'https://www.youtube.com/results?search_query=%s' },
    { id: 'wikipedia', name: 'Wikipedia', keyword: 'w', url: `https://${wiki}.wikipedia.org/w/index.php?search=%s` },
    { id: 'maps', name: 'Google Maps', keyword: 'maps', url: 'https://www.google.com/maps/search/%s' },
    { id: 'amazon', name: 'Amazon', keyword: 'amz', url: lang === 'pt-BR' ? 'https://www.amazon.com.br/s?k=%s' : lang === 'es' ? 'https://www.amazon.es/s?k=%s' : 'https://www.amazon.com/s?k=%s' },
    { id: 'github', name: 'GitHub', keyword: 'gh', url: 'https://github.com/search?q=%s' },
  ];
  if (lang === 'pt-BR') list.splice(4, 0, { id: 'mercadolivre', name: 'Mercado Livre', keyword: 'ml', url: 'https://lista.mercadolivre.com.br/%s' });
  return list;
}
const siteSearches = () => (Array.isArray(settings.siteSearch) ? settings.siteSearch : defaultSiteSearches())
  .filter((s) => s && s.name && s.keyword && /^https?:\/\/.+%s/.test(s.url || ''));
const siteHost = (s) => { try { return new URL(s.url.replace('%s', 'x')).hostname.replace(/^(www|lista|listado)\./, ''); } catch { return ''; } };
/** O endereço da busca no site (texto vazio: a página inicial do site). */
function siteSearchUrl(s, q) {
  if (!q.trim()) { try { return new URL(s.url.replace('%s', '')).origin + '/'; } catch { return null; } }
  return s.url.replace('%s', encodeURIComponent(q.trim()).replace(/%20/g, '+'));
}

/* ───────────── Atalhos do Kona: só abas, só favoritos, só histórico ───────────── */
const SCOPES = [
  { id: 'tabs', words: ['@tabs', '@abas', '@pestañas', '@pestanas'], label: /*i18n*/'Search tabs', icon: 'tabs' },
  { id: 'favorites', words: ['@favorites', '@bookmarks', '@favoritos'], label: /*i18n*/'Search favorites', icon: 'star' },
  { id: 'history', words: ['@history', '@historico', '@histórico', '@historial'], label: /*i18n*/'Search history', icon: 'clock' },
];

/**
 * O que o texto digitado pode virar com Tab (ou espaço depois do atalho exato):
 * { kind: 'site', site } | { kind: 'scope', scope } | null. exact: o texto é o próprio atalho.
 */
function keywordFor(typed) {
  const q = String(typed || '').trim().toLowerCase();
  if (!q || /\s/.test(q)) return null;
  if (q.startsWith('@')) {
    const scope = SCOPES.find((s) => s.words.some((w) => w.startsWith(q) && q.length >= 2));
    return scope ? { kind: 'scope', scope, exact: scope.words.includes(q) } : null;
  }
  const list = siteSearches();
  const exact = list.find((s) => s.keyword.toLowerCase() === q);
  if (exact) return { kind: 'site', site: exact, exact: true };
  if (q.length < 3) return null;
  const site = list.find((s) => s.name.toLowerCase().replace(/\s+/g, '').startsWith(q) || siteHost(s).startsWith(q.replace(/^www\./, '')));
  return site ? { kind: 'site', site, exact: false } : null;
}
