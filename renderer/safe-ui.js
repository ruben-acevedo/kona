/* Proteção contra golpes e malware (O2): o processo principal cancela a navegação para um site das
   listas e avisa; aqui aparece o aviso por cima da aba (como a tela vermelha do Chrome), com
   "Voltar à segurança" e, discreto, "Abrir mesmo assim". Download de endereço de malware: aviso. */
const SAFE_TEXT = {
  phishing: {
    title: /*i18n*/'Deceptive site ahead',
    text: /*i18n*/'Attackers on {host} may try to trick you into doing something dangerous, like revealing your passwords, phone number or card details.',
  },
  malware: {
    title: /*i18n*/'Dangerous site ahead',
    text: /*i18n*/'{host} may try to install harmful programs on your computer that steal or delete your information.',
  },
};

function paintSafe() {
  const b = active()?.blocked;
  const pane = $('#safe-pane');
  const was = !pane.hidden;
  pane.hidden = !b;
  if (!b) return;
  const s = SAFE_TEXT[b.threat] || SAFE_TEXT.phishing;
  pane.classList.toggle('malware', b.threat === 'malware');
  $('#safe-title').textContent = tl(s.title);
  $('#safe-text').textContent = tl(s.text, { host: hostOf(b.url) || b.url });
  $('#safe-url').textContent = b.url;
  if (!was) requestAnimationFrame(() => $('#safe-back').focus({ preventScroll: true }));
}

api?.on('safe:blocked', ({ wcId, url, threat }) => {
  const t = tabByWcId(wcId);
  if (!t) return;
  t.blocked = { url, threat };
  t.loading = false;
  render();
  if (t === active()) sfx.play('open');
});

$('#safe-back').addEventListener('click', () => {
  const t = active();
  if (!t?.blocked) return;
  const { url } = t.blocked;
  t.blocked = null;
  // a aba já tinha uma página antes (o site perigoso nem abriu): fica nela; senão, a página inicial
  let cur = '';
  try { cur = t.wv?.getURL() || ''; } catch { /* ainda sem página */ }
  if (!/^https?:/.test(cur) || cur === url) {
    discardParked(t);
    t.wv?.remove();
    Object.assign(t, { wv: null, url: START, title: tl('New Tab'), favicon: null, canBack: false, canFwd: false, loading: false });
  } else {
    // a barra volta a mostrar a página que continua aberta (não o endereço perigoso que foi pedido)
    t.url = cur;
    try { t.title = t.wv.getTitle() || hostOf(cur); } catch { t.title = hostOf(cur); }
  }
  sfx.play('close');
  render();
});

$('#safe-go').addEventListener('click', async () => {
  const t = active();
  if (!t?.blocked || !t.wv) return;
  const { url } = t.blocked;
  if (!(await api?.safeAllow(t.wv.getWebContentsId(), url))) return;
  t.blocked = null;
  render();
  navigate(t, url);
});

api?.on('safe:download-blocked', ({ name, threat }) => {
  sfx.play('close');
  toast(threat === 'malware'
    ? tl('Download blocked: “{name}” comes from a site known to spread malware', { name })
    : tl('Download blocked: “{name}” comes from a deceptive site', { name }));
});
