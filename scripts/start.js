// Inicia o Kona (no WSL, com aceleração pela placa de vídeo; veja env.js).
const { spawn } = require('child_process');
const path = require('path');
const electron = require('electron');
const { launchEnv } = require('./env');

const { env, flags } = launchEnv();
const child = spawn(electron, ['.', ...process.argv.slice(2), ...flags], {
  stdio: 'inherit', env, cwd: path.join(__dirname, '..'),
});
child.on('exit', (code) => process.exit(code ?? 0));
