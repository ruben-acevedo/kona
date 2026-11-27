// O7: um perfil por janela. Abrir outro perfil abre uma janela dele (ou traz a que existe); cada
// janela guarda o seu perfil (favoritos, principal, título); abas só mudam entre janelas do mesmo
// perfil; apagar um perfil aberto noutra janela é recusado; janela sozinha e vazia troca no lugar.
const os = require('os'); const path = require('path');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-pw-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wins = () => BrowserWindow.getAllWindows().filter((w) => w.webContents.getURL().includes('index.html') && !w.webContents.getURL().includes('app='));
let fails = 0;
const check = (ok, msg) => { console.log(ok ? 'OK  ' : 'FALHA', msg); if (!ok) fails++; };
app.whenReady().then(async () => {
  let w1; while (!(w1 = wins()[0])) await sleep(50);
  await sleep(3000);
  const js = (w, c) => w.webContents.executeJavaScript(c);
  const waitWins = async (n) => { for (let i = 0; i < 80 && wins().length !== n; i++) await sleep(100); await sleep(2000); return wins(); };

  await js(w1, `settings.sounds = false; window.__B = PROFILES.create({ name: 'Work', avatar: { type: 'preset', id: AVATARS[5].id } }).id; renderProfileUI(); 0`);
  await js(w1, `newTab('about:blank', false); 0`); await sleep(500);
  const A = await js(w1, 'PROFILES.current');
  const B = await js(w1, 'window.__B');

  // 1) abrir outro perfil com abas abertas → janela nova dele
  await js(w1, `switchProfile(window.__B); 0`);
  let ws = await waitWins(2); const w2 = ws.find((w) => w !== w1);
  check(ws.length === 2, `abre uma janela nova (${ws.length} janelas)`);
  check(await js(w1, 'PROFILES.current') === A && await js(w2, 'PROFILES.current') === B, 'janela 1 continua no perfil 1; janela 2 no perfil novo');
  check(await js(w1, 'library.primary') && await js(w2, 'library.primary'), 'cada janela é a principal do seu perfil');
  check(await js(w2, 'library.partition()') !== await js(w1, 'library.partition()'), `sessões diferentes (${await js(w2, 'library.partition()')})`);
  check(/\(Work\)/.test(w2.getTitle()) && !/\(Work\)/.test(w1.getTitle()), `títulos com o perfil: "${w1.getTitle()}" | "${w2.getTitle()}"`);

  // 2) de novo → só traz a janela que existe
  await js(w1, `switchProfile(window.__B); 0`);
  ws = await waitWins(2);
  check(ws.length === 2, 'perfil já aberto: não abre outra janela');

  // 3) favoritos separados
  await js(w2, `bookmarks.add('https://example.com/work', 'Work site'); 0`); await sleep(800);
  check(!(await js(w1, `JSON.stringify(bookmarks.list).includes('example.com/work')`)), 'favorito do perfil 2 não aparece na janela do perfil 1');

  // 4) abas só entre janelas do mesmo perfil
  const others1 = await js(w1, `window.kona.otherWindows()`);
  console.log('others1', JSON.stringify(others1));
  await js(w2, `shortcut('n'); 0`);
  ws = await waitWins(3); const w3 = ws.find((w) => w !== w1 && w !== w2);
  check(await js(w3, 'PROFILES.current') === B && !(await js(w3, 'library.primary')), 'Ctrl+N na janela do perfil 2 → janela secundária do perfil 2');
  const others3 = await js(w3, `window.kona.otherWindows()`);
  console.log('others3', JSON.stringify(others3));
  check(others1.length === 0 && others3.length === 1, '"Mover para a janela" só lista janelas do mesmo perfil');

  // 5) apagar o perfil 2 com janelas abertas: recusado
  const r = await js(w1, `window.kona.profileForget(PROFILES.byId(window.__B).partition)`);
  check(r === false, 'apagar perfil com janela aberta é recusado');

  // 6) fechar as janelas do perfil 2; janela sozinha e vazia troca no lugar
  w3.close(); w2.close(); ws = await waitWins(1);
  await js(w1, `for (const t of [...tabs]) if (t.url !== START) closeTab(t.id, { force: true }); 0`); await sleep(800);
  await js(w1, `switchProfile(window.__B); 0`); await sleep(2500);
  check(wins().length === 1 && await js(w1, 'PROFILES.current') === B, 'janela sozinha e vazia: troca no próprio lugar');
  check(await js(w1, 'JSON.stringify(bookmarks.list).includes("example.com/work")'), 'e mostra os favoritos do perfil 2');
  console.log(fails ? `${fails} falha(s)` : 'tudo certo');
  app.exit(fails ? 1 : 0);
});
