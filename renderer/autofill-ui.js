'use strict';
// Endereços e cartões (N9), na interface: a lista sob o campo da página, o balão "Salvar endereço?" /
// "Salvar cartão?", o editor e a seção em Configurações. O número do cartão nunca passa por aqui
// (só bandeira e 4 últimos dígitos); preencher um cartão pede o Windows Hello no processo principal.

const afState = { list: { addresses: [], cards: [] }, suggest: null, pressing: false, shownAt: 0, offer: null, editing: null };

const afAddressTitle = (a) => a.name || a.street || a.city || tl('Address');
const afAddressLine = (a) => [[a.street, a.number].filter(Boolean).join(', '), a.city, a.state, a.postal].filter(Boolean).join(' · ');
const afExp = (c) => (c.expMonth && c.expYear ? `${String(c.expMonth).padStart(2, '0')}/${String(c.expYear).slice(-2)}` : '');
const afCardTitle = (c) => `${c.brand === 'Card' ? tl('Card') : c.brand} •••• ${c.last4}`;

/* ───────────── Lista sob o campo ───────────── */
function afHideSuggest() {
  if (afState.pressing) return;
  $('#af-suggest').classList.remove('show');
  afState.suggest = null;
}
api?.on('af:suggest', (s) => {
  const t = active();
  let wcId = -1; try { wcId = t?.wv?.getWebContentsId(); } catch { /* sem webview */ }
  if (!t?.wv || s.wcId !== wcId) return;
  if (Date.now() - (afState.filledAt || 0) < 1000) return; // a volta do foco logo depois de preencher
  afState.suggest = s;
  afState.shownAt = Date.now();
  const box = $('#af-suggest');
  const rows = s.items.map((x) => (s.kind === 'card'
    ? `<div class="pw-opt" data-af="${x.id}" role="option"><span class="pw-ic">${icon('card')}</span>
        <span class="pw-txt"><b>${escapeHtml(afCardTitle(x))}</b><small>${escapeHtml([x.name, afExp(x) && tl('Expires {date}', { date: afExp(x) })].filter(Boolean).join(' · '))}</small></span></div>`
    : `<div class="pw-opt" data-af="${x.id}" role="option"><span class="pw-ic">${icon('pin')}</span>
        <span class="pw-txt"><b>${escapeHtml(afAddressTitle(x))}</b><small>${escapeHtml(afAddressLine(x))}</small></span></div>`)).join('');
  const note = s.kind === 'card' && !s.secure ? `<p class="pw-note">${tl('Cards are only filled in on secure (https) pages.')}</p>` : '';
  box.innerHTML = rows + note + `<div class="pop-sep"></div><div class="pw-opt pw-manage" data-manage="1" role="option"><span class="pw-ic">${icon('gear')}</span>
    <span class="pw-txt"><b>${s.kind === 'card' ? tl('Manage cards…') : tl('Manage addresses…')}</b></span></div>`;
  // logo abaixo do campo (frame principal); em iframes, no topo da página
  const r = t.wv.getBoundingClientRect();
  const f = s.top && s.rect ? s.rect : { x: 16, y: 8, width: 300, height: 0 };
  const zoom = typeof zoomFor === 'function' ? zoomFor(t.url) : 1;
  let x = r.left + f.x * zoom, y = r.top + (f.y + f.height) * zoom + 4;
  box.classList.add('show');
  box.style.minWidth = `${Math.max(280, Math.min(420, f.width * zoom))}px`;
  if (y + box.offsetHeight > innerHeight - 8) y = Math.max(r.top + 4, r.top + f.y * zoom - box.offsetHeight - 4);
  x = Math.min(x, innerWidth - box.offsetWidth - 8);
  box.style.left = `${Math.max(8, x)}px`; box.style.top = `${y}px`;
});
api?.on('af:suggest-hide', () => setTimeout(afHideSuggest, 120));
$('#af-suggest').addEventListener('mousedown', () => { afState.pressing = true; });
$('#af-suggest').addEventListener('click', async (e) => {
  afState.pressing = false;
  const s = afState.suggest;
  const opt = e.target.closest('.pw-opt');
  if (!s || !opt) return;
  if (opt.dataset.manage) { afHideSuggest(); openSettings('enderecos'); return; }
  afHideSuggest();
  const r = await api.af.fill(s.id, opt.dataset.af);
  afState.filledAt = Date.now();
  sfx.play('select');
  active()?.wv?.focus();
  if (r === 'auth') toast(tl('Windows Hello didn’t confirm it’s you'));
  else if (!r) toast(s.kind === 'card' && !s.secure ? tl('Cards are only filled in on secure (https) pages.') : tl('Couldn’t fill in the form'));
});
document.addEventListener('mouseup', () => { setTimeout(() => { afState.pressing = false; }, 0); });
document.addEventListener('mousedown', (e) => { if (!e.target.closest('#af-suggest')) afHideSuggest(); }, true);
api?.on('page:mousedown', () => {
  const at = Date.now();
  setTimeout(() => { if (!afState.pressing && afState.shownAt < at) afHideSuggest(); }, 150);
});

