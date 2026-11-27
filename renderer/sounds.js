/* ───────────── Sons da interface ─────────────
   Sons curtos e discretos (estilo PS5/iPhone), sintetizados com Web Audio: nada de arquivos,
   nada de decodificação, e cada som custa alguns osciladores que se desligam sozinhos em ~0,2 s.
   O AudioContext é criado quando o navegador fica ocioso, para o primeiro som não atrasar.
   Desligáveis em Personalizar (settings.sounds). */
const sfx = (() => {
  let ctx = null;
  let master = null;
  let noise = null; // 50 ms de ruído branco, gerado uma vez (base do som de tecla)
  let lastTick = 0;
  let lastKey = 0;
  let lastSelect = 0;
  let lastBig = 0; // último som de abrir/fechar: a "seleção" logo em seguida seria um som duplicado
  let lastBigName = '';

  function ensure() {
    if (ctx) return ctx;
    ctx = new AudioContext({ latencyHint: 'interactive' });
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.05), ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  (window.requestIdleCallback || setTimeout)(() => { try { ensure(); } catch { /* sem áudio */ } });

  /** Um tom com ataque rápido e queda exponencial. f1 → f2 desliza a frequência. */
  function tone(t, { f1, f2 = f1, dur, gain, type = 'sine', attack = 0.004 }) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f1, t);
    if (f2 !== f1) o.frequency.exponentialRampToValueAtTime(f2, t + dur * 0.8);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
    o.onended = () => g.disconnect();
  }

  const SOUNDS = {
    // passar por um item: um "tique" curto e agudo
    tick: (t) => {
      tone(t, { f1: 1850, dur: 0.035, gain: 0.032 });
      tone(t, { f1: 3700, dur: 0.018, gain: 0.008 });
    },
    // escolher / alterar uma opção: dois parciais, um pouco mais cheio
    select: (t) => {
      tone(t, { f1: 1046, dur: 0.09, gain: 0.05 });
      tone(t, { f1: 1568, dur: 0.07, gain: 0.025 });
    },
    // abrir um painel: duas notas subindo, suaves
    open: (t) => {
      tone(t, { f1: 587, f2: 700, dur: 0.14, gain: 0.04, type: 'triangle', attack: 0.008 });
      tone(t + 0.055, { f1: 880, f2: 1046, dur: 0.18, gain: 0.032, attack: 0.008 });
    },
    // digitar: um "toc" curto de ruído filtrado, como o teclado do iPhone (varia um pouco a cada tecla)
    key: (t) => {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.playbackRate.value = 0.85 + Math.random() * 0.3;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2600 + Math.random() * 500;
      bp.Q.value = 1.4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.028);
      src.connect(bp).connect(g).connect(master);
      src.start(t);
      src.stop(t + 0.035);
      src.onended = () => g.disconnect();
      tone(t, { f1: 1500, dur: 0.012, gain: 0.012 });
    },
    // abrir aba: uma bolha suave subindo, com um brilho agudo leve no fim
    tabOpen: (t) => {
      tone(t, { f1: 392, f2: 660, dur: 0.2, gain: 0.045, attack: 0.012 });
      tone(t + 0.06, { f1: 1320, dur: 0.16, gain: 0.012, attack: 0.01 });
    },
    // fechar aba: a mesma bolha descendo, mais baixa e mais curta
    tabClose: (t) => {
      tone(t, { f1: 620, f2: 330, dur: 0.17, gain: 0.036, attack: 0.01 });
      tone(t, { f1: 1240, f2: 660, dur: 0.07, gain: 0.006, attack: 0.006 });
    },
    // fechar: uma nota descendo, mais baixa
    close: (t) => {
      tone(t, { f1: 784, f2: 523, dur: 0.13, gain: 0.026, type: 'triangle', attack: 0.006 });
    },
  };

  function play(name) {
    if (typeof settings !== 'undefined' && settings.sounds === false) return;
    if (document.body.classList.contains('warming')) return;
    try {
      ensure();
      if (ctx.state === 'suspended') ctx.resume();
      const now = performance.now();
      // passar o mouse rápido por uma lista não vira uma metralhadora de tiques
      if (name === 'tick') { if (now - lastTick < 40) return; lastTick = now; }
      if (name === 'key') { if (now - lastKey < 18) return; lastKey = now; }
      if (name === 'select' && now - lastBig < 150) return;
      // um clique que já toca o próprio som não toca dois "select" seguidos
      if (name === 'select') { if (now - lastSelect < 90) return; lastSelect = now; }
      // o mesmo som "grande" pedido duas vezes no mesmo instante (ex.: closeSheet + quem chamou) toca uma vez
      if (name !== 'tick' && name !== 'key' && name !== 'select') {
        if (name === lastBigName && now - lastBig < 120) return;
        lastBig = now; lastBigName = name;
      }
      SOUNDS[name]?.(ctx.currentTime + 0.002);
      window.__sfxLog?.push(name); // só nos testes
    } catch { /* sem áudio: segue em silêncio */ }
  }

  /* Passar o mouse: um tique ao entrar em cada item (não ao mexer dentro dele). */
  const HOVER = [
    '#toolbar .tb', '#toolbar .addr', '#omnibox .om-row',
    '#sidebar .sb-item', '#sidebar .sb-tab', '.fav-item', '#btn-customize',
    '#custom-pop .wp-swatch', '#custom-pop .toggle', '#custom-pop .seg button', '#profile-pop .pf-row',
    // botões e listas que vieram depois: pastas e downloads no menu, botões da barra de endereço,
    // busca na página, extensões, senhas, modo leitura, compartilhar a tela, avisos e janelas (sheets)
    '#sb-list .sb-row', '#sb-list .sb-act', '#sb-tools button', '#sb-subfoot button', '#folder-pop .tb',
    '.tab :is(.zoomind, .readerbtn, .aabtn, .snd, .popupind, .bm, .reload)',
    '#find-bar .tb', '#ext-pop .ext-pop-row', '#ext-pop .pop-item', '#ext-pop .ext-pin',
    '#pw-suggest .pw-opt', '#pw-bubble button', '#pw-list .sb-act', '#pw-list .btn-link',
    '#reader-pop button', '#share-tabs button', '#share-grid .share-item', '#share-bar button',
    '#infobar button', '#imp-body label',
    '.sheet :is(.btn-primary, .btn-secondary, .btn-danger, .btn-link)', '.sheet-head .tb',
    '#st-nav .st-nav-item', '#st-main :is(.btn-primary, .btn-secondary, .btn-link, .sw)',
  ].join(', ');
  const CLICK = [
    '#sidebar .sb-item', '#sidebar .sb-tab', '#custom-pop .wp-swatch', '#custom-pop .toggle',
    '#custom-pop .seg button', '#profile-pop .pf-row',
    // da barra, só os que não abrem painel nem focam a pesquisa (esses já têm o próprio som)
    '#back', '#fwd',
    // os que vieram depois (os que já tocam um som próprio não tocam dois: ver lastSelect)
    '#sb-list .sb-act', '#sb-tools button', '.tab :is(.zoomind, .bm, .reload)', '#find-bar .tb',
    '#ext-pop .pop-item', '#pw-bubble button', '#pw-list .sb-act', '#pw-list .btn-link', '#infobar button',
    '#imp-body label', '.sheet:not(#share-sheet) :is(.btn-primary, .btn-secondary, .btn-danger, .btn-link)',
    '#st-nav .st-nav-item', '#st-main :is(.btn-primary, .btn-secondary, .btn-link, .sw)', '#share-grid .share-item',
  ].join(', ');
  let hovered = null;
  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest?.(HOVER) || null;
    if (el && el !== hovered) play('tick');
    hovered = el;
  });
  document.addEventListener('click', (e) => { if (e.target.closest?.(CLICK)) play('select'); }, true);

  /* Barra de pesquisa: seleção ao entrar no campo e ao abrir o que foi digitado; tecla ao digitar */
  const ADDR = '#toolbar .addr input';
  document.addEventListener('focusin', (e) => { if (e.target.matches?.(ADDR)) play('select'); });
  document.addEventListener('keydown', (e) => {
    if (!e.target.matches?.(ADDR) || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete') play('key');
    else if (e.key === 'Enter') play('select');
  }, true);

  /* Teclado (N20): andar pelo Tab ou pelas setas toca o mesmo tique do mouse passando por cima.
     Enter/Espaço num botão viram "click" e tocam o som dele (lista CLICK). Se o foco veio de uma
     janela que acabou de abrir (som "open"), o tique não toca por cima. */
  let viaKeyboard = false;
  document.addEventListener('keydown', () => { viaKeyboard = true; }, true);
  document.addEventListener('pointerdown', () => { viaKeyboard = false; }, true);
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    // contêineres (menu, menu lateral, janela sem botões) recebem foco com tabindex -1: o som é o "open" deles
    if (!viaKeyboard || el === document.body || el.tagName === 'WEBVIEW' || el.tabIndex < 0 || el.matches?.(ADDR)) return;
    if (performance.now() - lastBig < 150) return;
    play('tick');
  });

  return { play };
})();
