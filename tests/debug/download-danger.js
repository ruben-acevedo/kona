// N14: aviso de download perigoso — .exe fica guardado à parte com "Manter" / "Descartar" (Manter
// leva à pasta com a marca de internet; Descartar apaga), .txt normal sem aviso, arquivo vindo por
// http de fora da máquina = "Download inseguro". Os arquivos vão para uma pasta temporária.
const os = require('os'); const path = require('path'); const http = require('http'); const fs = require('fs');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-dldanger-${process.pid}`);
const DIR = path.join(os.tmpdir(), `kona-dldanger-files-${process.pid}`);
fs.mkdirSync(DIR, { recursive: true });
require('../../main.js');
const { app, BrowserWindow, webContents } = require('electron');
app.commandLine.appendSwitch('host-resolver-rules', 'MAP insecure.test 127.0.0.1');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('R', ...a);
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(req.url.split('/').pop() || 'x');
  if (req.url.startsWith('/file/')) { res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${name}"` }); res.end(`conteúdo de ${name}`); return; }
  res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<title>Página</title>ok');
});
app.whenReady().then(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  let w; while (!(w = BrowserWindow.getAllWindows()[0])) await sleep(50);
  await sleep(3000);
  const js = (c) => w.webContents.executeJavaScript(c);
  await js(`settings.sounds = false; setLanguage('pt-BR'); settings.downloadDir = ${JSON.stringify(DIR)}; saveSettings(); navigate(active(), '${base}/'); 0`);
  await sleep(1500);
  const g = webContents.getAllWebContents().find((c) => c.getType() === 'webview');
  const item = (name) => js(`JSON.stringify((downloadsList.items.find((x) => x.name === ${JSON.stringify(name)}) || {}))`).then(JSON.parse);
  const waitState = async (name, states) => { for (let i = 0; i < 60; i++) { const x = await item(name); if (states.includes(x.state)) return x; await sleep(150); } return item(name); };
  const files = () => fs.readdirSync(DIR).join(', ') || '(vazia)';

  // 1) .exe: fica à parte, com aviso
  g.downloadURL(`${base}/file/setup.exe`);
  let x = await waitState('setup.exe', ['dangerous', 'completed']);
  log('setup.exe → estado:', x.state, '· tipo:', x.danger, '· na pasta de downloads:', files(), '· aviso:', await js("document.querySelector('#toast').textContent"));
  await js("openSidebarView('downloads'); 0"); await sleep(700);
  log('   lista:', await js("[...document.querySelectorAll('#sb-list .dl-row')].map((r) => r.innerText.replace(/\\s+/g, ' ').trim()).join(' | ')"));
  fs.writeFileSync(path.join(os.tmpdir(), 'kona-dldanger.png'), (await w.webContents.capturePage()).toPNG());
  // Manter
  await js("document.querySelector('#sb-list .dl-row.danger [data-dl-act=keep]').click(); 0"); await sleep(900);
  x = await item('setup.exe');
  let zone = '(sem marca)'; try { zone = fs.readFileSync(path.join(DIR, 'setup.exe:Zone.Identifier'), 'utf8').replace(/\r?\n/g, ' | '); } catch { /* sem marca */ }
  log('Manter → estado:', x.state, '· pasta:', files(), '· marca de internet:', zone);

  // 2) Descartar
  g.downloadURL(`${base}/file/tool.bat`);
  await waitState('tool.bat', ['dangerous']); await sleep(400);
  await js("document.querySelector('#sb-list .dl-row.danger [data-dl-act=discard]').click(); 0"); await sleep(900);
  x = await item('tool.bat');
  const holding = path.join(process.env.KONA_USER_DATA, 'Downloads-holding');
  log('Descartar → estado:', x.state, '· pasta:', files(), '· guardados à parte:', fs.existsSync(holding) ? fs.readdirSync(holding).length : 0);

  // 3) .txt normal: sem aviso
  g.downloadURL(`${base}/file/notes.txt`);
  x = await waitState('notes.txt', ['completed', 'dangerous']);
  log('notes.txt (127.0.0.1) → estado:', x.state, '· pasta:', files());

  // 4) .txt vindo por http de outro site: inseguro
  g.downloadURL(`http://insecure.test:${port}/file/report.txt`);
  x = await waitState('report.txt', ['dangerous', 'completed']);
  log('report.txt (http://insecure.test) → estado:', x.state, '· tipo:', x.danger, '· texto:', await js("[...document.querySelectorAll('#sb-list .dl-row')].find((r) => r.innerText.includes('report.txt'))?.querySelector('.dl-status').textContent"));
  log('captura:', path.join(os.tmpdir(), 'kona-dldanger.png'));
  server.close(); app.exit(0);
});
