'use strict';
// Suíte de testes do Kona: desempenho, visual e bugs. Dirige o app real com cliques e teclas
// de verdade (sendInputEvent). Execute com `npm test` (veja scripts/test.js).
const T0 = Date.now();
const path = require('path');
const fs = require('fs');

const OUT = process.env.KONA_TEST_OUT || path.join(__dirname, 'output');
const PASS = process.env.KONA_TEST_PASS || 'cold'; // cold = perfil novo; warm = perfil reaproveitado
const NET = process.env.KONA_TEST_NET === '1';
const UPDATE_BASELINE = process.env.KONA_TEST_UPDATE_BASELINE === '1';
// --only=a,b roda só essas suítes (teste focado numa feature)
const ONLY = (process.env.KONA_TEST_ONLY || '').split(',').map((x) => x.trim()).filter(Boolean);
const want = (name) => !ONLY.length || ONLY.includes(name);
process.env.KONA_USER_DATA = process.env.KONA_TEST_PROFILE || path.join(OUT, 'profile');

const { app, webContents, screen, session, nativeTheme } = require('electron');
// Nos testes, a janela continua desenhando mesmo se outra janela a cobrir (no Windows o Chromium
// pausa janelas cobertas, o que travaria quadros e focos no meio de uma medição)
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
const startServer = require('./fixtures/server');
require('../main.js');

const SCREENS = path.join(OUT, 'screens');
const SETTINGS_URL = 'kona://settings';
const BASELINE = path.join(__dirname, 'baseline', process.platform); // fontes e suavização mudam por sistema
fs.mkdirSync(SCREENS, { recursive: true });

const results = [];
const consoleErrors = [];
const crashes = [];
const timings = {};
let win; let wc; let base; let HZ = 60; let BUDGET = 1000 / 60; let bootFrames = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, timeout = 10000, every = 50) {
  const t = Date.now();
  while (Date.now() - t < timeout) {
    try { if (await fn()) return true; } catch { /* tenta de novo */ }
    await sleep(every);
  }
  return false;
}
const js = (code) => wc.executeJavaScript(code, true);

function record(suite, name, status, detail = '', metrics = null) {
  results.push({ pass: PASS, suite, name, status, detail, metrics });
  const mark = { PASS: '✓', WARN: '!', FAIL: '✗', INFO: '·' }[status];
  console.log(`${mark} [${PASS}/${suite}] ${name}${detail ? ' — ' + detail : ''}`);
}

/* ───────────── Medição de quadros ───────────── */
const MEASURE_SRC = `(ms) => new Promise((res) => {
  const f = []; const loaf = []; let last = performance.now(); const t0 = last;
  let po; try {
    po = new PerformanceObserver((l) => l.getEntries().forEach((e) => {
      const script = (e.scripts || []).reduce((a, s) => a + s.duration, 0);
      loaf.push({ d: Math.round(e.duration), script: Math.round(script),
        render: Math.round(e.renderStart ? e.startTime + e.duration - e.renderStart : 0),
        fn: (e.scripts || []).map((s) => s.sourceFunctionName || s.invoker).filter(Boolean).slice(0, 2).join(',') });
    }));
    po.observe({ type: 'long-animation-frame' });
  } catch {}
  const tick = (t) => { f.push(t - last); last = t; if (t - t0 < ms) requestAnimationFrame(tick); else { po && po.disconnect(); res({ f: f.slice(1), loaf }); } };
  requestAnimationFrame(tick);
})`;

function stats(m) {
  const frames = Array.isArray(m) ? m : m?.f;
  const loaf = Array.isArray(m) ? [] : m?.loaf || [];
  if (!frames?.length) return { fps: 0, p95: 0, max: 0, jank: 0, n: 0 };
  const s = [...frames].sort((a, b) => a - b);
  const total = frames.reduce((a, b) => a + b, 0);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return {
    fps: Math.round(frames.length / (total / 1000)),
    p95: +q(0.95).toFixed(1),
    max: +s[s.length - 1].toFixed(1),
    jank: frames.filter((x) => x > BUDGET * 1.5).length, // quadros que perderam o vsync
    n: frames.length,
    // Quadros longos do thread principal: quanto foi script e quanto foi estilo/layout/pintura
    causes: loaf.filter((l) => l.d > 30).slice(0, 3).map((l) => `${l.d}ms (script ${l.script}${l.fn ? ' ' + l.fn : ''}, render ${l.render})`),
  };
}
function grade(st, stress = false) {
  if (stress) return st.fps >= HZ * 0.92 && st.max <= BUDGET * 2.1 ? 'PASS' : st.fps >= HZ * 0.8 ? 'WARN' : 'FAIL';
  if (st.jank === 0) return 'PASS';
  if (st.jank <= 2 && st.max <= BUDGET * 4) return 'WARN';
  return 'FAIL';
}
const fmt = (st) => `${st.fps} fps · p95 ${st.p95} ms · pior ${st.max} ms · ${st.jank} quadro(s) perdido(s)`
  + (st.jank && st.causes?.length ? ` · thread principal: ${st.causes.join('; ')}` : st.jank ? ' · thread principal livre (custo na GPU/compositor)' : '');

/** Mede os quadros da interface (ou de uma página) enquanto executa a ação. */
async function perf(suite, name, action, { ms = 900, target = wc, stress = false } = {}) {
  const pending = target.executeJavaScript(`(${MEASURE_SRC})(${ms})`, true);
  await sleep(40);
  await action();
  const st = stats(await pending);
  record(suite, name + (stress ? ' [estresse]' : ''), grade(st, stress), fmt(st), st);
  return st;
}

/* ───────────── Entrada real ───────────── */
function key(keyCode, modifiers = [], target = wc) {
  if (keyCode === 'Return') {
    target.sendInputEvent({ type: 'keyDown', keyCode: 'Enter', modifiers });
    target.sendInputEvent({ type: 'char', keyCode: '\r', modifiers });
    target.sendInputEvent({ type: 'keyUp', keyCode: 'Enter', modifiers });
    return;
  }
  target.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
  target.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
}
async function center(sel, index = 0) {
  return js(`(() => { const el = document.querySelectorAll(${JSON.stringify(sel)})[${index}]; if (!el) return null;
    const r = el.getBoundingClientRect(); return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; })()`);
}
async function click(sel, index = 0) {
  const p = await center(sel, index);
  if (!p) throw new Error(`elemento não encontrado: ${sel}`);
  const [x, y] = p;
  wc.sendInputEvent({ type: 'mouseMove', x, y });
  wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
  wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
}
async function hover(sel, index = 0) {
  const [x, y] = await center(sel, index);
  wc.sendInputEvent({ type: 'mouseMove', x, y });
}
function wheel(target, x, y, dy) {
  target.sendInputEvent({ type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy, wheelTicksY: dy / 100, canScroll: true });
}
async function scrollFor(target, x, y, ms, dy = -100) {
  const end = Date.now() + ms;
  while (Date.now() < end) { wheel(target, x, y, dy); await sleep(16); }
}

/* ───────────── Ajudantes dentro da interface ───────────── */
const HELPERS = `window.__kt = {
  visible(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return false;
    return this.opacity(el) > 0.05 && getComputedStyle(el).visibility !== 'hidden';
  },
  opacity(el) { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= +getComputedStyle(e).opacity; return o; },
  hit(sel) {
    return [...document.querySelectorAll(sel)].filter((el) => this.visible(el) && !el.disabled).map((el) => {
      const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { sel, ok: !!t && (t === el || el.contains(t)), got: t ? (t.id || String(t.className) || t.tagName) : null };
    });
  },
  textBoxes(sels) {
    const out = [];
    for (const sel of sels) for (const el of document.querySelectorAll(sel)) {
      if (!this.visible(el) || !el.textContent.trim()) continue;
      const br = el.getBoundingClientRect(); const top = document.elementFromPoint(br.x + br.width / 2, br.y + br.height / 2);
      if (!top || !(top === el || el.contains(top) || top.contains(el))) continue; // coberto por outra camada
      const range = document.createRange(); range.selectNodeContents(el);
      const r = range.getBoundingClientRect(); if (r.width < 4 || r.height < 4) continue;
      const cs = getComputedStyle(el);
      const ctx = this._ctx || (this._ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true }));
      ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = cs.color; ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data; const c = [d[0], d[1], d[2], d[3] / 255];
      out.push({ sel, text: el.textContent.trim().slice(0, 40), rect: [r.x, r.y, r.width, r.height],
        color: [c[0], c[1], c[2], c[3] ?? 1], opacity: this.opacity(el), size: parseFloat(cs.fontSize), weight: +cs.fontWeight });
    }
    return out;
  },
  toolbarLayout() {
    const tb = document.getElementById('toolbar');
    const kids = [...tb.children].map((el) => ({ id: el.id || el.className, r: el.getBoundingClientRect() }));
    const overlaps = []; const outside = [];
    for (let i = 0; i < kids.length; i++) {
      if (kids[i].r.right > innerWidth + 0.5 || kids[i].r.left < -0.5) outside.push(kids[i].id);
      if (i && kids[i].r.left < kids[i - 1].r.right - 0.5) overlaps.push(kids[i - 1].id + ' × ' + kids[i].id);
    }
    const strip = document.getElementById('tabs').getBoundingClientRect();
    const tabs = [...document.querySelectorAll('#tabs .tab:not(.leaving)')];
    const hiddenTabs = tabs.filter((t) => { const r = t.getBoundingClientRect(); return r.right > strip.right + 1 || r.left < strip.left - 1; }).length;
    const act = document.querySelector('#tabs .tab.active');
    const st = document.getElementById('tabs');
    const scrollable = st.scrollWidth > st.clientWidth + 1 && getComputedStyle(st).overflowX !== 'visible';
    return { overlaps, outside, hiddenTabs, scrollable, tabs: tabs.length, activeWidth: act ? Math.round(act.getBoundingClientRect().width) : 0,
             activeVisible: act ? (() => { const r = act.getBoundingClientRect(); return r.left >= strip.left - 1 && r.right <= strip.right + 1; })() : false };
  },
};
document.title; 0`;

const injectHelpers = () => js(HELPERS);

async function guestOf(tabIndexExpr = 'tabs.indexOf(active())') {
  const id = await js(`(() => { const t = tabs[${tabIndexExpr}]; return t && t.wv ? t.wv.getWebContentsId() : null; })()`);
  return id ? webContents.fromId(id) : null;
}
async function openUrlInActiveTab(url) {
  await click('#tabs .tab.active input');
  await sleep(120);
  const before = await js(`({ focus: document.activeElement.tagName + '.' + (document.activeElement.closest('.tab')?.className || document.activeElement.className), active: active().url })`);
  wc.insertText(url);
  await sleep(50);
  const typed = await js('document.activeElement.value');
  key('Return');
  const ok = await until(() => js(`!active().loading && active().url.startsWith(${JSON.stringify(url)})`), 15000);
  openUrlInActiveTab.debug = { ...before, typed, after: await js('active().url') };
  return ok;
}
async function resetUI() {
  await js(`document.activeElement?.blur(); while (closeProfileLayers()); closeOverview(); toggleCustomize(false); closeSheet('#ext-sheet'); closeSheet('#confirm-sheet');
    if (document.body.classList.contains('sidebar-open')) toggleSidebar(); 0`);
  await sleep(450);
}
async function goStart() {
  await js(`(() => { const t = tabs.find((x) => x.url === START); if (t) activate(t.id); else newTab(START, false); })(); 0`);
  await sleep(500);
}
async function memoryMB() {
  return Math.round(app.getAppMetrics().reduce((a, m) => a + (m.memory?.workingSetSize || 0), 0) / 1024);
}

