// Capturas para o README (perfil limpo, sem dados pessoais): nova aba, visão geral, menu lateral, tema claro,
// modo leitura, painel do site e pré-visualização de impressão.
const os = require('os'); const fs = require('fs'); const path = require('path');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-shots-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = path.join(__dirname, '..', 'output-windows', 'readme'); fs.mkdirSync(OUT, { recursive: true });
app.whenReady().then(async () => {
  let w; while (!(w = BrowserWindow.getAllWindows()[0])) await sleep(50);
  const wc = w.webContents;
  await sleep(3000);
  w.unmaximize(); w.setSize(1600, 1000); w.center();
  await sleep(1200);
  const js = (c) => wc.executeJavaScript(c);
  const shot = async (name) => { await sleep(900); fs.writeFileSync(path.join(OUT, name), (await wc.capturePage()).toPNG()); console.log('R', name); };
  await js(`settings.sounds = false; 0`);
  await shot('new-tab.png');

  for (const u of ['https://en.wikipedia.org/wiki/Pineapple', 'https://en.wikipedia.org/wiki/Kona_District,_Hawaii', 'https://www.openstreetmap.org/#map=12/19.64/-155.99', 'https://news.ycombinator.com/']) {
    await js(`newTab(${JSON.stringify(u)}); 0`);
    await sleep(3500);
  }
  await js(`activate(tabs[1].id); 0`);
  await sleep(2500);
  await shot('page.png');
  await js(`activate(tabs[0].id); 0`);
  await sleep(1200);
  await js(`openOverview(); 0`);
  await sleep(1500);
  await shot('overview.png');
  await js(`closeOverview(); activate(tabs[1].id); 0`);
  await sleep(1500);
  await js(`toggleSidebar(true); 0`);
  await sleep(1000);
  await shot('sidebar.png');
  await js(`toggleSidebar(false); 0`);
  await sleep(800);
  // modo leitura num artigo da Wikipedia
  await js(`toggleReader(tabs[1]); 0`);
  await sleep(3000);
  await shot('reader.png');
  await js(`toggleReader(tabs[1]); 0`);
  await sleep(1500);
  // painel do site (cadeado)
  await js(`toggleSitePop(tabs[1], document.querySelector('.tab.active .lock') || tabEl(tabs[1]).querySelector('.lock'), true); 0`);
  await sleep(1500);
  await shot('site-panel.png');
  await js(`toggleSitePop(tabs[1], null, false); 0`);
  await sleep(600);
  // pré-visualização de impressão
  await js(`openPrint(tabs[1]); 0`);
  await sleep(5000);
  await shot('print.png');
  await js(`closePrint(); 0`);
  await sleep(800);
  await js(`activate(tabs[0].id); settings.theme = 'light'; applyTheme(true); 0`);
  await sleep(1200);
  await shot('new-tab-light.png');
  app.exit(0);
});
