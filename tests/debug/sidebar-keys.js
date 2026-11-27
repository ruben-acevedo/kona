// Menu lateral pelo teclado: Alt+Z abre no 1º item; ↓/↑ um a um; Ctrl+↓/↑ de 3 em 3; Enter abre
// (subtela recebe o foco); Esc volta; Delete fecha a aba. Sons: tique ao andar, seleção ao abrir.
// Também: trocar de aba clicando toca "select"; Ctrl+Tab / Ctrl+1…9 tocam "tick".
const os = require('os'); const path = require('path');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-sbkeys-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('R', ...a);

app.whenReady().then(async () => {
  let w; while (!(w = BrowserWindow.getAllWindows()[0])) await sleep(50);
  await sleep(3000);
  const wc = w.webContents; wc.setAudioMuted(true);
  const js = (c) => wc.executeJavaScript(c);
  const key = async (keyCode, modifiers = []) => { wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers }); wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers }); await sleep(180); };
  const where = () => js("(() => { const a = document.activeElement; const t = (a.querySelector?.('.sb-label, .sb-tab-title') || a).textContent.replace(/\\s+/g, ' ').trim().slice(0, 22); return (a.id ? '#' + a.id : a.tagName.toLowerCase() + '.' + [...a.classList].slice(0, 2).join('.')) + ' “' + t + '”'; })()");
  await js("settings.sounds = true; setLanguage('pt-BR'); newTab('about:blank#1', false); newTab('about:blank#2', false); activate(tabs[0].id); window.__sfxLog = []; 0"); await sleep(800);

  await js("window.__f = []; document.addEventListener('focusin', (e) => __f.push('in:' + (e.target.id || e.target.className || e.target.tagName)), true); document.addEventListener('focusout', (e) => __f.push('out:' + (e.target.id || e.target.className || e.target.tagName)), true); document.querySelector('#back').focus(); 0");
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'Z', modifiers: ['alt'] }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Z', modifiers: ['alt'] }); await sleep(60);
  const alinha = () => js("(() => { const c = document.querySelector('#sb-cursor'), a = document.activeElement; const sb = document.querySelector('#sidebar'); let y = 0; for (let n = a; n && n !== sb; n = n.offsetParent) y += n.offsetTop; return { cursor: c.style.transform, itemY: y, alinhado: c.style.transform.includes(', ' + y + 'px') }; })()");
  log('logo depois do Alt+Z (60 ms, menu ainda animando):', JSON.stringify(await alinha()));
  await sleep(440);
  log('Alt+Z → foco:', await where(), '· sons:', await js("__sfxLog.splice(0).join(' ')"));
  log('   diag:', JSON.stringify(await js(`(() => { const a = document.activeElement; const sb = document.querySelector('#sidebar');
    const view = sb.classList.contains('sub-open') ? '#sbv-sub' : '#sbv-main';
    const all = [...sb.querySelectorAll('.sb-item, .sb-tab')];
    return { ativo: a.id || a.className, aberto: document.body.classList.contains('sidebar-open'), itens: all.length,
      visiveis: all.filter((el) => el.checkVisibility({ checkVisibilityCSS: true })).length, altura: all[0]?.getBoundingClientRect().height,
      naView: all.filter((el) => document.querySelector(view).contains(el)).length, fn: typeof sidebarFocusFirst, focos: __f.join(' ') }; })()`)));
  await key('Down'); log('↓ →', await where());
  await sleep(400);
  log('   cursor:', JSON.stringify(await js("(() => { const c = document.querySelector('#sb-cursor'), a = document.activeElement.getBoundingClientRect(), r = c.getBoundingClientRect(); return { visivel: c.classList.contains('on'), alinhado: Math.abs(r.top - a.top) < 2 && Math.abs(r.height - a.height) < 2 }; })()")));
  require('fs').writeFileSync(require('path').join(os.tmpdir(), 'kona-sb-cursor.png'), (await wc.capturePage()).toPNG());
  await key('Down', ['control']); log('Ctrl+↓ (3) →', await where());
  await key('Up', ['control']); log('Ctrl+↑ (3) →', await where(), '· sons:', await js("__sfxLog.splice(0).join(' ')"));
  await key('End'); log('End →', await where());
  await key('Home'); log('Home →', await where());
  // vai até Favoritos e abre
  for (let i = 0; i < 12 && !(await where()).includes('“Favoritos'); i++) await key('Down');
  await js('__sfxLog.length = 0; 0');
  await key('Return'); await sleep(700);
  log('Enter em Favoritos → subtela aberta:', await js("document.querySelector('#sidebar').classList.contains('sub-open')"), '· foco:', await where(), '· sons:', await js("__sfxLog.splice(0).join(' ')"));
  await key('Down'); log('↓ na subtela →', await where());
  await key('Escape'); await sleep(700);
  log('Esc → subtela fechada:', !(await js("document.querySelector('#sidebar').classList.contains('sub-open')")), '· foco:', await where());
  // fechar aba com Delete
  await key('Home'); await key('Down'); await key('Down'); // 2ª aba da lista
  const n = await js('tabs.length');
  const alvo = await where();
  await key('Delete'); await sleep(500);
  log('Delete em', JSON.stringify(alvo), '→ abas:', n, '→', await js('tabs.length'), '· foco:', await where());
  await key('Escape'); await sleep(500);
  log('Esc de novo → menu aberto:', await js("document.body.classList.contains('sidebar-open')"));

  // trocar de aba: clique e teclado
  await js('__sfxLog.length = 0; 0');
  const r = await js("(() => { const b = document.querySelectorAll('#tabs .tab:not(.active)')[0].getBoundingClientRect(); return [Math.round(b.left + 30), Math.round(b.top + b.height / 2)]; })()");
  wc.sendInputEvent({ type: 'mouseMove', x: r[0], y: r[1] }); await sleep(150);
  wc.sendInputEvent({ type: 'mouseDown', x: r[0], y: r[1], button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', x: r[0], y: r[1], button: 'left', clickCount: 1 }); await sleep(400);
  log('clicar numa aba → sons:', await js("__sfxLog.splice(0).join(' ')"), '· menu aberto:', await js("document.body.classList.contains('sidebar-open')"), '· aba atual agora:', await js('tabs.indexOf(active())'));
  await js("shortcut('tab', false); 0"); await sleep(300);
  log('Ctrl+Tab → sons:', await js("__sfxLog.splice(0).join(' ')"));
  await js("shortcut('1', false); 0"); await sleep(300);
  log('Ctrl+1 → sons:', await js("__sfxLog.splice(0).join(' ')"));
  app.exit(0);
});