/* ───────────── Visual: captura, contraste e comparação ───────────── */
function lum([r, g, b]) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

async function shot(name) {
  const img = await wc.capturePage();
  fs.writeFileSync(path.join(SCREENS, `${PASS}-${name}.png`), img.toPNG());
  return img;
}

/** Contraste real: cor do texto contra a mediana dos pixels do fundo capturado atrás dele. */
async function contrast(suite, label, selectors, img) {
  const boxes = await js(`__kt.textBoxes(${JSON.stringify(selectors)})`);
  const size = img.getSize();
  const scale = size.width / (await js('innerWidth'));
  const bmp = img.toBitmap(); // BGRA
  const worst = {};
  for (const b of boxes) {
    const [x, y, w, h] = b.rect.map((v) => Math.round(v * scale));
    const px = [[], [], []];
    for (let yy = Math.max(0, y); yy < Math.min(size.height, y + h); yy += 1)
      for (let xx = Math.max(0, x); xx < Math.min(size.width, x + w); xx += 1) {
        const i = (yy * size.width + xx) * 4;
        px[0].push(bmp[i + 2]); px[1].push(bmp[i + 1]); px[2].push(bmp[i]);
      }
    if (!px[0].length) continue;
    const med = px.map((ch) => ch.sort((p, q) => p - q)[ch.length >> 1]);
    const a = b.color[3] * b.opacity;
    const fg = b.color.slice(0, 3).map((c, i) => c * a + med[i] * (1 - a));
    const r = ratio(fg, med);
    const need = b.size >= 18 || (b.size >= 14 && b.weight >= 600) ? 3 : 4.5;
    if (!worst[b.sel] || r / need < worst[b.sel].r / worst[b.sel].need) worst[b.sel] = { r, need, text: b.text };
  }
  for (const [sel, w] of Object.entries(worst)) {
    const st = w.r >= w.need ? 'PASS' : w.r >= 3 ? 'WARN' : 'FAIL';
    record(suite, `contraste ${label}: ${sel}`, st, `${w.r.toFixed(2)}:1 (mínimo ${w.need}:1) “${w.text}”`);
  }
}

async function compareBaseline(suite, name, img) {
  const file = path.join(BASELINE, `${name}.png`);
  if (UPDATE_BASELINE || !fs.existsSync(file)) {
    fs.mkdirSync(BASELINE, { recursive: true });
    fs.writeFileSync(file, img.toPNG());
    record(suite, `referência visual: ${name}`, 'INFO', 'captura de referência criada');
    return;
  }
  const { nativeImage } = require('electron');
  const ref = nativeImage.createFromPath(file);
  const a = img.toBitmap(); const b = ref.toBitmap();
  const sa = img.getSize(); const sb = ref.getSize();
  if (sa.width !== sb.width || sa.height !== sb.height) {
    record(suite, `referência visual: ${name}`, 'WARN', `tamanho mudou (${sb.width}×${sb.height} → ${sa.width}×${sa.height})`);
    return;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 4)
    if (Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) > 32) diff++;
  const pct = (diff / (a.length / 4)) * 100;
  fs.writeFileSync(path.join(SCREENS, `${PASS}-${name}.png`), img.toPNG());
  record(suite, `referência visual: ${name}`, pct < 0.5 ? 'PASS' : pct < 3 ? 'WARN' : 'FAIL', `${pct.toFixed(2)}% dos pixels diferentes`);
}

/* ───────────── Suítes ───────────── */
async function suiteBoot() {
  const S = 'abertura';
  const g = timings.ready < 1500 ? 'PASS' : timings.ready < 3000 ? 'WARN' : 'FAIL';
  record(S, 'tempo até a interface aparecer', g, `janela ${timings.readyToShow} ms · pronta ${timings.ready} ms (desde o início do processo)`);
  if (bootFrames) { const st = stats(bootFrames); record(S, 'animação de abertura', grade(st), fmt(st), st); }
}

const PANELS = {
  'barra lateral': { open: () => key('L', ['control', 'shift']), close: () => key('L', ['control', 'shift']) },
  personalizar: { open: () => click('#btn-customize'), close: () => key('Escape') },
  'visão geral': { open: () => click('#btn-overview'), close: () => key('Escape') },
  'nova aba': { open: () => key('T', ['control']), close: () => key('W', ['control']) },
  extensões: { open: () => js('openExtensions(); 0'), close: () => key('Escape') },
  sugestões: { open: async () => { await click('#tabs .tab.active input'); await sleep(30); wc.insertText('kona'); }, close: () => js('document.activeElement.blur(); 0') },
  'menu de perfis': { open: () => js('toggleSidebar(); toggleProfilePop(true); 0'), close: () => js('toggleProfilePop(false); toggleSidebar(); 0') },
};

async function suiteFirstOpens() {
  const S = PASS === 'cold' ? 'primeiras aberturas (perfil novo)' : 'primeiras aberturas (logo após abrir)';
  if (PASS === 'cold') {
    await until(() => js(`!document.body.classList.contains('warming') && !document.getElementById('warm')`), 8000);
    await sleep(1200);
  } else {
    await sleep(400);
  }
  for (const [name, p] of Object.entries(PANELS)) {
    await perf(S, `1ª vez: ${name}`, p.open);
    await sleep(250); await p.close(); await sleep(550);
  }
  if (PASS !== 'cold') return;
  const S2 = 'aberturas repetidas';
  for (const [name, p] of Object.entries(PANELS)) {
    await perf(S2, `2ª vez: ${name}`, p.open);
    await sleep(250); await p.close(); await sleep(550);
  }
  await click('#btn-customize'); await sleep(500);
  await perf(S2, 'trocar tema (escuro → claro)', () => click('#seg-theme [data-theme="light"]'));
  await perf(S2, 'trocar tema (claro → escuro)', () => click('#seg-theme [data-theme="dark"]'));
  await perf(S2, 'trocar fundo (fade)', () => click('.wp-swatch[data-wp="oceano"]'));
  await sleep(300);
  await click('.wp-swatch[data-wp="aurora"]');
  await resetUI();
}

async function suitePages() {
  const S = 'páginas';
  await goStart();
  const t0 = Date.now();
  const ok = await openUrlInActiveTab(`${base}/text`);
  record('bugs', 'digitar endereço e abrir página', ok ? 'PASS' : 'FAIL', ok ? `carregou em ${Date.now() - t0} ms` : `não carregou ${JSON.stringify(openUrlInActiveTab.debug)}`);
  if (!ok) return;
  await sleep(500);
  const guest = await guestOf();

  // Layout: a página começa abaixo da barra; o cabeçalho fixo do site continua visível e clicável
  const tbBottom = await js(`document.getElementById('toolbar').getBoundingClientRect().bottom`);
  const wvTop = await js(`active().wv.getBoundingClientRect().top`);
  record('bugs', 'página começa logo abaixo da barra', Math.abs(tbBottom - wvTop) < 1 ? 'PASS' : 'FAIL', `barra termina em ${tbBottom}px, página começa em ${wvTop}px`);
  await guest.executeJavaScript('window.scrollTo(0, 900); 0');
  await sleep(200);
  const sticky = await guest.executeJavaScript(`(() => { const h = document.getElementById('sticky').getBoundingClientRect();
    const t = document.elementFromPoint(30, 20); return { top: h.top, hit: t && t.id === 'sticky' }; })()`);
  record('bugs', 'cabeçalho “sticky” do site visível e clicável', sticky.top === 0 && sticky.hit ? 'PASS' : 'FAIL', `topo ${sticky.top}px, clique acerta: ${sticky.hit}`);
  await guest.executeJavaScript('window.scrollTo(0, 0); 0');

  const tbFilter = await js(`getComputedStyle(document.getElementById('toolbar'), '::before').backdropFilter`);
  record('visual', 'barra sólida e sem desfoque em abas de site', tbFilter === 'none' ? 'PASS' : 'FAIL', `backdrop-filter: ${tbFilter}`);

  // Rolagem de texto: quadros da página e da interface ao mesmo tempo
  const scrollPerf = async (label, g) => {
    await g.executeJavaScript('window.scrollTo(0, 0); 0');
    await sleep(300);
    const pg = g.executeJavaScript(`(${MEASURE_SRC})(1300)`, true);
    const ui = js(`(${MEASURE_SRC})(1300)`);
    await sleep(40);
    await scrollFor(g, 500, 400, 1100, -120);
    const [fp, fu] = [stats(await pg), stats(await ui)];
    const y = await g.executeJavaScript('scrollY');
    record(S, `${label}: quadros da página`, y > 200 ? grade(fp) : 'FAIL', `${fmt(fp)} · rolou ${Math.round(y)}px`, fp);
    record(S, `${label}: quadros da interface`, grade(fu), fmt(fu), fu);
  };
  await scrollPerf('rolar artigo longo', guest);

  // Página pesada numa nova aba
  await js(`newTab(${JSON.stringify(base + '/heavy')}, false); 0`);
  await until(() => js(`!active().loading && active().url.includes('/heavy')`), 15000);
  await sleep(800);
  await scrollPerf('rolar página pesada (animações + 360 cartões)', await guestOf());

  // Troca de abas: artigo ↔ pesada ↔ nova aba
  for (let i = 1; i <= 3; i++) await perf(S, `trocar aba com Ctrl+Tab (${i}/3)`, () => key('Tab', ['control'])), await sleep(400);

  // Cabeçalho position:fixed
  await js(`newTab(${JSON.stringify(base + '/fixed')}, false); 0`);
  await until(() => js(`!active().loading && active().url.includes('/fixed')`), 15000);
  await sleep(300);
  const fixedHit = await (await guestOf()).executeJavaScript(`(() => { const t = document.elementFromPoint(30, 20); return t && t.id; })()`);
  record('bugs', 'cabeçalho “fixed” do site visível e clicável', fixedHit === 'fixed' ? 'PASS' : 'FAIL', `clique acerta: ${fixedHit}`);

  // Popup vira nova aba
  await js(`newTab(${JSON.stringify(base + '/popup')}, false); 0`);
  await until(() => js(`!active().loading && active().url.includes('/popup')`), 15000);
  const before = await js('tabs.length');
  await (await guestOf()).executeJavaScript(`document.getElementById('open').click(); 0`, true);
  const popOk = await until(() => js(`tabs.length === ${before + 1} && tabs.some((t) => t.url.endsWith('/text') && t !== tabs[0])`), 5000);
  record('bugs', 'window.open() do site abre nova aba', popOk ? 'PASS' : 'FAIL');

  // Voltar da página para a nova aba e avançar de novo
  await js(`activate(tabs[0].id); 0`); await sleep(400);
  await click('#back');
  const backOk = await until(() => js(`active().url === START && document.getElementById('start').classList.contains('show')`), 3000);
  record('bugs', 'voltar de uma página para a nova aba', backOk ? 'PASS' : 'FAIL');
  const fwd = await js(`!document.getElementById('fwd').disabled`);
  record('bugs', 'avançar depois de voltar para a nova aba', fwd ? 'PASS' : 'WARN', fwd ? '' : 'botão Avançar fica desativado (a página anterior se perde)');
}

