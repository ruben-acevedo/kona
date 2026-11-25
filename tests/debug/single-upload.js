// C4: uma imagem enviada por vez (fundo da nova aba e foto de perfil); padrões sempre disponíveis.
const os = require('os'); const path = require('path');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-upl-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  let wc; while (!(wc = BrowserWindow.getAllWindows()[0]?.webContents)) await sleep(50);
  await sleep(3500);
  wc.on('console-message', (e) => { if (e.level === 'error' || /Uncaught/.test(e.message)) console.log('C erro:', e.message); });
  const js = (c) => wc.executeJavaScript(c);
  const log = (...a) => console.log('R', ...a);
  // gera uma imagem de cor sólida e "envia" pelo campo de arquivo
  await js(`window.upload = async (sel, color) => {
    const c = new OffscreenCanvas(400, 300); const x = c.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, 400, 300);
    const f = new File([await c.convertToBlob({ type: 'image/png' })], color.slice(1) + '.png', { type: 'image/png' });
    const dt = new DataTransfer(); dt.items.add(f);
    const input = document.querySelector(sel); input.files = dt.files; input.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 600));
  }; 0`);

  // Fundo
  await js(`toggleCustomize(true); 0`);
  await js(`upload('#wp-file', '#ff0000')`);
  const a = await js(`settings.customImage.slice(-40)`);
  await js(`upload('#wp-file', '#00ff00')`);
  const b = await js(`settings.customImage.slice(-40)`);
  log('fundo: imagens enviadas na grade:', await js(`document.querySelectorAll('#wp-grid [data-wp=image]').length`), '· a segunda substituiu a primeira:', a !== b);
  await js(`document.querySelector('#wp-grid [data-wp=aurora]').click(); 0`); await sleep(300);
  log('fundo: escolher um padrão mantém a enviada disponível:', await js(`document.querySelectorAll('#wp-grid [data-wp=image]').length === 1 && settings.wallpaper === 'aurora'`),
    '· padrões:', await js(`document.querySelectorAll('#wp-grid .wp-swatch[data-wp]:not([data-wp=image]):not([data-wp=color])').length`));
  await js(`toggleCustomize(false); 0`);

  // Foto de perfil
  const photoTiles = () => js(`document.querySelectorAll('#pf-grid [data-photo]').length`);
  await js(`openProfileSheet('edit', PROFILES.current); 0`); await sleep(400);
  await js(`upload('#avatar-file', '#0000ff')`);
  const p1 = await js(`draft.photo.slice(-40)`);
  await js(`upload('#avatar-file', '#ffff00')`);
  log('perfil: fotos na grade:', await photoTiles(), '· a segunda substituiu a primeira:', p1 !== await js(`draft.photo.slice(-40)`));
  await js(`document.querySelector('#pf-grid [data-av]').click(); 0`); await sleep(200);
  await js(`saveProfile(); 0`); await sleep(500);
  await js(`openProfileSheet('edit', PROFILES.current); 0`); await sleep(400);
  log('perfil: depois de salvar com avatar pronto, a foto continua disponível:', await photoTiles(), '· avatar atual:', await js(`PROFILES.currentProfile().avatar.type`),
    '· prontos:', await js(`document.querySelectorAll('#pf-grid [data-av]').length`));
  await js(`document.querySelector('#pf-grid [data-photo]').click(); saveProfile(); 0`); await sleep(500);
  log('perfil: voltar para a foto:', await js(`PROFILES.currentProfile().avatar.type`));
  app.exit(0);
});
