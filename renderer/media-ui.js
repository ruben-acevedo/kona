'use strict';
// Controle de mídia global (N16): o botão ♪ aparece enquanto alguma aba (de qualquer janela) tem
// vídeo ou áudio; o painel mostra cada uma com capa, título, tocar/pausar, faixa anterior/seguinte
// (quando o site tem) e, clicando, leva à aba. As abas do modo privado só aparecem na própria janela.

const media = { list: [], open: false };
const mediaBtn = $('#btn-media');
const mediaPop = $('#media-pop');

/** As que esta janela mostra (privadas só se a aba é desta janela). */
function visibleMedia() {
  return media.list.filter((s) => !s.priv || tabs.some((t) => { try { return t.wv?.getWebContentsId() === s.wcId; } catch { return false; } }));
}

function mediaRow(s) {
  const host = hostOf(s.url || '');
  const title = s.title || s.pageTitle || host;
  const sub = [s.artist, host].filter(Boolean).join(' · ');
  const art = s.artwork
    ? `<img class="md-art" src="${escapeHtml(s.artwork)}" alt="" draggable="false" />`
    : `<span class="md-art md-site">${siteIcon(s.url || '')}</span>`;
  const has = (a) => s.actions?.includes(a);
  return `<div class="md-row" data-wc="${s.wcId}">
      <button class="md-open" data-act="focus" title="Go to tab">${art}
        <span class="md-text"><span class="md-title">${escapeHtml(title)}</span><span class="md-sub">${escapeHtml(sub)}</span></span>
      </button>
      <span class="md-ctl">
        ${has('previoustrack') ? `<button class="tb small" data-act="previoustrack" title="Previous">${icon('prevTrack')}</button>` : ''}
        <button class="tb small md-play" data-act="toggle" title="${s.playing ? 'Pause' : 'Play'}">${icon(s.playing ? 'pause' : 'play')}</button>
        ${has('nexttrack') ? `<button class="tb small" data-act="nexttrack" title="Next">${icon('nextTrack')}</button>` : ''}
      </span>
    </div>`;
}

function renderMedia() {
  const list = visibleMedia();
  mediaBtn.hidden = !list.length;
  mediaBtn.classList.toggle('playing', list.some((s) => s.playing));
  if (!list.length) { toggleMediaPop(false); return; }
  if (!media.open) return;
  mediaPop.innerHTML = `<div class="pp-head">Playing now</div>${list.map(mediaRow).join('')}`;
  $$('img.md-art', mediaPop).forEach((img) => { img.onerror = () => img.replaceWith(Object.assign(document.createElement('span'), { className: 'md-art md-site' })); });
}

function toggleMediaPop(force) {
  const show = force ?? !media.open;
  if (show === media.open) return;
  media.open = show;
  if (show) {
    renderMedia();
    const r = mediaBtn.getBoundingClientRect();
    mediaPop.style.top = `${Math.round(r.bottom + 8)}px`;
    mediaPop.style.right = `${Math.round(innerWidth - r.right)}px`;
    mediaPop.style.left = 'auto';
    mediaPop.style.transformOrigin = 'top right';
  }
  mediaPop.classList.toggle('show', show);
  mediaBtn.classList.toggle('on', show);
  sfx.play(show ? 'open' : 'close');
}

mediaBtn.addEventListener('click', () => toggleMediaPop());
mediaPop.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  const row = e.target.closest('.md-row');
  if (!b || !row) return;
  api?.mediaControl(Number(row.dataset.wc), b.dataset.act);
  if (b.dataset.act === 'focus') toggleMediaPop(false);
});
document.addEventListener('mousedown', (e) => { if (media.open && !e.target.closest('#media-pop, #btn-media')) toggleMediaPop(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && media.open) { toggleMediaPop(false); e.stopPropagation(); } }, true);
api?.on('page:mousedown', () => toggleMediaPop(false));
api?.on('media:list', (list) => { media.list = Array.isArray(list) ? list : []; renderMedia(); });
api?.mediaList?.().then((list) => { media.list = list || []; renderMedia(); });
