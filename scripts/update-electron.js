// Rotina mensal, passo 1: sobe o Electron/Chromium para a versão estável mais nova da castLabs
// (com Widevine). Troca a versão em scripts/electron-win.js e o Electron oficial do npm (o do
// WSL/Linux) para a mesma versão. O download para Windows acontece no próximo "npm run windows".
//
//   npm run update-electron            → só a mesma versão principal (ex.: 45.x → 45.y; mais seguro)
//   npm run update-electron -- --major → aceita também uma versão principal nova (46, 47…)
//
// Depois: npm run test:windows (suíte completa) e, passando, npm run release.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(__dirname, 'electron-win.js');
const { VERSION } = require('./electron-win');
const major = process.argv.includes('--major');

const parse = (v) => v.replace(/^v/, '').split('+')[0].split('.').map(Number);
const newer = (a, b) => { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]; return false; };

(async () => {
  const res = await fetch('https://api.github.com/repos/castlabs/electron-releases/releases?per_page=60', {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'kona-build' },
  });
  if (!res.ok) throw new Error(`GitHub respondeu ${res.status}`);
  const current = parse(VERSION);
  const stable = (await res.json())
    .filter((r) => !r.prerelease && !r.draft && /^v\d+\.\d+\.\d+\+wvcus$/.test(r.tag_name))
    .filter((r) => major || parse(r.tag_name)[0] === current[0]);
  const best = stable.reduce((b, r) => (!b || newer(parse(r.tag_name), parse(b.tag_name)) ? r : b), null);
  if (!best || !newer(parse(best.tag_name), current)) {
    console.log(`O Electron já está na versão mais nova${major ? '' : ` da linha ${current[0]}`}: ${VERSION}.`);
    return;
  }
  const tag = best.tag_name;
  const plain = tag.slice(1).split('+')[0];
  console.log(`Electron ${VERSION} → ${tag.slice(1)} (publicado em ${best.published_at.slice(0, 10)})`);
  const src = fs.readFileSync(FILE, 'utf8');
  fs.writeFileSync(FILE, src.replace(/const TAG = '[^']+';/, `const TAG = '${tag}';`));
  execFileSync('npm', ['install', '--save-dev', '--save-exact=false', `electron@^${plain}`], { cwd: ROOT, stdio: 'inherit' });
  console.log(`\nPronto. Agora: npm run test:windows (baixa o Electron novo e roda a suíte completa);
passando, npm run release.`);
})().catch((e) => { console.error(e.message); process.exit(1); });
