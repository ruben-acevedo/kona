'use strict';
// Idiomas da interface (N5). O texto em inglês é a própria chave: tl('Close tab') devolve a tradução
// do idioma atual, ou o inglês se faltar. Variáveis entre chaves: tl('{n} Tabs', { n: 3 }).
// Os dicionários ficam em renderer/i18n/<idioma>.js (os mesmos servem ao processo principal).
// O HTML fixo da interface é traduzido aqui, guardando o original para a troca valer na hora.

const LANGUAGES = [
  ['en', 'English'],
  ['pt-BR', 'Português (Brasil)'],
  ['es', 'Español'],
];
const LANG_KEY = 'kona:language'; // 'auto' (segue o Windows) ou um dos códigos acima

/** Código suportado mais próximo de um idioma do sistema (pt-PT → pt-BR, es-MX → es; resto → en). */
function matchLanguage(code) {
  const c = String(code || '').toLowerCase();
  if (c.startsWith('pt')) return 'pt-BR';
  if (c.startsWith('es')) return 'es';
  return 'en';
}

const i18n = {
  choice: 'auto', // o que a pessoa escolheu
  lang: 'en', // o idioma em uso
  dict: {},
  system: new URLSearchParams(location.search).get('syslang') || navigator.language,
  load() {
    try { this.choice = localStorage.getItem(LANG_KEY) || 'auto'; } catch { this.choice = 'auto'; }
    this.apply();
  },
  apply() {
    this.lang = this.choice === 'auto' ? matchLanguage(this.system) : (LANGUAGES.some(([c]) => c === this.choice) ? this.choice : 'en');
    this.dict = (window.KONA_LOCALES && window.KONA_LOCALES[this.lang]) || {};
    document.documentElement.lang = this.lang;
  },
  /** Formatação de datas e números no idioma da interface. */
  get locale() { return this.lang === 'en' ? 'en-US' : this.lang; },
};
i18n.load();

/** Texto traduzido. vars: { nome: valor } para as {chaves} do texto. */
function tl(s, vars) {
  let r = i18n.dict[s];
  if (typeof r !== 'string' || !r) r = s;
  if (vars) r = r.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return r;
}
/** Singular/plural: tln(3, '{n} Tab', '{n} Tabs'). */
function tln(n, one, many, vars) { return tl(n === 1 ? one : many, { n, ...vars }); }

/* ── HTML fixo da interface ──
   Só o HTML que vem no index.html (lido uma vez, antes de qualquer script desenhar algo): o que os
   scripts desenham já passa por tl(). Assim o título de um site nunca é "traduzido" por engano. */
const I18N_ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
const i18nTexts = []; // [nó de texto, original]
const i18nAttrs = []; // [elemento, atributo, original]
function collectStatic() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!/[A-Za-z]/.test(n.nodeValue) || n.parentElement?.closest('script, style, [data-no-i18n]')) continue;
    i18nTexts.push([n, n.nodeValue]);
  }
  for (const el of document.body.querySelectorAll(I18N_ATTRS.map((a) => `[${a}]`).join(','))) {
    if (el.closest('[data-no-i18n]')) continue;
    for (const a of I18N_ATTRS) if (el.hasAttribute(a)) i18nAttrs.push([el, a, el.getAttribute(a)]);
  }
}
/** Aplica o idioma atual ao HTML fixo. */
function translateDom() {
  for (const [n, src] of i18nTexts) {
    const core = src.trim();
    const tr = tl(core);
    n.nodeValue = tr === core ? src : src.replace(core, tr);
  }
  for (const [el, a, src] of i18nAttrs) el.setAttribute(a, tl(src));
}
collectStatic();
translateDom();

/** Troca o idioma: guarda a escolha, traduz o HTML e avisa quem desenha a interface. */
function setLanguage(choice) {
  i18n.choice = choice;
  try { localStorage.setItem(LANG_KEY, choice); } catch { /* sem espaço */ }
  i18n.apply();
  translateDom();
  window.kona?.setLanguage?.(i18n.lang);
  if (typeof library !== 'undefined') library.changed('language');
}
window.kona?.setLanguage?.(i18n.lang); // o processo principal fica no mesmo idioma
