// Roda no mundo isolado da página (ver reader.js), junto com o Readability da Mozilla.
// window.__konaReader: check() — é um artigo?; open(s) — mostra a versão limpa; close(); apply(s) —
// tamanho, fonte e fundo; speech(cmd) — ler em voz alta (play/pause/resume/stop/status).
// A versão limpa fica numa camada por cima da página, num shadow DOM fechado: o CSS do site não
// interfere e a página continua intacta embaixo (sair não recarrega).
(() => {
  if (window.__konaReader) return;
  const FONTS = {
    system: '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif',
    georgia: 'Georgia, serif',
    palatino: '"Palatino Linotype", Palatino, "Book Antiqua", serif',
    times: '"Times New Roman", Times, serif',
    cambria: 'Cambria, Georgia, serif',
    constantia: 'Constantia, Georgia, serif',
    sitka: '"Sitka Text", "Sitka Small", Georgia, serif',
    candara: 'Candara, "Segoe UI", sans-serif',
  };
  const SIZES = [14, 15, 16, 17, 18, 19, 20, 22, 24, 26, 28, 32];
  const THEMES = {
    white: { bg: '#ffffff', fg: '#1d1d1f', muted: '#6e6e73', link: '#0a66d1', rule: '#e5e5ea' },
    sepia: { bg: '#f8f1e3', fg: '#4f321c', muted: '#8c6d52', link: '#9a5b1e', rule: '#e8dcc4' },
    gray: { bg: '#4a4a4d', fg: '#e4e4e6', muted: '#b2b2b6', link: '#8ec5ff', rule: '#5d5d61' },
    night: { bg: '#121214', fg: '#c9c9cc', muted: '#8a8a8f', link: '#6cb2ff', rule: '#2a2a2e' },
  };
  let article = null;
  let host = null;
  let root = null;
  let saved = null;
  let queue = [];
  let speaking = false;
  let paused = false;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const parse = () => {
    if (article) return article;
    try { article = new Readability(document.cloneNode(true), { charThreshold: 300, keepClasses: false }).parse(); } catch { article = null; }
    return article;
  };

  function check() {
    if (!/^https?:$/.test(location.protocol)) return false;
    try { return isProbablyReaderable(document, { minContentLength: 140, minScore: 20 }); } catch { return false; }
  }

  const CSS = `
    :host { all: initial; }
    .wrap { position: fixed; inset: 0; overflow-y: auto; background: var(--bg); color: var(--fg); -webkit-font-smoothing: antialiased;
      animation: in .28s cubic-bezier(.32,.72,0,1) both; }
    @keyframes in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
    .rd { box-sizing: border-box; max-width: 34em; margin: 0 auto; padding: 72px 28px 120px; font-family: var(--font); font-size: var(--size); line-height: 1.62; }
    header { margin-bottom: 2.2em; padding-bottom: 1.4em; border-bottom: 1px solid var(--rule); }
    .site { font: 600 .72em/1.3 "Segoe UI Variable Text", "Segoe UI", sans-serif; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
    h1.title { font-size: 1.85em; line-height: 1.18; margin: .35em 0 .4em; font-weight: 700; letter-spacing: -.01em; }
    .meta { font: .78em/1.4 "Segoe UI Variable Text", "Segoe UI", sans-serif; color: var(--muted); }
    .content article, .content section { margin: 0; padding: 0; max-width: none; }
    .content > div > :first-child { margin-top: 0; }
    .content :is(h1, h2, h3, h4) { line-height: 1.25; margin: 1.6em 0 .5em; }
    .content h2 { font-size: 1.35em; } .content h3 { font-size: 1.15em; }
    .content p { margin: 0 0 1.05em; }
    .content a { color: var(--link); text-decoration: none; } .content a:hover { text-decoration: underline; }
    .content img, .content video, .content svg, .content picture { max-width: 100%; height: auto; border-radius: 6px; }
    .content figure { margin: 1.6em 0; } .content figcaption { font-size: .8em; color: var(--muted); margin-top: .5em; text-align: center; }
    .content blockquote { margin: 1.4em 0; padding: .1em 0 .1em 1.1em; border-left: 3px solid var(--rule); color: var(--muted); font-style: italic; }
    .content pre, .content code { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: .86em; }
    .content pre { overflow-x: auto; padding: 1em; border-radius: 8px; background: color-mix(in srgb, var(--fg) 7%, transparent); }
    .content table { border-collapse: collapse; max-width: 100%; display: block; overflow-x: auto; font-size: .9em; }
    .content td, .content th { border: 1px solid var(--rule); padding: .35em .6em; }
    .content hr { border: 0; border-top: 1px solid var(--rule); margin: 2em 0; }
    .content ul, .content ol { padding-left: 1.4em; }
    .speaking { background: color-mix(in srgb, var(--link) 14%, transparent); border-radius: 4px; box-shadow: 0 0 0 4px color-mix(in srgb, var(--link) 14%, transparent); }
  `;

  function apply(s = {}) {
    if (!host) return false;
    const t = THEMES[s.theme] || THEMES.white;
    const el = root.querySelector('.wrap');
    // fundo e texto direto no elemento (a transição sobre a variável ficava presa no fundo anterior)
    el.style.backgroundColor = t.bg; el.style.color = t.fg;
    el.style.setProperty('--bg', t.bg); el.style.setProperty('--fg', t.fg); el.style.setProperty('--muted', t.muted);
    el.style.setProperty('--link', t.link); el.style.setProperty('--rule', t.rule);
    el.style.setProperty('--font', FONTS[s.font] || FONTS.system);
    el.style.setProperty('--size', `${SIZES[Math.max(0, Math.min(SIZES.length - 1, s.size ?? 5))]}px`);
    return true;
  }

  function open(s) {
    if (host) { apply(s); return { active: true }; }
    const a = parse();
    if (!a || !a.content) return { active: false };
    const words = (a.textContent || '').trim().split(/\s+/).length;
    const minutes = Math.max(1, Math.round(words / 230));
    host = document.createElement('kona-reader');
    host.setAttribute('style', 'all: initial; position: fixed; inset: 0; z-index: 2147483647; display: block;');
    root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `<style>${CSS}</style><div class="wrap" lang="${esc(a.lang || document.documentElement.lang || '')}"><div class="rd">
      <header>
        ${a.siteName ? `<div class="site">${esc(a.siteName)}</div>` : `<div class="site">${esc(location.hostname.replace(/^www\./, ''))}</div>`}
        <h1 class="title">${esc(a.title || document.title)}</h1>
        <div class="meta">${[a.byline ? esc(a.byline) : '', `${minutes} min read`].filter(Boolean).join(' · ')}</div>
      </header>
      <div class="content">${a.content}</div>
    </div></div>`;
    // links do artigo abrem na própria aba (como no Safari)
    root.addEventListener('click', (e) => {
      const link = e.composedPath().find((n) => n.tagName === 'A' && n.href);
      if (link && !e.ctrlKey && !e.metaKey && e.button === 0) { e.preventDefault(); location.href = link.href; }
    });
    saved = { overflow: document.documentElement.style.overflow };
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.appendChild(host);
    apply(s);
    root.querySelector('.wrap').focus?.();
    return { active: true };
  }

  function close() {
    speech('stop');
    if (!host) return { active: false };
    host.remove();
    host = null; root = null;
    document.documentElement.style.overflow = saved?.overflow || '';
    return { active: false };
  }

  /* Ouvir a página: lê parágrafo por parágrafo (vozes do Windows), destacando o atual */
  function speakNext() {
    const synth = window.speechSynthesis;
    root?.querySelectorAll('.speaking').forEach((n) => n.classList.remove('speaking'));
    const node = queue.shift();
    if (!node) { speaking = false; paused = false; return; }
    const text = node.textContent.replace(/\s+/g, ' ').trim();
    if (!text) { speakNext(); return; }
    node.classList.add('speaking');
    node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const u = new SpeechSynthesisUtterance(text);
    const lang = root?.querySelector('.wrap')?.getAttribute('lang') || document.documentElement.lang || navigator.language;
    u.lang = lang;
    const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang.toLowerCase().slice(0, 2)));
    if (voice) u.voice = voice;
    u.rate = 1;
    u.onend = () => { if (speaking && !paused) speakNext(); };
    u.onerror = () => { if (speaking) speakNext(); };
    synth.speak(u);
  }
  function speech(cmd) {
    const synth = window.speechSynthesis;
    if (cmd === 'play') {
      if (!root) return { speaking: false, paused: false };
      synth.cancel();
      queue = [...root.querySelectorAll('h1.title, .content :is(p, h2, h3, h4, li, blockquote, figcaption)')];
      speaking = true; paused = false;
      speakNext();
    } else if (cmd === 'pause' && speaking) { synth.pause(); paused = true; }
    else if (cmd === 'resume' && speaking) { synth.resume(); paused = false; }
    else if (cmd === 'stop') { speaking = false; paused = false; queue = []; synth.cancel(); root?.querySelectorAll('.speaking').forEach((n) => n.classList.remove('speaking')); }
    return { speaking, paused };
  }

  // Esc sai do modo leitura (a interface fica sabendo pela mensagem no console, ver reader.js)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && host) { close(); console.debug('__kona_reader_closed__'); }
  }, true);

  window.__konaReader = { check, open, close, apply, speech, isOpen: () => !!host };
})();
