// Ícones dos favoritos no menu lateral: os mesmos da nova aba (padrão com ícone embutido; site sem
// ícone nenhum mostra a inicial no quadradinho).
const os = require('os'); const fs = require('fs'); const path = require('path');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-sbi-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = path.join(__dirname, '..', 'output-windows', 'sidebar-icons'); fs.mkdirSync(OUT, { recursive: true });
app.whenReady().then(async () => {
  let win; while (!(win = BrowserWindow.getAllWindows()[0])) await sleep(50);
  const wc = win.webContents;
  await sleep(3000);
  const js = (c) => wc.executeJavaScript(c);
  await js(`settings.sounds = false; bookmarks.add('http://127.0.0.1:9/nothing', 'No icon site'); openSidebarView('bookmarks'); 0`);
  await sleep(4000);
  const rows = await js(`[...document.querySelectorAll('#sb-list .sb-row[data-url]')].map((r) => { const f = r.querySelector('.sb-fav'); const img = f.querySelector('img'); return r.querySelector('b').textContent + ': ' + (img ? (img.complete && img.naturalWidth ? 'ícone' : 'carregando') : (f.querySelector('.mono') ? 'inicial ' + f.textContent : '?')); }).join(' | ')`);
  console.log('R', rows);
  win.focus(); await sleep(600);
  fs.writeFileSync(path.join(OUT, 'sidebar.png'), (await wc.capturePage()).toPNG());
  app.exit(0);
});
