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
    // espera o código de quem abriu terminar (ele pode focar algo específico logo depois);
    // setTimeout e não requestAnimationFrame: com a janela coberta, o Windows pausa os quadros
    setTimeout(() => {
      if (!el.classList.contains('show') || el.contains(document.activeElement)) return;
      const target = firstStop(el);
      if (target) target.focus({ preventScroll: true });
      else if (isModal(el)) { el.tabIndex = -1; el.focus({ preventScroll: true }); }
    }, 20);
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

/* ───────────── Menu lateral pelo teclado ─────────────
   Alt+Z abre já no primeiro item. ↑/↓ andam entre os itens, Ctrl+↑/↓ pulam 3, Home/End vão às pontas,
   Enter/Espaço abrem, Delete fecha a aba. Numa subtela (Favoritos, Histórico…) o foco vai para ela. */
(() => {
  const sbEl = $('#sidebar');
  const NAV = '.sb-item, .sb-tab, .sb-row, #sb-back, #sb-subaction, #sb-tools button, #rl-filter button, #sb-subfoot button, .sb-search, #sb-profile, #sb-settings';
  // só a tela atual do menu (na troca, as duas ficam visíveis um instante) + o rodapé (perfil, ajustes);
  // sem olhar a opacidade: ao abrir, o menu ainda está no começo da animação
  const shown = (el) => el.checkVisibility({ checkVisibilityCSS: true }) && el.getBoundingClientRect().height > 0;
  const items = () => {
    const view = sbEl.classList.contains('sub-open') ? $('#sbv-sub') : $('#sbv-main');
    return $$(NAV, sbEl).filter((el) => (view.contains(el) || !el.closest('.sb-view')) && !el.disabled && !el.closest('[hidden]') && shown(el));
  };
  const go = (el) => {
    if (!el) return;
    if (!el.matches('button, input, select, textarea, a[href]') && !el.hasAttribute('tabindex')) el.tabIndex = -1;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest' });
  };
  /** Foco no primeiro item da tela visível do menu (ao abrir o menu e ao trocar de subtela). */
  window.sidebarFocusFirst = () => go(items()[0]);

  /* Cursor de seleção: uma pílula que desliza (com mola) até o item focado pelo teclado, no lugar
     do anel de foco. Acompanha a rolagem e a troca de subtela; some quando o foco sai do menu. */
  const cursor = document.createElement('div');
  cursor.id = 'sb-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  sbEl.prepend(cursor);
  let target = null;
  function place(el, animate = true) {
    target = el;
    if (!el || !el.isConnected) { cursor.classList.remove('on'); sbEl.classList.remove('kb-nav'); return; }
    // posição pelo layout (offsetTop…), não pelo retângulo na tela: ao abrir o menu, os itens ainda
    // estão subindo na animação de entrada, e o cursor nasceria fora do lugar
    let x = 0, y = 0;
    for (let n = el; n && n !== sbEl; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; }
    for (let n = el.parentElement; n && n !== sbEl; n = n.parentElement) { x -= n.scrollLeft; y -= n.scrollTop; }
    if (!animate || !cursor.classList.contains('on')) cursor.classList.add('instant');
    cursor.style.transform = `translate(${x}px, ${y}px)`;
    cursor.style.width = `${el.offsetWidth}px`;
    cursor.style.height = `${el.offsetHeight}px`;
    cursor.classList.add('on');
    sbEl.classList.add('kb-nav');
    if (cursor.classList.contains('instant')) requestAnimationFrame(() => requestAnimationFrame(() => cursor.classList.remove('instant')));
  }
  sbEl.addEventListener('focusin', (e) => {
    const el = e.target.closest?.(NAV);
    // só pelo teclado (o mouse tem o próprio destaque ao passar por cima)
    if (el && e.target.matches(':focus-visible')) {
      place(el);
      // ao abrir o menu os itens ainda estão entrando (animação): acerta a posição quando assentam
      setTimeout(() => { if (target === el) place(el); }, 460);
    } else place(null);
  });
  sbEl.addEventListener('focusout', (e) => { if (!e.relatedTarget || !sbEl.contains(e.relatedTarget)) requestAnimationFrame(() => { if (!sbEl.contains(document.activeElement)) place(null); }); });
  sbEl.addEventListener('scroll', () => { if (target) place(target, false); }, true);
  sbEl.addEventListener('pointerdown', () => place(null));
  // a subtela entra deslizando: o cursor acompanha o item até ela assentar
  sbEl.addEventListener('transitionend', (e) => { if (target && e.target.classList?.contains('sb-view')) place(target); });

  // O menu se redesenha sozinho (aba que terminou de carregar, contadores…): o item com o foco é
  // trocado por um novo igual. O foco volta para o equivalente, em vez de se perder.
  const sig = (el) => el.id ? `#${el.id}` : ['data-set', 'data-tab', 'data-view', 'data-key', 'data-act', 'data-i']
    .map((a) => el.getAttribute(a)).filter((v) => v != null).join('|') + `|${el.className}`;
  let lastSig = null, lastIdx = -1;
  sbEl.addEventListener('focusin', (e) => {
    const el = e.target.closest?.(NAV);
    if (el) { lastSig = sig(el); lastIdx = items().indexOf(el); }
  });
  new MutationObserver(() => {
    if (!lastSig || !document.body.classList.contains('sidebar-open')) return;
    const a = document.activeElement;
    if (a && a !== document.body && a !== sbEl) return; // o foco não se perdeu
    const list = items();
    go(list.find((el) => sig(el) === lastSig) || list[Math.min(lastIdx, list.length - 1)]);
  }).observe(sbEl, { childList: true, subtree: true });
  sbEl.addEventListener('focusout', (e) => { if (!sbEl.contains(e.relatedTarget) && e.relatedTarget) lastSig = null; });
  // depois de um Enter que troca a tela do menu (abrir/fechar subtela), o foco não se perde
  // (setTimeout e não requestAnimationFrame: com a janela coberta, o Windows pausa os quadros)
  const keepFocus = () => setTimeout(() => {
    if (!document.body.classList.contains('sidebar-open')) return;
    if (!items().includes(document.activeElement) && !sbEl.querySelector('.sb-edit')) sidebarFocusFirst();
  }, 60);

  sbEl.addEventListener('keydown', (e) => {
    if (e.altKey || e.metaKey || e.target.classList.contains('sb-edit')) return;
    const list = items();
    const cur = e.target.closest?.(NAV);
    const i = list.indexOf(cur);
    const field = e.target.matches('input, textarea');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (field && e.key === 'ArrowUp') return; // no campo de busca, ↑ fica com o campo
      const step = (e.ctrlKey ? 3 : 1) * (e.key === 'ArrowDown' ? 1 : -1);
      go(list[i < 0 ? 0 : Math.max(0, Math.min(list.length - 1, i + step))]);
    } else if ((e.key === 'Home' || e.key === 'End') && !field) {
      go(e.key === 'Home' ? list[0] : list[list.length - 1]);
    } else if ((e.key === 'Enter' || e.key === ' ') && cur && !field) {
      cur.click(); // os itens que são <div> (abas, grupos, linhas) não reagem ao Enter sozinhos
      keepFocus();
    } else if (e.key === 'Delete' && cur?.matches('.sb-tab, .sb-row')) {
      const x = cur.querySelector('[data-act="close-tab"], [data-act="remove"], .sb-act');
      if (!x) return;
      const next = list[i + 1] || list[i - 1];
      x.click();
      setTimeout(() => (items().includes(next) ? go(next) : keepFocus()), 60);
    } else if (e.key === 'Escape') {
      keepFocus(); // Esc numa subtela volta à tela principal (sidebar.js); o foco vai junto
      return;
    } else return;
    e.preventDefault();
    e.stopPropagation();
  });
})();
