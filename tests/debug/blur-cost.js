// Custo do desfoque do menu lateral por cima de uma página animada (com e sem backdrop-filter).
process.env.KONA_USER_DATA = require('path').join(__dirname, '..', 'output', 'blur-profile');
require('../../main.js');
const { app, BrowserWindow } = require('electron');
const startServer = require('../fixtures/server');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const M = `new Promise((res) => { const f = []; let l = performance.now(); const t0 = l; const k = (t) => { f.push(t - l); l = t; if (t - t0 < 1500) requestAnimationFrame(k); else { f.shift(); res({ fps: Math.round(f.length / 1.5), jank: f.filter((x) => x > 25).length, max: Math.round(Math.max(...f)) }); } }; requestAnimationFrame(k); })`;
app.whenReady().then(async () => {
  const { base } = await startServer();
  let wc; while (!(wc = BrowserWindow.getAllWindows()[0]?.webContents)) await sleep(50);
  await sleep(3000);
  const js = (c) => wc.executeJavaScript(c, true);
  await js(`navigate(active(), ${JSON.stringify(base + '/heavy')}); 0`); await sleep(2000);
  for (const [label, css] of [['com desfoque 30px', ''], ['desfoque 12px', 'blur(12px)'], ['sem desfoque', 'none']]) {
    await js(`document.getElementById('sidebar').style.backdropFilter = ${JSON.stringify(css)}; toggleSidebar(false); 0`); await sleep(500);
    const p = js(M); await sleep(30); await js('toggleSidebar(true); 0');
    console.log('R abrir menu', label, JSON.stringify(await p));
    await sleep(600);
    console.log('R menu parado sobre página animada', label, JSON.stringify(await js(M)));
  }
  app.exit(0);
});
