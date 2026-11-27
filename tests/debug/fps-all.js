// Bateria de desempenho: cada interação da interface (abrir e fechar), com teclas e cliques de
// verdade, numa janela maximizada. Mede os quadros da interface durante a animação.
// Critério: pelo menos 60 fps e nenhum quadro perdido (✓); até 2 quadros perdidos (!); mais (✗).
// Roda duas vezes: sobre uma página de texto e sobre uma página animada pesada (estresse).
const os = require('os'); const path = require('path'); const fs = require('fs');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-fps-${process.pid}`);
const { app, BrowserWindow, screen } = require('electron');
// como na suíte: a janela continua desenhando mesmo se outra a cobrir
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
const startServer = require('../fixtures/server');
require('../../main.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = path.join(os.tmpdir(), 'kona-fps-all');
fs.mkdirSync(OUT, { recursive: true });

const MEASURE = `(ms) => new Promise((res) => {
  const f = []; const loaf = []; let last = performance.now(); const t0 = last;
  let po; try {
    po = new PerformanceObserver((l) => l.getEntries().forEach((e) => {
      const script = (e.scripts || []).reduce((a, s) => a + s.duration, 0);
      loaf.push({ d: Math.round(e.duration), script: Math.round(script),
        fn: (e.scripts || []).map((s) => s.sourceFunctionName || s.invoker).filter(Boolean).slice(0, 2).join(',') });
    }));
    po.observe({ type: 'long-animation-frame' });
  } catch {}
  const tick = (t) => { f.push(t - last); last = t; if (t - t0 < ms) requestAnimationFrame(tick); else { po && po.disconnect(); res({ f: f.slice(1), loaf }); } };
  requestAnimationFrame(tick);
})`;

let HZ = 60; let BUDGET = 1000 / 60;
function stats({ f, loaf }) {
  if (!f.length) return { fps: 0, p95: 0, max: 0, jank: 0 };
  const s = [...f].sort((a, b) => a - b);
  const total = f.reduce((a, b) => a + b, 0);
  return {
    fps: Math.round(f.length / (total / 1000)),
    p95: +s[Math.min(s.length - 1, Math.floor(0.95 * s.length))].toFixed(1),
    max: +s[s.length - 1].toFixed(1),
    jank: f.filter((x) => x > BUDGET * 1.5).length,
    causes: loaf.filter((l) => l.d > 30).slice(0, 2).map((l) => `${l.d}ms script ${l.script}${l.fn ? ' ' + l.fn : ''}`),
  };
}
const grade = (st) => (st.fps >= Math.min(60, HZ) * 0.95 && st.jank === 0 ? 'PASS' : st.jank <= 2 && st.fps >= 57 ? 'WARN' : 'FAIL');
const results = [];

app.whenReady().then(async () => {
  const { base } = await startServer();
  let w; while (!(w = BrowserWindow.getAllWindows()[0])) await sleep(50);
  const wc = w.webContents;
  await sleep(3500);
  w.maximize(); await sleep(800);
  const d = screen.getDisplayMatching(w.getBounds());
  HZ = Math.round(d.displayFrequency) || 60; BUDGET = 1000 / HZ;
  console.log(`R monitor ${HZ} Hz · escala ${d.scaleFactor} · janela ${w.getBounds().width}×${w.getBounds().height} · GPU ${JSON.stringify(app.getGPUFeatureStatus().gpu_compositing)}`);
  wc.setAudioMuted(true);
  const js = (c) => wc.executeJavaScript(c, true);
  await js("setLanguage('en'); 0");

  const key = (keyCode, modifiers = []) => {
    if (keyCode === 'Return') { wc.sendInputEvent({ type: 'keyDown', keyCode: 'Enter', modifiers }); wc.sendInputEvent({ type: 'char', keyCode: '\r', modifiers }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Enter', modifiers }); return; }
    wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers }); wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
  };
  const type = async (text) => { for (const ch of text) { wc.sendInputEvent({ type: 'keyDown', keyCode: ch }); wc.sendInputEvent({ type: 'char', keyCode: ch }); wc.sendInputEvent({ type: 'keyUp', keyCode: ch }); await sleep(70); } };
  const pos = (sel, i = 0) => js(`(() => { const e = document.querySelectorAll(${JSON.stringify(sel)})[${i}]; if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; })()`);
  const mouse = async (sel, i = 0, button = 'left') => {
    const p = await pos(sel, i); if (!p) throw new Error('sem ' + sel);
    const [x, y] = p; wc.sendInputEvent({ type: 'mouseMove', x, y });
    wc.sendInputEvent({ type: 'mouseDown', x, y, button, clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', x, y, button, clickCount: 1 });
  };

  let scene = '';
  // KONA_FPS_ONLY=regex: só as interações cujo nome combina (as outras nem acontecem)
  const ONLY = process.env.KONA_FPS_ONLY ? new RegExp(process.env.KONA_FPS_ONLY, 'i') : null;
  async function perf(name, action, ms = 900, target = wc) {
    if (ONLY && !ONLY.test(name)) return;
    try {
      const p = target.executeJavaScript(`(${MEASURE})(${ms})`, true);
      await sleep(40);
      await action();
      const st = stats(await p);
      const g = grade(st);
      results.push({ scene, name, g, ...st });
      console.log(`R ${{ PASS: '✓', WARN: '!', FAIL: '✗' }[g]} [${scene}] ${name} — ${st.fps} fps · p95 ${st.p95} ms · pior ${st.max} ms · ${st.jank} perdido(s)${st.causes.length ? ' · ' + st.causes.join('; ') : ''}`);
    } catch (e) {
      results.push({ scene, name, g: 'FAIL', err: e.message });
      console.log(`R ✗ [${scene}] ${name} — erro: ${e.message}`);
    }
    await sleep(350);
  }
  const reset = async () => { for (let i = 0; i < 4; i++) { key('Escape'); await sleep(120); } await sleep(300); };

  const REPEAT = Number(process.env.KONA_FPS_REPEAT) || 1;
  const SCENES = [['página de texto', '/text'], ['página animada pesada', '/heavy']];
  for (const [label, page] of Array.from({ length: REPEAT }, () => SCENES).flat()) {
    scene = label;
    const url = base + page;
    // 5 abas da mesma página
    await js(`navigate(active(), ${JSON.stringify(url)}); for (let i = 0; i < 4; i++) newTab(${JSON.stringify(url)}, false); activate(tabs[0].id); 0`);
    await sleep(3500);

    // Abas
    await perf('nova aba (Ctrl+T)', () => key('T', ['control']));
    await perf('fechar aba (Ctrl+W)', () => key('W', ['control']));
    await perf('reabrir aba fechada (Ctrl+Shift+T)', () => key('T', ['control', 'shift']));
    await sleep(800);
    await perf('próxima aba (Ctrl+Tab)', () => key('Tab', ['control']));
    await perf('aba seguinte (Ctrl+PgDn)', () => key('PageDown', ['control']));
    await perf('última aba (Ctrl+9)', () => key('9', ['control']));
    await perf('primeira aba (Ctrl+1)', () => key('1', ['control']));
    await perf('mover aba para a direita (Ctrl+Shift+PgDn)', () => key('PageDown', ['control', 'shift']));
    await perf('mover aba de volta (Ctrl+Shift+PgUp)', () => key('PageUp', ['control', 'shift']));
    await perf('clicar em outra aba', () => mouse('#tabs .tab', 2));
    await perf('passar o mouse pelas abas', async () => {
      const a = await pos('#tabs .tab', 0); const b = await pos('#tabs .tab', 4);
      for (let i = 0; i <= 20; i++) { wc.sendInputEvent({ type: 'mouseMove', x: Math.round(a[0] + (b[0] - a[0]) * i / 20), y: a[1] }); await sleep(30); }
    });
    await perf('arrastar aba com o mouse', async () => {
      const a = await pos('#tabs .tab', 1); const b = await pos('#tabs .tab', 3);
      wc.sendInputEvent({ type: 'mouseMove', x: a[0], y: a[1] });
      wc.sendInputEvent({ type: 'mouseDown', x: a[0], y: a[1], button: 'left', clickCount: 1 });
      for (let i = 0; i <= 15; i++) { wc.sendInputEvent({ type: 'mouseMove', x: Math.round(a[0] + (b[0] - a[0]) * i / 15), y: a[1], button: 'left' }); await sleep(25); }
      wc.sendInputEvent({ type: 'mouseUp', x: b[0], y: b[1], button: 'left', clickCount: 1 });
    }, 1100);
    await sleep(500); await js('activate(tabs[0].id); 0'); await sleep(400);
    await perf('fixar aba', () => js('library.pin(active()); 0'));
    await perf('desafixar aba', () => js('library.unpin(active()); 0'));
    await perf('menu de contexto da aba (botão direito)', () => mouse('#tabs .tab', 1, 'right'));
    await perf('menu de contexto: setas', async () => { for (let i = 0; i < 5; i++) { key('Down'); await sleep(90); } });
    await perf('fechar menu de contexto (Esc)', () => key('Escape'));
    await reset();

    // Visão geral e menu lateral
    await perf('visão geral (Alt+V)', () => key('V', ['alt']));
    await perf('visão geral: setas', async () => { for (const k of ['Right', 'Right', 'Down', 'Left']) { key(k); await sleep(120); } });
    await perf('fechar visão geral (Esc)', () => key('Escape'));
    await reset();
    await perf('menu lateral (Alt+Z)', () => key('Z', ['alt']));
    await perf('menu lateral: setas (cursor deslizando)', async () => { for (let i = 0; i < 8; i++) { key('Down'); await sleep(80); } for (let i = 0; i < 4; i++) { key('Up'); await sleep(80); } }, 1300);
    await perf('menu lateral: subtela de Favoritos', () => js("openSidebarView('bookmarks'); 0"));
    await perf('menu lateral: voltar (Esc)', () => key('Escape'));
    await perf('fechar menu lateral', () => js('toggleSidebar(false); 0'));
    await reset();
    await perf('Histórico (Ctrl+H)', () => key('H', ['control']));
    await perf('fechar Histórico', () => js('toggleSidebar(false); 0'));
    await reset();
    await perf('Downloads (Ctrl+J)', () => key('J', ['control']));
    await perf('fechar Downloads', () => js('toggleSidebar(false); 0'));
    await reset();

    // Ferramentas da página
    await perf('buscar na página (Ctrl+F)', () => key('F', ['control']));
    await perf('buscar: digitar', () => type('lorem'), 1000);
    await perf('fechar busca (Esc)', () => key('Escape'));
    await reset();
    await perf('zoom + (Ctrl+=)', () => key('=', ['control']));
    await perf('zoom − (Ctrl+-)', () => key('-', ['control']));
    await perf('zoom 100% (Ctrl+0)', () => key('0', ['control']));
    await perf('favoritar (Ctrl+D)', () => key('D', ['control']));
    await perf('fechar janela de favorito (Esc)', () => key('Escape'));
    await reset();
    await perf('modo leitura (Ctrl+Shift+R)', () => key('R', ['control', 'shift']), 1200);
    await perf('sair do modo leitura', () => key('R', ['control', 'shift']), 1200);
    await reset();
    await perf('imprimir (Ctrl+P)', () => key('P', ['control']), 1500);
    await perf('fechar impressão', () => js('closePrint(); 0'));
    await reset();

    // Barra de endereço
    await perf('barra de endereço (Ctrl+L)', () => key('L', ['control']));
    await perf('digitar com sugestões', () => type('github'), 1000);
    await perf('sugestões: setas', async () => { for (let i = 0; i < 3; i++) { key('Down'); await sleep(100); } });
    await perf('fechar sugestões (Esc)', async () => { key('Escape'); await sleep(80); key('Escape'); });
    await reset();

    // Painéis e menus
    await perf('painel do site (cadeado)', () => mouse('#tabs .tab.active .lock'));
    await perf('fechar painel do site', () => key('Escape'));
    await reset(); await js('toggleSitePop(null, null, false); 0').catch(() => {});
    await perf('painel de mídia', () => js('toggleMediaPop(true); 0'));
    await perf('fechar painel de mídia', () => js('toggleMediaPop(false); 0'));
    await perf('menu de perfis', () => js('toggleProfilePop(true); 0'));
    await perf('fechar menu de perfis', () => key('Escape'));
    await reset();
    await perf('menu de extensões', () => js('openExtPop(); 0'));
    await perf('fechar menu de extensões', () => js('closeExtPop(); 0'));
    await perf('senhas', () => js('openPasswordSheet(); 0'));
    await perf('fechar senhas', () => key('Escape'));
    await reset();

    // Configurações
    await perf('Configurações (Ctrl+,)', () => key(',', ['control']), 1200);
    await perf('Configurações: rolar', async () => {
      const p = await pos('body'); for (let i = 0; i < 25; i++) { wc.sendInputEvent({ type: 'mouseWheel', x: p[0], y: p[1], deltaX: 0, deltaY: -120, wheelTicksY: -1.2, canScroll: true }); await sleep(30); }
    }, 1200);
    await perf('Configurações: licenças', () => js('openLicenses(); 0'), 1200);
    await perf('fechar licenças', () => key('Escape'));
    await reset();
    await perf('fechar Configurações (Ctrl+W)', () => key('W', ['control']));
    await reset();

    // Nova aba: personalizar
    await perf('nova aba para personalizar (Ctrl+T)', () => key('T', ['control']));
    await perf('personalizar a página inicial', () => js('toggleCustomize(true); 0'));
    await perf('fechar personalizar', () => js('toggleCustomize(false); 0'));
    await perf('fechar a aba', () => key('W', ['control']));
    await reset();

    // Janela
    await perf('tela cheia (F11)', () => key('F11'), 1300);
    await perf('sair da tela cheia (F11)', () => key('F11'), 1300);
    await sleep(600);
    if (!w.isMaximized()) w.maximize();
    await sleep(500);
  }

  // Janelas novas: medidas dentro da janela que abriu
  scene = 'janelas';
  await perf('modo privado (Ctrl+Shift+N)', () => key('N', ['control', 'shift']), 1000);
  await perf('sair do modo privado (Ctrl+Shift+N)', () => key('N', ['control', 'shift']), 1000);
  for (const [name, mods] of [['janela nova (Ctrl+N)', ['control']]]) {
    if (ONLY && !ONLY.test(name)) continue;
    const before = new Set(BrowserWindow.getAllWindows());
    key('N', mods);
    let nw; const t0 = Date.now();
    while (!(nw = BrowserWindow.getAllWindows().find((x) => !before.has(x))) && Date.now() - t0 < 5000) await sleep(20);
    if (!nw) { results.push({ scene, name, g: 'FAIL', err: 'não abriu' }); console.log(`R ✗ [${scene}] ${name} — não abriu`); continue; }
    while (nw.webContents.isLoading()) await sleep(20);
    await perf(name + ': primeiros quadros', async () => {}, 1200, nw.webContents);
    nw.close(); await sleep(1200);
  }

  const bad = results.filter((r) => r.g !== 'PASS');
  console.log(`R ── ${results.length} interações · ${results.filter((r) => r.g === 'PASS').length} ✓ · ${results.filter((r) => r.g === 'WARN').length} ! · ${results.filter((r) => r.g === 'FAIL').length} ✗`);
  for (const r of bad) console.log(`R    ${r.g} [${r.scene}] ${r.name}: ${r.err || `${r.fps} fps, ${r.jank} perdido(s), pior ${r.max} ms`}`);
  fs.writeFileSync(path.join(OUT, 'fps.json'), JSON.stringify({ hz: HZ, results }, null, 2));
  app.exit(0);
});
