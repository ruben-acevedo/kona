// Criar grupo pelo menu lateral com o menu se redesenhando no meio da digitação (o texto não se perde).
const os = require('os'); const path = require('path');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-grp-${process.pid}`);
const startServer = require('../fixtures/server');
require('../../main.js');
const { app, BrowserWindow } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('R', ...a);
app.whenReady().then(async () => {
  const { base } = await startServer();
  let w; while (!(w = BrowserWindow.getAllWindows()[0])) await sleep(50);
  const wc = w.webContents; await sleep(3000);
  wc.on('console-message', (e) => { if (e.level === 'error' || e.level === 3) log('console:', e.message); });
  const js = (c) => wc.executeJavaScript(c, true);
  const click = async (sel, i = 0) => {
    const p = await js(`(() => { const e = document.querySelectorAll(${JSON.stringify(sel)})[${i}]; if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; })()`);
    if (!p) return log('sem', sel);
    wc.sendInputEvent({ type: 'mouseMove', x: p[0], y: p[1] }); wc.sendInputEvent({ type: 'mouseDown', x: p[0], y: p[1], button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', x: p[0], y: p[1], button: 'left', clickCount: 1 });
  };
  await js(`navigate(active(), '${base}/text'); newTab('${base}/heavy', false); 0`); await sleep(2500);
  await js('toggleSidebar(true); 0'); await sleep(700);
  await click('#sb-sets .sb-tab:not(.new)', 0); await sleep(300);
  log('depois de clicar na aba: menu aberto', await js("document.body.classList.contains('sidebar-open')"), '· foco', await js('document.activeElement.outerHTML.slice(0,80)'));
  await click('[data-act="new-group"]'); await sleep(200);
  log('depois de novo grupo: editing', await js('JSON.stringify(sb.editing)'), '· foco', await js('document.activeElement.outerHTML.slice(0,80)'));
  wc.insertText('Via'); await js('renderMain(); renderMain(); 0'); await sleep(100); wc.insertText('gem');
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' }); wc.sendInputEvent({ type: 'char', keyCode: '\r' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
  await sleep(900);
  log('resultado', await js(`JSON.stringify({ key: library.currentKey(), name: tabSets.group(library.currentKey())?.name, tabs: tabs.length, groups: tabSets.data.groups.map((g) => g.name) })`));
  app.exit(0);
});
