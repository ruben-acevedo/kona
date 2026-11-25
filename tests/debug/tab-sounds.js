// Sons de abrir/fechar aba e a visão geral atualizando com Ctrl+T aberta.
const os = require('os'); const path = require('path');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-tabsfx-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  let wc; while (!(wc = BrowserWindow.getAllWindows()[0]?.webContents)) await sleep(50);
  await sleep(3500);
  wc.on('console-message', (e) => { if (e.level === 'error' || /Uncaught/.test(e.message)) console.log('C erro:', e.message); });
  const js = (c) => wc.executeJavaScript(c);
  await js('window.__sfxLog = []; 0');
  const key = async (keyCode, modifiers = []) => { wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers }); wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers }); await sleep(450); };
  const take = async (label) => console.log('R', label.padEnd(28), JSON.stringify(await js('window.__sfxLog.splice(0)')));
  const ov = async (label) => console.log('R', label.padEnd(28), JSON.stringify(await js(`({ abas: tabs.length, cartoes: document.querySelectorAll('#ov-grid .ov-card').length, sel: ovSel, novaSel: tabs.indexOf(active()) === ovSel })`)));
  await key('T', ['control']); await take('Ctrl+T');
  await key('W', ['control']); await take('Ctrl+W');
  await key('V', ['alt']); await js('window.__sfxLog.splice(0); 0'); await ov('visão geral aberta');
  await key('T', ['control']); await take('Ctrl+T com a visão geral'); await ov('depois do Ctrl+T');
  await key('T', ['control']); await ov('mais um Ctrl+T');
  app.exit(0);
});
