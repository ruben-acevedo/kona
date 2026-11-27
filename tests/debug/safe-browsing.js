// O2: proteção contra golpes e malware. Entradas de teste (sem sites perigosos de verdade):
// site de golpe → aviso por cima da aba; "Voltar à segurança"; "Abrir mesmo assim"; download de
// endereço de malware bloqueado. Depois baixa as listas reais e mede tamanho e tempo.
const os = require('os'); const path = require('path'); const http = require('http'); const fs = require('fs');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-safe-${process.pid}`);
require('../../main.js');
const safe = require('../../safe-browsing');
const { app, BrowserWindow } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('R', ...a);

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/bad/')) { res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="instalador.exe"' }); res.end('MZ'); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<title>Página ${req.url}</title><h1>${req.url}</h1>`);
});

app.whenReady().then(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const A = `http://127.0.0.1:${port}`, L = `http://localhost:${port}`;
  safe._inject([`${L}/golpe/login`], 'phishing');
  safe._inject([`${A}/bad/`], 'malware');
  let w; while (!(w = BrowserWindow.getAllWindows()[0])) await sleep(50);
  await sleep(3000);
  const wc = w.webContents; wc.setAudioMuted(true);
  const js = (c) => wc.executeJavaScript(c);
  const st = () => js("({ aviso: !document.querySelector('#safe-pane').hidden, titulo: document.querySelector('#safe-title').textContent, texto: document.querySelector('#safe-text').textContent.slice(0, 60), aba: active().url, foco: document.activeElement.id })");
  await js(`settings.sounds = true; settings.httpsFirst = false; saveSettings(); setLanguage('pt-BR'); navigate(active(), '${A}/inicio'); window.__sfxLog = []; 0`); await sleep(1500);

  await js(`navigate(active(), '${L}/golpe/login?x=1'); 0`); await sleep(1500);
  log('site de golpe →', JSON.stringify(await st()), '· sons:', await js("__sfxLog.join(' ')"));
  log('   a página perigosa abriu por baixo?', await js("active().wv.getURL()"));
  fs.writeFileSync(path.join(os.tmpdir(), 'kona-safe.png'), (await wc.capturePage()).toPNG());
  await js("document.querySelector('#safe-back').click(); 0"); await sleep(600);
  log('Voltar à segurança →', JSON.stringify(await st()));

  await js(`navigate(active(), '${L}/golpe/login'); 0`); await sleep(1500);
  await js("document.querySelector('#safe-go').click(); 0"); await sleep(1800);
  log('Abrir mesmo assim →', JSON.stringify(await st()), '· título:', await js('active().title'));

  await js(`newTab('${L}/golpe/login', false); 0`); await sleep(1500);
  log('aba nova direto no site (já liberado nesta sessão) →', JSON.stringify(await st()));

  await js(`navigate(active(), '${A}/bad/instalador.exe'); 0`); await sleep(1500);
  log('arquivo de endereço de malware →', JSON.stringify(await st()), '· aviso:', await js("document.querySelector('#toast').textContent"));
  await js("document.querySelector('#safe-back').click(); 0"); await sleep(500);
  // download por link (sem abrir a página): o arquivo nem começa
  await js(`navigate(active(), '${A}/inicio'); 0`); await sleep(1200);
  await js(`active().wv.downloadURL('${A}/bad/outro.exe'); 0`); await sleep(1500);
  log('download direto de endereço de malware → aviso:', await js("document.querySelector('#toast').textContent"));

  // listas reais
  const t0 = Date.now();
  await safe.update({ force: true });
  const s = safe.status();
  const t1 = performance.now(); for (let i = 0; i < 1000; i++) safe.check(`https://www.exemplo${i}.com.br/caminho/pagina.html?q=${i}`);
  log('listas reais:', s.entries, 'sites · baixar + montar:', Date.now() - t0, 'ms · conferir um endereço:', ((performance.now() - t1) / 1000).toFixed(3), 'ms');
  log('   sites comuns bloqueados por engano?', ['https://www.google.com/', 'https://docs.google.com/document/d/1', 'https://github.com/', 'https://www.youtube.com/', 'https://web.whatsapp.com/', 'https://www.mercadolivre.com.br/', 'https://pt.wikipedia.org/wiki/Brasil'].filter((u) => safe.check(u)).join(', ') || 'nenhum');
  const dir = path.join(app.getPath('userData'), 'safe-browsing');
  log('   arquivos:', fs.readdirSync(dir).map((f) => `${f} ${Math.round(fs.statSync(path.join(dir, f)).size / 1024)} KB`).join(' · '));
  await js("openSettings('privacidade'); 0"); await sleep(1200);
  log('Configurações:', await js("[...document.querySelectorAll('#st-privacidade .st-row')].slice(0, 2).map((r) => r.textContent.replace(/\\s+/g, ' ').trim().slice(0, 140)).join(' || ')"));
  server.close(); app.exit(0);
});