/* ───────────── Balão "Salvar?" ───────────── */
function afCloseBubble(answer = 'dismiss') {
  const b = $('#af-bubble');
  if (!b.classList.contains('show')) return false;
  b.classList.remove('show');
  if (afState.offer) api?.af.answer(afState.offer.id, answer);
  afState.offer = null;
  return true;
}
api?.on('af:offer-save', (o) => {
  afState.offer = o;
  const b = $('#af-bubble');
  const isCard = o.kind === 'card';
  const title = isCard ? (o.update ? tl('Update card?') : tl('Save card?')) : (o.update ? tl('Update address?') : tl('Save address?'));
  const lines = isCard
    ? [afCardTitle(o.card), [o.card.name, afExp(o.card) && tl('Expires {date}', { date: afExp(o.card) })].filter(Boolean).join(' · ')]
    : [o.address.name, afAddressLine(o.address), [o.address.tel, o.address.email].filter(Boolean).join(' · ')];
  b.innerHTML = `<div class="pwb-head"><span class="pw-ic">${icon(isCard ? 'card' : 'pin')}</span><div><h3>${title}</h3>
      ${lines.filter(Boolean).map((l) => `<p>${escapeHtml(l)}</p>`).join('')}</div>
      <button class="tb small" data-afb="close" title="${tl('Close')}">${icon('x')}</button></div>
    ${isCard ? `<p class="af-note">${tl('Kona doesn’t save the security code (CVV). Filling in this card asks for Windows Hello.')}</p>` : ''}
    <div class="pwb-actions"><span class="spacer"></span>
      <button class="btn-secondary" data-afb="close">${tl('Not now')}</button>
      <button class="btn-primary" data-afb="save">${o.update ? tl('Update') : tl('Save')}</button></div>`;
  b.classList.add('show');
  sfx.play('open');
});
$('#af-bubble').addEventListener('click', async (e) => {
  const act = e.target.closest('[data-afb]')?.dataset.afb;
  if (!act || !afState.offer) return;
  const kind = afState.offer.kind;
  if (act === 'close') { afCloseBubble('dismiss'); sfx.play('close'); return; }
  const id = afState.offer.id;
  afState.offer = null;
  $('#af-bubble').classList.remove('show');
  const ok = await api.af.answer(id, 'save');
  sfx.play('select');
  if (ok) toast(kind === 'card' ? tl('Card saved') : tl('Address saved'));
});

/* ───────────── Editor (folha) ───────────── */
const AF_ADDRESS_FIELDS = [
  ['name', /*i18n*/'Name'], ['org', /*i18n*/'Organization'], ['street', /*i18n*/'Street'], ['number', /*i18n*/'Number'],
  ['complement', /*i18n*/'Apartment, suite, etc.'], ['neighborhood', /*i18n*/'Neighborhood'], ['city', /*i18n*/'City'],
  ['state', /*i18n*/'State'], ['postal', /*i18n*/'Postal code'], ['country', /*i18n*/'Country'], ['tel', /*i18n*/'Phone'], ['email', /*i18n*/'Email'],
];
function openAfEditor(kind, id = null) {
  afState.editing = { kind, id };
  const item = id ? (kind === 'card' ? afState.list.cards : afState.list.addresses).find((x) => x.id === id) : null;
  $('#af-title').textContent = kind === 'card' ? (id ? tl('Edit card') : tl('Add card')) : (id ? tl('Edit address') : tl('Add address'));
  const input = (key, label, value = '', attrs = '') => `<label class="af-field af-${key}"><span>${tl(label)}</span>
    <input class="pf-input" data-f="${key}" value="${escapeHtml(value || '')}" spellcheck="false" autocomplete="off" ${attrs} /></label>`;
  if (kind === 'card') {
    const year = new Date().getFullYear();
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    const years = Array.from({ length: 16 }, (_, i) => year + i);
    if (item?.expYear && !years.includes(item.expYear)) years.unshift(item.expYear);
    const sel = (key, opts, v) => `<select class="st-select" data-f="${key}"><option value="">—</option>${opts.map((o) => `<option value="${o}"${o === v ? ' selected' : ''}>${String(o).padStart(2, '0')}</option>`).join('')}</select>`;
    $('#af-form').innerHTML = `<div class="af-grid af-card">
      ${input('number', /*i18n*/'Card number', '', `inputmode="numeric" placeholder="${item ? escapeHtml(`•••• ${item.last4} — ${tl('leave empty to keep')}`) : ''}"`)}
      ${input('name', /*i18n*/'Name on card', item?.name)}
      <label class="af-field"><span>${tl('Expiration')}</span><span class="af-exp">${sel('expMonth', months, item?.expMonth)}<span>/</span>${sel('expYear', years, item?.expYear)}</span></label>
    </div><p class="af-note">${tl('Kona doesn’t save the security code (CVV). Filling in this card asks for Windows Hello.')}</p>`;
  } else {
    $('#af-form').innerHTML = `<div class="af-grid">${AF_ADDRESS_FIELDS.map(([k, l]) => input(k, l, item?.[k])).join('')}</div>`;
  }
  openSheet('#af-sheet');
  requestAnimationFrame(() => $('#af-form input')?.focus());
}
async function saveAfEditor() {
  const ed = afState.editing;
  if (!ed) return;
  const data = Object.fromEntries($$('#af-form [data-f]').map((el) => [el.dataset.f, el.value.trim()]));
  const r = ed.kind === 'card' ? await api.af.saveCard(data, ed.id) : await api.af.saveAddress(data, ed.id);
  if (r === 'invalid') { toast(tl('That card number doesn’t look right')); return; }
  if (!r) { toast(tl('Couldn’t save')); return; }
  afState.editing = null;
  closeSheet('#af-sheet');
  toast(ed.kind === 'card' ? tl('Card saved') : tl('Address saved'));
}
$('#af-save').addEventListener('click', saveAfEditor);
$('#af-cancel').addEventListener('click', () => { afState.editing = null; closeSheet('#af-sheet'); });
$('#af-form').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveAfEditor(); } });

