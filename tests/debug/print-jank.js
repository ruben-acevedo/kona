// Ctrl+P perde 1–3 quadros ao abrir: qual etapa (animação da janela, lista de impressoras, PDF, webview da prévia)?
const os = require('os'); const path = require('path');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-prj-${process.pid}`);
const { app, BrowserWindow } = require('electron');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
const startServer = require('../fixtures/server');
require('../../main.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const M = `new Promise((res) => { const f = []; const lo = []; let l = performance.now(); const t0 = l;
  const po = new PerformanceObserver((x) => x.getEntries().forEach((e) => lo.push(Math.round(e.duration) + 'ms@' + Math.round(e.startTime - t0) + ' render ' + Math.round(e.renderStart ? e.startTime + e.duration - e.renderStart : 0) + ' style ' + Math.round(e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0))));
  po.observe({ type: 'long-animation-frame' });
  const k = (t) => { f.push(t - l); l = t; if (t - t0 < 1500) requestAnimationFrame(k); else { po.disconnect(); f.shift(); res({ fps: Math.round(f.length / 1.5), drop: f.filter((x) => x > 25).length, at: f.map((x, i) => [x, f.slice(0, i).reduce((a, b) => a + b, 0)]).filter(([x]) => x > 25).map(([x, t]) => Math.round(x) + 'ms@' + Math.round(t)), lo }); } };
  requestAnimationFrame(k); })`;
app.whenReady().then(async () => {
  const { base } = await startServer();
  let w; while (!(w = BrowserWindow.getAllWindows()[0])) await sleep(50);
  const wc = w.webContents; await sleep(3000); w.maximize(); wc.setAudioMuted(true);
  const js = (c) => wc.executeJavaScript(c, true);
  await js(`navigate(active(), '${base}/text'); window.__orig = { preview, printers: api.print.printers }; 0`); await sleep(2500);
  const variants = {
    'completo': '',
    ...(process.env.ONLY_FULL ? {} : {
    'sem prévia (só a janela)': 'preview = () => {};',
    'sem lista de impressoras': 'api.print.printers = async () => [];',
    'sem webview (PDF gerado, não mostrado)': `preview = (now) => { setTimeout(async () => { await api.print.preview(pr.wcId, prOpts()); }, 0); };`,
    }),
  };
  for (let round = 0; round < (Number(process.env.ROUNDS) || 2); round++) for (const [name, patch] of Object.entries(variants)) {
    await js(`preview = __orig.preview; api.print.printers = __orig.printers; ${patch} 0`);
    const p = js(M); await sleep(40);
    await js('openPrint(); 0');
    console.log('R', name.padEnd(40), JSON.stringify(await p));
    await sleep(800); await js('closePrint(); 0'); await sleep(900);
  }
  // trocar uma opção com a janela aberta: a prévia é refeita
  await js(`preview = __orig.preview; api.print.printers = __orig.printers; 0`);
  await js('openPrint(); 0'); await sleep(2500);
  for (let i = 0; i < 4; i++) {
    const p = js(M); await sleep(40);
    await js(`(() => { const s = document.getElementById('pr-layout'); s.value = s.value === 'portrait' ? 'landscape' : 'portrait'; s.dispatchEvent(new Event('change', { bubbles: true })); })(); 0`);
    console.log('R trocar orientação'.padEnd(42), JSON.stringify(await p));
    await sleep(1200);
  }
  app.exit(0);
});
