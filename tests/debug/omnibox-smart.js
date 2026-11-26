// N12: barra de endereço mais esperta — contas (resposta no topo; escolher copia), "Ir para a aba"
// (nesta janela e em outra), favoritos na lista, "Pesquisar no YouTube" com Tab / espaço / prefixo,
// @abas, sair do modo com Backspace, e um atalho novo salvo nas Configurações. Não abre sites de fora.
const os = require('os'); const path = require('path'); const http = require('http'); const fs = require('fs');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-omni-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('R', ...a);
const OUT = path.join(os.tmpdir(), 'kona-omni-shots');
fs.mkdirSync(OUT, { recursive: true });
const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(`<title>Page ${req.url.slice(1)}</title>${req.url}`); });
const wins = () => BrowserWindow.getAllWindows().filter((w) => w.webContents.getURL().includes('index.html'));
app.whenReady().then(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let w1; while (!(w1 = wins()[0])) await sleep(50);
  await sleep(3000);
  const js = (w, c) => w.webContents.executeJavaScript(c);
  await js(w1, `settings.sounds = false; setLanguage('pt-BR'); navigate(active(), '${base}/alpha'); newTab('${base}/beta', false); newTab(); 0`);
  await sleep(2000);
  log('aba ativa 2 s depois de abrir (a nova aba, não a que carregou em segundo plano):', await js(w1, 'active().url'));
  const type = (w, text) => js(w, `(() => { const i = document.querySelector('#tabs .tab.active input'); i.focus(); i.value = ${JSON.stringify(text)}; i.setSelectionRange(i.value.length, i.value.length); i.dispatchEvent(new InputEvent('input', { bubbles: true })); return 0; })()`);
  const key = (w, k) => js(w, `(() => { const i = document.querySelector('#tabs .tab.active input'); i.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true, cancelable: true })); return 0; })()`);
  const rows = (w) => js(w, "[...document.querySelectorAll('#omnibox .om-row')].map((r) => (r.classList.contains('sel') ? '▸' : '') + r.innerText.replace(/\\s+/g, ' ').trim()).join(' | ')");
  const pick = (w, i) => js(w, `(() => { const r = document.querySelectorAll('#omnibox .om-row')[${i}]; r.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); return 0; })()`);
  const chip = (w) => js(w, "document.querySelector('#tabs .tab.active .kw-chip')?.textContent || '(sem etiqueta)'");
  const blur = (w) => js(w, "document.activeElement?.blur(); 0");

  // contas
  await type(w1, '6*7'); await sleep(300);
  log('"6*7" →', await rows(w1));
  fs.writeFileSync(path.join(OUT, 'calc.png'), (await w1.webContents.capturePage({ x: 0, y: 0, width: 1400, height: 420 })).toPNG());
  await pick(w1, 0); await sleep(300);
  log('   escolher a resposta copia:', await js(w1, 'api.clipboardRead()'), '· aviso:', await js(w1, "document.querySelector('#toast').textContent"));
  await type(w1, '200 + 10%'); await sleep(300);
  log('"200 + 10%" →', (await rows(w1)).split(' | ')[0]);
  await blur(w1);

  // Ir para a aba (nesta janela)
  await type(w1, 'beta'); await sleep(300);
  log('"beta" →', await rows(w1));
  const nBefore = await js(w1, 'tabs.length');
  const idx = await js(w1, "[...document.querySelectorAll('#omnibox .om-row')].findIndex((r) => r.classList.contains('om-tab'))");
  await pick(w1, idx); await sleep(500);
  log('   foi para a aba:', await js(w1, 'active().url.slice(-5)'), '· abas antes/depois:', nBefore, await js(w1, 'tabs.length'));

  // favoritos
  await js(w1, `bookmarks.add('${base}/fav', 'Minha Página Favorita'); newTab(); 0`); await sleep(500);
  await type(w1, 'minha pág'); await sleep(300);
  log('"minha pág" →', await rows(w1));
  await blur(w1);

  // Ir para a aba de outra janela
  await js(w1, "shortcut('n'); 0");
  for (let i = 0; i < 60 && wins().length < 2; i++) await sleep(100);
  await sleep(2500);
  const w2 = wins().find((w) => w !== w1);
  await js(w2, `settings.sounds = false; navigate(active(), '${base}/gamma'); 0`); await sleep(1500);
  w1.focus(); await sleep(300);
  await js(w1, 'newTab(); 0'); await sleep(300);
  await type(w1, 'gamma'); await sleep(600);
  await type(w1, 'gamma'); await sleep(400); // a lista das outras janelas chega logo depois de abrir
  log('"gamma" (aba da janela 2) →', await rows(w1));
  const gi = await js(w1, "[...document.querySelectorAll('#omnibox .om-row')].findIndex((r) => r.classList.contains('om-tab'))");
  await pick(w1, gi); await sleep(800);
  log('   janela 2 veio para a frente:', w2.isFocused(), '· aba ativa nela:', await js(w2, 'active().url.slice(-6)'));
  w1.focus(); await sleep(300);

  // Pesquisar no YouTube: atalho + Tab
  await type(w1, 'yt'); await sleep(300);
  log('"yt" →', await rows(w1));
  await key(w1, 'Tab'); await sleep(300);
  await type(w1, 'lofi'); await sleep(300);
  log('   Tab → etiqueta:', await chip(w1), '· lista:', await rows(w1), '· endereço:', await js(w1, 'omnibox.items[0]?.url'));
  fs.writeFileSync(path.join(OUT, 'keyword.png'), (await w1.webContents.capturePage({ x: 0, y: 0, width: 1400, height: 300 })).toPNG());
  await type(w1, ''); await key(w1, 'Backspace'); await sleep(200);
  log('   Backspace com o campo vazio → etiqueta:', await chip(w1));
  // começo do nome
  await type(w1, 'youtu'); await sleep(300);
  log('"youtu" →', await rows(w1));
  await blur(w1);
  // atalho + espaço
  await type(w1, 'w '); await sleep(300);
  await type(w1, 'Brasil'); await sleep(200);
  log('"w " (espaço) → etiqueta:', await chip(w1), '· endereço:', await js(w1, 'omnibox.items[0]?.url'));
  await blur(w1);
  // @abas
  await type(w1, '@abas'); await key(w1, 'Tab'); await sleep(200);
  await type(w1, 'alp'); await sleep(300);
  log('"@abas" + Tab + "alp" → etiqueta:', await chip(w1), '· lista:', await rows(w1));
  await blur(w1);

  // Configurações: um atalho novo
  await js(w1, "openSiteSearchSheet(); document.querySelector('#ss-add').click(); 0"); await sleep(300);
  await js(w1, `(() => { const r = [...document.querySelectorAll('#ss-list .ss-row')].pop(); const set = (f, v) => { const i = r.querySelector('[data-f=' + f + ']'); i.value = v; i.dispatchEvent(new InputEvent('input', { bubbles: true })); }; set('name', 'Local'); set('keyword', 'lc'); set('url', '${base}/search?q=%s'); return 0; })()`);
  fs.writeFileSync(path.join(OUT, 'sheet.png'), (await w1.webContents.capturePage()).toPNG());
  await js(w1, "document.querySelector('#ss-save').click(); 0"); await sleep(300);
  await type(w1, 'lc'); await key(w1, 'Tab'); await type(w1, 'teste'); await sleep(300);
  log('atalho novo "lc" → etiqueta:', await chip(w1), '· endereço:', await js(w1, 'omnibox.items[0]?.url'));
  log('capturas em:', OUT);
  server.close(); app.exit(0);
});
