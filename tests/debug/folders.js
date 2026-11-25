// G1: pastas de favoritos — nova aba (ícone da pasta e painel), menu lateral (abrir/fechar) e arrastar.
const os = require('os'); const fs = require('fs'); const path = require('path');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-folders-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = path.join(__dirname, '..', 'output-windows', 'folders'); fs.mkdirSync(OUT, { recursive: true });
app.whenReady().then(async () => {
  let wc; while (!(wc = BrowserWindow.getAllWindows()[0]?.webContents)) await sleep(50);
  await sleep(4000);
  wc.on('console-message', (e) => { if (e.level === 'error' || /Uncaught/.test(e.message)) console.log('C erro:', e.message); });
  const js = (c) => wc.executeJavaScript(c);
  const log = (...a) => console.log('R', ...a);
  const shot = async (name) => { await sleep(500); fs.writeFileSync(path.join(OUT, name), (await wc.capturePage()).toPNG()); };
  const click = async (sel) => {
    const p = await js(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } })()`);
    wc.sendInputEvent({ type: 'mouseDown', ...p, button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', ...p, button: 'left', clickCount: 1 }); await sleep(450);
  };
  await js(`settings.sounds = false; bookmarks.replace([
    { id: 'yt', title: 'YouTube', url: 'https://www.youtube.com' },
    { id: 'f1', title: 'Work', folder: true, children: [
      { id: 'gh', title: 'GitHub', url: 'https://github.com' },
      { id: 'mdn', title: 'MDN', url: 'https://developer.mozilla.org' },
      { id: 'f2', title: 'Docs', folder: true, children: [{ id: 'el', title: 'Electron', url: 'https://www.electronjs.org' }] },
      { id: 'fg', title: 'Figma', url: 'https://www.figma.com' },
    ] },
    { id: 'wk', title: 'Wikipedia', url: 'https://en.wikipedia.org' },
    { id: 'f3', title: 'Empty', folder: true, children: [] },
  ]); renderStartContent(); 0`);
  await sleep(600);
  log('nova aba:', await js(`[...document.querySelectorAll('#fav-grid .fav-item')].map((b) => (b.dataset.folder ? '[' : '') + b.querySelector('.label').textContent + (b.dataset.folder ? ']' : '')).join(', ')`));
  log('miniaturas na pasta Work:', await js(`document.querySelectorAll('[data-folder="f1"] .mini').length`));
  await click('[data-folder="f1"]');
  log('painel aberto:', await js(`document.querySelector('#folder-pop').classList.contains('show') + ' · ' + [...document.querySelectorAll('#folder-pop .fav-item .label')].map((x) => x.textContent).join(', ')`));
  await shot('newtab-folder.png');
  await click('#folder-pop [data-folder="f2"]');
  log('subpasta:', await js(`document.querySelector('#folder-pop .fp-head b').textContent + ' · voltar: ' + !!document.querySelector('#folder-pop [data-fp-back]')`));
  await click('#folder-pop [data-fp-back]');
  log('voltou para:', await js(`document.querySelector('#folder-pop .fp-head b').textContent`));
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' }); await sleep(400);
  log('Esc fecha:', await js(`!document.querySelector('#folder-pop').classList.contains('show')`));

  // menu lateral
  await js(`openSidebarView('bookmarks'); 0`); await sleep(700);
  const rows = () => js(`[...document.querySelectorAll('#sb-list .sb-row')].map((r) => '  '.repeat(+getComputedStyle(r).getPropertyValue('--depth') || 0) + (r.dataset.folder ? (r.classList.contains('open') ? 'v ' : '> ') : '') + (r.querySelector('b')?.textContent || r.textContent.trim())).join(' | ')`);
  log('menu (fechado):', await rows());
  await click('#sb-list [data-bm="f1"]');
  log('menu (Work aberta):', await rows());
  await shot('sidebar-folder.png');

  // arrastar: Wikipedia para dentro de Work; YouTube para depois de Wikipedia… (eventos de arrasto sintéticos)
  const drag = (id, target, frac) => js(`(() => {
    const src = document.querySelector('#sb-list [data-bm="${id}"]');
    const dst = document.querySelector(${JSON.stringify(target)});
    const r = dst.getBoundingClientRect();
    const dt = new DataTransfer();
    const at = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.x + 40, clientY: r.y + r.height * ${frac} };
    src.dispatchEvent(new DragEvent('dragstart', at));
    dst.dispatchEvent(new DragEvent('dragover', at));
    dst.dispatchEvent(new DragEvent('drop', at));
    src.dispatchEvent(new DragEvent('dragend', at));
    return true;
  })()`);
  await drag('wk', '#sb-list [data-bm="f1"]', 0.5); await sleep(400);
  log('Wikipedia → dentro de Work:', JSON.stringify(await js(`bookmarks.get('f1').children.map((b) => b.title)`)));
  await drag('yt', '#sb-list [data-bm="gh"]', 0.8); await sleep(400);
  log('YouTube → depois de GitHub:', JSON.stringify(await js(`bookmarks.get('f1').children.map((b) => b.title)`)));
  await drag('gh', '#sb-list [data-bm-end]', 0.5); await sleep(400);
  log('GitHub → fim da lista principal:', JSON.stringify(await js(`bookmarks.list.map((b) => b.title)`)));
  await drag('f1', '#sb-list [data-bm="f2"]', 0.5); await sleep(400);
  log('pasta para dentro dela mesma (deve recusar):', JSON.stringify(await js(`bookmarks.list.map((b) => b.title)`)));
  await shot('sidebar-after-drag.png');

  // nova pasta pelo botão; estrela da barra ainda acha favoritos dentro de pastas
  await click('#sb-tools [data-act="new-folder"]');
  for (const ch of 'Reading') { wc.sendInputEvent({ type: 'char', keyCode: ch }); await sleep(15); }
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' }); await sleep(400);
  log('nova pasta:', await js(`bookmarks.list.filter((b) => b.folder).map((b) => b.title).join(', ')`));
  log('find dentro de pasta:', await js(`bookmarks.find('https://www.electronjs.org')?.title`), '· total:', await js(`bookmarks.count()`), '· badge:', await js(`document.querySelector('#sb-bm-count').textContent`));
  // apagar pasta com conteúdo pede confirmação
  await js(`deleteFolder('f1'); 0`); await sleep(400);
  log('confirmação ao apagar pasta:', await js(`document.querySelector('#ask-title').textContent + ' / ' + document.querySelector('#ask-text').textContent`));
  await click('#ask-yes');
  log('depois de apagar:', await js(`bookmarks.list.map((b) => b.title).join(', ')`));
  app.exit(0);
});
