// Idiomas no processo principal (N5): diálogos, Windows Hello, modo leitura, importação.
// Usa os mesmos dicionários da interface (renderer/i18n/<idioma>.js); a interface avisa o idioma
// em uso, e ele fica guardado para a próxima abertura (as páginas do Chromium dependem dele: --lang).
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const DICTS = { 'pt-BR': require('./renderer/i18n/pt-BR.js'), es: require('./renderer/i18n/es.js') };
const SUPPORTED = ['en', 'pt-BR', 'es'];
let lang = 'en';

const file = () => path.join(app.getPath('userData'), 'language.json');
/** O idioma salvo (antes do app ficar pronto), para o Chromium abrir já nele. */
function startupLanguage() {
  try {
    const l = JSON.parse(fs.readFileSync(file(), 'utf8')).lang;
    if (SUPPORTED.includes(l)) lang = l;
  } catch { /* 1ª abertura: segue o sistema, a interface confirma depois */
    const sys = String(app.getPreferredSystemLanguages?.()[0] || '').toLowerCase();
    lang = sys.startsWith('pt') ? 'pt-BR' : sys.startsWith('es') ? 'es' : 'en';
  }
  return lang;
}
function setLanguage(l) {
  if (!SUPPORTED.includes(l) || l === lang) return;
  lang = l;
  fs.writeFile(file(), JSON.stringify({ lang }), () => {});
}
function tl(s, vars) {
  let r = DICTS[lang]?.[s];
  if (typeof r !== 'string' || !r) r = s;
  if (vars) r = r.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return r;
}
const currentLanguage = () => lang;

module.exports = { startupLanguage, setLanguage, tl, currentLanguage };
