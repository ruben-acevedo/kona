/* Acessibilidade (N20): foco nos diálogos e teclado na faixa de abas.
   Fica num lugar só: as janelas continuam abrindo/fechando pela classe "show", e aqui
   se observa essa classe para levar o foco para dentro e devolvê-lo ao fechar. */
(() => {
  const DIALOGS = '.sheet, .popover-pf, .panel-pop, #folder-pop, #ext-pop, #reader-pop, #pw-bubble, #af-bubble';
  // aparecem sozinhos (sem o usuário pedir): não tiram o foco de quem está digitando
  const PASSIVE = '#pw-bubble, #af-bubble, #media-pop';
  const FOCUSABLE = 'button, [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';

  const visible = (el) => el.checkVisibility({ checkVisibilityCSS: true });
  const focusables = (root) => $$(FOCUSABLE, root).filter((el) => !el.disabled && !el.closest('[hidden]') && visible(el));
  const isModal = (el) => el.classList.contains('sheet');

  // o teclado (e não o mouse) abriu o diálogo? Só então os pop-overs recebem o foco
  let keyboard = false;
  document.addEventListener('keydown', () => { keyboard = true; }, true);
  document.addEventListener('pointerdown', () => { keyboard = false; }, true);

  // últimos elementos focados: quem abriu o diálogo é o último fora dele
  const history = [];
  document.addEventListener('focusin', (e) => {
    history.push(e.target);
    if (history.length > 8) history.shift();
  });

  const open = []; // [{ el, opener }] na ordem em que abriram
  const topModal = () => [...open].reverse().find((d) => isModal(d.el))?.el;

  /** Primeiro lugar para o foco: [autofocus], um campo de texto, o botão principal ou o primeiro botão. */
  function firstStop(el) {
    const list = focusables(el);
    return list.find((x) => x.hasAttribute('autofocus'))
      || list.find((x) => x.matches('input:not([type="checkbox"], [type="radio"], [type="range"]), textarea'))
      || list.find((x) => x.matches('.btn-primary'))
      || list[0];
  }

  function opened(el) {
    const opener = [...history].reverse().find((x) => x.isConnected && !el.contains(x)) || null;
    open.push({ el, opener });
    if (el.contains(document.activeElement)) return; // o código já pôs o foco lá dentro
    if (el.matches(PASSIVE) && !isModal(el)) return;
    if (!isModal(el) && !keyboard) return;
    // espera o código de quem abriu terminar (ele pode focar algo específico logo depois)
    requestAnimationFrame(() => {
      if (!el.classList.contains('show') || el.contains(document.activeElement)) return;
      const target = firstStop(el);
      if (target) target.focus({ preventScroll: true });
      else if (isModal(el)) { el.tabIndex = -1; el.focus({ preventScroll: true }); }
    });
  }

  function closed(el) {
    const i = open.findIndex((d) => d.el === el);
    if (i < 0) return;
    const [{ opener }] = open.splice(i, 1);
    const a = document.activeElement;
    // só devolve se o foco estava no diálogo (ou se perdeu); clicar numa página não é desfeito
    if (a && a !== document.body && !el.contains(a)) return;
    if (opener?.isConnected && visible(opener)) opener.focus({ preventScroll: true });
  }

  for (const el of $$(DIALOGS)) {
    if (isModal(el)) el.setAttribute('aria-modal', 'true');
    let was = el.classList.contains('show');
    new MutationObserver(() => {
      const now = el.classList.contains('show');
      if (now === was) return;
      was = now;
      (now ? opened : closed)(el);
    }).observe(el, { attributes: true, attributeFilter: ['class'] });
  }

  // Tab não sai de uma janela modal
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || e.ctrlKey || e.altKey || e.metaKey) return;
    const modal = topModal();
    if (!modal) return;
    const list = focusables(modal);
    const a = document.activeElement;
    if (!list.length) { e.preventDefault(); modal.focus?.(); return; }
    const first = list[0], last = list[list.length - 1];
    if (!modal.contains(a)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
    else if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
  }, true);

  /* ───────────── Faixa de abas: setas, Home/End, Enter, Delete ───────────── */
  const strip = $('#tabs');
  const tabEls = () => $$('#tabs .tab:not(.leaving)');
  const tabOf = (el) => tabs.find((t) => String(t.id) === el.dataset.id);

  /** Só uma aba entra no Tab (a focada ou a ativa); as outras pelas setas. */
  function rove(target) {
    for (const el of tabEls()) el.tabIndex = el === target ? 0 : -1;
  }
  strip.addEventListener('focusin', (e) => { if (e.target.classList.contains('tab')) rove(e.target); });
  strip.addEventListener('focusout', (e) => {
    if (strip.contains(e.relatedTarget)) return;
    rove($('#tabs .tab.active:not(.leaving)'));
  });
  // abas novas ou fechadas: mantém exatamente uma no Tab
  new MutationObserver(() => {
    if (strip.contains(document.activeElement)) return;
    rove($('#tabs .tab.active:not(.leaving)'));
  }).observe(strip, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  strip.addEventListener('keydown', (e) => {
    const el = e.target;
    if (!el.classList?.contains('tab') || e.ctrlKey || e.altKey || e.metaKey) return;
    const list = tabEls(), i = list.indexOf(el);
    const t = tabOf(el);
    let to = null;
    if (e.key === 'ArrowRight') to = list[(i + 1) % list.length];
    else if (e.key === 'ArrowLeft') to = list[(i - 1 + list.length) % list.length];
    else if (e.key === 'Home') to = list[0];
    else if (e.key === 'End') to = list[list.length - 1];
    else if (e.key === 'Enter' || e.key === ' ') {
      if (!t) return;
      if (t.id !== activeId) { sfx.play('select'); activate(t.id); el.focus(); }
      else if (!APP_MODE) $('input', el).focus(); // o campo já toca o som ao receber o foco
    } else if (e.key === 'Delete') {
      if (!t) return;
      const next = list[i + 1] || list[i - 1];
      closeTab(t.id);
      if (next?.isConnected) next.focus();
    } else return;
    e.preventDefault();
    to?.focus();
  });
})();

/* ───────────── Barra de endereço: sugestões anunciadas pelas setas ───────────── */
(() => {
  const list = $('#omnibox');
  function sync() {
    const input = omnibox.input;
    const shown = list.classList.contains('show');
    const rows = $$('.om-row', list);
    rows.forEach((row, i) => { row.id = `om-i${i}`; row.setAttribute('aria-selected', String(row.classList.contains('sel'))); });
    for (const el of $$('#tabs .addr input')) {
      if (el !== input || !shown) { el.setAttribute('aria-expanded', 'false'); el.removeAttribute('aria-activedescendant'); }
    }
    if (!input || !shown) return;
    input.setAttribute('aria-expanded', 'true');
    const sel = rows.find((r) => r.classList.contains('sel'));
    if (sel) input.setAttribute('aria-activedescendant', sel.id); else input.removeAttribute('aria-activedescendant');
  }
  new MutationObserver(sync).observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
})();
