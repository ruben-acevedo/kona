// N20: acessibilidade — o que está fechado não entra no Tab; janelas prendem o foco e o devolvem;
// abas pelas setas; menu e barra de endereço anunciam o item escolhido; interruptores mantêm o foco;
// auditoria axe-core (WCAG 2 AA) em várias telas; captura em alto contraste. Só servidor local.
const os = require('os'); const path = require('path'); const http = require('http'); const fs = require('fs');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-a11y-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('R', ...a);
const OUT = path.join(os.tmpdir(), 'kona-a11y-shots');
fs.mkdirSync(OUT, { recursive: true });
const AXE = fs.readFileSync(path.join(__dirname, '../../node_modules/axe-core/axe.min.js'), 'utf8');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<title>Página ${req.url}</title><h1>Página ${req.url}</h1><p>Texto.</p>`);
});

app.whenReady().then(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let w; while (!(w = BrowserWindow.getAllWindows()[0])) await sleep(50);
  await sleep(3000);
  const wc = w.webContents;
  wc.setAudioMuted(true); // os sons tocam (e entram no registro), mas sem barulho
  const js = (c) => wc.executeJavaScript(c);
  const key = async (keyCode, modifiers = []) => {
    wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    if (keyCode.length === 1) wc.sendInputEvent({ type: 'char', keyCode, modifiers });
    wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    await sleep(120);
  };
  const focused = () => js("(() => { const a = document.activeElement; return a ? a.tagName.toLowerCase() + (a.id ? '#' + a.id : '') + (a.className && typeof a.className === 'string' ? '.' + a.className.trim().split(/\\s+/).join('.') : '') : 'nada'; })()");
  const shot = async (name) => fs.writeFileSync(path.join(OUT, `${name}.png`), (await wc.capturePage()).toPNG());

  await js(`settings.sounds = true; setLanguage('pt-BR'); navigate(active(), '${base}/um'); 0`); await sleep(1500);
  await js(`newTab('${base}/dois'); newTab('${base}/tres'); 0`); await sleep(1500);

  // 1) fechados fora do Tab e do leitor de tela
  const leaks = await js(`(() => {
    const F = 'button, [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';
    const closed = [...document.querySelectorAll('.sheet:not(.show), .popover-pf:not(.show), .panel-pop:not(.show), #folder-pop:not(.show), #ext-pop:not(.show), #reader-pop:not(.show), #pw-bubble:not(.show), #af-bubble:not(.show), #overview:not(.show)')];
    if (!document.body.classList.contains('sidebar-open')) closed.push(document.querySelector('#sidebar'));
    const a = closed.flatMap((d) => [...d.querySelectorAll(F)].filter((el) => el.checkVisibility({ checkVisibilityCSS: true })).map((el) => d.id + ' ' + (el.id || el.className)));
    const b = [...document.querySelectorAll(F)].filter((el) => el.checkVisibility({ checkVisibilityCSS: true, opacityProperty: true }) === false && el.tabIndex >= 0 && el.checkVisibility({ checkVisibilityCSS: true }) && !el.closest('#start, #views'))
      .map((el) => 'transparente: ' + (el.id || el.className || el.tagName));
    return [...a, ...b].slice(0, 12);
  })()`);
  log('Controles focáveis dentro de janelas fechadas:', leaks.length ? leaks.join(', ') : 'nenhum');

  // 2) abas pelas setas
  const tabInfo = () => js("[...document.querySelectorAll('#tabs .tab:not(.leaving)')].map((el) => (el.getAttribute('aria-label') || '?') + (el.getAttribute('aria-current') ? '*' : '') + '[' + el.tabIndex + ']').join(' | ')");
  log('Abas (rótulo, *=atual, [tabindex]):', await tabInfo());
  await js("window.__sfxLog = []; document.querySelector('#back').focus(); 0");
  await key('Tab'); await key('Tab');
  log('Tab a partir de Voltar →', await focused());
  await js("document.querySelector('#tabs .tab.active').focus(); 0");
  await key('Left'); log('Seta ← →', await focused(), '·', await js("document.activeElement.getAttribute('aria-label')"));
  await key('Return'); await sleep(400);
  log('Enter → ativa:', await js("document.querySelector('#tabs .tab.active').getAttribute('aria-label')"), '· foco:', await js("document.activeElement.getAttribute('aria-label')"));
  await key('Home'); log('Home →', await js("document.activeElement.getAttribute('aria-label')"));
  await key('Delete'); await sleep(600);
  log('Delete → abas:', await tabInfo(), '· foco:', await js("document.activeElement.getAttribute('aria-label')"));
  log('   sons tocados no teclado das abas:', await js("window.__sfxLog.join(' ')"));

  // 3) janela modal (imprimir): foco entra, Tab não sai, Esc devolve
  await js("document.querySelector('#btn-new').focus(); 0");
  await js("window.__sfxLog = []; shortcut('p'); 0"); await sleep(2500);
  log('Imprimir aberto → foco:', await focused());
  let out = 0;
  for (let i = 0; i < 30; i++) { await key('Tab'); if (!(await js("document.querySelector('#print-sheet').contains(document.activeElement)"))) out++; }
  for (let i = 0; i < 5; i++) { await key('Tab', ['shift']); if (!(await js("document.querySelector('#print-sheet').contains(document.activeElement)"))) out++; }
  log('35 Tabs/Shift+Tabs → vezes que o foco saiu:', out, '· sons:', await js("Object.entries(window.__sfxLog.reduce((m, x) => (m[x] = (m[x] || 0) + 1, m), {})).map(([k, v]) => k + '×' + v).join(' ')"));
  await shot('print-focus');
  await key('Escape'); await sleep(600);
  log('Esc → fechou:', !(await js("document.querySelector('#print-sheet').classList.contains('show')")), '· foco voltou para:', await focused());

  // 4) menu de contexto: item escolhido anunciado
  await js("tabMenu(active(), 300, 60); window.__sfxLog = []; 0"); await sleep(300);
  await key('Down'); await key('Down');
  log('Menu ↓↓ → aria-activedescendant:', await js("document.querySelector('#ctx-menu').getAttribute('aria-activedescendant')"), '=', await js("document.getElementById(document.querySelector('#ctx-menu').getAttribute('aria-activedescendant'))?.textContent.trim()"));
  log('   sons do menu pelas setas:', await js("window.__sfxLog.join(' ')"));
  await key('Escape'); await sleep(300);

  // 5) barra de endereço
  await js("document.querySelector('#tabs .tab.active input').focus(); 0"); await sleep(300);
  await js("document.execCommand('insertText', false, 'pagina'); 0"); await sleep(800);
  await key('Down');
  log('Endereço → role:', await js("document.activeElement.getAttribute('role')"), '· expanded:', await js("document.activeElement.getAttribute('aria-expanded')"), '· sugestão:', await js("document.getElementById(document.activeElement.getAttribute('aria-activedescendant') || '-')?.textContent.trim().slice(0, 40)"));
  await key('Escape'); await key('Escape'); await sleep(300);

  // 6) Configurações: interruptor com nome, estado e foco mantido
  await js("openSettings(); 0"); await sleep(1500);
  await js("document.querySelector('#st-main [role=switch]').focus(); 0");
  const sw = () => js("(() => { const a = document.activeElement; return a.getAttribute('role') + ' “' + a.getAttribute('aria-label') + '” checked=' + a.getAttribute('aria-checked'); })()");
  log('Interruptor antes:', await sw());
  await key('Space'); await sleep(400);
  log('Espaço →', await sw());
  await key('Space'); await sleep(300);

  // 7) auditoria axe-core em várias telas
  await js(AXE + '; 0');
  const audit = async (label) => {
    const r = await js(`axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'best-practice'], rules: { region: { enabled: false } }, exclude: [['webview']] }).then((r) => r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, ex: v.nodes.slice(0, 4).map((n) => n.target.join(' ') + (n.any[0]?.data?.contrastRatio ? ' (' + n.any[0].data.fgColor + ' em ' + n.any[0].data.bgColor + ' = ' + n.any[0].data.contrastRatio + ')' : '')).join(' ; ') })))`);
    log(`axe [${label}]: ${r.length} tipos de problema`);
    for (const v of r) log(`   ${v.impact} · ${v.id} ×${v.n} — ${v.ex}`);
  };
  await audit('Configurações');
  await js(`navigate(active(), '${base}/quatro'); 0`); await sleep(1200);
  await audit('página');
  await js('toggleSidebar(true); 0'); await sleep(800);
  await audit('menu lateral'); await shot('sidebar');
  await js('toggleSidebar(false); toggleOverview(); 0'); await sleep(800);
  await audit('todas as abas');
  await js("closeOverview(); shortcut('p'); 0"); await sleep(2500);
  await audit('imprimir');
  await key('Escape'); await sleep(500);

  // 8) alto contraste (emulado)
  try {
    wc.debugger.attach('1.3');
    await wc.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }, { name: 'prefers-color-scheme', value: 'dark' }] });
    await sleep(600); await shot('forced-colors');
    await js('toggleSidebar(true); 0'); await sleep(800); await shot('forced-colors-sidebar');
    await js('toggleSidebar(false); 0');
    await wc.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] });
    wc.debugger.detach();
  } catch (e) { log('alto contraste: erro', e.message); }
  log('capturas em:', OUT);
  server.close(); app.exit(0);
});
