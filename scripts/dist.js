// Gera o instalador do Windows a partir do WSL:
//   0. installer/KonaSetup.cs (/define:UNINSTALL) → build-extra/Kona Uninstaller.exe: a janela de
//      desinstalação, que vai dentro do app (package.json → build.extraFiles) e o Windows chama.
//   1. electron-builder → dist/Kona-<versão>-update.exe: o instalador NSIS (motor). Instala para
//      todos os usuários (Program Files, pede administrador), cria atalhos, registra a desinstalação e é o que as atualizações automáticas baixam.
//   2. installer/KonaSetup.cs → dist/Kona-Setup-<versão>.exe: a janela de instalação do Kona
//      (WPF, compilada com o csc.exe que vem no Windows), com o motor embutido rodando em silêncio.
//      É o arquivo que as pessoas baixam.
//
//   npm run dist                     → gera tudo (sem publicar)
//   npm run dist -- --installer-only → só recompila a janela de instalação (reaproveita o motor)
//   npm run dist -- --publish        → também publica um Release no GitHub (precisa do gh logado):
//                                      o Kona-Setup para baixar e o motor + latest.yml para as atualizações
//
// O empacotamento roda no Linux. O NSIS chama o "wine" para um único passo, que o
// scripts/wine-shim/wine resolve sem Wine. Temporários e cache ficam em %LOCALAPPDATA%\Kona-dev,
// num caminho que o Windows enxerga como C:\ (o csc.exe roda no Windows).
//
// Assinatura de código: com um certificado, defina CSC_LINK (arquivo .pfx) e CSC_KEY_PASSWORD antes
// de rodar; o electron-builder assina o Kona.exe e o motor. As duas janelas (Kona-Setup e
// Kona Uninstaller) ainda precisam ser assinadas com o mesmo certificado — ver ROADMAP (E1).
// Sem certificado tudo sai sem assinatura (o Windows SmartScreen avisa na 1ª instalação).
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const pkg = require(path.join(ROOT, 'package.json'));
const electronWin = require('./electron-win'); // Electron da castLabs (com Widevine)
const localAppData = execFileSync('cmd.exe', ['/c', 'echo %LOCALAPPDATA%'], { cwd: '/mnt/c', encoding: 'utf8' }).trim();
const base = execFileSync('wslpath', ['-u', path.join(localAppData, 'Kona-dev')], { encoding: 'utf8' }).trim();
const electronDist = electronWin.dirFor(base);
const work = path.join(base, 'build');
const out = path.join(work, 'dist');
const publish = process.argv.includes('--publish');
const installerOnly = process.argv.includes('--installer-only');

if (!fs.existsSync(path.join(electronDist, 'electron.exe'))) {
  console.error('Electron para Windows ainda não foi baixado: rode "npm run windows" uma vez.');
  process.exit(1);
}
if (!installerOnly) fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(work, 'tmp'), { recursive: true });

const env = {
  ...process.env,
  PATH: `${path.join(__dirname, 'wine-shim')}:${process.env.PATH}`,
  TMPDIR: path.join(work, 'tmp'),
  ELECTRON_BUILDER_CACHE: path.join(work, 'cache'),
};
if (publish) env.GH_TOKEN = env.GH_TOKEN || execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();

/* ── Compilação das janelas (instalar / desinstalar) ── */
const win = (p) => execFileSync('wslpath', ['-w', p], { encoding: 'utf8' }).trim();
const NET = '/mnt/c/Windows/Microsoft.NET/Framework64/v4.0.30319';
const v4 = `${pkg.version.split('-')[0]}.0`;

