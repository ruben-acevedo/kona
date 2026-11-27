// Ctrl+Shift+N (entrar/sair do modo privado) perde 1 quadro: o que acontece no quadro longo.
const os = require('os'); const path = require('path');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-pvj-${process.pid}`);
const { app, BrowserWindow } = require('electron');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
const startServer = require('../fixtures/server');
require('../../main.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const M = `new Promise((res) => { const f = []; const lo = []; let l = performance.now(); const t0 = l;
  const po = new PerformanceObserver((x) => x.getEntries().forEach((e) => lo.push({ d: Math.round(e.duration), at: Math.round(e.startTime - t0),
    block: Math.round(e.blockingDuration || 0), render: Math.round(e.renderStart ? e.startTime + e.duration - e.renderStart : 0),
    layout: Math.round(e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0),
    scripts: (e.scripts || []).map((s) => (s.sourceFunctionName || s.invoker) + ':' + Math.round(s.duration) + (s.forcedStyleAndLayoutDuration ? '/forced ' + Math.round(s.forcedStyleAndLayoutDuration) : '')) })));
  po.observe({ type: 'long-animation-frame', buffered: false });
  const k = (t) => { f.push(t - l); l = t; if (t - t0 < 1200) requestAnimationFrame(k); else { po.disconnect(); f.shift(); res({ drop: f.filter((x) => x > 25).length, at: f.map((x, i) => [x, f.slice(0, i).reduce((a, b) => a + b, 0)]).filter(([x]) => x > 25).map(([x, t]) => Math.round(x) + 'ms@' + Math.round(t)), lo }); } };
  requestAnimationFrame(k); })`;
app.whenReady().then(async () => {
  const { base } = await startServer();
  let w; while (!(w = BrowserWindow.getAllWindows()[0])) await sleep(50);
  const wc = w.webContents; await sleep(3000); w.maximize(); wc.setAudioMuted(true);
  const js = (c) => wc.executeJavaScript(c, true);
  await js(`navigate(active(), '${base}/text'); for (let i = 0; i < 4; i++) newTab('${base}/text', false); 0`); await sleep(2500);
  for (let i = 0; i < 6; i++) {
    const p = js(M); await sleep(40);
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'N', modifiers: ['control', 'shift'] }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'N', modifiers: ['control', 'shift'] });
    console.log('R', i % 2 ? 'sair ' : 'entrar', JSON.stringify(await p));
    await sleep(800);
  }
  app.exit(0);
});
