'use strict';
// Compartilhar a tela (como no Chrome): seletor com tela inteira, janelas e abas do Kona, "Also share
// system audio", e a barra "Sharing… · Stop sharing" enquanto dura. A captura em si fica em screen-share.js.
// Trocar de opção é animado: o indicador desliza, a grade sai para um lado e a nova entra do outro.

const share = { req: null, kind: 'screen', pick: null, active: new Map() };
const shareHost = (o) => { try { return new URL(o).host; } catch { return o || 'This site'; } };
const SHARE_KINDS = ['screen', 'window', 'tab'];
const SHARE_EASE = 'cubic-bezier(.32,.72,0,1)';

/** O indicador do seletor desliza até a opção escolhida (como o controle segmentado do macOS/iOS). */
function moveShareIndicator(instant) {
  const ind = $('#share-tabs .share-ind');
  if (instant) ind.style.transition = 'none';
  ind.style.transform = `translateX(${SHARE_KINDS.indexOf(share.kind) * 100}%)`;
  if (instant) { void ind.offsetWidth; ind.style.transition = ''; }
  $$('#share-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.kind === share.kind));
}

/** Itens entram um depois do outro, de leve. */
function revealShareItems() {
  $$('#share-grid .share-item').forEach((el, i) => el.animate(
    [{ opacity: 0, transform: 'translateY(6px) scale(.97)' }, { opacity: 1, transform: 'none' }],
    { duration: 320, delay: 40 + i * 32, easing: SHARE_EASE, fill: 'backwards' },
  ));
}

/**
 * Troca de opção (passar o mouse ou clicar): a grade sai para um lado, a nova entra do outro e a altura
 * acompanha. Trocas rápidas seguidas não se acumulam: a mais recente vence e interrompe a anterior.
 */
let switchToken = 0;
async function switchShareKind(kind, { sound = true } = {}) {
  if (kind === share.kind || !share.req) return;
  const token = ++switchToken;
  const dir = Math.sign(SHARE_KINDS.indexOf(kind) - SHARE_KINDS.indexOf(share.kind)) || 1;
  share.kind = kind;
  share.pick = null;
  moveShareIndicator();
  if (sound) sfx.play('select');
  const grid = $('#share-grid');
  const stage = $('#share-stage');
  const h0 = stage.offsetHeight;
  grid.getAnimations().forEach((a) => a.cancel());
  await grid.animate([{ opacity: 1, transform: 'none', filter: 'blur(0)' }, { opacity: 0, transform: `translateX(${-dir * 18}px)`, filter: 'blur(2px)' }],
    { duration: 110, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' }).finished.catch(() => {});
  if (token !== switchToken) return; // outra troca já começou
  await renderShareGrid();
  if (token !== switchToken) return;
  grid.getAnimations().forEach((a) => a.cancel());
  stage.getAnimations().forEach((a) => a.cancel());
  const h1 = Math.min(stage.scrollHeight, stage.offsetHeight || stage.scrollHeight);
  stage.animate([{ height: `${h0}px` }, { height: `${h1}px` }], { duration: 340, easing: SHARE_EASE });
  grid.animate([{ opacity: 0, transform: `translateX(${dir * 18}px)`, filter: 'blur(2px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
    { duration: 300, easing: SHARE_EASE });
  revealShareItems();
}

async function renderShareGrid() {
  const r = share.req;
  if (!r) return;
  let items = [];
  if (share.kind === 'tab') {
    // abas do Kona com página (miniaturas capturadas uma vez por pedido: ir e voltar não recaptura)
    r.tabItems ||= await Promise.all(tabs.filter((t) => t.wv && /^https?:/.test(t.url)).map(async (t) => {
      let thumb = null;
      try { const img = await t.wv.capturePage(); if (!img.isEmpty()) thumb = img.resize({ width: 320 }).toDataURL(); } catch { /* aba estacionada */ }
      return { id: `tab:${t.wv.getWebContentsId()}`, name: t.title || hostOf(t.url), thumb, icon: t.favicon };
    }));
    if (share.req !== r || share.kind !== 'tab') return;
    items = r.tabItems;
  } else if (!r.sources) { $('#share-grid').innerHTML = '<p class="st-empty share-loading">Loading…</p>'; $('#share-go').disabled = true; return; }
  else items = r.sources.filter((s) => s.type === share.kind);
  $('#share-grid').innerHTML = items.length ? items.map((s, i) => `
    <button class="share-item${share.pick === s.id ? ' on' : ''}" data-src="${escapeHtml(s.id)}" title="${escapeHtml(s.name)}">
      <span class="share-thumb">${s.thumb ? `<img src="${s.thumb}" alt="" draggable="false" />` : ''}</span>
      <span class="share-name">${s.icon ? `<img src="${escapeHtml(s.icon)}" alt="" />` : ''}${escapeHtml(share.kind === 'screen' ? (items.length > 1 ? `Screen ${i + 1}` : 'Entire screen') : s.name)}</span>
    </button>`).join('')
    : `<p class="st-empty">${share.kind === 'tab' ? 'Open a page in another tab to share it.' : 'Nothing to share here.'}</p>`;
  $('#share-go').disabled = !share.pick;
}

api?.on('share:pick', (req) => {
  // um pedido por vez: o anterior é cancelado
  if (share.req) api.shareChoice(share.req.id, null);
  share.req = req; share.pick = null; share.kind = 'screen';
  $('#share-sub').textContent = `${shareHost(req.origin)} wants to share the contents of your screen.`;
  $('#share-audio').checked = false;
  $('#share-audio-row').hidden = false;
  moveShareIndicator(true);
  renderShareGrid();
  openSheet('#share-sheet');
  sfx.play('open');
});
api?.on('share:sources', async ({ id, sources }) => {
  if (share.req?.id !== id) return;
  share.req.sources = sources;
  if (share.kind === 'tab') return;
  await renderShareGrid();
  revealShareItems();
});
function answerShare(go) {
  const r = share.req;
  if (!r) return;
  share.req = null;
  closeSheet('#share-sheet');
  if (!go || !share.pick) { api.shareChoice(r.id, null); sfx.play('close'); return; }
  const audio = $('#share-audio').checked;
  api.shareChoice(r.id, share.pick.startsWith('tab:') ? { tab: Number(share.pick.slice(4)), audio } : { source: share.pick, audio });
  sfx.play('tabOpen'); // começou a compartilhar
}
// Passar o mouse já troca de opção (o tique de passar o mouse vem de sounds.js); uma pequena espera
// evita trocar à toa quando o mouse só atravessa o seletor. Clicar também troca, na hora.
let hoverTimer = null;
$('#share-tabs').addEventListener('pointerover', (e) => {
  const b = e.target.closest('[data-kind]');
  clearTimeout(hoverTimer);
  if (b && b.dataset.kind !== share.kind) hoverTimer = setTimeout(() => switchShareKind(b.dataset.kind, { sound: false }), 90);
});
$('#share-tabs').addEventListener('pointerleave', () => clearTimeout(hoverTimer));
$('#share-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-kind]'); if (b) { clearTimeout(hoverTimer); switchShareKind(b.dataset.kind); } });
// escolher um item só muda a seleção (sem redesenhar: as miniaturas ficam paradas)
$('#share-grid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-src]');
  if (!b) return;
  share.pick = b.dataset.src;
  $$('#share-grid .share-item').forEach((el) => el.classList.toggle('on', el === b));
  $('#share-go').disabled = false;
});
$('#share-grid').addEventListener('dblclick', (e) => { if (e.target.closest('[data-src]')) answerShare(true); });
$('#share-go').addEventListener('click', () => answerShare(true));
$('#share-cancel').addEventListener('click', () => answerShare(false));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && share.req) { e.stopPropagation(); answerShare(false); } }, true);

