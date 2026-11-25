// C2: sons da interface — quais tocam em cada ação, custo por som, e o interruptor.
const os = require('os'); const path = require('path');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-sfx-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  let wc; while (!(wc = BrowserWindow.getAllWindows()[0]?.webContents)) await sleep(50);
  await sleep(3500);
  wc.on('console-message', (e) => { if (e.level === 'error' || /Uncaught/.test(e.message)) console.log('C erro:', e.message); });
  const js = (c) => wc.executeJavaScript(c);
  await js('window.__sfxLog = []; 0');
  const take = async (label) => console.log('R', label.padEnd(34), JSON.stringify(await js('window.__sfxLog.splice(0)')));
  const key = async (keyCode, modifiers = []) => { wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers }); if (keyCode.length === 1 && !modifiers.length) wc.sendInputEvent({ type: 'char', keyCode }); wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers }); await sleep(350); };
  const center = (sel, i = 0) => js(`(() => { const r = document.querySelectorAll(${JSON.stringify(sel)})[${i}]?.getBoundingClientRect(); return r ? { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } : null })()`);
  const hover = async (sel, i = 0) => { const p = await center(sel, i); if (p) wc.sendInputEvent({ type: 'mouseMove', ...p }); await sleep(120); return p; };
  const click = async (sel, i = 0) => { const p = await hover(sel, i); if (!p) return; wc.sendInputEvent({ type: 'mouseDown', ...p, button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', ...p, button: 'left', clickCount: 1 }); await sleep(400); };

  await js('wc = null; 0').catch(() => {});
  for (let i = 0; i < 3; i++) await js(`newTab('about:blank', false); 0`);
  await sleep(800);
  await js(`activate(tabs[0].id); 0`); await sleep(600); await take('(preparo)');

  for (const b of ['#btn-sidebar', '#back', '#fwd', '#btn-new', '#btn-overview']) await hover(b);
  await take('passar pelos 5 botões da barra');
  await hover('#toolbar .addr'); await take('passar na barra de pesquisa');
  await click('#toolbar .addr input'); await take('clicar na pesquisa');
  for (const k of ['K', 'o', 'n', 'a']) await key(k);
  await take('digitar 4 letras');
  await key('Backspace'); await take('apagar');
  await sleep(1500);
  console.log('R sugestões na tela:', await js('[omnibox.isOpen(), omnibox.items.length, omnibox.sel, document.activeElement?.tagName]'));
  await key('Down'); await key('Down'); await take('↓ ↓ nas sugestões');
  await key('Escape'); await key('Escape'); await sleep(300); await js('window.__sfxLog.splice(0); 0');
  await hover('.fav-item', 0); await js('window.__sfxLog.splice(0); 0');
  for (let i = 0; i < 4; i++) await hover('.fav-item', i);
  await take('passar por 4 favoritos');
  await hover('.fav-item', 3); await take('mexer dentro do mesmo favorito');
  await hover('#btn-customize'); await take('passar no Personalizar');
  await click('#btn-customize'); await take('abrir Personalizar');
  await click('#custom-pop .wp-swatch', 2); await take('trocar o fundo');
  await key('Escape'); await take('Esc (fecha Personalizar)');

  await key('Z', ['alt']); await sleep(300); await take('Alt+Z (abre menu lateral)');
  await hover('#sidebar .sb-item', 0); await hover('#sidebar .sb-item', 1); await hover('#sidebar .sb-tab', 0);
  await take('passar por 3 itens do menu');
  await click('#sb-profile'); await take('abrir menu de perfis');
  await key('Escape'); await key('Escape'); await take('Esc, Esc');

  await key('V', ['alt']); await sleep(300); await take('Alt+V (visão geral)');
  await key('Right'); await key('Right'); await key('Left'); await take('→ → ←');
  await key('Return'); await take('Enter');

  const cost = await js(`(() => { const t = performance.now(); for (let i = 0; i < 50; i++) sfx.play('open'); return ((performance.now() - t) / 50).toFixed(3) })()`);
  await js('window.__sfxLog.splice(0); 0');
  console.log('R custo por som (ms, na thread da interface):', cost);

  await js(`settings.sounds = false; 0`);
  await key('V', ['alt']); await key('Right'); await key('Escape'); await hover('.fav-item', 0); await hover('.fav-item', 1);
  await take('sons desligados');
  console.log('R AudioContext:', await js(`typeof sfx`));
  app.exit(0);
});
