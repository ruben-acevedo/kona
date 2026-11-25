// IPC só da interface do Kona. Qualquer outra origem é ignorada: páginas, extensões e frames.
// As páginas não têm acesso ao ipcRenderer, mas a checagem impede que um bug ou uma extensão
// alcance os canais que apagam dados, abrem pastas ou mudam permissões.
const { ipcMain } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const UI_URL = pathToFileURL(path.join(__dirname, 'renderer', 'index.html')).href.toLowerCase();

function fromUi(e) {
  const f = e.senderFrame;
  return !!f && e.sender.getType() === 'window' && f === e.sender.mainFrame
    && f.url.split(/[?#]/)[0].toLowerCase() === UI_URL;
}

const onUi = (channel, fn) => ipcMain.on(channel, (e, ...args) => { if (fromUi(e)) fn(e, ...args); });
const handleUi = (channel, fn) => ipcMain.handle(channel, (e, ...args) => (fromUi(e) ? fn(e, ...args) : null));

module.exports = { onUi, handleUi, fromUi };
