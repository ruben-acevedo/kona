// Executa a suíte de testes (tests/harness.js) e gera tests/output/report.md.
//
//   npm test                      → duas passadas: perfil novo ("cold") e perfil reaproveitado ("warm")
//   npm test -- --net             → inclui sites reais (Wikipedia, GitHub)
//   npm test -- --update-baseline → regrava as capturas de referência em tests/baseline/
//   npm test -- --only=endereco   → só algumas suítes (teste focado numa feature; só a passada cold)
//     suítes: abertura, primeiras, paginas, abas, janela, bugs, endereco, menu, biblioteca, sugestoes, perfis, visual
//
// O app abre na tela durante os testes. Não use o mouse enquanto rodam.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const electron = require('electron');
const { launchEnv } = require('./env');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'tests', 'output');
const PROFILE = path.join(OUT, 'profile');
const args = process.argv.slice(2);
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').slice(7);

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

function run(pass) {
  console.log(`\n━━━ Passada “${pass}” ━━━`);
  const { env, flags } = launchEnv({
    KONA_TEST_PASS: pass,
    KONA_TEST_OUT: OUT,
    KONA_TEST_PROFILE: PROFILE,
    KONA_TEST_NET: args.includes('--net') ? '1' : '0',
    KONA_TEST_UPDATE_BASELINE: args.includes('--update-baseline') ? '1' : '0',
    KONA_TEST_ONLY: ONLY,
  });
  spawnSync(electron, [path.join(ROOT, 'tests', 'harness.js'), ...flags], { stdio: ['ignore', 'inherit', 'ignore'], env, cwd: ROOT });
  const file = path.join(OUT, `results-${pass}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { pass, results: [{ pass, suite: 'harness', name: 'a passada não gerou resultados', status: 'FAIL', detail: '' }] };
}

const passes = ONLY ? [run('cold')] : [run('cold'), run('warm')];
const { buildReport } = require('./report');
const { pass, warn, fail } = buildReport(passes, path.join(OUT, 'report.md'), 'WSL / Linux');
console.log(`\n${pass} ok · ${warn} alertas · ${fail} falhas — relatório em tests/output/report.md`);
process.exit(fail ? 1 : 0);