async function suiteManyTabs() {
  const S = 'muitas abas';
  await resetUI();
  await perf('páginas', 'abrir uma aba com página (caso comum)', () => js(`newTab(${JSON.stringify(base + '/text?single')}, false); 0`), { ms: 1200 });
  await sleep(600);
  await perf('páginas', 'fechar essa aba', () => key('W', ['control']), { ms: 900 });
  await sleep(600);
  const memBefore = await memoryMB();
  const t0 = Date.now();
  await perf(S, 'abrir 12 abas em sequência', async () => {
    for (let i = 0; i < 12; i++) { await js(`newTab(${JSON.stringify(`${base}/text?n=${i}`)}, false); 0`); await sleep(60); }
  }, { ms: 1400, stress: true });
  await until(() => js(`tabs.every((t) => !t.loading)`), 20000);
  record(S, 'tempo para carregar 12 abas', 'INFO', `${Date.now() - t0} ms`);
  const memPeak = await memoryMB();
  await sleep(400);
  await perf(S, 'visão geral com todas as abas', () => click('#btn-overview'));
  await sleep(300); key('Escape'); await sleep(500);
  const n = await js('tabs.length');
  await perf(S, `fechar ${n - 1} abas com Ctrl+W rapidamente`, async () => {
    for (let i = 0; i < n - 1; i++) { key('W', ['control']); await sleep(40); }
  }, { ms: 1400, stress: true });
  await sleep(1800);
  const dom = await js(`({ tabs: tabs.length, els: document.querySelectorAll('#tabs .tab').length,
    wv: document.querySelectorAll('#views webview').length, wvExpected: tabs.filter((t) => t.wv).length + tabs.filter((t) => t.parked).length })`);
  const guests = webContents.getAllWebContents().filter((w) => w.getType() === 'webview' && !w.isDestroyed()).length;
  const okDom = dom.els === dom.tabs && dom.wv === dom.wvExpected && guests === dom.wvExpected;
  record('bugs', 'abas fechadas somem do DOM e liberam a página', okDom ? 'PASS' : 'FAIL', JSON.stringify({ ...dom, processos: guests }));
  await sleep(1500);
  const memAfter = await memoryMB();
  record(S, 'memória (abertura → 13 abas → depois de fechar)', memAfter <= memBefore * 1.35 ? 'PASS' : 'WARN', `${memBefore} MB → ${memPeak} MB → ${memAfter} MB`);
}

async function suiteWindow() {
  const S = 'janela';
  await resetUI(); await goStart();
  const b = win.getBounds();
  await perf(S, 'redimensionar (30 passos)', async () => {
    for (let i = 0; i < 30; i++) { win.setBounds({ ...b, width: b.width - i * 12, height: b.height - i * 7 }); await sleep(16); }
    win.setBounds(b);
  }, { ms: 1100 });
  await sleep(400);
  await perf(S, 'maximizar', () => win.maximize(), { ms: 800 });
  await sleep(500);
  await perf(S, 'restaurar', () => win.unmaximize(), { ms: 800 });
  await sleep(500);
  win.setBounds(b);

  // Rolagem da nova aba com todas as seções: conteúdo passando por baixo da barra acrílica
  // conteúdo suficiente para a nova aba precisar rolar (favoritos extras, removidos no fim)
  await js(`Object.keys(settings.sections).forEach((k) => settings.sections[k] = true); applySections();
    window.__bmBackup = structuredClone(bookmarks.list);
    for (let i = 0; i < 16; i++) bookmarks.list.push({ id: 'x' + i, url: 'https://exemplo' + i + '.test', title: 'Exemplo ' + i });
    renderStartContent(); 0`);
  win.setSize(b.width, 520);
  await sleep(600);
  const scrollable = await js(`(() => { const s = document.querySelector('.start-scroll'); return s.scrollHeight > s.clientHeight + 50; })()`);
  if (scrollable) {
    const st = await perf(S, 'rolar a nova aba por baixo da barra acrílica', () => scrollFor(wc, 600, 400, 1000, -100), { ms: 1200 });
    const moved = await js(`document.querySelector('.start-scroll').scrollTop`);
    if (moved < 50) record(S, 'a nova aba rolou de fato no teste', 'FAIL', `rolou ${moved}px`);
    else record(S, 'a nova aba rolou de fato no teste', 'PASS', `rolou ${Math.round(moved)}px`);
  } else {
    record(S, 'rolar a nova aba por baixo da barra acrílica', 'WARN', 'conteúdo não ficou rolável no teste');
  }
  await js(`bookmarks.list = window.__bmBackup; bookmarks.save(); renderStartContent();
    settings.sections = { favorites: true, frequent: false, privacy: false, reading: false }; applySections();
    document.querySelector('.start-scroll').scrollTop = 0; 0`);
  win.setBounds(b);
  await sleep(500);
}

