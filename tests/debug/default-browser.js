// G3: navegador padrão — link vindo de outro programa (segunda instância) vira aba na janela aberta;
// a barra de aviso empurra o conteúdo para baixo sem cobrir a página.
const os = require('os'); const fs = require('fs'); const path = require('path');
const { spawn } = require('child_process');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-default-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = path.join(__dirname, '..', 'output-windows', 'default'); fs.mkdirSync(OUT, { recursive: true });
app.whenReady().then(async () => {
  let wc; while (!(wc = BrowserWindow.getAllWindows()[0]?.webContents)) await sleep(50);
  await sleep(3500);
  wc.on('console-message', (e) => { if (e.level === 'error' || /Uncaught/.test(e.message)) console.log('C erro:', e.message); });
  const js = (c) => wc.executeJavaScript(c);
  const log = (...a) => console.log('R', ...a);
  await js(`settings.sounds = false; if (document.querySelector('#import-sheet').classList.contains('show')) closeImport(); 0`);
  log('status (Kona de teste, sem instalador):', JSON.stringify(await js(`api.defaultStatus()`)), '· barra visível:', await js(`document.body.classList.contains('infobar-on')`));

  // segunda instância com um link, como o Windows faz quando o Kona é o padrão
  const before = await js(`tabs.length`);
  const appDir = path.join(__dirname, '..', '..');
  const second = spawn(process.execPath, [appDir, '--', 'https://example.com/'], { env: { ...process.env }, stdio: 'ignore' });
  const code = await new Promise((r) => second.on('exit', r));
  await sleep(2500);
  log('segunda instância saiu sozinha:', code === 0, '· abas:', before, '→', await js(`tabs.length`), '· ativa:', await js(`active().url`));

  // barra de aviso: aparece abaixo da barra de ferramentas e empurra a página
  const top = () => js(`Math.round(document.querySelector('#views').getBoundingClientRect().top)`);
  const t0 = await top();
  await js(`showInfobar(true); $('#ib-text').textContent = 'Kona isn’t your default browser.'; 0`); await sleep(500);
  log('página começa em:', t0, '→', await top(), '· barra:', await js(`JSON.stringify((({ top, height }) => ({ top: Math.round(top), height: Math.round(height) }))(document.querySelector('#infobar').getBoundingClientRect()))`));
  fs.writeFileSync(path.join(OUT, 'infobar-web.png'), (await wc.capturePage()).toPNG());
  await js(`newTab(); 0`); await sleep(800);
  fs.writeFileSync(path.join(OUT, 'infobar-start.png'), (await wc.capturePage()).toPNG());
  await js(`document.querySelector('#ib-close').click(); 0`); await sleep(300);
  log('× fecha:', await js(`!document.body.classList.contains('infobar-on')`), '· página volta para:', await top());
  app.exit(0);
});
