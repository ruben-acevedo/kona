// Atualização automática (só no app instalado). Procura uma versão nova nos Releases do GitHub
// ao abrir e a cada 4 horas, baixa em segundo plano e instala quando o Kona é fechado.
// A interface só recebe um aviso de que a atualização está pronta.
const { app } = require('electron');
const { onUi } = require('./ipc');

const EVERY = 4 * 60 * 60 * 1000;

function startUpdater(win) {
  if (!app.isPackaged || process.env.KONA_NO_UPDATE) return;
  let autoUpdater;
  try { ({ autoUpdater } = require('electron-updater')); } catch { return; }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', (info) => win()?.webContents.send('update:ready', { version: info.version }));
  // "Reiniciar agora" no aviso: fecha, instala e abre o Kona de novo (as abas voltam como estavam)
  onUi('update:install', () => autoUpdater.quitAndInstall(true, true));
  autoUpdater.on('error', () => { /* sem rede ou sem versão publicada: tenta de novo mais tarde */ });
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 15000); // depois que o app terminou de abrir
  setInterval(check, EVERY);
}

module.exports = { startUpdater };
