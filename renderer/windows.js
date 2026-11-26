'use strict';
// Várias janelas (N2): arrastar abas (mudar a ordem, soltar fora para abrir numa janela nova, soltar
// na barra de abas de outra janela para mover para ela) e "Mover para…" no menu da aba.
// A aba que muda de janela renasce lá com o histórico de voltar/avançar (ver tab:move no main.js).

/** Posição na faixa de abas para um ponto x (coordenada da janela): antes da 1ª aba cujo meio passa de x. */
function tabDropIndex(x, skip = null) {
  const els = $$('#tabs .tab:not(.leaving)').filter((el) => el !== skip);
  const i = els.findIndex((el) => { const r = el.getBoundingClientRect(); return x < r.left + r.width / 2; });
  return i < 0 ? els.length : i;
}

/**
 * Leva a aba para outra janela. to: { window: id } | { newWindow: true } | { point: {x, y}, allowNew }.
 * A aba sai desta janela só depois que a outra a aceitou.
 */
async function moveTab(t, to) {
  if (library.isPrivate()) { toast('Private tabs stay in their window'); return false; }
  let wcId = null;
  try { wcId = t.wv ? t.wv.getWebContentsId() : null; } catch { /* ainda não pronta */ }
  const ok = await api?.tabMove({ wcId, url: t.url, title: t.title, to });
  if (!ok || !tabs.includes(t)) return false;
  if (tabs.length === 1) api?.close(); // era a última: a janela vai junto
  else closeTab(t.id, { moved: true });
  return true;
}

/** Itens "Mover para…" do menu da aba. */
async function moveItems(t) {
  if (library.isPrivate()) return [];
  const others = (await api?.otherWindows?.()) || [];
  return [
    { label: 'Move to new window', run: () => moveTab(t, { newWindow: true }), disabled: tabs.length < 2 },
    ...others.map((w) => ({ label: `Move to window: ${short(w.title || 'New Tab', 40)}`, run: () => moveTab(t, { window: w.id }) })),
  ];
}

/* ───────────── Arrastar abas ─────────────
   Segurar e arrastar na horizontal muda a ordem. Levar para longe da barra (ou para fora da janela)
   e soltar abre a aba numa janela nova; soltar sobre a barra de abas de outra janela leva a aba para
   lá. Começa só depois de alguns pixels: um clique continua sendo um clique. */
const tabDrag = { t: null, el: null, startX: 0, startY: 0, grabX: 0, on: false, out: false, justDragged: false };
const DRAG_START = 6; // px até virar arraste
const DETACH = 46; // px acima/abaixo da barra para a aba "sair"

$('#tabs').addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const el = e.target.closest('.tab:not(.leaving)');
  if (!el || e.target.closest('button, .x') || el.classList.contains('editing')) return;
  const t = tabs.find((x) => String(x.id) === el.dataset.id);
  if (!t) return;
  const r = el.getBoundingClientRect();
  Object.assign(tabDrag, { t, el, startX: e.clientX, startY: e.clientY, grabX: e.clientX - r.left, on: false, out: false, pointer: e.pointerId });
});

addEventListener('pointermove', (e) => {
  const d = tabDrag;
  if (!d.t || e.pointerId !== d.pointer) return;
  if (!d.on) {
    if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_START) return;
    if (!tabs.includes(d.t)) { d.t = null; return; }
    d.on = true;
    if (d.el.contains(document.activeElement)) document.activeElement.blur(); // arrastar não edita o endereço
    getSelection()?.removeAllRanges();
    try { d.el.setPointerCapture(e.pointerId); } catch { /* já solto */ }
    d.el.classList.add('dragging');
    document.body.classList.add('tab-dragging');
  }
  const strip = $('#tabs').getBoundingClientRect();
  const out = e.clientY < strip.top - DETACH || e.clientY > strip.bottom + DETACH || e.clientX < 0 || e.clientX > innerWidth;
  // com uma aba só não há para onde reordenar; sair da barra ainda leva a aba para outra janela
  if (out !== d.out) { d.out = out; d.el.classList.toggle('detaching', out); showGhost(out ? d.t : null); }
  if (out) moveGhost(e.clientX, e.clientY);
  if (!out) {
    // reordenar: a aba vai para a posição do ponteiro
    const want = tabDropIndex(e.clientX, d.el);
    const cur = tabs.indexOf(d.t);
    if (want !== cur) {
      tabs.splice(cur, 1);
      tabs.splice(want, 0, d.t);
      render();
      try { d.el.setPointerCapture(e.pointerId); } catch { /* mover o elemento solta a captura */ }
    }
  }
  // a aba segue o ponteiro (em relação ao lugar dela na faixa, que pode ter mudado)
  d.el.style.transform = 'none';
  const home = d.el.getBoundingClientRect();
  d.el.style.transform = out ? '' : `translateX(${e.clientX - d.grabX - home.left}px)`;
});

/** Fora da barra, a aba vira uma "etiqueta" que segue o ponteiro (dentro da janela). */
let ghostEl = null;
function showGhost(t) {
  if (!t) { ghostEl?.remove(); ghostEl = null; return; }
  ghostEl = document.createElement('div');
  ghostEl.id = 'tab-ghost';
  ghostEl.className = 'glass';
  ghostEl.innerHTML = `<span class="tfav">${favHtml(t).html}</span><span class="title">${escapeHtml(t.title || hostOf(t.url))}</span>`;
  document.body.appendChild(ghostEl);
}
function moveGhost(x, y) { if (ghostEl) ghostEl.style.transform = `translate(${x - 24}px, ${y - 18}px)`; }

function endTabDrag(e, cancel = false) {
  const d = tabDrag;
  if (!d.t || (e && e.pointerId !== d.pointer)) return;
  const { t, el, on, out } = d;
  tabDrag.t = null;
  tabDrag.on = false;
  if (!on) return;
  showGhost(null);
  tabDrag.justDragged = true; // o "click" que vem em seguida não começa a editar o endereço
  setTimeout(() => { tabDrag.justDragged = false; }, 0);
  el.classList.remove('dragging', 'detaching');
  document.body.classList.remove('tab-dragging');
  el.style.transform = '';
  if (cancel || !out) { library.onTabsChanged(); return; }
  // ponto na tela: posição da janela + posição na janela (a janela não tem moldura)
  moveTab(t, { point: { x: window.screenX + e.clientX, y: window.screenY + e.clientY }, allowNew: tabs.length > 1 });
}
addEventListener('pointerup', (e) => endTabDrag(e));
addEventListener('pointercancel', (e) => endTabDrag(e, true));
addEventListener('click', (e) => { if (tabDrag.justDragged && e.target.closest?.('#tabs')) { e.stopPropagation(); e.preventDefault(); } }, true);
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !tabDrag.on || !tabDrag.t) return;
  e.stopPropagation();
  const { el } = tabDrag;
  tabDrag.t = null;
  tabDrag.on = false;
  showGhost(null);
  library.onTabsChanged();
  el.classList.remove('dragging', 'detaching');
  document.body.classList.remove('tab-dragging');
  el.style.transform = '';
}, true);