async function suiteBugs() {
  const S = 'bugs';
  await resetUI(); await goStart();

  // Cliques chegam aos controles (regressão da camada invisível que roubava cliques)
  const states = {
    'nova aba': null,
    'barra lateral aberta': () => js('toggleSidebar(); 0'),
    'personalizar aberto': () => js('toggleCustomize(true); 0'),
  };
  const sels = {
    'nova aba': '#toolbar button, #tabs .tab, .fav-item, #btn-customize',
    'barra lateral aberta': '#sidebar button',
    'personalizar aberto': '#custom-pop button, #custom-pop .wp-swatch',
  };
  for (const [st, enter] of Object.entries(states)) {
    if (enter) { await enter(); await sleep(600); }
    const hits = await js(`__kt.hit(${JSON.stringify(sels[st])})`);
    const bad = hits.filter((h) => !h.ok);
    record(S, `cliques chegam aos controles (${st})`, bad.length ? 'FAIL' : 'PASS', bad.length ? `${bad.length}/${hits.length} bloqueados: ${bad.slice(0, 4).map((h) => h.sel + '→' + h.got).join(', ')}` : `${hits.length} controles`);
    await resetUI();
  }

  // Atalhos
  const n0 = await js('tabs.length');
  key('T', ['control']); await sleep(400);
  const n1 = await js('tabs.length');
  const focused = await js(`document.activeElement === document.querySelector('#tabs .tab.active input')`);
  key('W', ['control']); await sleep(400);
  const n2 = await js('tabs.length');
  key('L', ['control']); await sleep(200);
  const lFocus = await js(`document.activeElement === document.querySelector('#tabs .tab.active input')`);
  key('Escape'); await sleep(100);
  await js(`newTab(START, false); 0`); await sleep(300);
  const id0 = await js('activeId'); key('Tab', ['control']); await sleep(300);
  const id1 = await js('activeId');
  await js(`while (tabs.length > 1) closeTab(tabs[tabs.length - 1].id); 0`); await sleep(400);
  record(S, 'Ctrl+T abre aba com o endereço em foco', n1 === n0 + 1 && focused ? 'PASS' : 'FAIL', `abas ${n0}→${n1}, foco no endereço: ${focused}`);
  record(S, 'Ctrl+W fecha a aba', n2 === n0 ? 'PASS' : 'FAIL', `abas ${n1}→${n2}`);
  record(S, 'Ctrl+L foca o endereço', lFocus ? 'PASS' : 'FAIL');
  record(S, 'Ctrl+Tab troca de aba', id0 !== id1 ? 'PASS' : 'FAIL');

  const sb = () => js(`document.body.classList.contains('sidebar-open')`);
  key('Z', ['alt']); await sleep(300);
  const opened = await sb();
  key('Z', ['alt']); await sleep(300);
  record(S, 'Alt+Z abre e fecha a barra lateral', opened && !(await sb()) ? 'PASS' : 'FAIL');
  await js(`newTab(${JSON.stringify(base + '/blank')}, false); 0`);
  await until(() => js(`!active().loading`), 8000); await sleep(300);
  const g = await guestOf();
  g.focus(); key('Z', ['alt'], g); await sleep(400);
  const fromPage = await sb();
  if (fromPage) await js('toggleSidebar(); 0');
  record(S, 'Alt+Z funciona com o foco dentro de uma página', fromPage ? 'PASS' : 'FAIL');
  await js(`while (tabs.length > 1) closeTab(tabs[tabs.length - 1].id); 0`); await sleep(500);

  // Ctrl+W com uma única aba fecha o navegador (o teste intercepta o fechamento)
  let closeAttempts = 0;
  const block = (e) => { closeAttempts++; e.preventDefault(); };
  win.on('close', block);
  key('W', ['control']); await sleep(400);
  win.removeListener('close', block);
  const stillOne = await js('tabs.length === 1');
  record(S, 'Ctrl+W na última aba fecha o navegador', closeAttempts === 1 && stillOne ? 'PASS' : 'FAIL', `pedidos de fechamento: ${closeAttempts}`);
  await goStart();

  // Interpretação do que é digitado no endereço
  const cases = await js(`[
    ['kona.dev', toUrl('kona.dev')], ['localhost:3000', toUrl('localhost:3000')],
    ['127.0.0.1:8080/a', toUrl('127.0.0.1:8080/a')], ['como fazer pão', toUrl('como fazer pão')],
    ['http://x.y/z', toUrl('http://x.y/z')], ['   ', toUrl('   ')], ['arquivo.pdf', toUrl('arquivo.pdf')],
  ]`);
  const expect = {
    'kona.dev': 'https://kona.dev', 'localhost:3000': 'http://localhost:3000', '127.0.0.1:8080/a': 'http://127.0.0.1:8080/a',
    'como fazer pão': 'https://www.google.com/search?q=como%20fazer%20p%C3%A3o', 'http://x.y/z': 'http://x.y/z', '   ': null,
  };
  const wrong = cases.filter(([i, o]) => i in expect && expect[i] !== o);
  record(S, 'endereço digitado vira URL ou busca', wrong.length ? 'FAIL' : 'PASS', wrong.map(([i, o]) => `“${i}” → ${o}`).join('; '));
  const pdf = cases.find(([i]) => i === 'arquivo.pdf')[1];
  record(S, '“arquivo.pdf” é tratado como site', 'INFO', `vira ${pdf}`);

  // Fechar todas as abas deixa uma nova aba
  await js(`[...tabs].forEach((t) => closeTab(t.id)); 0`); await sleep(700);
  const last = await js(`({ n: tabs.length, start: active().url === START, els: document.querySelectorAll('#tabs .tab:not(.leaving)').length })`);
  record(S, 'fechar todas as abas deixa uma nova aba', last.n === 1 && last.start && last.els === 1 ? 'PASS' : 'FAIL', JSON.stringify(last));

  // Estresse: abrir e fechar muito rápido
  for (let i = 0; i < 10; i++) key('T', ['control']);
  await sleep(50);
  for (let i = 0; i < 10; i++) key('W', ['control']);
  await sleep(1000);
  const st = await js(`({ tabs: tabs.length, els: document.querySelectorAll('#tabs .tab:not(.leaving)').length,
    leaving: document.querySelectorAll('#tabs .tab.leaving').length, active: !!document.querySelector('#tabs .tab.active') })`);
  record(S, 'abrir/fechar 10 abas muito rápido mantém tudo consistente', st.tabs === st.els && st.leaving === 0 && st.active ? 'PASS' : 'FAIL', JSON.stringify(st));

  // Troca rápida de fundos não acumula camadas
  await js('toggleCustomize(true); 0'); await sleep(400);
  for (const wp of ['grafite', 'noite', 'oceano', 'floresta', 'brasa', 'areia', 'nevoa', 'aurora']) { await click(`.wp-swatch[data-wp="${wp}"]`); await sleep(40); }
  await sleep(1200);
  const layers = await js(`document.querySelectorAll('.wp-layer').length`);
  record(S, 'troca rápida de fundos não acumula camadas', layers <= 2 ? 'PASS' : 'FAIL', `${layers} camada(s) restantes`);
  await resetUI();

  // Hover nos favoritos
  await hover('.fav-item', 0); await sleep(500);
  const tf = await js(`getComputedStyle(document.querySelector('.fav-item .tile')).transform`);
  record(S, 'hover nos favoritos', tf !== 'none' ? 'PASS' : 'FAIL', `transform: ${tf}`);
  await hover('#tabs'); await sleep(200);

  // Folha de extensões
  await js('openExtensions(); 0'); await sleep(500);
  const open = await js(`document.getElementById('scrim').classList.contains('show') && document.getElementById('ext-sheet').classList.contains('show')`);
  key('Escape'); await sleep(500);
  const closed = await js(`!document.getElementById('scrim').classList.contains('show') && !document.getElementById('ext-sheet').classList.contains('show')`);
  record(S, 'folha de extensões abre e fecha com Esc', open && closed ? 'PASS' : 'FAIL');

  // Aquecimento da GPU terminou e não deixou lixo
  const warm = await js(`({ warming: document.body.classList.contains('warming'), box: !!document.getElementById('warm') })`);
  record(S, 'aquecimento da GPU não deixa resíduos', !warm.warming && !warm.box ? 'PASS' : 'FAIL', JSON.stringify(warm));

  // Fonte carregada
  const font = await js(`document.fonts.check('13px "Inter Variable"')`);
  record(S, 'fonte Inter carregada', font ? 'PASS' : 'WARN');

  // Tema: interface + páginas (nativeTheme)
  await js(`settings.theme = 'light'; applyTheme(); 0`); await sleep(300);
  const light = { ui: await js(`document.documentElement.dataset.theme`), native: nativeTheme.shouldUseDarkColors };
  await js(`settings.theme = 'dark'; applyTheme(); 0`); await sleep(300);
  record(S, 'tema claro vale para a interface e para as páginas', light.ui === 'light' && light.native === false ? 'PASS' : 'FAIL', JSON.stringify(light));

  // Barra acrílica segue o tom do fundo da nova aba
  await js(`settings.wallpaper = 'areia'; applyWallpaper(); 0`); await sleep(400);
  const tone = await js(`({ cls: document.getElementById('toolbar').className, filter: getComputedStyle(document.getElementById('toolbar'), '::before').backdropFilter })`);
  await js(`settings.wallpaper = 'aurora'; applyWallpaper(); 0`); await sleep(400);
  record(S, 'barra acrílica segue o tom do fundo (fundo claro no tema escuro)', tone.cls.includes('tone-light') && tone.filter.includes('blur') ? 'PASS' : 'FAIL', JSON.stringify(tone));

  // Persistência dos ajustes ao recarregar
  await js(`settings.theme = 'light'; settings.wallpaper = 'oceano'; saveSettings(); 0`);
  wc.reload();
  await sleep(500);
  await until(() => js(`document.body.classList.contains('ready')`), 10000);
  await injectHelpers();
  const persisted = await js(`({ theme: settings.theme, wp: settings.wallpaper, attr: document.documentElement.dataset.theme })`);
  record(S, 'ajustes continuam depois de recarregar', persisted.theme === 'light' && persisted.wp === 'oceano' && persisted.attr === 'light' ? 'PASS' : 'FAIL', JSON.stringify(persisted));
  await js(`settings.theme = 'dark'; settings.wallpaper = 'aurora'; saveSettings(); applyTheme(); 0`);
  await sleep(2500); // deixa o aquecimento e o pré-carregamento terminarem
}

const omRows = () => js(`[...document.querySelectorAll('#omnibox.show .om-row')].map((r) => r.querySelector('.om-text').innerText.trim())`);

async function suiteAddress() {
  const S = 'endereço';
  await resetUI(); await goStart();
  await js(`while (tabs.length > 1) closeTab(tabs[tabs.length - 1].id); 0`); await sleep(700);
  const b0 = win.getBounds();
  const centerOff = () => js(`(() => { const r = document.querySelector('#tabs .tab.active').getBoundingClientRect(); return Math.round(r.left + r.width / 2 - innerWidth / 2); })()`);
  for (const width of [1360, 900]) {
    win.setBounds({ ...b0, width }); await sleep(700);
    const off = await centerOff();
    record(S, `uma aba só: caixa centralizada na janela (${width}px)`, Math.abs(off) <= 2 ? 'PASS' : 'FAIL', `${off}px do centro`);
  }
  win.setBounds(b0); await sleep(400);
  await perf(S, 'abrir 2ª aba: caixa desliza do centro para a esquerda', () => js('newTab(START, false); 0'), { ms: 700 });
  await sleep(300);
  const padTwo = await js(`getComputedStyle(document.getElementById('tabs')).paddingLeft`);
  record(S, 'com duas abas a faixa volta a começar na esquerda', padTwo === '4px' ? 'PASS' : 'FAIL', `padding-left ${padTwo}`);
  await perf(S, 'fechar 2ª aba: caixa volta ao centro', () => js('closeTab(activeId); 0'), { ms: 800 });
  await sleep(300);
  const offBack = await centerOff();
  record(S, 'ao voltar a uma aba, a caixa recentraliza', Math.abs(offBack) <= 2 ? 'PASS' : 'FAIL', `${offBack}px do centro`);
  const tryClick = async (label, fx) => {
    await js('document.activeElement?.blur(); 0'); await sleep(250);
    const p = await js(`(() => { const r = document.querySelector('#tabs .tab.active').getBoundingClientRect();
      return [Math.round(r.left + r.width * ${fx}), Math.round(r.top + r.height / 2)]; })()`);
    const what = await js(`(() => { const e = document.elementFromPoint(${p[0]}, ${p[1]}); return e.tagName + '.' + e.className; })()`);
    wc.sendInputEvent({ type: 'mouseMove', x: p[0], y: p[1] });
    wc.sendInputEvent({ type: 'mouseDown', x: p[0], y: p[1], button: 'left', clickCount: 1 });
    wc.sendInputEvent({ type: 'mouseUp', x: p[0], y: p[1], button: 'left', clickCount: 1 });
    await sleep(200);
    const ok = await js(`document.activeElement === document.querySelector('#tabs .tab.active input') && document.querySelector('#tabs .tab.active').classList.contains('editing')`);
    record(S, `clicar ${label} foca o campo`, ok ? 'PASS' : 'FAIL', `ponto em ${(fx * 100).toFixed(0)}% da caixa (${what})`);
  };
  for (const fx of [0.12, 0.3, 0.7, 0.92]) await tryClick(`na nova aba, a ${(fx * 100).toFixed(0)}% da caixa`, fx);
  await js(`document.activeElement?.blur(); newTab(${JSON.stringify(base + '/text')}, false); 0`);
  await until(() => js('!active().loading'), 8000); await sleep(300);
  for (const fx of [0.15, 0.35, 0.65, 0.85]) await tryClick(`numa aba de site, a ${(fx * 100).toFixed(0)}% da caixa`, fx);
  // o botão recarregar continua recarregando (e não foca o campo)
  await js('document.activeElement?.blur(); 0'); await sleep(250);
  const reloads = await js(`(() => { let n = 0; const wv = active().wv; wv.addEventListener('did-start-loading', () => n++); window.__reloads = () => n; return 0; })()`);
  await hover('#tabs .tab.active'); await sleep(150);
  await click('#tabs .tab.active .reload'); await sleep(500);
  const rel = await js(`({ n: __reloads(), focused: document.activeElement === document.querySelector('#tabs .tab.active input') })`);
  record(S, 'botão recarregar recarrega e não foca o campo', rel.n >= 1 && !rel.focused ? 'PASS' : 'FAIL', JSON.stringify(rel));
  await js(`document.activeElement?.blur(); while (tabs.length > 1) closeTab(tabs[tabs.length - 1].id); 0`); await sleep(400);
}