async function deleteAf(kind, id) {
  const item = (kind === 'card' ? afState.list.cards : afState.list.addresses).find((x) => x.id === id);
  if (!item) return;
  const yes = await ask({
    title: kind === 'card' ? tl('Delete {card}?', { card: afCardTitle(item) }) : tl('Delete this address?'),
    text: kind === 'card' ? '' : afAddressLine(item),
    ok: tl('Delete'),
    danger: true,
  });
  if (!yes) return;
  await api.af.remove(kind, id);
  toast(kind === 'card' ? tl('Card deleted') : tl('Address deleted'));
}

/* ───────────── Seção em Configurações ───────────── */
function afSettingsSection() {
  const L = afState.list;
  const row = (kind, x) => `<div class="st-row af-row">
      <div class="st-text"><span class="st-ic">${icon(kind === 'card' ? 'card' : 'pin')}</span><b>${escapeHtml(kind === 'card' ? afCardTitle(x) : afAddressTitle(x))}</b>
        <p>${escapeHtml(kind === 'card' ? [x.name, afExp(x) && tl('Expires {date}', { date: afExp(x) })].filter(Boolean).join(' · ') : afAddressLine(x))}</p></div>
      <div class="st-ctrl">${stButton(tl('Edit…'), 'af-edit', 'btn-secondary', `data-kind="${kind}" data-id="${x.id}"`)}${stButton(tl('Delete'), 'af-delete', 'btn-link', `data-kind="${kind}" data-id="${x.id}"`)}</div>
    </div>`;
  const add = (kind, label) => `<div class="st-row"><div class="st-text"></div><div class="st-ctrl">${stButton(label, 'af-add', 'btn-secondary', `data-kind="${kind}"`)}</div></div>`;
  return settingsPage.section('enderecos', /*i18n*/'Addresses and cards',
    stRow(tl('Save and fill addresses'), tl('Kona offers to save the address when you fill in a form, and fills it in next time.'), stSwitch('autofillAddresses', settings.autofillAddresses !== false))
    + L.addresses.map((a) => row('address', a)).join('') + add('address', tl('Add address'))
    // segundo cartão da mesma seção: os cartões de pagamento
    + '</div><div class="st-card st-card-gap">'
    + stRow(tl('Save and fill cards'), tl('The card number is encrypted by Windows. The security code (CVV) is never saved. Filling in a card asks for Windows Hello.'), stSwitch('autofillCards', settings.autofillCards !== false))
    + L.cards.map((c) => row('card', c)).join('') + add('card', tl('Add card')));
}
$('#st-main').addEventListener('click', (e) => {
  const b = e.target.closest('[data-do^="af-"]');
  if (!b) return;
  if (b.dataset.do === 'af-add') openAfEditor(b.dataset.kind);
  else if (b.dataset.do === 'af-edit') openAfEditor(b.dataset.kind, b.dataset.id);
  else if (b.dataset.do === 'af-delete') deleteAf(b.dataset.kind, b.dataset.id);
});

async function loadAutofill() {
  try { afState.list = (await api?.af.list()) || afState.list; } catch { /* sem processo principal (testes da interface) */ }
  if (active()?.url === SETTINGS) settingsPage.refresh?.();
}
const syncAfPrefs = () => api?.af.setPrefs({ addresses: settings.autofillAddresses !== false, cards: settings.autofillCards !== false });
api?.on('af:changed', loadAutofill);
library.onChange((what) => {
  afHideSuggest();
  if (what === 'profile' || what === 'settings') { syncAfPrefs(); loadAutofill(); }
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (afCloseBubble() | ($('#af-suggest').classList.contains('show') && (afHideSuggest(), true))) e.stopPropagation();
}, true);
syncAfPrefs();
loadAutofill();
hydrateIcons($('#af-sheet'));
