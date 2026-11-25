// Fumaça: barra de endereço com sugestões e perfis (capturas em tests/output/smoke-*.png).
const path = require('path'); const fs = require('fs');
const OUT = path.join(__dirname, '..', 'output'); fs.mkdirSync(OUT, { recursive: true });
process.env.KONA_USER_DATA = path.join(OUT, 'smoke-profile');
fs.rmSync(process.env.KONA_USER_DATA, { recursive: true, force: true });
require('../../main.js');
const { app, BrowserWindow } = require('electron');
const startServer = require('../fixtures/server');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const { base } = await startServer();
  process.env.KONA_SUGGEST_URL = base + '/complete/search';
  let wc; while (!(wc = BrowserWindow.getAllWindows()[0]?.webContents)) await sleep(50);
  const errors = [];
  wc.on('console-message', (e, l, m) => { const lv = e?.level ?? l; const msg = e?.message ?? m; if ((lv === 'error' || lv === 3) && !/Failed to load resource/.test(msg)) errors.push(msg); });
  await sleep(4000);
  const js = (c) => wc.executeJavaScript(c, true);
  const shot = async (n) => fs.writeFileSync(path.join(OUT, `smoke-${n}.png`), (await wc.capturePage()).toPNG());
  // buscas anteriores
  await js(`browseHistory.addSearch('hello world'); browseHistory.addSearch('hello kitty'); browseHistory.addVisit('https://github.com/electron/electron', 'GitHub - electron/electron'); 0`);
  await js(`focusAddress(); 0`); await sleep(400);
  console.log('R vazio:', await js(`[...document.querySelectorAll('#omnibox .om-row')].map((r) => r.innerText.trim()).join(' | ')`));
  await shot('omnibox-vazio');
  wc.insertText('hel'); await sleep(600);
  console.log('R "hel":', await js(`[...document.querySelectorAll('#omnibox .om-row')].map((r) => r.innerText.trim()).join(' | ')`));
  await shot('omnibox-hel');
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'Down' }); await sleep(100);
  console.log('R seta ↓ → campo:', await js(`document.activeElement.value`));
  await js(`document.activeElement.blur(); 0`); await sleep(300);
  // perfis
  await js(`toggleSidebar(); 0`); await sleep(500);
  await js(`toggleProfilePop(true); 0`); await sleep(400); await shot('perfis-menu');
  await js(`toggleProfilePop(false); openProfileSheet('new'); 0`); await sleep(600); await shot('perfil-novo');
  await js(`saveProfile(); 0`); await sleep(1500);
  console.log('R perfis:', await js(`JSON.stringify(PROFILES.list.map((p) => [p.name, p.partition]))`), 'atual:', await js('PROFILES.current'));
  console.log('R histórico no novo perfil:', await js('browseHistory.data.searches.length'));
  await js(`newTab(${JSON.stringify(base + '/text')}, false); 0`); await sleep(1200);
  console.log('R partição da aba:', await js(`active().wv.getAttribute('partition')`));
  await shot('perfil-trocado');
  console.log('R erros no console:', errors.length ? errors.join(' | ') : 'nenhum');
  app.exit(0);
});
