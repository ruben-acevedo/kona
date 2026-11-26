'use strict';
// Navegador padrão: links abertos por outros programas viram abas; e, enquanto o Kona não for o
// navegador padrão, uma barra fina abaixo da barra de ferramentas oferece tl("Make default"). Fechar a
// barra vale até o Kona ser aberto de novo. O Windows não deixa um app se tornar padrão sozinho:
// o botão abre Configurações na página do Kona, e a barra some quando a pessoa confirma lá.

api?.on('tab:external', (url) => newTab(url, false));

const defaultBar = { dismissed: false, waiting: false };

function showInfobar(on) {
  document.body.classList.toggle('infobar-on', on);
}

async function checkDefault() {
  if (typeof restoreBar !== 'undefined' && restoreBar.open) return; // "Restaurar abas" tem a vez
  if (defaultBar.dismissed || library.isPrivate?.()) { showInfobar(false); return; }
  const st = (await api?.defaultStatus?.()) || { registered: false };
  if (!st.registered || st.isDefault) {
    if (st.isDefault && defaultBar.waiting) toast(tl('Kona is now your default browser'));
    defaultBar.waiting = false;
    showInfobar(false);
    return;
  }
  $('#ib-text').textContent = defaultBar.waiting
    ? tl('In Windows Settings, click “Set default” next to Kona.')
    : tl('Kona isn’t your default browser.');
  $('#ib-yes').textContent = defaultBar.waiting ? tl('Open Settings again') : tl('Make default');
  showInfobar(true);
}

$('#ib-yes').addEventListener('click', async () => {
  if (typeof restoreBar !== 'undefined' && restoreBar.open) return;
  sfx.play('select');
  defaultBar.waiting = true;
  await api?.defaultSet();
  checkDefault();
});
$('#ib-close').addEventListener('click', () => {
  if (typeof restoreBar !== 'undefined' && restoreBar.open) return;
  sfx.play('close');
  defaultBar.dismissed = true;
  showInfobar(false);
});
// volta das Configurações do Windows: confere de novo
api?.on('win:state', ({ focused }) => { if (focused && defaultBar.waiting) checkDefault(); });

hydrateIcons($('#infobar'));
setTimeout(checkDefault, 1500);