/* ───────────── Barra "Sharing…" ───────────── */
function renderShareBar() {
  const bar = $('#share-bar');
  const list = [...share.active.entries()];
  bar.classList.toggle('show', list.length > 0);
  if (!list.length) return;
  const [id, a] = list[list.length - 1];
  const what = { screen: 'your screen', window: 'a window', tab: 'a tab' }[a.what] || 'your screen';
  bar.innerHTML = `<span class="share-dot"></span><span>${escapeHtml(shareHost(a.origin))} is sharing ${what}</span>
    <button class="btn-primary danger" data-stop="${id}">Stop sharing</button>`;
}
api?.on('share:started', (a) => { share.active.set(a.id, a); renderShareBar(); });
api?.on('share:ended', ({ id }) => {
  // o site parou sozinho: som de fechar (o "Stop sharing" já tocou o dele)
  if (share.active.has(id) && !share.stopping) sfx.play('close');
  share.stopping = false;
  share.active.delete(id);
  renderShareBar();
});
$('#share-bar').addEventListener('click', (e) => {
  const b = e.target.closest('[data-stop]');
  if (!b) return;
  share.stopping = true;
  sfx.play('tabClose');
  api.shareStop(Number(b.dataset.stop));
});
$('#scrim').addEventListener('click', () => { if (share.req) answerShare(false); });
