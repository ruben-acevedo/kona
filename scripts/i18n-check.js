// Confere as traduções da interface (N5).
//
//   node scripts/i18n-check.js            → chaves usadas (tl('…'), tln(…), HTML fixo) sem tradução em pt-BR/es
//   node scripts/i18n-check.js --loose    → também os textos com cara de interface que não passam por t()
//   node scripts/i18n-check.js --keys     → imprime todas as chaves (JSON), para montar um dicionário
//
// A chave é o próprio texto em inglês. Arquivos: a interface (renderer/*.js, renderer/index.html) e o
// processo principal (arquivos .js da raiz que usam tl de ./i18n).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LANGS = ['pt-BR', 'es'];
const args = process.argv.slice(2);

const rendererFiles = fs.readdirSync(path.join(ROOT, 'renderer')).filter((f) => f.endsWith('.js') && f !== 'i18n.js').map((f) => `renderer/${f}`);
const mainFiles = fs.readdirSync(ROOT).filter((f) => f.endsWith('.js') && fs.readFileSync(path.join(ROOT, f), 'utf8').includes("require('./i18n')"));
const files = [...rendererFiles, ...mainFiles];

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const unquote = (q) => {
  const body = q.slice(1, -1);
  try { return JSON.parse(`"${body.replace(/\\'/g, "'").replace(/"/g, '\\"').replace(/\\\\"/g, '\\"')}"`); } catch { return body; }
};
const LIT = String.raw`'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"`;

/** Chaves usadas: tl('x'), tln(n, 'x', 'y'), e listas marcadas como traduzíveis. */
const keys = new Map(); // chave → arquivos
const addKey = (k, f) => { if (!keys.has(k)) keys.set(k, new Set()); keys.get(k).add(f); };
const loose = [];
for (const f of files) {
  const src = stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\*i18n\*\//g, 'I18N$'));
  for (const m of src.matchAll(new RegExp(String.raw`(?<![\w$.])tl\(\s*(${LIT})`, 'g'))) addKey(unquote(m[1]), f);
  for (const m of src.matchAll(new RegExp(String.raw`(?<![\w$.])tln\([^,]+,\s*(${LIT})\s*,\s*(${LIT})`, 'g'))) { addKey(unquote(m[1]), f); addKey(unquote(m[2]), f); }
  // textos em listas constantes traduzidos onde são usados: marcados com /*i18n*/ antes da string
  const raw = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const m of raw.matchAll(new RegExp(String.raw`/\*i18n\*/\s*(${LIT})`, 'g'))) addKey(unquote(m[1]), f);
  if (args.includes('--loose')) {
    for (const m of src.matchAll(new RegExp(LIT + '|`(?:[^`\\\\]|\\\\.)*`', 'g'))) {
      const s = m[0];
      const before = src.slice(Math.max(0, m.index - 4), m.index);
      
      if (/\btl\($|\btln\([^)]*$/.test(src.slice(Math.max(0, m.index - 40), m.index))) continue;
      if (src.slice(Math.max(0, m.index - 5), m.index) === 'I18N$') continue;
      const plain = s.slice(1, -1).replace(/\$\{[^}]*\}/g, '').replace(/<[^>]+>/g, ' ').trim();
      if (!/[A-Z][a-z]+(\s|[.,…!?’'])/.test(plain) && !/^[A-Z][a-z]+(?:\s[a-z]+)*[.…]?$/.test(plain)) continue;
      if (/^(https?:|#|\.|\/|data:|kona:|crx:|view-source:)/.test(plain)) continue;
      loose.push(`${f}:${src.slice(0, m.index).split('\n').length}  ${s.slice(0, 110)}`);
    }
  }
}

/** HTML fixo: textos e atributos (title, placeholder, aria-label, alt). */
const html = fs.readFileSync(path.join(ROOT, 'renderer', 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
const body = html.slice(html.indexOf('<body'));
for (const m of body.matchAll(/>([^<]+)</g)) {
  const s = m[1].replace(/\s+/g, ' ').trim();
  if (/[A-Za-z]/.test(s) && !/^&\w+;$/.test(s)) addKey(s.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' '), 'renderer/index.html');
}
for (const m of body.matchAll(/\s(?:title|placeholder|aria-label|alt)="([^"]*[A-Za-z][^"]*)"/g)) addKey(m[1].replace(/&amp;/g, '&'), 'renderer/index.html');

if (args.includes('--keys')) { console.log(JSON.stringify([...keys.keys()].sort(), null, 1)); process.exit(0); }

let missing = 0;
for (const lang of LANGS) {
  let dict = {};
  try { dict = require(path.join(ROOT, 'renderer', 'i18n', `${lang}.js`)); } catch (e) { console.log(`${lang}: erro ao ler o dicionário: ${e.message}`); }
  const miss = [...keys.keys()].filter((k) => typeof dict[k] !== 'string' || !dict[k]);
  const unused = Object.keys(dict).filter((k) => !keys.has(k));
  missing += miss.length;
  console.log(`${lang}: ${keys.size - miss.length}/${keys.size} traduzidas${unused.length ? ` · ${unused.length} sem uso` : ''}`);
  for (const k of miss.slice(0, 400)) console.log(`   falta: ${JSON.stringify(k)}  (${[...keys.get(k)].join(', ')})`);
  if (args.includes('--unused')) for (const k of unused) console.log(`   sem uso: ${JSON.stringify(k)}`);
}
if (loose.length) { console.log(`\nTextos fora de t() (${loose.length}):`); for (const l of loose) console.log(`   ${l}`); }
process.exitCode = missing ? 1 : 0;
