'use strict';
// Modo leitura na interface (como o do Safari): o ícone na barra de endereço quando a página é um
// artigo, o botão "Aa" com o leitor aberto e o painel com tamanho do texto, fontes, fundos,
// "Listen to Page" e "Use Reader automatically" por site. A montagem do artigo fica em reader.js.

const READER_FONTS = [
  ['system', /*i18n*/'System', '"Segoe UI Variable Text", "Segoe UI", sans-serif'],
  ['georgia', 'Georgia', 'Georgia, serif'],
  ['palatino', 'Palatino', '"Palatino Linotype", Palatino, serif'],
  ['times', 'Times New Roman', '"Times New Roman", serif'],
  ['cambria', 'Cambria', 'Cambria, serif'],
  ['constantia', 'Constantia', 'Constantia, serif'],
  ['sitka', 'Sitka', '"Sitka Text", Georgia, serif'],
  ['candara', 'Candara', 'Candara, sans-serif'],
];
const READER_THEMES = [['white', /*i18n*/'White', '#ffffff', '#1d1d1f'], ['sepia', /*i18n*/'Sepia', '#f8f1e3', '#4f321c'], ['gray', /*i18n*/'Gray', '#4a4a4d', '#e4e4e6'], ['night', /*i18n*/'Night', '#121214', '#c9c9cc']];
const readerWcId = (t) => { try { return t?.wv?.getWebContentsId() ?? -1; } catch { return -1; } };
const readerHost = (t) => { try { return new URL(t.url).hostname; } catch { return ''; } };
/** Ajustes do leitor; sem fundo escolhido, segue o tema do Kona (claro → White, escuro → Night). */
function readerSettings() {
  const r = settings.reader || {};
  return { size: r.size ?? 5, font: r.font || 'system', theme: r.theme || (document.documentElement.dataset.theme === 'dark' ? 'night' : 'white') };
}

async function openReader(t) {
  const id = readerWcId(t);
  if (id < 0) return;
  const r = await api?.reader.open(id, readerSettings());
  if (r?.active) { t.reader = { ...(t.reader || {}), available: true, active: true }; sfx.play('open'); }
  else toast(tl('Reader isn’t available for this page'));
  render();
}
async function closeReader(t) {
  const id = readerWcId(t);
  closeReaderPop();
  await api?.reader.close(id);
  if (t.reader) t.reader.active = false;
  sfx.play('close');
  render();
}
function toggleReader(t = active()) {
  if (!t?.wv) return;
  if (t.reader?.active) closeReader(t);
  else if (t.reader?.available) openReader(t);
  else toast(tl('Reader isn’t available for this page'));
}

api?.on('reader:state', ({ id, available, active: isActive, host }) => {
  const t = tabs.find((x) => readerWcId(x) === id);
  if (!t) return;
  t.reader = { available, active: isActive, host };
  if (!isActive && t === active()) closeReaderPop();
  // "Use Reader automatically" neste site
  if (available && !isActive && host && settings.readerAuto?.[host]) openReader(t);
  render();
});

/* ───────────── Painel "Aa" ───────────── */
let readerPopAnchor = null;
async function renderReaderPop() {
  const t = active();
  const s = readerSettings();
  const host = readerHost(t);
  const sp = (await api?.reader.speech(readerWcId(t), 'status')) || {};
  $('#reader-pop').innerHTML = `
    <div class="rp-sizes">
      <button class="rp-size small" data-size="-1" title="Smaller text"${s.size <= 0 ? ' disabled' : ''}>A</button>
      <button class="rp-size big" data-size="1" title="Larger text"${s.size >= 11 ? ' disabled' : ''}>A</button>
    </div>
    <div class="rp-fonts">${READER_FONTS.map(([k, name, css]) => `
      <button class="rp-font${k === s.font ? ' on' : ''}" data-font="${k}" style="font-family:${css}">${k === 'system' ? tl(name) : name}<span class="rp-check">${k === s.font ? icon('check') : ''}</span></button>`).join('')}
    </div>
    <div class="rp-themes">${READER_THEMES.map(([k, name, bg, fg]) => `
      <button class="rp-theme${k === s.theme ? ' on' : ''}" data-theme-r="${k}" title="${tl(name)}" style="background:${bg};color:${fg}">Aa</button>`).join('')}
    </div>
    <div class="pop-sep"></div>
    <button class="rp-row" data-speech="${sp.speaking ? (sp.paused ? 'resume' : 'pause') : 'play'}">
      <span class="rp-ic">${icon(sp.speaking && !sp.paused ? 'pause' : 'play')}</span>${sp.speaking ? (sp.paused ? tl('Resume Listening') : tl('Pause Listening')) : tl('Listen to Page')}
    </button>
    ${sp.speaking ? `<button class="rp-row" data-speech="stop"><span class="rp-ic">${icon('x')}</span>${tl('Stop Listening')}</button>` : ''}
    <button class="rp-row rp-auto" data-auto="1"${host ? '' : ' disabled'}>
      <span class="rp-ic">${icon('reader')}</span><span class="rp-auto-text">${tl('Use Reader automatically on {host}', { host: escapeHtml(host.replace(/^www\./, '')) })}</span>
      <span class="sw${settings.readerAuto?.[host] ? ' on' : ''}"><span></span></span>
    </button>`;
}
async function openReaderPop(anchor) {
  readerPopAnchor = anchor;
  await renderReaderPop();
  const pop = $('#reader-pop');
  const r = anchor.getBoundingClientRect();
  pop.classList.add('show');
  pop.style.top = `${r.bottom + 10}px`;
  pop.style.left = `${Math.max(12, Math.min(innerWidth - pop.offsetWidth - 12, r.left + r.width / 2 - pop.offsetWidth / 2))}px`;
  sfx.play('open');
}
function closeReaderPop() {
  const pop = $('#reader-pop');
  if (!pop.classList.contains('show')) return false;
  pop.classList.remove('show');
  return true;
}
function toggleReaderPop(anchor) { if (!closeReaderPop()) openReaderPop(anchor); }

async function setReader(patch) {
  settings.reader = { ...readerSettings(), ...(settings.reader || {}), ...patch };
  saveSettings();
  await api?.reader.apply(readerWcId(active()), readerSettings());
  sfx.play('tick');
  renderReaderPop();
}
$('#reader-pop').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  const s = readerSettings();
  if (b.dataset.size) setReader({ size: Math.max(0, Math.min(11, s.size + Number(b.dataset.size))) });
  else if (b.dataset.font) setReader({ font: b.dataset.font });
  else if (b.dataset.themeR) setReader({ theme: b.dataset.themeR });
  else if (b.dataset.speech) { await api?.reader.speech(readerWcId(active()), b.dataset.speech); sfx.play('select'); setTimeout(renderReaderPop, 150); }
  else if (b.dataset.auto) {
    const host = readerHost(active());
    settings.readerAuto ||= {};
    if (settings.readerAuto[host]) delete settings.readerAuto[host]; else settings.readerAuto[host] = true;
    saveSettings();
    sfx.play('tick');
    renderReaderPop();
  }
});
document.addEventListener('mousedown', (e) => { if (!e.target.closest('#reader-pop, .aabtn')) closeReaderPop(); }, true);
api?.on('page:mousedown', () => closeReaderPop());
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && closeReaderPop()) e.stopPropagation(); }, true);
