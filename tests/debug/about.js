// O4: Settings → About Kona — "Report a problem" (issue do GitHub preenchida, sem abrir a rede de
// verdade: só confere o endereço da aba) e a tela de licenças (lista, expandir, link do Chromium).
const os = require('os'); const fs = require('fs'); const path = require('path');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-about-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = path.join(__dirname, '..', 'output-windows', 'about'); fs.mkdirSync(OUT, { recursive: true });
let fails = 0;
const check = (ok, msg) => { console.log(ok ? 'OK  ' : 'FALHA', msg); if (!ok) fails++; };
app.whenReady().then(async () => {
  let win; while (!(win = BrowserWindow.getAllWindows()[0])) await sleep(50);
  const wc = win.webContents;
  await sleep(3000);
  const js = (c) => wc.executeJavaScript(c);
  const shot = async (name) => { win.focus(); await sleep(500); fs.writeFileSync(path.join(OUT, `${name}.png`), (await wc.capturePage()).toPNG()); };

  await js(`openSettings(); 0`); await sleep(800);
  await js(`settingsPage.scrollTo('sobre'); 0`); await sleep(1500);
  const info = await js(`appInfo`);
  console.log('info', JSON.stringify({ os: info.os, arch: info.arch, packaged: info.packaged, chromium: info.chromiumLicenses }));
  check(/^Windows 1[01]/.test(info.os) && /build \d{5}/.test(info.os), `sistema: ${info.os}`);
  check(!!info.chromiumLicenses, 'arquivo de licenças do Chromium encontrado');
  check(await js(`!!document.querySelector('#st-main [data-do="report"]') && !!document.querySelector('#st-main [data-do="licenses"]')`), 'botões em About Kona');
  await shot('about');

  // Relatar um problema: a aba nova vai para a issue do GitHub com o ambiente no corpo
  // (a navegação é parada logo em seguida para não abrir o GitHub de verdade no teste)
  await js(`document.querySelector('#st-main [data-do="report"]').click(); 0`); await sleep(300);
  const url = await js(`active().url`);
  await js(`active().wv?.stop?.(); 0`);
  const body = decodeURIComponent((url.split('body=')[1] || ''));
  check(url.startsWith('https://github.com/ruben-acevedo/kona/issues/new?body='), 'abre a issue nova do GitHub');
  check(body.includes(`- Kona: ${info.version}`) && body.includes(`Chromium: ${info.chrome}`) && body.includes(info.os), 'corpo com versão, Chromium e Windows');
  console.log('---\n' + body + '\n---');
  await js(`closeTab(active().id); 0`); await sleep(500);

  // Licenças
  await js(`openSettings(); 0`); await sleep(500);
  await js(`document.querySelector('#st-main [data-do="licenses"]').click(); 0`); await sleep(1200);
  const n = await js(`document.querySelectorAll('#lic-list button.lic-head').length`);
  check(n >= 30, `${n} itens na lista de licenças`);
  check(await js(`document.querySelector('#lic-sheet').classList.contains('show')`), 'tela de licenças aberta');
  await shot('licenses');
  await js(`[...document.querySelectorAll('#lic-list button.lic-head')].find((b) => b.textContent.includes('readability')).click(); 0`); await sleep(400);
  const txt = await js(`document.querySelector('#lic-list .lic-item.open .lic-text')?.textContent || ''`);
  check(/Apache License/.test(txt), 'expande e mostra o texto (Readability, Apache)');
  await js(`document.querySelector('#lic-list .lic-item.open').scrollIntoView({ block: 'center' }); 0`);
  await shot('licenses-open');
  // Esc fecha
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); await sleep(400);
  check(await js(`!document.querySelector('#lic-sheet').classList.contains('show')`), 'Esc fecha a tela');
  // licenças do Chromium abrem numa aba
  await js(`openLicenses(); 0`); await sleep(600);
  await js(`document.querySelector('#lic-list [data-lic-open^="file:"]').click(); 0`); await sleep(2500);
  const cu = await js(`active().url`);
  check(/LICENSES\.chromium\.html$/i.test(cu), `licenças do Chromium numa aba: ${cu}`);
  await shot('chromium');
  // pt-BR
  await js(`setLanguage('pt-BR'); 0`); await sleep(1000);
  await js(`openSettings(); settingsPage.scrollTo('sobre'); 0`); await sleep(1000);
  await shot('about-pt');
  console.log(fails ? `${fails} falha(s)` : 'tudo certo');
  app.exit(fails ? 1 : 0);
});
