// Ambiente para iniciar o Electron. No WSL, aponta o Chromium para a GPU real (driver D3D12 do Mesa);
// sem isso ele cai na renderização por software (llvmpipe) e tudo fica lento.
const fs = require('fs');

function isWsl() {
  try { return /microsoft/i.test(fs.readFileSync('/proc/version', 'utf8')); } catch { return false; }
}

function launchEnv(extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  const flags = [];
  if (isWsl() && fs.existsSync('/usr/lib/wsl/lib')) {
    env.GALLIUM_DRIVER ??= 'd3d12';
    env.LD_LIBRARY_PATH = ['/usr/lib/wsl/lib', env.LD_LIBRARY_PATH].filter(Boolean).join(':');
    flags.push('--ignore-gpu-blocklist');
  }
  return { env, flags };
}

module.exports = { launchEnv, isWsl };
