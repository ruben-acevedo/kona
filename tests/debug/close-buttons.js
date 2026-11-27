// Todos os botões de fechar (×) da interface: com cada janela, painel e menu aberto, mede cada botão
// visível com o ícone ×: se é quadrado (o fundo vira círculo/quadrado certinho) e se o × está no centro.
// Nos três idiomas (textos compridos podem espremer o botão). Captura ampliada de cada um com o mouse em cima.
const os = require('os'); const path = require('path'); const fs = require('fs');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-closebtn-${process.pid}`);
const startServer = require('../fixtures/server');
require('../../main.js');
const { app, BrowserWindow } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = path.join(os.tmpdir(), 'kona-close-buttons');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });

const MEASURE = `(() => {
  const X = 'M7 7l10 10M17 7 7 17';
  const btns = [...document.querySelectorAll('button')].filter((b) => {
    const r = b.getBoundingClientRect(); if (!r.width || !r.height) return false;
    const cs = getComputedStyle(b); if (cs.visibility === 'hidden') return false;
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    if (!top || !(b === top || b.contains(top))) return false; // coberto por outra camada
    return b.classList.contains('close') || [...b.querySelectorAll('path')].some((p) => p.getAttribute('d') === X);
  });
  return btns.map((b) => {
    const r = b.getBoundingClientRect(); const svg = b.querySelector('svg'); const i = svg.getBoundingClientRect();
    const name = b.id ? '#' + b.id : '.' + [...b.classList].join('.') + (b.dataset.act ? '[' + b.dataset.act + ']' : '') + (b.title ? ' “' + b.title + '”' : '');
    return { name, w: +r.width.toFixed(1), h: +r.height.toFixed(1), radius: getComputedStyle(b).borderTopLeftRadius,
      ox: +(i.x - r.x).toFixed(2), oy: +(i.y - r.y).toFixed(2), dx: +(i.x + i.width / 2 - (r.x + r.width / 2)).toFixed(1), dy: +(i.y + i.height / 2 - (r.y + r.height / 2)).toFixed(1),
      box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] };
  });
})()`;

app.whenReady().then(async () => {
  const { base } = await startServer();
  let w; while (!(w = BrowserWindow.getAllWindows()[0])) await sleep(50);
  const wc = w.webContents; await sleep(3000);
  wc.setAudioMuted(true);
  const js = (c) => wc.executeJavaScript(c, true);
  await js(`navigate(active(), '${base}/text'); newTab('${base}/heavy', false); 0`); await sleep(2000);
  await js(`browseHistory.addSearch('hello world'); 0`);

  const surfaces = [
    ['barra de abas e janela', async () => { const p = await js(`(() => { const r = document.querySelector('#tabs .tab:not(.active)').getBoundingClientRect(); return [r.x + 20, r.y + r.height / 2]; })()`); wc.sendInputEvent({ type: 'mouseMove', x: Math.round(p[0]), y: Math.round(p[1]) }); await sleep(300); }],
    ['editar perfil', () => js('openProfileSheet("edit", PROFILES.current); 0'), '#profile-sheet'],
    ['novo perfil', () => js('openProfileSheet("new"); 0'), '#profile-sheet'],
    ['extensões', () => js('openExtensions(); 0'), '#ext-sheet'],
    ['sites (configurações por site)', () => js('openSitesSheet(); 0'), '#sites-sheet'],
    ['importar', () => js('openImport(); 0'), '#import-sheet'],
    ['senhas', () => js('openPasswordSheet(); 0'), '#pw-sheet'],
    ['licenças', () => js('openLicenses(); 0'), '#lic-sheet'],
    ['buscar na página', () => js("shortcut('f'); 0")],
    ['visão geral', async () => { await js('openOverview(); 0'); await sleep(700); const p = await js(`(() => { const r = document.querySelector('.ov-card').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`); wc.sendInputEvent({ type: 'mouseMove', x: Math.round(p[0]), y: Math.round(p[1]) }); }],
    ['menu lateral', async () => { await js('toggleSidebar(true); 0'); await sleep(600); const p = await js(`(() => { const r = document.querySelector('#sidebar .sb-tab:not(.new)').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`); wc.sendInputEvent({ type: 'mouseMove', x: Math.round(p[0]), y: Math.round(p[1]) }); }],
    ['sugestões da barra de endereço', async () => { await js("shortcut('l'); 0"); await sleep(200); wc.insertText('hel'); await sleep(700); const p = await js(`(() => { const r = [...document.querySelectorAll('#omnibox .om-row')].find((x) => x.querySelector('.om-x')).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`); wc.sendInputEvent({ type: 'mouseMove', x: Math.round(p[0]), y: Math.round(p[1]) }); }],
  ];

  const bad = [];
  let shot = 0;
  for (const lang of ['en', 'pt-BR', 'es']) {
    await js(`setLanguage('${lang}'); 0`); await sleep(400);
    for (const [name, open, sheet] of surfaces) {
      try { await open(); } catch (e) { console.log(`R ${lang} · ${name}: não abriu (${e.message.split('\n')[0]})`); continue; }
      await sleep(700);
      let list = await js(MEASURE);
      if (sheet) list = list.filter((b) => b.name !== '.wc.close[close] “Close”' && !b.name.startsWith('.wc'));
      if (name !== 'barra de abas e janela') list = list.filter((b) => !b.name.startsWith('.wc') && !b.name.startsWith('.x'));
      for (const b of list) {
        const round = parseFloat(b.radius) >= Math.min(b.w, b.h) / 2 - 0.5;
        const problems = [];
        if (Math.abs(b.w - b.h) > 0.6 && (round || b.name.startsWith('.tb'))) problems.push(`não é quadrado (${b.w}×${b.h})`);
        if (Math.abs(b.dx) > 0.6 || Math.abs(b.dy) > 0.6) problems.push(`× fora do centro (${b.dx}, ${b.dy} px)`);
        const half = (v) => { const f = Math.abs(v - Math.floor(v)); return f > 0.3 && f < 0.7; }; // meio pixel (botão ampliado por animação não conta)
        if (half(b.ox) || half(b.oy)) problems.push(`× em meio pixel (margem ${b.ox}, ${b.oy} px)`);
        const line = `${lang} · ${name} · ${b.name} ${b.w}×${b.h} r=${b.radius} desvio ${b.dx},${b.dy}`;
        if (problems.length) { bad.push(`${line} → ${problems.join('; ')}`); console.log(`R ✗ ${line} → ${problems.join('; ')}`); }
        else console.log(`R ✓ ${line}`);
        if (lang === 'en' || problems.length) {
          const [x, y, bw, bh] = b.box;
          wc.sendInputEvent({ type: 'mouseMove', x: x + Math.round(bw / 2), y: y + Math.round(bh / 2) }); await sleep(250);
          const img = await wc.capturePage({ x: x - 8, y: y - 8, width: bw + 16, height: bh + 16 });
          fs.writeFileSync(path.join(OUT, `${String(++shot).padStart(2, '0')}-${lang}-${b.name.replace(/[^\w-]+/g, '_').slice(0, 40)}.png`), img.resize({ width: (bw + 16) * 6, quality: 'good' }).toPNG());
        }
      }
      // fecha tudo
      for (let i = 0; i < 3; i++) { wc.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' }); await sleep(150); }
      await js(`document.querySelectorAll('.sheet.show').forEach((s) => closeSheet('#' + s.id)); toggleSidebar(false); 0`).catch(() => {});
      wc.sendInputEvent({ type: 'mouseMove', x: 5, y: 400 });
      await sleep(400);
    }
  }
  console.log(`R ── ${bad.length} problema(s)`);
  for (const b of bad) console.log('R   ' + b);
  console.log('R capturas em', OUT);
  app.exit(0);
});
