// Diagnóstico pontual (não faz parte da suíte): linha do tempo da abertura, custo de webview, rolagem e faixa de abas.
process.env.KONA_USER_DATA = require('path').join(__dirname, '..', 'output', 'debug-profile');
require('../../main.js');
const { app, BrowserWindow, webContents } = require('electron');
const startServer = require('../fixtures/server');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const { base } = await startServer();
  let wc; while (!(wc = BrowserWindow.getAllWindows()[0]?.webContents)) await sleep(50);
  await new Promise((r) => wc.once('did-finish-load', r));
  await wc.executeJavaScript(`window.__lo = []; new PerformanceObserver((l) => l.getEntries().forEach((e) => __lo.push(e))).observe({ type: 'long-animation-frame', buffered: true }); 0`);
  await sleep(6000);
  const tl = await wc.executeJavaScript(`(() => { const r = performance.getEntriesByName('kona:ready')[0]?.startTime || 0;
    const marks = performance.getEntriesByType('mark').map((m) => m.name + '@' + Math.round(m.startTime - r));
    const lo = __lo.filter((e) => e.duration > 50).map((e) => Math.round(e.startTime - r) + '+' + Math.round(e.duration) + 'ms blocking=' + Math.round(e.blockingDuration) + ' scripts=' + e.scripts.map((s) => (s.sourceFunctionName || s.invoker) + ':' + Math.round(s.duration)).join(','));
    return { marks, lo }; })()`);
  console.log('R marcações (ms após ready):', tl.marks.join(' | '));
  console.log('R quadros longos (início após ready + duração):', tl.lo.join(' | '));
  const m = await wc.executeJavaScript(`(async () => { const before = performance.getEntriesByName('kona:webview-append').length;
    const t0 = performance.now(); newTab(${JSON.stringify(base + '/text')}, false); const t1 = performance.now();
    await new Promise((r) => setTimeout(r, 1500));
    return { newTab: (t1 - t0).toFixed(1), append: performance.getEntriesByName('kona:webview-append').slice(before).map((e) => e.duration.toFixed(1)) }; })()`);
  console.log('R newTab síncrono (ms):', m.newTab, '· appendChild(webview):', m.append.join(','));
  console.log('R closeTab síncrono (ms):', await wc.executeJavaScript(`(() => { const t0 = performance.now(); closeTab(activeId); return (performance.now() - t0).toFixed(1); })()`));
  await wc.executeJavaScript(`newTab(${JSON.stringify(base + '/text')}, false); 0`);
  await sleep(1500);
  const g = webContents.fromId(await wc.executeJavaScript('active().wv.getWebContentsId()'));
  console.log('R retângulo do webview:', await wc.executeJavaScript(`JSON.stringify(active().wv.getBoundingClientRect())`));
  wc.sendInputEvent({ type: 'mouseMove', x: 600, y: 450 });
  for (let i = 0; i < 20; i++) { wc.sendInputEvent({ type: 'mouseWheel', x: 600, y: 450, deltaX: 0, deltaY: -120, canScroll: true }); await sleep(16); }
  await sleep(400);
  console.log('R scrollY (roda pela janela):', await g.executeJavaScript('scrollY'));
  g.sendInputEvent({ type: 'mouseMove', x: 300, y: 300 });
  for (let i = 0; i < 20; i++) { g.sendInputEvent({ type: 'mouseWheel', x: 300, y: 300, deltaX: 0, deltaY: -120, canScroll: true }); await sleep(16); }
  await sleep(400);
  console.log('R scrollY (roda pela página):', await g.executeJavaScript('scrollY'));
  await wc.executeJavaScript(`while (tabs.length < 30) newTab(START, false); activate(tabs[tabs.length - 1].id); 0`);
  await sleep(1200);
  console.log('R faixa com 30 abas:', await wc.executeJavaScript(`(() => { const s = document.getElementById('tabs'); const a = document.querySelector('#tabs .tab.active');
    const sr = s.getBoundingClientRect(), ar = a.getBoundingClientRect();
    return JSON.stringify({ cls: s.className, sw: s.scrollWidth, cw: s.clientWidth, sl: s.scrollLeft, ox: getComputedStyle(s).overflowX, strip: [Math.round(sr.left), Math.round(sr.right)], active: [Math.round(ar.left), Math.round(ar.right)], idx: tabs.indexOf(active()) }); })()`));
  app.exit(0);
});
