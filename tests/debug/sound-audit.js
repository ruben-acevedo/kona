// Auditoria de sons: abre cada tela/painel, passa o mouse (de verdade) e clica em cada controle
// visível, e anota o som que tocou. Também anota toda janela/painel que abre ou fecha sem som.
// Diálogos nativos, links externos e pastas são simulados (nada sai do app). Perfil temporário.
const os = require('os'); const path = require('path'); const http = require('http'); const fs = require('fs');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-sndaudit-${process.pid}`);
process.env.KONA_PDF_TARGET = path.join(os.tmpdir(), `kona-sndaudit-${process.pid}.pdf`);
const electron = require('electron');
for (const k of ['showOpenDialog', 'showSaveDialog', 'showMessageBox']) electron.dialog[k] = async () => ({ canceled: true, filePaths: [], filePath: '', response: 1 });
for (const k of ['showOpenDialogSync', 'showSaveDialogSync', 'showMessageBoxSync']) electron.dialog[k] = () => undefined;
electron.shell.openExternal = async () => {}; electron.shell.openPath = async () => ''; electron.shell.showItemInFolder = () => {};
require('../../main.js');
const { app, BrowserWindow } = electron;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('R', ...a);
const ONLY = process.env.KONA_AUDIT_ONLY || '';

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<title>Página ${req.url}</title><body style="font:16px sans-serif;margin:40px"><h1>Página ${req.url}</h1><p>Um texto qualquer para a busca na página. Texto texto.</p></body>`);
});

// não clicar: fecham/minimizam a janela, abrem janelas nativas que travam o teste ou mandam para impressora
const DENY = '.wc, #winctl button, #ib-yes, #pr-system, #pr-go, #imp-go, input[type="file"], input[type="color"], select, #wp-upload';

