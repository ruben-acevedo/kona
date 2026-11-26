// Roda o Kona nativo no Windows a partir do WSL.
// No WSLg, a janela é transmitida para o Windows (como uma área de trabalho remota) e
// redimensionar fica travado. Nativo no Windows, quem cuida da janela é o próprio Windows:
// redimensionar é liso e maximizar/encaixar ganham as animações do sistema.
//
// O que faz: baixa (uma vez) o Electron para Windows, copia o app para
// %LOCALAPPDATA%\Kona-dev\app e abre o electron.exe. Não precisa de Node no Windows.
//
//   npm run windows                 → abre o app no Windows
//   npm run test:windows            → roda a suíte de testes nativa no Windows
//                                     (relatório em tests/output-windows/report.md)
//   npm run test:windows -- --net   → inclui sites reais
//   npm run test:windows -- --only=configuracoes → só algumas suítes (teste por feature; só a passada cold)
//   node scripts/windows.js --run=tests/debug/x.js → roda um script avulso (diagnóstico) no Electron do Windows
const { execFileSync, spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const version = require(path.join(ROOT, 'node_modules/electron/package.json')).version;

function winToWsl(p) {
  return execFileSync('wslpath', ['-u', p], { encoding: 'utf8' }).trim();
}
function wslToWin(p) {
  return execFileSync('wslpath', ['-w', p], { encoding: 'utf8' }).trim();
}

const localAppData = execFileSync('cmd.exe', ['/c', 'echo %LOCALAPPDATA%'], { cwd: '/mnt/c', encoding: 'utf8' }).trim();
const base = path.join(winToWsl(localAppData), 'Kona-dev');
const electronDir = path.join(base, `electron-${version}`);
const electronExe = path.join(electronDir, 'electron.exe');
// os testes usam uma cópia separada, para não mexer num Kona que esteja aberto
const RUN = (process.argv.find((a) => a.startsWith('--run=')) || '').slice(6);
const appDir = path.join(base, process.argv.includes('--test') || RUN ? 'app-test' : 'app');

async function ensureElectron() {
  if (fs.existsSync(electronExe)) return;
  console.log(`Baixando Electron ${version} para Windows (só na primeira vez)…`);
  const { downloadArtifact } = require('@electron/get');
  const AdmZip = require('adm-zip');
  const zip = await downloadArtifact({ version, artifactName: 'electron', platform: 'win32', arch: 'x64' });
  fs.mkdirSync(electronDir, { recursive: true });
  new AdmZip(zip).extractAllTo(electronDir, true);
}

const SKIP_MODULES = new Set(['electron', '@electron', '@electron-internal', '.bin', '.package-lock.json']);

function syncApp() {
  fs.rmSync(appDir, { recursive: true, force: true });
  fs.mkdirSync(appDir, { recursive: true });
  for (const f of ['main.js', 'preload.js', 'page-preload.js', 'ipc.js', 'updater.js', 'session-policy.js', 'importer.js', 'downloads.js', 'context-menu.js', 'package.json']) fs.copyFileSync(path.join(ROOT, f), path.join(appDir, f));
  fs.cpSync(path.join(ROOT, 'renderer'), path.join(appDir, 'renderer'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'assets'), path.join(appDir, 'assets'), { recursive: true });
  for (const m of fs.readdirSync(path.join(ROOT, 'node_modules'))) {
    if (SKIP_MODULES.has(m)) continue;
    fs.cpSync(path.join(ROOT, 'node_modules', m), path.join(appDir, 'node_modules', m), { recursive: true, dereference: true });
  }
  // a suíte de testes vai junto (sem resultados antigos nem diagnósticos)
  fs.cpSync(path.join(ROOT, 'tests'), path.join(appDir, 'tests'), {
    recursive: true,
    filter: (src) => !/[\\/]tests[\\/](output|output-windows)([\\/]|$)/.test(src),
  });
}

function runTests() {
  const args = process.argv.slice(2);
  const out = path.join(base, 'test-output');
  const local = path.join(ROOT, 'tests', 'output-windows');
  fs.rmSync(out, { recursive: true, force: true });
  fs.rmSync(local, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const passes = [];
  const only = (args.find((a) => a.startsWith('--only=')) || '').slice(7);
  for (const pass of only ? ['cold'] : ['cold', 'warm']) {
    console.log(`\n━━━ Windows · passada “${pass}” ━━━`);
    const env = {
      ...process.env,
      KONA_TEST_PASS: pass,
      KONA_TEST_OUT: out,
      KONA_TEST_PROFILE: path.join(out, 'profile'),
      KONA_TEST_NET: args.includes('--net') ? '1' : '0',
      KONA_TEST_UPDATE_BASELINE: args.includes('--update-baseline') ? '1' : '0',
      KONA_TEST_ONLY: only,
      // /p converte os caminhos do WSL para caminhos do Windows
      WSLENV: 'KONA_TEST_PASS:KONA_TEST_OUT/p:KONA_TEST_PROFILE/p:KONA_TEST_NET:KONA_TEST_UPDATE_BASELINE:KONA_TEST_ONLY',
    };
    spawnSync(electronExe, [wslToWin(path.join(appDir, 'tests', 'harness.js'))], { cwd: electronDir, env, stdio: ['ignore', 'inherit', 'ignore'] });
    const file = path.join(out, `results-${pass}.json`);
    passes.push(fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8'))
      : { pass, results: [{ pass, suite: 'harness', name: 'a passada não gerou resultados', status: 'FAIL', detail: '' }] });
  }
  fs.mkdirSync(local, { recursive: true });
  if (fs.existsSync(path.join(out, 'screens'))) fs.cpSync(path.join(out, 'screens'), path.join(local, 'screens'), { recursive: true });
  const winBaseline = path.join(appDir, 'tests', 'baseline', 'win32');
  if (fs.existsSync(winBaseline)) fs.cpSync(winBaseline, path.join(ROOT, 'tests', 'baseline', 'win32'), { recursive: true });
  const { buildReport } = require('./report');
  const { pass, warn, fail } = buildReport(passes, path.join(local, 'report.md'), 'Windows nativo');
  console.log(`\n${pass} ok · ${warn} alertas · ${fail} falhas — relatório em tests/output-windows/report.md`);
  process.exit(fail ? 1 : 0);
}

(async () => {
  await ensureElectron();
  if (RUN) {
    syncApp();
    // variáveis KONA_* do WSL seguem para o script (ex.: KONA_PROBE_MODE)
    const pass = Object.keys(process.env).filter((k) => k.startsWith('KONA_'));
    const env = { ...process.env, WSLENV: [process.env.WSLENV, ...pass].filter(Boolean).join(':') };
    const r = spawnSync(electronExe, [wslToWin(path.join(appDir, RUN))], { cwd: electronDir, env, stdio: ['ignore', 'inherit', 'inherit'] });
    process.exit(r.status ?? 0);
  }
  if (process.argv.includes('--test')) {
    console.log('Copiando app e testes para', wslToWin(appDir));
    syncApp();
    runTests();
    return;
  }
  console.log('Copiando o app para', wslToWin(appDir));
  syncApp();
  // Dados do Kona de desenvolvimento em %APPDATA%\Kona-dev, separados do Kona instalado
  // (%APPDATA%\Kona), que criptografa os cookies. Na 1ª vez, copia os dados que já existiam.
  const appData = winToWsl(execFileSync('cmd.exe', ['/c', 'echo %APPDATA%'], { cwd: '/mnt/c', encoding: 'utf8' }).trim());
  const devData = path.join(appData, 'Kona-dev');
  const oldData = path.join(appData, 'Kona');
  if (!fs.existsSync(devData) && fs.existsSync(oldData)) {
    console.log('Copiando os dados atuais para', wslToWin(devData), '(só desta vez)…');
    fs.cpSync(oldData, devData, { recursive: true, force: false, errorOnExist: false });
  }
  const child = spawn(electronExe, [wslToWin(appDir)], {
    cwd: electronDir, // pasta do Windows, evita aviso de caminho UNC
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, KONA_USER_DATA: wslToWin(devData), WSLENV: [process.env.WSLENV, 'KONA_USER_DATA'].filter(Boolean).join(':') },
  });
  child.unref();
  console.log('Kona aberto no Windows.');
})().catch((err) => {
  console.error('Falha ao abrir no Windows:', err.message);
  process.exit(1);
});