async function suiteSidebar() {
  const S = 'menu lateral';
  await resetUI(); await goStart();
  const isOpen = () => js(`document.body.classList.contains('sidebar-open')`);
  const open = async () => { if (!(await isOpen())) key('Z', ['alt']); await sleep(450); };
  const at = async (x, y) => {
    wc.sendInputEvent({ type: 'mouseMove', x, y });
    wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
    await sleep(350);
  };
  const W = (await js('innerWidth'));

  await open(); await at(Math.round(W * 0.6), 600);
  record(S, 'clicar na nova aba (fora do menu) fecha', !(await isOpen()) ? 'PASS' : 'FAIL');

  await open(); await click('#tabs .tab.active input'); await sleep(300);
  record(S, 'clicar na barra de endereço fecha o menu', !(await isOpen()) ? 'PASS' : 'FAIL');
  await js('document.activeElement.blur(); 0'); await sleep(200);

  await open(); await click('.sb-item', 2); await sleep(200);
  record(S, 'clicar num item dentro do menu não fecha', (await isOpen()) ? 'PASS' : 'FAIL');

  await click('#sb-profile'); await sleep(350);
  const popOpen = await js(`document.getElementById('profile-pop').classList.contains('show')`);
  await click('#pf-edit'); await sleep(500);
  await click('#pf-name'); await sleep(150);
  record(S, 'menu de perfis e janela de perfil não fecham o menu', popOpen && (await isOpen()) ? 'PASS' : 'FAIL');
  key('Escape'); await sleep(400);

  await click('#btn-sidebar'); await sleep(400);
  const closedByBtn = !(await isOpen());
  await click('#btn-sidebar'); await sleep(400);
  record(S, 'botão do menu continua abrindo e fechando', closedByBtn && (await isOpen()) ? 'PASS' : 'FAIL');

  key('Escape'); await sleep(300);
  record(S, 'Esc fecha o menu', !(await isOpen()) ? 'PASS' : 'FAIL');

  // clicar dentro de uma página de site (outro processo): o foco vai para a página e o menu fecha
  await js(`newTab(${JSON.stringify(base + '/text')}, false); 0`);
  await until(() => js('!active().loading'), 8000); await sleep(300);
  const g = await guestOf();
  g.focus(); await sleep(200); // o foco já estava na página antes de abrir o menu (caso do Alt+Z)
  key('Z', ['alt'], g); await sleep(450);
  const openedFromPage = await isOpen();
  g.sendInputEvent({ type: 'mouseDown', x: 400, y: 300, button: 'left', clickCount: 1 });
  g.sendInputEvent({ type: 'mouseUp', x: 400, y: 300, button: 'left', clickCount: 1 });
  await sleep(400);
  record(S, 'clicar dentro de uma página de site fecha o menu', openedFromPage && !(await isOpen()) ? 'PASS' : 'FAIL', `abriu com Alt+Z na página: ${openedFromPage}`);
  await js(`while (tabs.length > 1) closeTab(tabs[tabs.length - 1].id); 0`); await sleep(400);
}

async function suiteLibrary() {
  const S = 'biblioteca';
  await resetUI(); await goStart();
  await js(`while (tabs.length > 1) closeTab(tabs[tabs.length - 1].id); browseHistory.clear(); 0`); await sleep(500);
  const T = (p) => `${base}${p}`;
  await openUrlInActiveTab(T('/text')); await sleep(300);
  await js(`newTab(${JSON.stringify(T('/heavy'))}, false); 0`); await until(() => js('!active().loading'), 8000);
  await sleep(1500); // deixa a página pesada assentar antes de medir

  // lista de abas no menu
  await perf(S, 'abrir o menu com a lista de abas', () => js('toggleSidebar(true); 0'), { ms: 700 });
  await sleep(300);
  const rows = await js(`[...document.querySelectorAll('#sb-sets .sb-tab:not(.new)')].map((r) => r.textContent.trim())`);
  record(S, 'menu lista as abas abertas', rows.length === 2 && rows[0].includes('Artigo') ? 'PASS' : 'FAIL', JSON.stringify(rows));
  await click('#sb-sets .sb-tab:not(.new)', 0); await sleep(300);
  record(S, 'clicar numa aba do menu ativa a aba', (await js('active().url')).endsWith('/text') ? 'PASS' : 'FAIL');

  // grupo: criar pela interface
  await click('[data-act="new-group"]'); await sleep(200);
  wc.insertText('Viagem'); key('Return'); await sleep(900);
  const g = await js(`({ key: library.currentKey(), name: tabSets.group(library.currentKey())?.name, tabs: tabs.length, start: active().url === START })`);
  record(S, 'criar grupo de abas (abre com uma nova aba)', g.name === 'Viagem' && g.tabs === 1 && g.start ? 'PASS' : 'FAIL', JSON.stringify(g));
  await openUrlInActiveTab(T('/fixed')); await sleep(300);
  await js('toggleSidebar(true); 0'); await sleep(450); // digitar o endereço é um clique fora do menu
  await perf(S, 'trocar para as abas sem grupo', () => click('#sb-sets [data-set="default"]'), { ms: 900 });
  await sleep(500);
  const back = await js(`tabs.map((t) => t.url.split('/').pop())`);
  record(S, 'voltar às abas sem grupo restaura as abas delas', JSON.stringify(back) === '["text","heavy"]' ? 'PASS' : 'FAIL', JSON.stringify(back));
  await click('#sb-groups [data-set]'); await sleep(800);
  const inGroup = await js(`tabs.map((t) => t.url.split('/').pop())`);
  record(S, 'voltar ao grupo restaura a página aberta nele', JSON.stringify(inGroup) === '["fixed"]' ? 'PASS' : 'FAIL', JSON.stringify(inGroup));
  // renomear e apagar
  await hover('#sb-groups .sb-item.set'); await sleep(150);
  await click('#sb-groups [data-act="rename-group"]'); await sleep(200);
  await js(`document.querySelector('#sidebar .sb-edit').select(); 0`); wc.insertText('Lisboa'); key('Return'); await sleep(300);
  const renamed = await js(`tabSets.data.groups[0]?.name`);
  record(S, 'renomear grupo', renamed === 'Lisboa' ? 'PASS' : 'FAIL', renamed);
  await hover('#sb-groups .sb-item.set'); await sleep(150);
  await click('#sb-groups [data-act="delete-group"]'); await sleep(400);
  await click('#ask-yes'); await sleep(900);
  const del = await js(`({ groups: tabSets.data.groups.length, key: library.currentKey(), tabs: tabs.length })`);
  record(S, 'apagar grupo (com confirmação) volta às abas sem grupo', del.groups === 0 && del.key === 'default' && del.tabs === 2 ? 'PASS' : 'FAIL', JSON.stringify(del));

  // favoritos: estrela, menu, nova aba, renomear, remover, Ctrl+D
  await js(`activate(tabs[0].id); 0`); await sleep(300);
  await hover('#tabs .tab.active'); await sleep(100);
  await click('#tabs .tab.active .bm'); await sleep(300);
  const bm = await js(`({ saved: !!bookmarks.find(active().url), star: document.querySelector('#tabs .tab.active').classList.contains('bookmarked') })`);
  record(S, 'estrela na barra adiciona aos Favoritos', bm.saved && bm.star ? 'PASS' : 'FAIL', JSON.stringify(bm));
  await js('toggleSidebar(true); 0'); await sleep(450); // a estrela fica na barra (clique fora do menu)
  await click('[data-view="bookmarks"]'); await sleep(500);
  const bmRows = await js(`[...document.querySelectorAll('#sb-list .sb-row')].map((r) => r.querySelector('b')?.textContent)`);
  record(S, 'subtela de Favoritos mostra o favorito novo', bmRows.includes('Artigo de teste') ? 'PASS' : 'FAIL', `${bmRows.length} favoritos`);
  const idx = bmRows.indexOf('Artigo de teste');
  await hover('#sb-list .sb-row', idx); await sleep(120);
  await click('#sb-list .sb-row [data-act="rename-bm"]', 0 + (await js(`[...document.querySelectorAll('#sb-list .sb-row')].slice(0, ${idx}).length`) )); await sleep(200);
  await js(`document.querySelector('#sidebar .sb-edit').select(); 0`); wc.insertText('Meu artigo'); key('Return'); await sleep(300);
  record(S, 'renomear favorito', (await js(`bookmarks.find(${JSON.stringify(T('/text'))})?.title`)) === 'Meu artigo' ? 'PASS' : 'FAIL');
  key('D', ['control']); await sleep(300);
  record(S, 'Ctrl+D remove o favorito da página', !(await js(`!!bookmarks.find(active().url)`)) ? 'PASS' : 'FAIL');

  // lista de leitura
  key('D', ['control', 'shift']); await sleep(300);
  await click('#sb-back'); await sleep(450);
  await click('[data-view="reading"]'); await sleep(500);
  const rl = await js(`[...document.querySelectorAll('#sb-list .sb-row')].map((r) => r.querySelector('b').textContent)`);
  record(S, 'Ctrl+Shift+D guarda na Lista de Leitura', rl.includes('Artigo de teste') ? 'PASS' : 'FAIL', JSON.stringify(rl));
  await js(`newTab(START, false); 0`); await sleep(300);
  await click('#sb-list .sb-row'); await sleep(600);
  const read = await js(`({ url: active().url, read: readingList.items[0].read, unreadShown: document.querySelectorAll('#sb-list .sb-row').length })`);
  record(S, 'abrir item da lista marca como lido (e some de “Não lidos”)', read.url.endsWith('/text') && read.read && read.unreadShown === 0 ? 'PASS' : 'FAIL', JSON.stringify(read));

  // histórico
  await click('#sb-back'); await sleep(450);
  await perf(S, 'abrir a subtela de Histórico', () => click('[data-view="history"]'), { ms: 700 });
  await sleep(200);
  const hist = await js(`({ day: document.querySelector('#sb-list .sb-day')?.textContent, n: document.querySelectorAll('#sb-list .sb-row').length })`);
  record(S, 'histórico agrupado por dia', hist.day === 'Hoje' && hist.n >= 2 ? 'PASS' : 'FAIL', JSON.stringify(hist));
  wc.insertText('pesada'); await sleep(300);
  const found = await js(`[...document.querySelectorAll('#sb-list .sb-row b')].map((b) => b.textContent)`);
  record(S, 'busca no histórico', found.length === 1 && found[0] === 'Página pesada' ? 'PASS' : 'FAIL', JSON.stringify(found));
  await hover('#sb-list .sb-row'); await sleep(120);
  await click('#sb-list .sb-row [data-act="remove-hist"]'); await sleep(300);
  record(S, 'remover item do histórico', !(await js(`browseHistory.data.visits.some((v) => v.url.endsWith('/heavy'))`)) ? 'PASS' : 'FAIL');
  await click('[data-act="clear-history"]'); await sleep(450);
  await click('#clear-period input[value="all"]'); await click('#clear-yes'); await sleep(500);
  record(S, 'limpar todo o histórico', (await js(`browseHistory.data.visits.length + browseHistory.data.searches.length`)) === 0 ? 'PASS' : 'FAIL');
  key('Escape'); await sleep(450);
  const escBack = await js(`!document.getElementById('sidebar').classList.contains('sub-open') && document.body.classList.contains('sidebar-open')`);
  key('Escape'); await sleep(400);
  record(S, 'Esc volta da subtela e depois fecha o menu', escBack && !(await js(`document.body.classList.contains('sidebar-open')`)) ? 'PASS' : 'FAIL');

  // modo privado
  await js('toggleSidebar(true); 0'); await sleep(400);
  await perf(S, 'entrar no modo privado', () => click('#sb-sets [data-set="private"]'), { ms: 900 });
  await sleep(400);
  const pv = await js(`({ priv: document.body.classList.contains('private'), part: active().partition, ph: document.querySelector('#tabs .tab.active input').placeholder })`);
  record(S, 'modo privado: sessão em memória e barra indicando', pv.priv && /^kona-private-/.test(pv.part) && pv.ph.startsWith('Private browsing') ? 'PASS' : 'FAIL', JSON.stringify(pv));
  await js('toggleSidebar(false); 0'); await sleep(300);
  await openUrlInActiveTab(T('/text')); await sleep(300);
  await (await guestOf()).executeJavaScript(`document.cookie = 'privado=1; max-age=3600'; 0`);
  await click('#tabs .tab.active'); await sleep(150); wc.insertText('busca secreta'); key('Return'); await sleep(400);
  const noHist = await js(`!browseHistory.data.visits.length && !browseHistory.data.searches.length`);
  record(S, 'modo privado não grava histórico nem buscas', noHist ? 'PASS' : 'FAIL');
  await js('toggleSidebar(true); 0'); await sleep(400);
  await click('#sb-sets [data-set="default"]'); await sleep(900);
  const left = await js(`({ priv: document.body.classList.contains('private'), tabs: tabs.map((t) => t.url.split('/').pop()) })`);
  const leftover = await session.fromPartition(pv.part).cookies.get({});
  record(S, 'sair do modo privado apaga os dados da sessão', !left.priv && leftover.length === 0 ? 'PASS' : 'FAIL', `${leftover.length} cookie(s) · abas: ${left.tabs.join(', ')}`);
  await js('toggleSidebar(false); 0'); await sleep(300);

  // sessão: restaurar abas ao reabrir
  await js(`settings.startup = 'restore'; saveSettings(); library.saveCurrent(); 0`);
  wc.reload(); await sleep(500);
  await until(() => js(`document.body.classList.contains('ready')`), 10000);
  await injectHelpers(); await sleep(600);
  const restored = await js(`tabs.map((t) => t.url === START ? 'nova' : t.url.split('/').pop())`);
  record(S, 'reabrir com “restaurar abas” traz as abas de volta', restored.includes('text') && restored.length >= 2 ? 'PASS' : 'FAIL', JSON.stringify(restored));
  await js(`settings.startup = 'newtab'; saveSettings(); 0`);
  wc.reload(); await sleep(500);
  await until(() => js(`document.body.classList.contains('ready')`), 10000);
  await injectHelpers(); await sleep(600);
  const fresh = await js(`tabs.map((t) => t.url === START ? 'nova' : t.url.split('/').pop())`);
  record(S, 'reabrir com “nova aba” começa só com uma nova aba', JSON.stringify(fresh) === '["nova"]' ? 'PASS' : 'FAIL', JSON.stringify(fresh));
}

