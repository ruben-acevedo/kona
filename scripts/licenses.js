// Gera assets/licenses.json: as licenças de tudo o que vai dentro do app (O4).
//
//   node scripts/licenses.js
//
// Entram as dependências de produção (diretas e indiretas, como o npm as instala) com o texto da
// licença de cada uma, e as fontes de dados usadas pelo Kona. O Chromium tem o próprio arquivo
// (LICENSES.chromium.html, ao lado do Kona.exe), aberto pela tela de licenças.
// Rodado pelo scripts/dist.js antes de empacotar; o resultado fica no repositório.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'licenses.json');

const MIT = (holder) => `MIT License

Copyright (c) ${holder}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

const authorOf = (p) => (typeof p.author === 'string' ? p.author : p.author?.name || '').replace(/\s*[<(].*$/, '').trim();
const repoUrl = (p) => {
  const r = typeof p.repository === 'string' ? p.repository : p.repository?.url || '';
  const gh = r.match(/github(?:\.com[/:]|:)([^/]+\/[^/.#]+)/);
  if (gh) return `https://github.com/${gh[1]}`;
  if (/^[\w.-]+\/[\w.-]+$/.test(r)) return `https://github.com/${r}`; // "dono/repo"
  return p.homepage || `https://www.npmjs.com/package/${p.name}`;
};

const dirs = execFileSync('npm', ['ls', '--omit=dev', '--all', '--parseable'], { cwd: ROOT, encoding: 'utf8' })
  .trim().split('\n').slice(1); // a 1ª linha é o próprio Kona
const seen = new Set();
const packages = [];
for (const dir of dirs) {
  const p = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const id = `${p.name}@${p.version}`;
  if (seen.has(id)) continue;
  seen.add(id);
  const file = fs.readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(f));
  const license = typeof p.license === 'string' ? p.license : (p.licenses || []).map((l) => l.type || l).join(' OR ');
  let text = file ? fs.readFileSync(path.join(dir, file), 'utf8').trim() : '';
  if (!text && license === 'MIT') text = MIT(authorOf(p) || `${p.name} contributors`).trim(); // pacote sem o arquivo
  if (!text) throw new Error(`${id}: sem texto de licença (${license || 'licença desconhecida'})`);
  packages.push({ name: p.name, version: p.version, license, url: repoUrl(p), text });
}
packages.sort((a, b) => a.name.replace(/^@/, '').localeCompare(b.name.replace(/^@/, '')));

// Listas abertas da proteção contra golpes e malware (safe-browsing.js)
const data = [
  { name: 'URLhaus (malware-filter)', license: 'CC0-1.0 / MIT', url: 'https://gitlab.com/malware-filter/urlhaus-filter', note: 'Malicious URLs from abuse.ch URLhaus, packaged by malware-filter.' },
  { name: 'OpenPhish Community Feed', license: 'OpenPhish terms of use', url: 'https://openphish.com/', note: 'Free phishing feed for non-commercial use.' },
  { name: 'Phishing.Database', license: 'MIT', url: 'https://github.com/mitchellkrogza/Phishing.Database', note: 'Active phishing domains.' },
];

// O próprio Kona e o Electron (a mesma licença vale para a versão da castLabs, com o Widevine)
const kona = { name: 'Kona', license: 'MIT', url: 'https://github.com/ruben-acevedo/kona', text: fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8').trim() };
const electron = { name: 'Electron', license: 'MIT', url: 'https://github.com/electron/electron', text: fs.readFileSync(path.join(ROOT, 'node_modules/electron/dist/LICENSE'), 'utf8').trim() };

fs.writeFileSync(OUT, `${JSON.stringify({ kona, electron, packages, data }, null, 1)}\n`);
console.log(`assets/licenses.json: ${packages.length} pacotes, ${data.length} fontes de dados`);
