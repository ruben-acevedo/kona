// N13: pré-visualização de impressão — Ctrl+P abre a tela do Kona; a prévia acompanha orientação,
// intervalo de páginas, papel e cabeçalho; intervalo inválido avisa; preto e branco; lista de
// impressoras; "Salvar como PDF" (arquivo de teste, sem a janela de salvar). Não manda nada para
// impressora nenhuma. Só servidor local.
const os = require('os'); const path = require('path'); const http = require('http'); const fs = require('fs');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-print-${process.pid}`);
const PDF = path.join(os.tmpdir(), `kona-print-${process.pid}.pdf`);
process.env.KONA_PDF_TARGET = PDF;
require('../../main.js');
const { app, BrowserWindow } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('R', ...a);
const OUT = path.join(os.tmpdir(), 'kona-print-shots');
fs.mkdirSync(OUT, { recursive: true });

const para = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer nec odio. Praesent libero. Sed cursus ante dapibus diam. ';
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<title>Relatório longo</title><style>body{font:16px Georgia;margin:40px} h1{color:#2b6cb0} .box{background:#fde68a;padding:20px}</style>
    <h1>Relatório de teste</h1><div class="box">Caixa com fundo amarelo</div>${Array.from({ length: 60 }, (_, i) => `<p>${i + 1}. ${para.repeat(2)}</p>`).join('')}`);
});

app.whenReady().then(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let w; while (!(w = BrowserWindow.getAllWindows()[0])) await sleep(50);
  await sleep(3000);
  const js = (c) => w.webContents.executeJavaScript(c);
  await js(`settings.sounds = false; setLanguage('pt-BR'); navigate(active(), '${base}/relatorio'); 0`); await sleep(2000);
  const state = () => js("({ open: document.querySelector('#print-sheet').classList.contains('show'), count: document.querySelector('#pr-count').textContent, erro: document.querySelector('#pr-error').hidden ? '' : document.querySelector('#pr-error').textContent, botao: document.querySelector('#pr-go').textContent + (document.querySelector('#pr-go').disabled ? ' (desligado)' : ''), destino: document.querySelector('#pr-dest').selectedOptions[0]?.textContent })");
  const set = (id, v) => js(`(() => { const e = document.querySelector('${id}'); if (e.type === 'checkbox') e.checked = ${JSON.stringify(v)}; else e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event(e.tagName === 'INPUT' && e.type !== 'checkbox' ? 'input' : 'change', { bubbles: true })); return 0; })()`);

  await js("shortcut('p'); 0"); await sleep(3500);
  log('Ctrl+P →', JSON.stringify(await state()));
  log('   impressoras:', await js("[...document.querySelectorAll('#pr-dest option')].map((o) => o.textContent).join(' | ')"));
  log('   prévia carregada:', await js("!!document.querySelector('#pr-preview webview')?.getURL().includes('.pdf')"));
  fs.writeFileSync(path.join(OUT, 'preview.png'), (await w.webContents.capturePage()).toPNG());

  await set('#pr-dest', '__pdf__'); await sleep(300);
  log('Salvar como PDF → botão:', (await state()).botao, '· campos de impressora escondidos:', await js("document.querySelector('#pr-copies').closest('.pr-row').hidden"));
  const portrait = (await state()).count;
  await set('#pr-layout', 'landscape'); await sleep(2500);
  const box = () => js("document.querySelector('#pr-preview webview').getURL()").then((u) => {
    const f = decodeURIComponent(u.replace(/^file:\/\/\//, '').replace(/#.*$/, ''));
    const m = /\/MediaBox\s*\[([^\]]*)\]/.exec(fs.readFileSync(f).toString('latin1'));
    const [, , wd, ht] = m[1].trim().split(/\s+/).map(Number);
    return wd > ht ? 'deitada' : 'em pé';
  });
  log('Paisagem → páginas:', portrait, '→', (await state()).count, '· folha da prévia:', await box());
  await set('#pr-layout', 'portrait');
  await set('#pr-pages', 'custom'); await set('#pr-range', '1-2, 4'); await sleep(2500);
  log('Páginas "1-2, 4" →', (await state()).count);
  await set('#pr-range', '50-60'); await sleep(2500);
  log('Páginas "50-60" (não existem) →', JSON.stringify(await state()), '· campo marcado:', await js("document.querySelector('#pr-range').classList.contains('bad')"));
  await set('#pr-range', '2'); await sleep(2000);
  await js("document.querySelector('#pr-more').click(); 0");
  await set('#pr-paper', 'A5'); await set('#pr-bg', true); await sleep(2500);
  log('Página 2, A5, gráficos de fundo →', (await state()).count);
  fs.writeFileSync(path.join(OUT, 'options.png'), (await w.webContents.capturePage()).toPNG());

  // preto e branco: só quando o destino é uma impressora
  const printer = await js("[...document.querySelectorAll('#pr-dest option')].find((o) => o.value !== '__pdf__')?.value || ''");
  if (printer) {
    await set('#pr-dest', printer); await set('#pr-color', 'bw'); await set('#pr-copies', '3'); await sleep(400);
    log('Impressora + preto e branco + 3 cópias → prévia cinza:', await js("document.querySelector('#pr-preview').classList.contains('bw')"), '· contagem:', (await state()).count);
    await set('#pr-dest', '__pdf__'); await sleep(300);
  }

  // salvar como PDF
  await set('#pr-pages', 'all'); await set('#pr-paper', 'A4'); await set('#pr-bg', false); await sleep(2500);
  await js("document.querySelector('#pr-go').click(); 0"); await sleep(3000);
  const pdf = fs.existsSync(PDF) ? fs.readFileSync(PDF) : null;
  log('Salvar → arquivo:', !!pdf, '· páginas no PDF:', pdf ? (pdf.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) || []).length : 0, '· tela fechou:', !(await state()).open, '· aviso:', await js("document.querySelector('#toast').textContent"));
  log('   lembra o destino:', await js('settings.print?.dest'));

  // Esc fecha; o menu do botão direito também abre a tela
  await js("openPrint(active()); 0"); await sleep(1500);
  await js("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); 0"); await sleep(400);
  log('Esc → fechou:', !(await state()).open, '· prévias que sobraram na pasta temporária:', (() => { try { return fs.readdirSync(path.join(os.tmpdir(), 'kona-print')).length; } catch { return 0; } })());
  log('capturas em:', OUT);
  server.close(); app.exit(0);
});
