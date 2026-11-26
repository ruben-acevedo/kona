// Registro VMP da castLabs (package.json → build.afterSign, depois de o electron-builder gravar ícone e versão no .exe): assina o Kona.exe empacotado para que
// Netflix e outros serviços com Widevine aceitem tocar. Usa a conta EVS gratuita do autor, já logada
// em ~/.config/evs (ferramenta em ~/.local/kona-evs: python -m venv + pip install castlabs-evs).
//
// Sem a ferramenta, o build segue com um aviso (o Widevine funciona, mas a Netflix recusa).
// KONA_REQUIRE_VMP=1 faz o build falhar nesse caso (para versões publicadas).
//
// Ordem: o VMP precisa ser a última mudança no .exe. Quando houver certificado de assinatura de código
// (Authenticode), a assinatura VMP deve vir DEPOIS dela — mover esta etapa para depois do signtool.
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PY = path.join(os.homedir(), '.local', 'kona-evs', 'bin', 'python');

exports.default = async function evsSign(context) {
  if (context.electronPlatformName !== 'win32') return;
  if (!fs.existsSync(PY)) {
    const msg = 'castLabs EVS não encontrado: o Kona sai sem registro VMP (Netflix não vai tocar).';
    if (process.env.KONA_REQUIRE_VMP) throw new Error(msg);
    console.warn(`\n⚠ ${msg}\n`);
    return;
  }
  // -H: o executável principal (sem a dica, a ferramenta pode pegar o "Kona Uninstaller.exe")
  const hint = ['-H', context.packager.appInfo.productFilename];
  for (const f of fs.readdirSync(context.appOutDir)) if (/uninstaller\.exe\.sig$/i.test(f)) fs.rmSync(path.join(context.appOutDir, f));
  for (const args of [['sign-pkg', ...hint, context.appOutDir], ['verify-pkg', ...hint, context.appOutDir]]) {
    const r = spawnSync(PY, ['-m', 'castlabs_evs.vmp', '-n', ...args], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`castLabs EVS: "${args[0]}" falhou (código ${r.status})`);
  }
};
