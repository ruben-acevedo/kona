// Primeira abertura: "Crie seu perfil" (nome + avatar), sem cancelar nem Esc; depois a oferta de
// importar. Sem a opção "Inicial". Perfil temporário zerado (KONA_WELCOME liga as ofertas do 1º uso).
const os = require('os'); const path = require('path'); const fs = require('fs');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-first-${process.pid}`);
process.env.KONA_WELCOME = '1';
require('../../main.js');
const { app, BrowserWindow } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('R', ...a);
const OUT = path.join(os.tmpdir(), 'kona-first-shots');
fs.mkdirSync(OUT, { recursive: true });

app.whenReady().then(async () => {
  let w; while (!(w = BrowserWindow.getAllWindows()[0])) await sleep(50);
  await sleep(4500);
  const wc = w.webContents; wc.setAudioMuted(true);
  const js = (c) => wc.executeJavaScript(c);
  const st = () => js(`({ aberta: document.querySelector('#profile-sheet').classList.contains('show'), titulo: document.querySelector('#pf-title').textContent,
    botao: document.querySelector('#pf-save').textContent, cancelar: !document.querySelector('#pf-cancel').hidden, fechar: !document.querySelector('#pf-close').hidden,
    nome: document.querySelector('#pf-name').value, dica: document.querySelector('#pf-name').placeholder, importar: document.querySelector('#import-sheet').classList.contains('show') })`);
  log('abriu sozinho →', JSON.stringify(await st()));
  log('   sem "Inicial":', await js("!document.querySelector('#pf-grid [data-av=\"inicial\"]') && !AVATARS.some((a) => a.id === 'inicial')"), '· grupos:', await js("document.querySelectorAll('#pf-grid [data-group]').length"));
  await fs.promises.writeFile(path.join(OUT, 'welcome.png'), (await wc.capturePage()).toPNG());
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' }); await sleep(400);
  log('Esc não fecha:', (await st()).aberta);
  await js("document.querySelector('#pf-grid [data-group=\"halloween\"]').click(); 0"); await sleep(300);
  await js("document.querySelector('#pf-variants [data-av=\"halloween-ghost\"]').click(); 0"); await sleep(200);
  await js("document.getElementById('pf-name').focus(); 0");
  wc.insertText('Ruben'); await sleep(200);
  await js("document.querySelector('#pf-save').click(); 0"); await sleep(600);
  log('Começar →', JSON.stringify(await js("({ nome: PROFILES.currentProfile().name, avatar: PROFILES.currentProfile().avatar.id, perfis: PROFILES.list.length, pendente: PROFILES.needsSetup, menu: document.querySelector('#sb-profile .pf-name').textContent })")));
  await sleep(2200);
  log('depois vem a importação (se houver navegador para importar):', JSON.stringify(await st()), '· navegadores:', (await js('api.importSources()')).length);
  app.exit(0);
});
