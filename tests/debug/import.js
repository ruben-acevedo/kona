// G2: importar de outro navegador — oferta no primeiro uso, janela, favoritos com pastas, histórico e
// uma extensão (instalada num perfil temporário; o navegador de origem não é alterado).
const os = require('os'); const fs = require('fs'); const path = require('path');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-import-${process.pid}`);
process.env.KONA_WELCOME = '1'; // este teste confere a oferta do primeiro uso
require('../../main.js');
const { app, BrowserWindow } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = path.join(__dirname, '..', 'output-windows', 'import'); fs.mkdirSync(OUT, { recursive: true });
app.whenReady().then(async () => {
  let wc; while (!(wc = BrowserWindow.getAllWindows()[0]?.webContents)) await sleep(50);
  wc.on('console-message', (e) => { if (e.level === 'error' || /Uncaught/.test(e.message)) console.log('C erro:', e.message); });
  const js = (c) => wc.executeJavaScript(c);
  const log = (...a) => console.log('R', ...a);
  const shot = async (name) => { await sleep(500); fs.writeFileSync(path.join(OUT, name), (await wc.capturePage()).toPNG()); };
  const until = async (c, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await js(c)) return true; await sleep(200); } return false; };
  const click = async (sel) => {
    const p = await js(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } })()`);
    wc.sendInputEvent({ type: 'mouseDown', ...p, button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', ...p, button: 'left', clickCount: 1 }); await sleep(400);
  };
  // primeiro uso: "Crie seu perfil" vem antes; depois de criar, a oferta de importar aparece sozinha
  await until(`document.querySelector('#profile-sheet').classList.contains('show')`, 20000);
  await js("document.getElementById('pf-name').focus(); 0");
  wc.insertText('Teste'); await sleep(200);
  await js("document.querySelector('#pf-save').click(); 0");
  const offered = await until(`document.querySelector('#import-sheet').classList.contains('show') && !!document.querySelector('#imp-body .imp-list')`, 20000);
  log('oferta no primeiro uso:', offered, '·', await js(`document.querySelector('#imp-title').textContent + ' / ' + document.querySelector('#imp-cancel').textContent`));
  await js(`settings.sounds = false; 0`);
  log('fontes:', await js(`imp.sources.map((s) => s.browser + ' — ' + s.profile).join(' | ')`));
  log('opções:', await js(`[...document.querySelectorAll('#imp-body .imp-list > label')].map((l) => l.innerText.replace(/\\s+/g, ' ').trim()).join(' || ')`));
  log('extensões marcadas:', await js(`[...document.querySelectorAll('#imp-body [data-ext]')].map((c) => c.closest('label').querySelector('.imp-ename').textContent + (c.checked ? ' ✓' : ' ✗') + (c.closest('label').querySelector('small')?.textContent ? ' (' + c.closest('label').querySelector('small').textContent + ')' : '')).join(', ')`));
  await shot('sheet.png');
  // deixa só uma extensão marcada (a primeira), para o teste ser rápido
  await js(`(() => { const on = [...document.querySelectorAll('#imp-body [data-ext]')].filter((c) => c.checked); on.slice(1).forEach((c) => c.click()); return 0; })()`);
  await click('#imp-go');
  await sleep(300);
  log('durante a importação, botões:', await js(`['#imp-go', '#imp-cancel', '#imp-close'].map((s) => s.slice(5) + (document.querySelector(s).hidden ? ' escondido' : ' VISÍVEL')).join(', ') + ' · ' + document.querySelector('#imp-hint').textContent`));
  const finished = await until(`imp.phase === 'done'`, 90000);
  log('terminou:', finished, '·', await js(`document.querySelector('.imp-done p')?.textContent`));
  log('aviso de falha:', await js(`document.querySelector('.imp-done .imp-warn')?.textContent || 'nenhum'`));
  await shot('done.png');
  log('favoritos:', await js(`bookmarks.count()`), '· nível principal:', await js(`bookmarks.list.map((b) => b.folder ? '[' + b.title + ' ' + b.children.length + ']' : b.title).join(', ')`));
  log('histórico:', await js(`browseHistory.data.visits.length + ' sites · ' + browseHistory.data.searches.length + ' buscas'`));
  await sleep(1500);
  log('extensões no Kona:', await js(`extensions.map((e) => e.name).join(', ')`));
  await click('#imp-go');
  log('janela fechada:', await js(`!document.querySelector('#import-sheet').classList.contains('show')`));
  log('nova aba:', await js(`[...document.querySelectorAll('#fav-grid .fav-item')].map((b) => b.querySelector('.label').textContent).join(', ')`));
  log('frequentes:', await js(`[...document.querySelectorAll('#freq-grid .freq b')].map((b) => b.textContent).join(', ')`));
  await shot('newtab.png');
  // abrir de novo pelas configurações: a extensão já instalada aparece como "Already in Kona"
  await js(`openImport(); 0`);
  await until(`!!document.querySelector('#imp-body .imp-list')`);
  log('reabrindo:', await js(`[...document.querySelectorAll('#imp-body .imp-ext.have .imp-ename')].map((x) => x.textContent).join(', ') || 'nenhuma marcada como instalada'`), '·', await js(`document.querySelector('#imp-body [data-pick="bookmarks"]').closest('label').innerText.replace(/\\s+/g, ' ')`));
  app.exit(0);
});