async function suiteSettings() {
  const S = 'configurações';
  await resetUI(); await goStart();
  await js(`while (tabs.length > 1) closeTab(tabs[tabs.length - 1].id); 0`); await sleep(400);
  const part = await js('PROFILES.currentProfile().partition');
  const ses = session.fromPartition(part);
  const setSel = (sel, value) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); el.value = ${JSON.stringify(String(value))}; el.dispatchEvent(new Event('change', { bubbles: true })); })(); 0`);

  // abrir e navegar
  await perf(S, 'abrir as Configurações (Ctrl+,)', async () => key(',', ['control']), { ms: 800 });
  await sleep(400);
  const open = await js(`({ url: active().url, show: document.getElementById('settings').classList.contains('show'), secs: document.querySelectorAll('.st-sec').length })`);
  record(S, 'Ctrl+, abre a página com as 8 seções', open.url === SETTINGS_URL && open.show && open.secs === 8 ? 'PASS' : 'FAIL', JSON.stringify(open));
  await click('.st-nav-item[data-go="downloads"]'); await sleep(900);
  const marked = await js(`document.querySelector('.st-nav-item.on')?.dataset.go`);
  record(S, 'navegação lateral leva à seção', marked === 'downloads' ? 'PASS' : 'FAIL', `marcada: ${marked}`);

  // buscador e sugestões
  await setSel('[data-set="searchEngine"]', 'duckduckgo'); await sleep(200);
  key('T', ['control']); await sleep(400); wc.insertText('teste'); key('Return'); await sleep(400);
  const ddg = await js('active().url');
  record(S, 'trocar o buscador vale na barra de endereço', ddg.startsWith('https://duckduckgo.com/?q=teste') ? 'PASS' : 'FAIL', ddg);
  await js(`settings.searchEngine = 'google'; settings.suggestions = false; saveSettings(); closeTab(activeId); 0`); await sleep(400);
  key('T', ['control']); await sleep(400); wc.insertText('hel'); await sleep(500);
  const off = await js(`({ rows: [...document.querySelectorAll('#omnibox.show .om-row')].map((r) => r.innerText.trim()),
    focus: document.activeElement.tagName, value: document.activeElement.value, url: active().url, tabs: tabs.length })`);
  record(S, 'desligar sugestões: nada é buscado ao digitar', off.rows.length === 1 ? 'PASS' : 'FAIL', JSON.stringify(off));
  await js(`document.activeElement.blur(); settings.suggestions = true; saveSettings(); closeTab(activeId); 0`); await sleep(400);

  // cookies de terceiros
  await ses.clearStorageData();
  const tpCookie = async () => (await ses.cookies.get({})).filter((c) => c.name === 'kona_tp').length;
  const visit3p = async () => {
    await js(`newTab(${JSON.stringify(base + '/3p')}, false); 0`);
    await until(() => js('!active().loading'), 8000); await sleep(500);
    await js('closeTab(activeId); 0'); await sleep(300);
  };
  await js(`settings.cookies = 'block-third-party'; saveSettings(); 0`); await sleep(200);
  await visit3p();
  const blocked = await tpCookie();
  await js(`settings.cookies = 'allow'; saveSettings(); 0`); await sleep(200);
  await visit3p();
  const allowed = await tpCookie();
  record(S, 'cookies de terceiros bloqueados (e gravados quando permitidos)', blocked === 0 && allowed === 1 ? 'PASS' : 'FAIL', `bloqueando: ${blocked} · permitindo: ${allowed}`);
  await js(`settings.cookies = 'block-third-party'; saveSettings(); 0`);

  // dados de sites: ver e remover
  await js(`openSettings('privacidade'); 0`); await sleep(500);
  await click('[data-do="sites"]'); await sleep(900);
  const siteRows = await js(`[...document.querySelectorAll('#sites-list .sb-row')].map((r) => r.dataset.site)`);
  const lhIdx = siteRows.indexOf('localhost');
  if (lhIdx >= 0) { await click('#sites-list [data-remove-site]', lhIdx); await sleep(700); }
  record(S, 'dados de sites: lista e remove os cookies de um site', lhIdx >= 0 && (await tpCookie()) === 0 ? 'PASS' : 'FAIL', JSON.stringify(siteRows));
  key('Escape'); await sleep(400);

  // GPC
  const echo = async () => {
    await js(`newTab(${JSON.stringify(base + '/echo')}, false); 0`);
    await until(() => js('!active().loading'), 8000); await sleep(200);
    const h = JSON.parse(await (await guestOf()).executeJavaScript(`document.getElementById('h').textContent`));
    await js('closeTab(activeId); 0'); await sleep(300);
    return h;
  };
  const withGpc = (await echo())['sec-gpc'];
  await js(`settings.gpc = false; saveSettings(); 0`); await sleep(200);
  const withoutGpc = (await echo())['sec-gpc'];
  await js(`settings.gpc = true; saveSettings(); 0`);
  record(S, 'GPC: o sinal só vai quando ligado', withGpc === '1' && withoutGpc === undefined ? 'PASS' : 'FAIL', `ligado: ${withGpc} · desligado: ${withoutGpc}`);

  // permissão: pergunta, lembra, e segue o padrão
  await js(`settings.sites = {}; settings.permissions.location = 'ask'; saveSettings(); newTab(${JSON.stringify(base + '/geo')}, false); 0`);
  await until(() => js('!active().loading'), 8000); await sleep(300);
  const geo = async () => (await guestOf()).executeJavaScript(`new Promise((r) => { navigator.geolocation.getCurrentPosition(() => r('ok'), (e) => r('erro ' + e.code), { timeout: 4000 }); }); 0`, true);
  geo();
  const asked = await until(() => js(`document.getElementById('perm-sheet').classList.contains('show')`), 5000);
  const askTitle = await js(`document.getElementById('perm-title').textContent`);
  await click('#perm-no'); await sleep(400);
  const saved = await js(`settings.sites[${JSON.stringify(base)}]?.location`);
  record(S, 'site pede localização: o Kona pergunta e lembra a resposta', asked && saved === 'block' ? 'PASS' : 'FAIL', `“${askTitle}” · salvo: ${saved}`);
  geo(); await sleep(1200);
  const askedAgain = await js(`document.getElementById('perm-sheet').classList.contains('show')`);
  record(S, 'resposta lembrada: não pergunta de novo', !askedAgain ? 'PASS' : 'FAIL');
  await js(`settings.sites = {}; settings.permissions.location = 'block'; saveSettings(); 0`); await sleep(200);
  geo(); await sleep(1200);
  const askedBlocked = await js(`document.getElementById('perm-sheet').classList.contains('show')`);
  record(S, 'padrão “Bloquear”: não pergunta', !askedBlocked ? 'PASS' : 'FAIL');
  if (askedBlocked) await click('#perm-no');
  await js(`settings.permissions.location = 'ask'; saveSettings(); closeTab(activeId); 0`); await sleep(300);

  // zoom padrão
  await js(`settings.zoom = 1.25; saveSettings(); newTab(${JSON.stringify(base + '/text')}, false); 0`);
  await until(() => js('!active().loading'), 8000); await sleep(400);
  const zoom = await js('active().wv.getZoomFactor()');
  record(S, 'zoom padrão aplicado às páginas', Math.abs(zoom - 1.25) < 0.01 ? 'PASS' : 'FAIL', `${zoom}`);
  await js(`settings.zoom = 1; saveSettings(); closeTab(activeId); 0`); await sleep(300);

  // downloads na pasta escolhida
  const dlDir = path.join(OUT, 'downloads');
  fs.rmSync(dlDir, { recursive: true, force: true }); fs.mkdirSync(dlDir, { recursive: true });
  await js(`settings.downloadDir = ${JSON.stringify(dlDir)}; settings.downloadAsk = false; saveSettings(); newTab(${JSON.stringify(base + '/blank')}, false); 0`);
  await until(() => js('!active().loading'), 8000);
  await js(`navigate(active(), ${JSON.stringify(base + '/file.txt')}); 0`);
  const got = await until(() => fs.existsSync(path.join(dlDir, 'kona-teste.txt')), 8000);
  await sleep(300);
  const toastTxt = await js(`document.getElementById('toast').textContent`);
  record(S, 'download vai para a pasta escolhida e avisa', got && toastTxt.includes('downloaded') ? 'PASS' : 'FAIL', `arquivo: ${got} · aviso: “${toastTxt}”`);
  await js(`settings.downloadDir = null; saveSettings(); while (tabs.length > 1) closeTab(tabs[tabs.length - 1].id); 0`); await sleep(300);

  // aparência da página nos dois temas
  for (const theme of ['dark', 'light']) {
    await js(`settings.theme = '${theme}'; applyTheme(); openSettings('privacidade'); 0`); await sleep(900);
    const img = await shot(`configuracoes-${theme}`);
    await contrast('visual', `configurações ${theme}`, ['.st-text b', '.st-text p', '.st-nav-item', '.st-intro', '.st-sec h2'], img);
  }
  await js(`settings.theme = 'dark'; applyTheme(); 0`);
  await js(`while (tabs.length > 1) closeTab(tabs[tabs.length - 1].id); if (active().url !== START) { active().url = START; active().title = 'New Tab'; render(); } 0`); await sleep(400);
}

async function suiteOmnibox() {
  const S = 'sugestões';
  await resetUI(); await goStart();
  await js(`browseHistory.clear(); 0`);
  // 1ª busca
  await click('#tabs .tab.active input'); await sleep(150);
  wc.insertText('hello world'); await sleep(150);
  key('Return'); await sleep(400);
  const url1 = await js('active().url');
  record(S, 'pesquisar “hello world” vai para o Google', url1.startsWith('https://www.google.com/search?q=hello%20world') ? 'PASS' : 'FAIL', url1);
  // 2ª vez: a busca anterior aparece
  key('T', ['control']); await sleep(500);
  const recent = await omRows();
  record(S, 'nova aba mostra as buscas recentes', recent.some((t) => t.startsWith('hello world')) ? 'PASS' : 'FAIL', JSON.stringify(recent));
  // sugestões ao digitar
  const st = await perf(S, 'digitar com sugestões (6 letras)', async () => {
    for (const ch of 'hellow') { wc.insertText(ch); await sleep(55); }
  }, { ms: 900 });
  await js(`document.activeElement.select(); 0`); wc.insertText('hel'); await sleep(500);
  const rows = await omRows();
  const okRows = rows[0]?.startsWith('hel') && rows.some((t) => t.startsWith('hello world')) && rows.some((t) => t.startsWith('hel tutorial'));
  record(S, 'ao digitar: ação, histórico e sugestões do Google', okRows ? 'PASS' : 'FAIL', JSON.stringify(rows));
  // teclado: seta, Esc volta ao digitado, Esc fecha
  key('Down'); await sleep(80);
  const afterDown = await js('document.activeElement.value');
  key('Escape'); await sleep(80);
  const afterEsc = await js('document.activeElement.value');
  key('Escape'); await sleep(200);
  const closed = await js(`!document.getElementById('omnibox').classList.contains('show')`);
  record(S, 'setas escolhem; Esc volta ao digitado; Esc fecha', afterDown !== 'hel' && afterEsc === 'hel' && closed ? 'PASS' : 'FAIL', `↓ “${afterDown}” · Esc “${afterEsc}” · fechou: ${closed}`);
  // escolher uma sugestão do Google com o teclado
  await js(`document.activeElement.blur(); 0`); await sleep(200);
  await click('#tabs .tab.active input'); await sleep(150); wc.insertText('hel'); await sleep(500);
  const idx = (await omRows()).findIndex((t) => t.startsWith('hel tutorial'));
  for (let i = 0; i < idx; i++) { key('Down'); await sleep(40); }
  key('Return'); await sleep(400);
  const url2 = await js('active().url');
  const saved = await js(`browseHistory.data.searches.some((x) => x.q === 'hel tutorial')`);
  record(S, 'Enter numa sugestão pesquisa por ela e guarda no histórico', url2.includes('q=hel%20tutorial') && saved ? 'PASS' : 'FAIL', url2);
  // remover do histórico pelo “×”
  key('T', ['control']); await sleep(500);
  const xi = await js(`[...document.querySelectorAll('#omnibox .om-row')].findIndex((r) => r.innerText.trim().startsWith('hello world'))`);
  await hover('#omnibox .om-row', xi); await sleep(150);
  await click('#omnibox .om-row .om-x', xi); await sleep(300);
  const gone = await js(`!browseHistory.data.searches.some((x) => x.q === 'hello world')`);
  record(S, 'remover uma busca do histórico pelo “×”', gone ? 'PASS' : 'FAIL');
  await js(`document.activeElement.blur(); 0`); await sleep(200);
  // sites visitados aparecem pelo título
  await openUrlInActiveTab(`${base}/text`); await sleep(400);
  key('T', ['control']); await sleep(400); wc.insertText('artigo'); await sleep(400);
  const vis = await js(`[...document.querySelectorAll('#omnibox .om-row')].map((r) => r.innerText.trim())`);
  record(S, 'site visitado aparece ao digitar parte do título', vis.some((t) => t.includes('Artigo de teste') && t.includes('127.0.0.1')) ? 'PASS' : 'FAIL', JSON.stringify(vis.slice(0, 4)));
  await js(`document.activeElement.blur(); 0`);
  await js(`while (tabs.length > 1) closeTab(tabs[tabs.length - 1].id); 0`); await sleep(500);
  return st;
}

async function suiteProfiles() {
  const S = 'perfis';
  await resetUI(); await goStart();
  const first = await js('PROFILES.current');
  await js(`settings.wallpaper = 'aurora'; saveSettings(); applyWallpaper(); browseHistory.addSearch('busca do perfil 1'); 0`);
  // cookie no perfil 1
  await js(`newTab(${JSON.stringify(base + '/text')}, false); 0`);
  await until(() => js('!active().loading'), 8000);
  await (await guestOf()).executeJavaScript(`document.cookie = 'kona_teste=perfil1; max-age=3600'; 0`);
  await js(`while (tabs.length > 1) closeTab(tabs[tabs.length - 1].id); 0`); await sleep(400);

  // criar pela interface
  await js('toggleSidebar(); 0'); await sleep(500);
  await perf(S, 'abrir menu de perfis', () => click('#sb-profile'), { ms: 600 });
  await sleep(200);
  await click('#pf-new'); await sleep(600);
  await js(`document.getElementById('pf-name').select(); 0`);
  wc.insertText('Trabalho');
  await click('.pf-tile[data-av="planeta"]'); await sleep(150);
  await perf(S, 'criar perfil e trocar para ele', () => click('#pf-save'), { ms: 1000 });
  await sleep(600);
  const p2 = await js(`({ id: PROFILES.current, name: PROFILES.currentProfile().name, av: PROFILES.currentProfile().avatar, sb: document.querySelector('#sb-profile .pf-name').textContent, part: PROFILES.currentProfile().partition })`);
  record(S, 'criar perfil pela interface (nome + avatar) e trocar para ele', p2.id !== first && p2.name === 'Trabalho' && p2.av.id === 'planeta' && p2.sb === 'Trabalho' ? 'PASS' : 'FAIL', JSON.stringify(p2));

  // isolamento: ajustes, histórico, cookies
  await js(`settings.wallpaper = 'oceano'; saveSettings(); applyWallpaper(); 0`);
  const hist2 = await js('browseHistory.data.searches.length');
  await js(`newTab(${JSON.stringify(base + '/text')}, false); 0`);
  await until(() => js('!active().loading'), 8000);
  const g2 = await guestOf();
  const cookie2 = await g2.executeJavaScript('document.cookie');
  const part2 = await js(`active().wv.getAttribute('partition')`);
  record(S, 'perfil novo começa sem histórico', hist2 === 0 ? 'PASS' : 'FAIL', `${hist2} buscas`);
  record(S, 'perfil novo tem sessão própria (cookies não vazam)', !cookie2.includes('kona_teste') && part2 === p2.part ? 'PASS' : 'FAIL', `cookie: “${cookie2}” · sessão ${part2}`);
  await perf(S, 'trocar de perfil', () => js(`switchProfile(${JSON.stringify(first)}); 0`), { ms: 1000 });
  await sleep(500);
  // as abas de cada perfil ficam guardadas nele: voltar reabre as abas do perfil 1
  const back = await js(`({ wp: settings.wallpaper, hist: browseHistory.data.searches.some((x) => x.q === 'busca do perfil 1'), part: active().partition })`);
  record(S, 'voltar ao perfil 1 restaura fundo, histórico e sessão dele', back.wp === 'aurora' && back.hist && back.part === 'persist:kona' ? 'PASS' : 'FAIL', JSON.stringify(back));

  // foto enviada: recorte quadrado 256×256
  await js(`switchProfile(${JSON.stringify(p2.id)}); 0`); await sleep(800);
  await js(`openProfileSheet('edit', PROFILES.current); 0`); await sleep(500);
  await js(`(async () => {
    const c = Object.assign(document.createElement('canvas'), { width: 900, height: 500 });
    const x = c.getContext('2d'); x.fillStyle = '#c33'; x.fillRect(0, 0, 900, 500); x.fillStyle = '#3c3'; x.fillRect(325, 0, 250, 500);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const dt = new DataTransfer(); dt.items.add(new File([blob], 'foto.png', { type: 'image/png' }));
    const input = document.getElementById('avatar-file'); input.files = dt.files; input.dispatchEvent(new Event('change'));
  })(); 0`);
  await sleep(800);
  await js(`document.getElementById('pf-name').select(); 0`); wc.insertText('Trabalho Novo');
  await click('#pf-save'); await sleep(500);
  const photo = await js(`(async () => { const a = PROFILES.currentProfile().avatar; if (a.type !== 'image') return { type: a.type };
    const img = new Image(); img.src = a.data; await img.decode();
    const c = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }); const x = c.getContext('2d');
    x.drawImage(img, 128, 128, 1, 1, 0, 0, 1, 1); const d = x.getImageData(0, 0, 1, 1).data;
    return { type: a.type, w: img.naturalWidth, h: img.naturalHeight, kb: Math.round(a.data.length / 1024), centro: [d[0], d[1], d[2]],
      nome: PROFILES.currentProfile().name, sb: !!document.querySelector('#sb-profile .avatar img') }; })()`);
  const photoOk = photo.type === 'image' && photo.w === 256 && photo.h === 256 && photo.centro[1] > 150 && photo.centro[0] < 120 && photo.sb && photo.nome === 'Trabalho Novo';
  record(S, 'enviar foto (recorte central 256×256) e renomear', photoOk ? 'PASS' : 'FAIL', JSON.stringify(photo));

  // apagar com confirmação; dados da sessão somem
  const partToDelete = p2.part;
  await js(`openProfileSheet('edit', PROFILES.current); 0`); await sleep(500);
  await click('#pf-delete'); await sleep(500);
  const askShown = await js(`document.getElementById('ask-sheet').classList.contains('show') && document.getElementById('ask-yes').classList.contains('danger')`);
  await click('#ask-yes'); await sleep(1500);
  const after = await js(`({ n: PROFILES.list.length, current: PROFILES.current, sb: document.querySelector('#sb-profile .pf-name').textContent })`);
  const leftover = await session.fromPartition(partToDelete).cookies.get({});
  record(S, 'apagar perfil pede confirmação e volta ao outro perfil', askShown && after.n === 1 && after.current === first ? 'PASS' : 'FAIL', JSON.stringify(after));
  record(S, 'apagar perfil apaga os dados da sessão dele', leftover.length === 0 ? 'PASS' : 'FAIL', `${leftover.length} cookie(s) restantes`);
  await js(`openProfileSheet('edit', PROFILES.current); 0`); await sleep(400);
  const canDeleteLast = await js(`!document.getElementById('pf-delete').hidden`);
  record(S, 'não deixa apagar o último perfil', canDeleteLast ? 'FAIL' : 'PASS');
  await resetUI();
}

async function suiteVisual() {
  const S = 'visual';
  await resetUI(); await goStart();
  win.setBounds({ ...win.getBounds(), width: 1360, height: 860 });
  await sleep(400);
  const textSels = ['.fav-item .label', '.start-block h2', '#tabs .tab:not(.active) .title', '.sb-item .sb-label', '.sb-heading',
    '.pp-head', '.pp-label', '.toggle > span:first-child', '.seg button', '.ov-title', '.ov-card .cap > span:last-child',
    '.sheet-head h2', '.sheet-head p', '.ext-empty b', '.ext-empty p', '.hint',
    '.om-text', '.om-sub', '.om-head', '.pf-row-name', '.popover-pf .pp-head', '.popover-pf .pop-item', '.pf-label', '.profile .pf-name'];
  const STATES = {
    'nova-aba': async () => {},
    'barra-lateral': () => js('toggleSidebar(); 0'),
    personalizar: () => js('toggleCustomize(true); 0'),
    'visao-geral': () => js('openOverview(); 0'),
    extensoes: () => js('openExtensions(); 0'),
    sugestoes: async () => {
      await js(`browseHistory.addSearch('hello world'); 0`);
      await click('#tabs .tab.active input'); await sleep(150); wc.insertText('hel'); await sleep(500);
    },
    'perfis-menu': () => js('toggleSidebar(); toggleProfilePop(true); 0'),
    'perfil-editar': () => js(`openProfileSheet('edit', PROFILES.current); 0`),
  };
  for (const theme of ['dark', 'light']) {
    await js(`settings.theme = '${theme}'; applyTheme(); 0`);
    await sleep(500);
    for (const [name, enter] of Object.entries(STATES)) {
      await resetUI(); await goStart(); await hover('#views'); await enter(); await sleep(800);
      const img = await shot(`${theme}-${name}`);
      await contrast(S, `${theme}/${name}`, textSels, img);
      await compareBaseline(S, `${theme}-${name}`, img);
    }
    // Página de site
    await resetUI();
    await js(`newTab(${JSON.stringify(base + '/text')}, false); 0`);
    await until(() => js(`!active().loading`), 10000); await sleep(600);
    const img = await shot(`${theme}-pagina`);
    await contrast(S, `${theme}/página`, ['#tabs .tab:not(.active) .title'], img);
    await js('closeTab(activeId); 0'); await sleep(400);
  }
  await js(`settings.theme = 'dark'; applyTheme(); 0`);

  // Todos os fundos: o texto da nova aba e das abas na barra precisa continuar legível
  await resetUI(); await goStart();
  for (const wp of ['aurora', 'grafite', 'noite', 'oceano', 'floresta', 'brasa', 'areia', 'nevoa']) {
    await js(`settings.wallpaper = '${wp}'; applyWallpaper(); 0`);
    await sleep(900);
    const img = await shot(`fundo-${wp}`);
    await contrast(S, `fundo ${wp}`, ['.fav-item .label', '.start-block h2', '#tabs .tab:not(.active) .title'], img);
  }
  await js(`settings.wallpaper = 'aurora'; applyWallpaper(); 0`);

  // Barra com muitas abas, em janela larga e na largura mínima
  for (const width of [1360, 760]) {
    win.setBounds({ ...win.getBounds(), width });
    for (const count of [1, 6, 14, 30]) {
      await js(`while (tabs.length > ${count}) closeTab(tabs[tabs.length - 1].id);
        while (tabs.length < ${count}) newTab(START, false); activate(tabs[tabs.length - 1].id); 0`);
      await sleep(1200);
      const L = await js('__kt.toolbarLayout()');
      const bad = L.overlaps.length || L.outside.length || (L.hiddenTabs && !L.scrollable) || !L.activeVisible;
      record(S, `barra com ${count} aba(s) em ${width}px`, bad ? 'FAIL' : 'PASS',
        `${L.hiddenTabs} aba(s) fora da área visível${L.hiddenTabs ? (L.scrollable ? ' (faixa rola)' : ' (sem rolagem!)') : ''} · aba ativa ${L.activeWidth}px${L.activeVisible ? '' : ' (fora da vista!)'}${L.overlaps.length ? ' · sobreposição: ' + L.overlaps.join(', ') : ''}${L.outside.length ? ' · fora da janela: ' + L.outside.join(', ') : ''}`);
      if (count === 30) await shot(`barra-30-abas-${width}`);
    }
  }
  win.setBounds({ ...win.getBounds(), width: 1360 });
  await js(`while (tabs.length > 1) closeTab(tabs[tabs.length - 1].id); 0`);
  await sleep(500);
}

async function suiteNetwork() {
  const S = 'sites reais';
  await resetUI(); await goStart();
  for (const url of ['https://pt.wikipedia.org/wiki/Brasil', 'https://github.com/electron/electron']) {
    await js(`newTab(${JSON.stringify(url)}, false); 0`);
    const t0 = Date.now();
    const ok = await until(() => js(`!active().loading`), 30000);
    record(S, `carregar ${url}`, ok ? 'INFO' : 'WARN', `${Date.now() - t0} ms`);
    await sleep(1500);
    const g = await guestOf();
    const pg = g.executeJavaScript(`(${MEASURE_SRC})(1300)`, true);
    await sleep(40);
    await scrollFor(g, 500, 400, 1100, -120);
    const st = stats(await pg);
    record(S, `rolar ${url}`, grade(st), fmt(st), st);
    await js('closeTab(activeId); 0'); await sleep(400);
  }
}

/* ───────────── Execução ───────────── */
app.on('browser-window-created', (_e, w) => {
  if (win) return;
  win = w; wc = w.webContents;
  timings.created = Date.now() - T0;
  w.once('ready-to-show', () => { timings.readyToShow = Date.now() - T0; });
  wc.on('console-message', (e, level, message) => {
    const lv = e?.level ?? level; const msg = e?.message ?? message;
    if ((lv === 'error' || lv === 3) && !/ERR_BLOCKED_BY_CLIENT|Failed to load resource/.test(msg)) consoleErrors.push(msg);
  });
  // A animação de abertura começa quando a interface ganha a classe "ready": mede a partir daí
  w.once('show', () => {
    wc.executeJavaScript(`new Promise((res) => {
      const go = () => (${MEASURE_SRC})(1000).then(res);
      if (document.body.classList.contains('ready')) go();
      else new MutationObserver((_, mo) => { if (document.body.classList.contains('ready')) { mo.disconnect(); go(); } })
        .observe(document.body, { attributes: true, attributeFilter: ['class'] });
    })`).then((f) => { bootFrames = f; }).catch(() => {});
  });
});
app.on('render-process-gone', (_e, contents, details) => crashes.push(`${contents.getType()}: ${details.reason}`));
app.on('child-process-gone', (_e, details) => { if (details.reason !== 'clean-exit' && details.reason !== 'killed') crashes.push(`${details.type}: ${details.reason}`); });

app.whenReady().then(async () => {
  // Sem internet nos testes (resultados estáveis), exceto o servidor local — a menos que --net
  if (!NET) {
    const allow = (u) => /^(http:\/\/(127\.0\.0\.1|localhost)|file:|data:|blob:|devtools:|chrome)/.test(u);
    const block = (ses) => ses.webRequest.onBeforeRequest((d, cb) => cb({ cancel: !allow(d.url) }));
    for (const ses of [session.defaultSession, session.fromPartition('persist:kona')]) block(ses);
    app.on('session-created', block);
  }
  ({ base } = await startServer());
  process.env.KONA_SUGGEST_URL = `${base}/complete/search`;
  const timeout = setTimeout(() => { record('harness', 'tempo limite da suíte', 'FAIL', 'a suíte travou'); finish(); }, 8 * 60 * 1000);
  try {
    await until(() => wc, 20000);
    await until(() => js(`document.body.classList.contains('ready')`), 20000);
    timings.ready = Date.now() - T0;
    const d = screen.getDisplayMatching(win.getBounds());
    HZ = Math.round(d.displayFrequency) || 60; BUDGET = 1000 / HZ;
    record('ambiente', 'monitor', 'INFO', `${HZ} Hz · orçamento ${BUDGET.toFixed(1)} ms por quadro · escala ${d.scaleFactor}`);
    // O Kona sempre abre maximizado; os testes seguem numa janela de tamanho fixo (resultados comparáveis)
    record('abertura', 'abre maximizado', win.isMaximized() ? 'PASS' : 'FAIL');
    win.unmaximize(); await sleep(400);
    win.setBounds({ x: 40, y: 40, width: 1360, height: 860 }); await sleep(500);
    const gpu = app.getGPUFeatureStatus();
    record('ambiente', 'aceleração por GPU', gpu.gpu_compositing.startsWith('enabled') ? 'PASS' : 'WARN', `composição: ${gpu.gpu_compositing}, rasterização: ${gpu.rasterization}`);
    await injectHelpers();
    await sleep(1600); // a animação de abertura termina
    if (want('abertura')) await suiteBoot();
    if (want('primeiras')) await suiteFirstOpens();
    if (PASS === 'cold') {
      if (want('paginas')) await suitePages();
      if (want('abas')) await suiteManyTabs();
      if (want('janela')) await suiteWindow();
      if (want('bugs')) await suiteBugs();
      if (want('endereco')) await suiteAddress();
      if (want('menu')) await suiteSidebar();
      if (want('biblioteca')) await suiteLibrary();
      if (want('configuracoes')) await suiteSettings();
      if (want('sugestoes')) await suiteOmnibox();
      if (want('perfis')) await suiteProfiles();
      if (want('visual')) await suiteVisual();
      if (NET) await suiteNetwork();
    }
  } catch (err) {
    record('harness', 'erro inesperado na suíte', 'FAIL', err.stack.split('\n').slice(0, 3).join(' | '));
  }
  clearTimeout(timeout);
  finish();
});

function finish() {
  record('bugs', 'erros no console da interface', consoleErrors.length ? 'FAIL' : 'PASS', consoleErrors.slice(0, 5).join(' | '));
  record('bugs', 'processos que travaram', crashes.length ? 'FAIL' : 'PASS', crashes.join(', '));
  fs.writeFileSync(path.join(OUT, `results-${PASS}.json`), JSON.stringify({ pass: PASS, hz: HZ, timings, results }, null, 2));
  app.exit(0);
}