const PAGE = `(() => {
  if (window.__aud) return 0;
  const sounds = [];
  window.__sfxLog = { push: (n) => sounds.push({ n, t: performance.now() }) };
  const desc = (el) => {
    if (!el || el === document.body) return 'body';
    const label = (el.getAttribute('aria-label') || el.title || el.textContent || el.value || '').replace(/\\s+/g, ' ').trim().slice(0, 32);
    const id = el.id ? '#' + el.id : el.tagName.toLowerCase() + [...el.classList].slice(0, 2).map((c) => '.' + c).join('');
    const ctx = el.closest('[id]');
    return (ctx && ctx !== el ? ctx.id + ' › ' : '') + id + (label ? ' “' + label + '”' : '');
  };
  const trans = [];
  new MutationObserver((ms) => {
    if (window.__resetting) return; // o que a auditoria fecha entre os passos não conta
    for (const m of ms) {
      const was = (m.oldValue || '').split(/\\s+/), now = [...m.target.classList];
      if (m.attributeName === 'hidden') {
        // algo que aparece/some dentro da interface (painéis, janelas, Configurações); a faixa de abas fica de fora
        if (!m.target.closest('.sheet, .popover-pf, .panel-pop, #sidebar, #settings, #overview, #ext-pop, #reader-pop, #find-bar, #start, #infobar, #crash-pane') && m.target.id !== 'crash-pane') continue;
        if (m.target.closest('#tabs, .fav-grid, #sb-list, #st-main [data-rule-row]')) continue;
        trans.push({ who: desc(m.target).replace(/ “.*/, '') + ' [hidden]', dir: m.target.hidden ? 'fecha' : 'abre', t: performance.now() });
        continue;
      }
      const cls = m.target === document.body ? [...new Set([...was, ...now])].filter(Boolean) : ['show', 'sidebar-open', 'sub-open', 'editing', 'open', 'expanded'];
      for (const c of cls) {
        if (was.includes(c) !== now.includes(c)) trans.push({ who: desc(m.target).replace(/ “.*/, '') + ' .' + c, dir: now.includes(c) ? 'abre' : 'fecha', t: performance.now() });
      }
    }
  }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['class', 'hidden'], attributeOldValue: true });
  const SEL = 'button, a[href], select, input:not([type="hidden"]), [role="menuitem"], [role="option"], [role="switch"], .tab, .sb-row, .sb-tab, .sb-item, .fav-item, .ov-card, .om-row, .ctx-item, .pop-item, .ext-pop-row, .share-item, label, [data-act], [data-go], [data-view], [data-do], [data-set], [data-tab]';
  const TEXT = 'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]), textarea';
  const visible = (el) => el.checkVisibility({ checkVisibilityCSS: true, opacityProperty: true }) && el.getBoundingClientRect().width > 2;
  const items = (root) => {
    const roots = [...document.querySelectorAll(root)];
    const all = roots.flatMap((r) => [...r.querySelectorAll(SEL)]).filter((el) => !el.disabled && !el.closest('[hidden], [aria-disabled="true"]') && visible(el));
    // um controle dentro de outro do mesmo tipo (ex.: rótulo dentro do botão) conta uma vez só
    return all.filter((el) => !all.some((o) => o !== el && o.contains(el) && !o.matches('label, .tab, .sb-item, .fav-item, .ov-card')));
  };
  window.__aud = {
    sounds, trans, desc,
    take() { const s = sounds.splice(0).map((x) => x.n); return s; },
    count(root) { return items(root).length; },
    prep(root, i, deny) {
      const el = items(root)[i];
      if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      const r = el.getBoundingClientRect();
      const x = Math.round(r.left + Math.min(r.width / 2, 40)), y = Math.round(r.top + r.height / 2);
      const hit = document.elementFromPoint(x, y);
      return { d: desc(el), x, y, denied: el.matches(deny) || /Inspecionar|Inspect/.test(el.textContent), covered: !(hit && (hit === el || el.contains(hit))), hit: desc(hit) + ' | pe=' + getComputedStyle(el).pointerEvents + ' xy=' + x + ',' + y + ' vw=' + innerWidth + 'x' + innerHeight + ' stack=' + document.elementsFromPoint(x, y).slice(0, 3).map(desc).join(' / '), input: el.matches(TEXT) || (el.tagName === 'LABEL' && !!el.control?.matches(TEXT)), select: el.tagName === 'SELECT', checked: el.matches('input[type=radio]') && el.checked };
    },
    change(root, i) {
      const el = items(root)[i];
      if (!el || el.tagName !== 'SELECT' || el.options.length < 2) return false;
      const old = el.selectedIndex;
      el.selectedIndex = (old + 1) % el.options.length;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return old;
    },
    restore(root, i, old) {
      const el = items(root)[i];
      if (el && el.tagName === 'SELECT') { el.selectedIndex = old; el.dispatchEvent(new Event('change', { bubbles: true })); }
      return 0;
    },
    silentTransitions() {
      const out = {};
      for (const tr of trans) {
        const heard = sounds.some((s) => s.t > tr.t - 250 && s.t < tr.t + 400) || window.__heard?.some((t) => t > tr.t - 250 && t < tr.t + 400);
        const k = tr.dir + ' ' + tr.who;
        out[k] = out[k] || { n: 0, mudo: 0 };
        out[k].n++; if (!heard) out[k].mudo++;
      }
      return out;
    },
  };
  // guarda o horário de todos os sons (take() esvazia a lista)
  window.__heard = [];
  const push = window.__sfxLog.push;
  window.__sfxLog.push = (n) => { window.__heard.push(performance.now()); push(n); };
  return 0;
})()`;

