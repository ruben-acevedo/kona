// C3: favoritos padrão novos, migração da lista antiga, botão "+" e folha de adicionar.
const os = require('os'); const fs = require('fs'); const path = require('path');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-fav-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = path.join(__dirname, '..', 'output-windows'); fs.mkdirSync(OUT, { recursive: true });
app.whenReady().then(async () => {
  let wc; while (!(wc = BrowserWindow.getAllWindows()[0]?.webContents)) await sleep(50);
  await sleep(4000);
  wc.on('console-message', (e) => { if (e.level === 'error' || /Uncaught/.test(e.message)) console.log('C erro:', e.message); });
  const js = (c) => wc.executeJavaScript(c);
  const log = (...a) => console.log('R', ...a);
  const labels = () => js(`[...document.querySelectorAll('#fav-grid .fav-item')].map((b) => b.querySelector('.label').textContent).join(', ')`);
  log('padrão:', await labels());
  fs.writeFileSync(path.join(OUT, 'favorites.png'), (await wc.capturePage()).toPNG());

  // lista antiga intocada → vira a nova
  await js(`localStorage.setItem(profileKey('bookmarks'), JSON.stringify(['https://pt.wikipedia.org','https://github.com','https://www.youtube.com','https://developer.mozilla.org','https://www.figma.com','https://news.ycombinator.com','https://www.electronjs.org','https://www.openstreetmap.org'].map((url, i) => ({ id: 'x' + i, title: 't' + i, url })))); bookmarks.load(); renderStartContent(); 0`);
  log('migração da lista antiga:', (await labels()).split(', ').slice(0, 3).join(', '), '…');
  // lista personalizada → mantida
  await js(`localStorage.setItem(profileKey('bookmarks'), JSON.stringify([{ id: 'a', title: 'Meu site', url: 'https://example.com' }])); bookmarks.load(); renderStartContent(); 0`);
  log('lista personalizada mantida:', await labels());

  const click = async (sel) => { const p = await js(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } })()`); wc.sendInputEvent({ type: 'mouseDown', ...p, button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', ...p, button: 'left', clickCount: 1 }); await sleep(500); };
  const type = async (text) => { for (const ch of text) { wc.sendInputEvent({ type: 'char', keyCode: ch }); await sleep(15); } };
  const enter = async () => { wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' }); await sleep(500); };

  await click('#fav-add');
  log('folha aberta:', await js(`document.querySelector('#fav-sheet').classList.contains('show') && document.activeElement.id`));
  await type('ola mundo'); await enter();
  log('endereço inválido → erro visível:', await js(`!document.querySelector('#fav-error').hidden`));
  fs.writeFileSync(path.join(OUT, 'favorites-sheet.png'), (await wc.capturePage()).toPNG());
  await js(`document.querySelector('#fav-url').value = ''; 0`);
  await type('github.com'); await enter();
  log('depois de adicionar github.com:', await labels(), '· folha fechada:', await js(`!document.querySelector('#fav-sheet').classList.contains('show')`));
  await click('#fav-add'); await type('https://example.com/'); await enter();
  log('repetido → aviso:', await js(`document.querySelector('#toast')?.textContent || ''`));
  app.exit(0);
});
