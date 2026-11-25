// C1: visão geral por teclado (Alt+V dentro de uma página, setas, Enter, Esc) + capturas.
const os = require('os'); const fs = require('fs'); const path = require('path');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-ov-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow, webContents } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = path.join(__dirname, '..', 'output-windows'); fs.mkdirSync(OUT, { recursive: true });
app.whenReady().then(async () => {
  let wc; while (!(wc = BrowserWindow.getAllWindows()[0]?.webContents)) await sleep(50);
  await sleep(3000);
  wc.on('console-message', (e) => { if (e.level === 'error' || /Uncaught/.test(e.message)) console.log('C erro:', e.message); });
  const js = (c) => wc.executeJavaScript(c);
  const fixture = (n) => `data:text/html,<title>Aba ${n}</title><body style="background:hsl(${n * 60},60%,50%)"><h1>Aba ${n}</h1>`;
  for (let n = 1; n <= 5; n++) await js(`newTab(${JSON.stringify(fixture(n))}); 0`);
  await sleep(2500);
  await js(`activate(tabs[2].id); 0`);
  await sleep(800);
  const state = async (label) => console.log('R', label, JSON.stringify(await js(`({ aberta: ovOpen(), sel: ovSel, ativa: tabs.indexOf(active()), selCard: [...document.querySelectorAll('#ov-grid .ov-card')].findIndex((c) => c.classList.contains('sel')), foco: document.activeElement?.id || document.activeElement?.tagName })`)));
  const key = async (target, keyCode, modifiers = []) => {
    target.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    target.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    await sleep(450);
  };
  // foco dentro da página: Alt+V tem de funcionar mesmo assim
  const g = webContents.fromId(await js('active().wv.getWebContentsId()'));
  await js(`active().wv.focus(); 0`);
  await sleep(300);
  await key(g, 'V', ['alt']);
  await sleep(500);
  await state('Alt+V na página →');
  await key(wc, 'Right'); await state('→');
  await key(wc, 'Right'); await state('→');
  await key(wc, 'Down'); await state('↓ (sem linha abaixo: fica)');
  await key(wc, 'Left'); await state('←');
  console.log('R recuo dos outros:', await js(`[document.querySelector('#ov-grid').className, getComputedStyle(document.querySelector('#ov-grid .ov-card:not(.sel) .thumb')).opacity, getComputedStyle(document.querySelector('#ov-grid .ov-card.sel .thumb')).opacity].join(' · ')`));
  fs.writeFileSync(path.join(OUT, 'overview-kb.png'), (await wc.capturePage()).toPNG());
  await key(wc, 'Return'); await sleep(400); await state('Enter →');
  await key(wc, 'V', ['alt']); await sleep(500); await state('Alt+V de novo →');
  await key(wc, 'Escape'); await sleep(400); await state('Esc →');
  await key(wc, 'V', ['alt']); await sleep(500);
  await key(wc, 'V', ['alt']); await sleep(400); await state('Alt+V abre e fecha →');
  app.exit(0);
});