function compile({ outFile, uninstall = false, engine = null, estimatedBytes = 0 }) {
  const info = path.join(work, uninstall ? 'BuildInfoUninstall.cs' : 'BuildInfo.cs');
  fs.writeFileSync(info, `using System.Reflection;
[assembly: AssemblyTitle("Kona")]
[assembly: AssemblyDescription(${JSON.stringify(uninstall ? 'Kona Uninstaller' : 'Kona Setup')})]
[assembly: AssemblyProduct("Kona")]
[assembly: AssemblyCompany(${JSON.stringify(pkg.author.name)})]
[assembly: AssemblyCopyright(${JSON.stringify(pkg.build.copyright)})]
[assembly: AssemblyVersion("${v4}")]
[assembly: AssemblyFileVersion("${v4}")]
[assembly: AssemblyInformationalVersion("${pkg.version}")]
static class BuildInfo { public const long EstimatedBytes = ${estimatedBytes}L; }
`);
  const tmpOut = path.join(work, path.basename(outFile)); // o csc grava em C:\ e depois copiamos
  const csc = spawnSync(`${NET}/csc.exe`, [
    '/nologo', '/target:winexe', '/optimize+', '/platform:anycpu', '/codepage:65001',
    ...(uninstall ? ['/define:UNINSTALL'] : []),
    `/out:${win(tmpOut)}`,
    `/win32icon:${win(path.join(ROOT, 'assets', 'icon.ico'))}`,
    `/win32manifest:${win(path.join(ROOT, 'installer', 'app.manifest'))}`,
    ...(engine ? [`/resource:${win(engine)},payload.exe`] : []),
    `/resource:${win(path.join(ROOT, 'assets', 'icon-256.png'))},icon.png`,
    `/reference:${win(`${NET}/WPF/PresentationFramework.dll`)}`,
    `/reference:${win(`${NET}/WPF/PresentationCore.dll`)}`,
    `/reference:${win(`${NET}/WPF/WindowsBase.dll`)}`,
    `/reference:${win(`${NET}/System.Xaml.dll`)}`,
    win(path.join(ROOT, 'installer', 'KonaSetup.cs')), win(info),
  ], { cwd: work, encoding: 'utf8' });
  if (csc.status !== 0) { console.error(csc.stdout, csc.stderr); process.exit(1); }
  if (tmpOut !== outFile) { fs.mkdirSync(path.dirname(outFile), { recursive: true }); fs.copyFileSync(tmpOut, outFile); }
}

const dirSize = (d) => fs.readdirSync(d, { withFileTypes: true })
  .reduce((n, e) => n + (e.isDirectory() ? dirSize(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);

/* ── 0 e 1. Desinstalador + motor NSIS ── */
if (!installerOnly) {
  fs.rmSync(path.join(ROOT, 'build-extra'), { recursive: true, force: true });
  compile({ outFile: path.join(ROOT, 'build-extra', 'Kona Uninstaller.exe'), uninstall: true });
  execFileSync('node', [path.join(__dirname, 'licenses.js')], { cwd: ROOT, stdio: 'inherit' }); // assets/licenses.json em dia
  const r = spawnSync('npx', ['electron-builder', '--win', '--x64', '--publish', publish ? 'always' : 'never',
    `-c.electronDist=${electronDist}`, `-c.electronVersion=${electronWin.PLAIN_VERSION}`, `-c.directories.output=${out}`], { cwd: ROOT, env, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

/* ── 2. Janela de instalação (Kona-Setup) ── */
const engine = path.join(out, `Kona-${pkg.version}-update.exe`);
const setupName = `Kona-Setup-${pkg.version}.exe`;
const setup = path.join(out, setupName);
compile({ outFile: setup, engine, estimatedBytes: dirSize(path.join(out, 'win-unpacked')) });

if (publish) {
  // o electron-builder já criou o Release com o motor e o latest.yml; falta a janela de instalação
  const { owner, repo } = pkg.build.publish[0];
  execFileSync('gh', ['release', 'upload', `v${pkg.version}`, setup, '--clobber', '--repo', `${owner}/${repo}`], { stdio: 'inherit', env });
}

// traz os arquivos para dist/ do projeto
const dest = path.join(ROOT, 'dist');
fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });
for (const f of fs.readdirSync(out)) if (/\.(exe|blockmap|yml)$/.test(f)) fs.copyFileSync(path.join(out, f), path.join(dest, f));
console.log('\nInstalador:', path.join(dest, setupName));
console.log('Motor (atualizações):', path.join(dest, path.basename(engine)));