const RESET = `(async () => {
  window.__resetting = true;
  try { closeMenu(); } catch {}
  try { findBar.close(); } catch {}
  try { closeFolderPop(); } catch {}
  try { toggleProfilePop(false); } catch {}
  try { toggleSitePop(null, null, false); } catch {}
  try { toggleCustomize(false); } catch {}
  try { closeOverview(); } catch {}
  try { if (document.body.classList.contains('sidebar-open')) { closeSidebarView?.(); toggleSidebar(false); } } catch {}
  for (const s of document.querySelectorAll('.sheet.show')) closeSheet('#' + s.id);
  for (const el of document.querySelectorAll('.show:not(#toast)')) el.classList.remove('show');
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  const page = tabs.find((t) => t.url.startsWith(BASE + '/a'));
  if (page) activate(page.id); else newTab(BASE + '/a', false);
  // só as 3 abas de teste (cliques abrem abas novas)
  for (const t of [...tabs]) if (!['/a', '/b1', '/b2'].some((u) => t.url === BASE + u) && tabs.length > 1) closeTab(t.id, { force: true });
  for (const u of ['/b1', '/b2']) if (!tabs.some((t) => t.url.endsWith(u))) newTab(BASE + u, false);
  // um clique pode ter desligado os sons (Personalizar › Sons da interface)
  settings.sounds = true; settings.theme = 'system'; if (document.documentElement.lang !== 'pt-BR') setLanguage('pt-BR');
  const page2 = tabs.find((t) => t.url.startsWith(BASE + '/a'));
  if (page2 && activeId !== page2.id) activate(page2.id);
  await new Promise((r) => setTimeout(r, 600));
  window.__resetting = false;
  return 0;
})()`;

