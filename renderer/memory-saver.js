/* Economia de memória (O1), como a do Chrome: abas paradas há um tempo são suspensas. A página sai
   da memória (o webview é fechado), o histórico de voltar/avançar fica guardado no processo principal
   (tab:stash) e, ao clicar na aba, ela renasce no mesmo lugar (ensureWebview + t.restore).
   Nunca suspende: a aba atual, aba tocando som, compartilhando a tela, com câmera/microfone liberados,
   de site com notificações permitidas, com formulário preenchido, ou de site em "manter sempre ativo". */
const SAVER_MODES = { // minutos parada até suspender
  moderate: 120, // e antes disso só se o Windows estiver quase sem memória
  balanced: 60,
  maximum: 15,
};
const LOW_MEMORY = 0.12; // memória livre abaixo disto: suspende as paradas há mais tempo antes do prazo
const LOW_MEMORY_MIN = 5; // ...mas nunca uma aba usada há menos de 5 min

/** "Inativa para economizar memória · 120 MB liberados" (dica da aba suspensa). */
function suspendedNote(t) {
  const mb = Math.round((t.suspended?.kb || 0) / 1024);
  return mb > 0 ? tl('Inactive to save memory · {mb} MB freed', { mb }) : tl('Inactive to save memory');
}

const saver = (() => {
  const started = Date.now();
  // os testes encurtam os prazos: minutos viram este tanto de milissegundos
  const unit = () => settings.memorySaverTestMs || 60000;
  const idleOf = (t) => Date.now() - (t.lastSeen || started);
  const hostIn = (t, list) => { const h = hostOf(t.url); return !!h && list.some((x) => h === x || h.endsWith(`.${x}`)); };
  const sharing = (t) => typeof share !== 'undefined' && [...share.active.values()].some((a) => a.wcId === t.wv?.getWebContentsId?.());

  // formulário com algo digitado e não enviado (ou texto sendo editado): a aba fica viva
  const DIRTY = `(() => {
    const changed = (e) => e.type === 'checkbox' || e.type === 'radio' ? e.checked !== e.defaultChecked
      : e.tagName === 'SELECT' ? [...e.options].some((o) => o.selected !== o.defaultSelected)
      : e.type !== 'hidden' && e.value !== e.defaultValue;
    return [...document.querySelectorAll('input, textarea, select')].some(changed) || !!document.activeElement?.isContentEditable;
  })()`;
  const dirty = (wv) => Promise.race([wv.executeJavaScript(DIRTY).catch(() => true), new Promise((r) => setTimeout(() => r(true), 1500))]);

  /** Pode suspender agora (sem perguntar ao processo principal)? */
  function candidate(t) {
    return t.wv && !t.suspended && t !== active() && !t.loading && !isInternal(t.url) && /^https?:/.test(t.url)
      && !t.audible && !sharing(t) && !hostIn(t, settings.keepActive || []);
  }

  async function suspend(t) {
    const wv = t.wv;
    const id = wv.getWebContentsId();
    const info = await api?.tabSuspendInfo?.(id, t.partition);
    if (!info || info.keep) { t.keepAlive = info?.keep || 'unknown'; return false; }
    if (await dirty(wv)) return false;
    const token = await api.tabStash(id);
    if (!token) return false;
    // mudou no meio (a pessoa voltou para a aba, ela começou a tocar som…): desiste
    if (t.wv !== wv || !candidate(t)) { api.tabStashDrop(token); return false; }
    discardParked(t);
    wv.remove();
    Object.assign(t, { wv: null, restore: token, loading: false, suspended: { kb: info.kb, at: Date.now() } });
    render();
    if (typeof renderSidebar === 'function') renderSidebar();
    return true;
  }

  let busy = false;
  let lowMem = false;
  async function tick() {
    const a = active();
    if (a) a.lastSeen = Date.now();
    if (!settings.memorySaver || busy || APP_MODE) return;
    busy = true;
    try {
      const limit = SAVER_MODES[settings.memorySaverMode] ?? SAVER_MODES.balanced;
      const list = tabs.filter(candidate).sort((x, y) => idleOf(y) - idleOf(x)); // as paradas há mais tempo primeiro
      for (const t of list) {
        const idle = idleOf(t) / unit();
        if (idle >= limit) await suspend(t);
        else if (lowMem && idle >= LOW_MEMORY_MIN) { await suspend(t); break; } // pouca memória: uma por vez
      }
    } finally { busy = false; }
  }
  async function checkMemory() {
    const m = await api?.sysMemory?.().catch(() => null);
    lowMem = !!m && m.total > 0 && m.free / m.total < LOW_MEMORY;
  }

  // a aba que deixa de ser a atual começa a contar a partir de agora
  let lastActive = null;
  const watch = () => {
    const a = active();
    if (a !== lastActive) { if (lastActive) lastActive.lastSeen = Date.now(); if (a) a.lastSeen = Date.now(); lastActive = a; }
    // aba que apareceu agora (aberta em segundo plano, vinda de outra janela): conta a partir daqui
    for (const t of tabs) if (!t.lastSeen) t.lastSeen = Date.now();
  };
  setInterval(watch, 1000);
  let timer = null;
  const schedule = () => {
    clearInterval(timer);
    // a cada 30 s (nos testes, a cada "minuto" encurtado)
    timer = setInterval(() => { checkMemory().finally(tick); }, Math.min(30000, unit()));
  };
  schedule();
  return { tick, suspend, schedule, candidate };
})();
