// Publica uma versão nova do Kona no GitHub (o passo final da rotina mensal).
//
//   npm run release           → sobe o último número (0.2.0 → 0.2.1)
//   npm run release -- 0.3.0  → uma versão escolhida
//
// Confere que está na main, sem mudanças pendentes e igual ao GitHub; troca a versão no
// package.json, faz o commit "Release vX", envia, gera o instalador e cria o Release vX com o
// Kona-Setup (para baixar), o motor e o latest.yml (que o Kona instalado consulta para se atualizar).
// Rodar antes a suíte completa: npm run test:windows.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PKG = path.join(ROOT, 'package.json');
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', ...opts });
const releaseNotes = (v) => `**To install Kona, download \`Kona-Setup-${v}.exe\`** below and run it.

Windows may show a blue "Windows protected your PC" screen the first time, because the installer isn't signed yet: click **More info → Run anyway**.

Already have Kona? It updates itself — no need to download anything.

<sub>The other files (\`Kona-${v}-update.exe\`, \`.blockmap\`, \`latest.yml\`) are used by the automatic updater.</sub>`;
const fail = (msg) => { console.error(msg); process.exit(1); };

const branch = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
if (branch !== 'main') fail(`Publicar só a partir da main (agora: ${branch}).`);
if (sh('git', ['status', '--porcelain']).trim()) fail('Há mudanças não salvas em commit. Faça o commit antes de publicar.');
sh('git', ['fetch', '-q', 'origin', 'main']);
if (sh('git', ['rev-list', '--count', 'HEAD..origin/main']).trim() !== '0') fail('O GitHub tem commits que não estão aqui. Rode git pull antes.');

const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'));
const arg = process.argv.slice(2).find((a) => /^\d+\.\d+\.\d+$/.test(a));
const [a, b, c] = pkg.version.split('-')[0].split('.').map(Number);
const version = arg || `${a}.${b}.${c + 1}`;
const tag = `v${version}`;
if (sh('git', ['tag', '--list', tag]).trim() || sh('git', ['ls-remote', '--tags', 'origin', tag]).trim()) fail(`A versão ${tag} já existe.`);

console.log(`Publicando o Kona ${version} (antes: ${pkg.version})…`);
if (version !== pkg.version) {
  fs.writeFileSync(PKG, fs.readFileSync(PKG, 'utf8').replace(/"version": "[^"]+"/, `"version": "${version}"`));
  sh('git', ['commit', '-q', '-am', `Release ${tag}`]);
}
sh('git', ['push', '-q', 'origin', 'main'], { stdio: 'inherit' });
// o electron-builder cria o Release e a tag vX no commit atual da main
sh('node', ['scripts/dist.js', '--publish'], { stdio: 'inherit' });
const { owner, repo } = pkg.build.publish[0];
// texto da página da versão: diz qual arquivo baixar (os outros são do atualizador)
sh('gh', ['release', 'edit', tag, '--repo', `${owner}/${repo}`, '--notes', releaseNotes(version)]);
console.log(`\nPublicado: https://github.com/${owner}/${repo}/releases/tag/${tag}`);