app.whenReady().then(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let w; while (!(w = BrowserWindow.getAllWindows()[0])) await sleep(50);
  await sleep(3000);
  const wc = w.webContents;
  wc.setAudioMuted(true);
  const js = (c) => wc.executeJavaScript(c);
  await js(`settings.sounds = true; setLanguage('pt-BR'); window.BASE = '${base}'; navigate(active(), '${base}/a'); 0`); await sleep(1500);
  await js(PAGE);
  const mouse = async (x, y, click, button = 'left') => {
    wc.sendInputEvent({ type: 'mouseMove', x, y });
    if (!click) return;
    wc.sendInputEvent({ type: 'mouseDown', x, y, button, clickCount: 1 });
    wc.sendInputEvent({ type: 'mouseUp', x, y, button, clickCount: 1 });
  };
  // janelas extras e DevTools ("Inspecionar") tiram o foco da janela do Kona: sem foco, os campos não recebem "focusin"
  const cleanWindows = () => {
    for (const b of BrowserWindow.getAllWindows()) if (b !== w && !b.isDestroyed()) b.destroy();
    for (const c of electron.webContents.getAllWebContents()) if (!c.isDestroyed() && c.isDevToolsOpened()) c.closeDevTools();
  };
  // estado de partida: mouse longe de tudo
  const park = async () => { await mouse(w.getContentBounds().width - 5, w.getContentBounds().height - 5); await sleep(60); };

  const S = [
    { name: 'barra (página aberta)', root: '#toolbar', enter: '0' },
    { name: 'página inicial', root: '#start', enter: "activate(newTab(START, false).id); 0" },
    { name: 'personalizar', root: '#custom-pop', enter: "activate(newTab(START, false).id); 0", then: 'toggleCustomize(true); 0' },
    { name: 'menu lateral', root: '#sidebar', enter: 'toggleSidebar(true); 0' },
    { name: 'lateral › favoritos', root: '#sidebar', enter: "toggleSidebar(true); openSidebarView('bookmarks'); 0" },
    { name: 'lateral › leitura', root: '#sidebar', enter: "toggleSidebar(true); openSidebarView('reading'); 0" },
    { name: 'lateral › downloads', root: '#sidebar', enter: "toggleSidebar(true); openSidebarView('downloads'); 0" },
    { name: 'lateral › histórico', root: '#sidebar', enter: "toggleSidebar(true); openSidebarView('history'); 0" },
    { name: 'perfis', root: '#profile-pop', enter: 'toggleSidebar(true); 0', then: 'toggleProfilePop(true); 0' },
    { name: 'todas as abas', root: '#overview', enter: 'openOverview(); 0' },
    { name: 'configurações', root: '#settings', enter: 'openSettings(); 0' },
    { name: 'informações do site', root: '#site-pop', enter: "toggleSitePop(active(), document.querySelector('#tabs .tab.active .lock'), true); 0", wait: 900 },
    { name: 'busca na página', root: '#find-bar', enter: "shortcut('f'); 0" },
    { name: 'sugestões', root: '#omnibox', enter: "document.querySelector('#tabs .tab.active input').focus(); document.execCommand('insertText', false, 'pagina'); 0", wait: 900 },
    { name: 'menu da aba', root: '#ctx-menu', enter: 'tabMenu(active(), 300, 60); 0' },
    { name: 'menu da página (botão direito)', root: '#ctx-menu', enter: '0', right: true },
    { name: 'extensões', root: '#ext-sheet', enter: 'openExtensions(); 0' },
    { name: 'novo favorito', root: '#fav-sheet', enter: 'openFavSheet(); 0' },
    { name: 'limpar dados', root: '#clear-sheet', enter: 'openClearSheet(); 0' },
    { name: 'dados dos sites', root: '#sites-sheet', enter: 'openSitesSheet(); 0' },
    { name: 'importar', root: '#import-sheet', enter: 'openImport(); 0', wait: 1200 },
    { name: 'senhas', root: '#pw-sheet', enter: 'openPasswordSheet(); 0' },
    { name: 'endereço (autopreenchimento)', root: '#af-sheet', enter: "openAfEditor('address'); 0" },
    { name: 'imprimir', root: '#print-sheet', enter: 'openPrint(); 0', wait: 2500 },
    { name: 'novo perfil', root: '#profile-sheet', enter: "openProfileSheet('new'); 0" },
    { name: 'busca em sites', root: '#ss-sheet', enter: 'openSiteSearchSheet(); 0' },
  ].filter((s) => !ONLY || s.name.includes(ONLY));

  const rows = [];
  const enter = async (st) => {
    await js(RESET); cleanWindows(); await park();
    await js(st.enter); if (st.right) {
      await sleep(400);
      const id = await js('active().wv.getWebContentsId()');
      const page = electron.webContents.fromId(id);
      page.sendInputEvent({ type: 'mouseDown', x: 300, y: 200, button: 'right', clickCount: 1 });
      page.sendInputEvent({ type: 'mouseUp', x: 300, y: 200, button: 'right', clickCount: 1 });
      await sleep(900);
    } if (st.then) { await sleep(700); await js(st.then); } await sleep(st.wait || 700);
  };
  // o mesmo controle depois de reabrir a tela: pelo nome (no menu os ids mudam quando um item liga/desliga)
  const key = (d) => (d.match(/“(.*)”/) || [, d])[1];
  const findIdx = async (st, d) => js(`(() => { const n = __aud.count(${JSON.stringify(st.root)}); for (let i = 0; i < n; i++) { const p = __aud.prep(${JSON.stringify(st.root)}, i, '#__none'); if (p && ((p.d.match(/“(.*)”/) || [, p.d])[1]) === ${JSON.stringify(key(d))}) return i; } return -1; })()`);
  const prep = (st, i) => js(`__aud.prep(${JSON.stringify(st.root)}, ${i}, ${JSON.stringify(DENY)})`);
  for (const st of S) {
    try {
      await enter(st);
      const n = await js(`__aud.count(${JSON.stringify(st.root)})`);
      log(`── ${st.name}: ${n} controles`);
      // 1) passar o mouse por todos, sem mexer em nada
      const list = [];
      for (let i = 0; i < n; i++) {
        await park(); await js('__aud.take(); 0');
        const p = await prep(st, i);
        if (!p || p.covered) { list.push(p ? { ...p, hover: 'coberto' } : null); continue; }
        await mouse(p.x, p.y); await sleep(150);
        list.push({ ...p, hover: (await js('__aud.take()')).join(' ') });
      }
      // 2) clicar em cada um; a tela só é reaberta se o clique a mudou
      for (let i = 0; i < n; i++) {
        const h = list[i];
        if (!h) continue;
        let click = 'não clicado';
        if (h.select) {
          try {
            await enter(st); const j = await findIdx(st, h.d); await js('__aud.take(); 0');
            const old = await js(`__aud.change(${JSON.stringify(st.root)}, ${j})`); await sleep(300);
            click = 'trocar opção: ' + ((await js('__aud.take()')).join(' ') || '—');
            if (old !== false) { await js(`__aud.restore(${JSON.stringify(st.root)}, ${j}, ${old})`); await sleep(300); }
          } catch (e) { click = 'erro: ' + e.message.slice(0, 60); }
        } else if (!h.denied && h.hover !== 'coberto') {
          try {
            let j = await findIdx(st, h.d);
            if (j < 0) { await enter(st); j = await findIdx(st, h.d); }
            let p = j >= 0 ? await prep(st, j) : null;
            if (p?.covered) { await enter(st); j = await findIdx(st, h.d); p = j >= 0 ? await prep(st, j) : null; }
            if (p && !p.covered) {
              // um campo que já tem o foco não toca de novo (certo): tira o foco antes de clicar
              await js(`(() => { const a = document.activeElement; if (a && [...document.querySelectorAll(${JSON.stringify(st.root)})].some((r) => r.contains(a))) a.blur(); return 0; })()`);
              if (p.checked) { rows.push({ st: st.name, ...h, click: 'já marcado' }); log(`   ${h.d}  · passar: ${h.hover || '—'} · clique: (rádio já marcado)`); continue; }
              await mouse(p.x, p.y); await sleep(150); await js('__aud.take(); 0');
              await mouse(p.x, p.y, true); await sleep(450);
              click = (await js('__aud.take()')).join(' ');
              cleanWindows();
            } else click = 'não achado';
          } catch (e) { click = 'erro: ' + e.message.slice(0, 60); }
        }
        rows.push({ st: st.name, ...h, click });
        // campos de texto: sem tique ao passar, "seleção" ao clicar; listas: som ao trocar de opção
        const flag = (h.hover !== 'coberto' && !h.input && !h.hover.includes('tick') ? ' ⚠passar' : '')
          + (h.input && h.hover.includes('tick') && !h.d.startsWith('tabs ›') ? ' ⚠tique num campo' : '')
          + (!h.denied && click === '' ? ' ⚠clique' : '') + (click === 'trocar opção: —' ? ' ⚠trocar' : '');
        log(`   ${h.d}  · passar: ${h.hover || '—'} · clique: ${click || '—'}${flag}`);
      }
    } catch (e) { log(`   ERRO na tela "${st.name}": ${e.message.slice(0, 80)}`); }
  }
  try { await js(RESET); } catch {}
  const silent = await js('__aud.silentTransitions()');
  log('── Painéis/janelas que abrem ou fecham SEM som (vezes sem som / total):');
  for (const [k, v] of Object.entries(silent).sort()) if (v.mudo) log(`   ${k}: ${v.mudo}/${v.n}`);
  const noHover = rows.filter((r) => r.hover !== 'coberto' && !r.input && !r.hover.includes('tick'));
  const noClick = rows.filter((r) => (!r.denied && r.click === '') || r.click === 'trocar opção: —');
  log(`── Resumo: ${rows.length} controles · sem som ao passar: ${noHover.length} · sem som ao clicar: ${noClick.length}`);
  fs.writeFileSync(path.join(os.tmpdir(), 'kona-sound-audit.json'), JSON.stringify({ rows, silent }, null, 1));
  log('detalhes:', path.join(os.tmpdir(), 'kona-sound-audit.json'));
  server.close(); app.exit(0);
});
