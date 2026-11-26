// H1: downloads — botão com anel na barra, lista no menu lateral (Ctrl+J), pausar/continuar, cancelar,
// tentar de novo, ícone do Windows e lista salva. Um servidor local entrega os arquivos devagar.
const os = require('os'); const fs = require('fs'); const path = require('path'); const http = require('http');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-dl-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = path.join(__dirname, '..', 'output-windows', 'downloads'); fs.mkdirSync(OUT, { recursive: true });
const DL_DIR = path.join(os.tmpdir(), `kona-dl-files-${process.pid}`); fs.mkdirSync(DL_DIR, { recursive: true });

// /file/<nome>?kb=N&ms=M → N KB em pedaços de 32 KB a cada M ms
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const name = decodeURIComponent(u.pathname.split('/').pop());
  const kb = +u.searchParams.get('kb') || 512; const ms = +u.searchParams.get('ms') || 50;
  res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': kb * 1024, 'Content-Disposition': `attachment; filename="${name}"` });
  let sent = 0;
  const tick = () => {
    if (res.destroyed) return;
    const n = Math.min(32, kb - sent); sent += n;
    res.write(Buffer.alloc(n * 1024, 65));
    if (sent >= kb) res.end(); else setTimeout(tick, ms);
  };
  tick();
});

app.whenReady().then(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/file/`;
  let wc; while (!(wc = BrowserWindow.getAllWindows()[0]?.webContents)) await sleep(50);
  await sleep(3500);
  wc.on('console-message', (e) => { if (e.level === 'error' || /Uncaught/.test(e.message)) console.log('C erro:', e.message); });
  const js = (c) => wc.executeJavaScript(c);
  const log = (...a) => console.log('R', ...a);
  const shot = async (name) => { await sleep(300); fs.writeFileSync(path.join(OUT, name), (await wc.capturePage()).toPNG()); };
  const until = async (c, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await js(c)) return true; await sleep(150); } return false; };
  const key = (k, mods = []) => { wc.sendInputEvent({ type: 'keyDown', keyCode: k, modifiers: mods }); wc.sendInputEvent({ type: 'keyUp', keyCode: k, modifiers: mods }); };
  await js(`settings.sounds = false; settings.downloadDir = ${JSON.stringify(DL_DIR)}; saveSettings(); 0`);
  log('botão antes do 1º download:', await js(`document.querySelector('#btn-downloads').hidden ? 'escondido' : 'visível'`));

  // 1. download lento: progresso, botão com anel, linha na lista
  await js(`navigate(active(), ${JSON.stringify(base + 'report.pdf?kb=3072&ms=60')}); 0`);
  await until(`downloadsList.active().length === 1 && downloadsList.active()[0].received > 200000`);
  key('J', ['control']); await sleep(700);
  log('Ctrl+J abre a lista:', await js(`sb.view === 'downloads' && document.body.classList.contains('sidebar-open')`));
  log('botão:', await js(`(() => { const b = document.querySelector('#btn-downloads'); return (b.hidden ? 'escondido' : 'visível') + ' · ativo: ' + b.classList.contains('active') + ' · anel: ' + getComputedStyle(b).getPropertyValue('--dl-pct') + '%'; })()`));
  log('linha:', await js(`document.querySelector('#sb-list .dl-row')?.innerText.replace(/\\s+/g, ' ')`), '· contador:', await js(`document.querySelector('#sb-dl-count').textContent`));
  await shot('progress.png');

  // 2. pausar e continuar
  await js(`document.querySelector('#sb-list .dl-row [data-dl-act="pause"]').click(); 0`); await sleep(900);
  const r1 = await js(`downloadsList.items[0].received`); await sleep(800); const r2 = await js(`downloadsList.items[0].received`);
  log('pausado:', await js(`document.querySelector('#sb-list .dl-row .dl-status').textContent`), '· parou de baixar:', r1 === r2);
  await shot('paused.png');
  await js(`document.querySelector('#sb-list .dl-row [data-dl-act="resume"]').click(); 0`);
  const finished = await until(`downloadsList.items[0].state === 'completed'`, 60000);
  await sleep(800);
  log('concluído:', finished, '·', await js(`document.querySelector('#sb-list .dl-row')?.innerText.replace(/\\s+/g, ' ')`), '· arquivo existe:', fs.existsSync(path.join(DL_DIR, 'report.pdf')));
  log('ícone do Windows:', await js(`!!document.querySelector('#sb-list .dl-row .dl-icon img')`), '· arrastável:', await js(`document.querySelector('#sb-list .dl-row').draggable`), '· anel ativo:', await js(`document.querySelector('#btn-downloads').classList.contains('active')`));

  // 3. cancelar → "Canceled" com Retry; Retry baixa de novo
  await js(`navigate(active(), ${JSON.stringify(base + 'video.zip?kb=4096&ms=60')}); 0`);
  await until(`downloadsList.active().length === 1 && downloadsList.active()[0].received > 100000`);
  await sleep(300);
  await js(`document.querySelector('#sb-list .dl-row.active [data-dl-act="cancel"]').click(); 0`);
  await until(`downloadsList.items[0].state === 'cancelled'`);
  await sleep(400);
  log('cancelado:', await js(`document.querySelector('#sb-list .dl-row')?.innerText.replace(/\\s+/g, ' ')`), '· botão Retry:', await js(`!!document.querySelector('#sb-list .dl-row [data-dl-act="retry"]')`));
  await shot('cancelled.png');
  await js(`document.querySelector('#sb-list .dl-row [data-dl-act="retry"]').click(); 0`);
  log('Retry recomeçou:', await until(`downloadsList.active().length === 1`), '· itens:', await js(`downloadsList.items.length`));
  await js(`api.downloadCancel(downloadsList.active()[0].id); 0`); await sleep(800);

  // 4. arquivo apagado do disco aparece como "Deleted"; lista salva sobrevive a recarregar
  fs.rmSync(path.join(DL_DIR, 'report.pdf'));
  await js(`missingChecked = 0; renderSub(); 0`); await sleep(1200);
  log('apagado do disco:', await js(`[...document.querySelectorAll('#sb-list .dl-row.missing .dl-status')].map((x) => x.textContent).join(', ')`));
  log('salvo:', await js(`(() => { const d = JSON.parse(localStorage.getItem(profileKey('downloads'))); return d.length + ' itens · ' + d.map((x) => x.name + ':' + x.state).join(', '); })()`));
  await js(`document.querySelector('#sb-subfoot [data-act="clear-downloads"]').click(); 0`); await sleep(400);
  log('Clear list:', await js(`downloadsList.items.length`), 'itens ·', await js(`document.querySelector('#sb-list').innerText.replace(/\\s+/g, ' ').slice(0, 60)`));
  await shot('empty.png');
  server.close();
  app.exit(0);
});
