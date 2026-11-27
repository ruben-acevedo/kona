// Avatares dos perfis: 10 grupos na grade, a fileira com as 4 opções do grupo escolhido, trocar de
// opção, salvar, avatar antigo (removido) vira o abacaxi de óculos, efeito ao passar o mouse, sons.
const os = require('os'); const path = require('path'); const fs = require('fs');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-avatars-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('R', ...a);
const OUT = path.join(os.tmpdir(), 'kona-avatars-shots');
fs.mkdirSync(OUT, { recursive: true });

app.whenReady().then(async () => {
  let w; while (!(w = BrowserWindow.getAllWindows()[0])) await sleep(50);
  await sleep(3000);
  const wc = w.webContents; wc.setAudioMuted(true);
  const js = (c) => wc.executeJavaScript(c);
  const shot = async (n) => fs.writeFileSync(path.join(OUT, `${n}.png`), (await wc.capturePage()).toPNG());
  await js("settings.sounds = true; setLanguage('pt-BR'); 0"); await sleep(300);

  // perfil antigo com um avatar que não existe mais
  await js("PROFILES.update(PROFILES.current, { avatar: { type: 'preset', id: 'montanha' } }); renderProfileButton?.(); 0").catch(() => {});
  log('avatar antigo "montanha" → mostra:', await js("avatarHtml({ type: 'preset', id: 'montanha' }).includes('svg') ? 'desenho novo' : 'outro'"));

  await js("openProfileSheet('new'); 0"); await sleep(900);
  const st = () => js(`({ grupos: document.querySelectorAll('#pf-grid [data-group]').length, opcoes: document.querySelectorAll('#pf-variants [data-av]').length,
    fileira: !document.querySelector('#pf-variants').hidden, escolhido: draft.avatar.id, titulo: document.querySelector('#pf-variants .pf-var-label')?.textContent })`);
  log('novo perfil →', JSON.stringify(await st()));
  await shot('sheet');

  await js("window.__sfxLog = []; document.querySelector('#pf-grid [data-group=\"cat\"]').click(); 0"); await sleep(500);
  log('clicar em Gatos →', JSON.stringify(await st()), '· sons:', await js('__sfxLog.join(" ")'));
  await js("window.__sfxLog = []; document.querySelector('#pf-variants [data-av=\"cat-siamese\"]').click(); 0"); await sleep(400);
  log('escolher Siamês →', JSON.stringify(await st()), '· a grade mostra o siamês no grupo:', await js("document.querySelector('#pf-grid [data-group=\"cat\"] img').src === AVATARS.find((a) => a.id === 'cat-siamese').src"), '· sons:', await js('__sfxLog.join(" ")'));
  await js("document.querySelector('#pf-grid [data-group=\"cat\"]').click(); 0"); await sleep(300);
  log('clicar de novo em Gatos mantém o siamês:', await js('draft.avatar.id'));

  // efeito ao passar o mouse (mouse de verdade sobre um avatar da fileira)
  const r = await js("(() => { const b = document.querySelector('#pf-variants [data-av=\"cat-black\"]').getBoundingClientRect(); return [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)]; })()");
  await js('window.__sfxLog = []; 0');
  wc.sendInputEvent({ type: 'mouseMove', x: r[0], y: r[1] }); await sleep(250);
  log('passar o mouse → transformação do ícone:', await js("getComputedStyle(document.querySelector('#pf-variants [data-av=\"cat-black\"] .avatar')).transform"),
    '· reflexo animando:', await js("getComputedStyle(document.querySelector('#pf-variants [data-av=\"cat-black\"] .avatar'), '::after').animationName"), '· sons:', await js('__sfxLog.join(" ")'));
  await shot('hover');

  for (const g of ['pine', 'dog', 'soccer', 'flower', 'woman', 'man', 'halloween', 'music', 'games']) {
    await js(`document.querySelector('#pf-grid [data-group="${g}"]').click(); 0`); await sleep(120);
  }
  log('todos os grupos abrem 4 opções:', await js("AVATAR_GROUPS.every((g) => g.items.length === 4)"), '· imagens que não carregaram:',
    await js("[...document.querySelectorAll('#profile-sheet img')].filter((i) => !i.complete || !i.naturalWidth).length"));
  await js("document.querySelector('#pf-variants [data-av=\"games-headset\"]').click(); document.getElementById('pf-name').value = 'Jogos'; saveProfile(); 0"); await sleep(900);
  log('salvou e trocou para o perfil novo:', JSON.stringify(await js('({ nome: PROFILES.currentProfile().name, avatar: PROFILES.currentProfile().avatar.id })')));
  await js('toggleSidebar(true); 0'); await sleep(700);
  await js('toggleProfilePop(true); 0'); await sleep(700);
  await shot('sidebar');
  log('capturas em:', OUT);
  app.exit(0);
});
