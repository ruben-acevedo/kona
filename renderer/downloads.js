'use strict';
// Downloads: lista no menu lateral (Ctrl+J), botão com anel de progresso na barra de ferramentas
// (aparece no primeiro download da sessão, como no Safari e no Chrome) e arrastar o arquivo para
// fora do Kona. Os avisos de início e fim (toasts) continuam em settings.js.

const dlIcons = new Map(); // caminho → dataURL do ícone do Windows (ou null)
let dlSession = false;     // já houve download nesta sessão: o botão da barra fica visível

/* ───────────── Formatação ───────────── */
function fmtBytes(n) {
  if (!(n > 0)) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / 1024 ** i;
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
}
function fmtLeft(s) {
  if (!Number.isFinite(s) || s <= 0) return '';
  if (s < 60) return tl('{n} s left', { n: Math.ceil(s) });
  if (s < 3600) return tl('{n} min left', { n: Math.ceil(s / 60) });
  return tl('{h} h {m} min left', { h: Math.floor(s / 3600), m: Math.ceil((s % 3600) / 60) });
}
const dlHost = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

/** Texto de estado de um item ("12 MB of 80 MB · 3.2 MB/s · 20 s left", "Completed", …). */
function dlStatus(x) {
  if (x.state === 'progressing') {
    const of = x.total > 0 ? tl('{got} of {total}', { got: fmtBytes(x.received), total: fmtBytes(x.total) }) : fmtBytes(x.received);
    if (x.paused) return `${tl('Paused')} · ${of}`;
    // duas linhas: o tamanho; a velocidade e o tempo restante
    const rate = [x.speed > 0 ? `${fmtBytes(x.speed)}/s` : '', x.total > 0 && x.speed > 0 ? fmtLeft((x.total - x.received) / x.speed) : '']
      .filter(Boolean).join(' · ');
    return rate ? `${of}\n${rate}` : of;
  }
  if (x.missing) return tl('Deleted');
  if (x.state === 'completed') return [fmtBytes(x.total || x.received), dlHost(x.url)].filter(Boolean).join(' · ');
  if (x.state === 'cancelled') return tl('Canceled');
  return tl('Failed');
}

/* ───────────── Eventos do processo principal ───────────── */
function trackSpeed(x, d) {
  const now = performance.now();
  if (x._lastAt && d.received >= x._lastBytes && !d.paused) {
    const inst = ((d.received - x._lastBytes) / Math.max(1, now - x._lastAt)) * 1000;
    x.speed = x.speed ? x.speed * 0.7 + inst * 0.3 : inst; // média suave
  }
  x._lastAt = now; x._lastBytes = d.received;
}

/** O download do aviso (todas as janelas recebem; uma janela aberta no meio dele o acha pela chave). */
function dlFor(d) {
  const x = downloadsList.byId(d.id) || downloadsList.get(`dl-${d.id}-${d.start}`);
  if (x) x.id = d.id;
  return x;
}
api?.on('download:start', (d) => {
  if (d.priv && !library.isPrivate()) return; // download do modo privado de outra janela
  downloadsList.add({ id: d.id, url: d.url, name: d.name, path: d.path, received: d.received, total: d.total, state: 'progressing', paused: false, start: d.start }, d.priv);
  dlSession = true;
  updateDlButton(true);
  refreshDownloadsView();
});
api?.on('download:progress', (d) => {
  const x = dlFor(d);
  if (!x) return;
  x.state = 'progressing';
  trackSpeed(x, d);
  Object.assign(x, { name: d.name, path: d.path, received: d.received, total: d.total, paused: d.paused, canResume: d.canResume });
  updateDlButton();
  updateDlRow(x);
});
api?.on('download:done', (d) => {
  const x = dlFor(d);
  if (!x) return;
  Object.assign(x, { name: d.name, path: d.path, received: d.received, total: d.total || d.received, state: d.state, paused: false, speed: 0, missing: false });
  downloadsList.save();
  updateDlButton(d.state === 'completed' ? 'done' : false);
  refreshDownloadsView();
});

/* ───────────── Botão da barra de ferramentas ───────────── */
function updateDlButton(bounce) {
  const btn = $('#btn-downloads');
  const active = downloadsList.active();
  btn.hidden = !dlSession;
  btn.classList.toggle('active', active.length > 0);
  const total = active.reduce((n, x) => n + (x.total || 0), 0);
  const got = active.reduce((n, x) => n + (x.total ? x.received : 0), 0);
  const pct = active.length ? (total ? Math.min(100, (got / total) * 100) : 12) : 0;
  btn.style.setProperty('--dl-pct', pct.toFixed(1));
  btn.classList.toggle('indeterminate', active.length > 0 && !total);
  btn.title = active.length ? tl('Downloads — {n} in progress (Ctrl+J)', { n: active.length }) : tl('Downloads (Ctrl+J)');
  if (bounce) { btn.classList.remove('bounce'); void btn.offsetWidth; btn.classList.add('bounce'); }
  const count = $('#sb-dl-count');
  if (count) count.textContent = active.length || '';
}
$('#btn-downloads').addEventListener('click', () => {
  if (sidebarOpen() && sb.view === 'downloads') toggleSidebar(false);
  else openSidebarView('downloads');
});
hydrateIcons($('#btn-downloads'));

/* ───────────── Lista no menu lateral ───────────── */
function dlIcon(x) {
  const src = x.path && dlIcons.get(x.path);
  return `<span class="dl-icon">${src ? `<img src="${src}" alt="" draggable="false" />` : icon('download')}</span>`;
}
function dlRowHtml(x) {
  const active = x.state === 'progressing';
  const done = x.state === 'completed' && !x.missing;
  const failed = x.state === 'cancelled' || x.state === 'interrupted';
  const pct = x.total > 0 ? Math.min(100, (x.received / x.total) * 100) : 0;
  const acts = active
    ? `<button class="sb-act" data-dl-act="${x.paused ? 'resume' : 'pause'}" title="${x.paused ? tl('Resume') : tl('Pause')}">${icon(x.paused ? 'play' : 'pause')}</button>
       <button class="sb-act" data-dl-act="cancel" title="${tl('Cancel')}">${icon('x')}</button>`
    : `${done ? `<button class="sb-act" data-dl-act="show" title="${tl('Show in folder')}">${icon('folder')}</button>` : ''}
       ${failed ? `<button class="sb-act" data-dl-act="retry" title="${tl('Retry')}">${icon('reload')}</button>` : ''}
       <button class="sb-act" data-dl-act="remove" title="${tl('Remove from list')}">${icon('x')}</button>`;
  return `<div class="sb-row dl-row${active ? ' active' : ''}${done ? ' done' : ''}${failed ? ' failed' : ''}${x.missing ? ' missing' : ''}${x.paused ? ' paused' : ''}"
      data-dl="${x.key}"${done ? ' draggable="true"' : ''} title="${escapeHtml(x.name)}${x.url ? `\n${escapeHtml(x.url)}` : ''}">
      ${dlIcon(x)}
      <div class="sb-row-text"><b>${escapeHtml(x.name)}</b><span class="dl-status">${escapeHtml(dlStatus(x))}</span>
        ${active ? `<span class="dl-bar${x.total ? '' : ' indeterminate'}"><i style="width:${pct.toFixed(1)}%"></i></span>` : ''}</div>
      <span class="sb-acts${active ? ' always' : ''}">${acts}</span>
    </div>`;
}

function renderDownloads(list) {
  const items = downloadsList.items;
  list.innerHTML = items.length
    ? items.map(dlRowHtml).join('')
    : empty('download', tl('No downloads'), tl('Files you download will show up here. Press Ctrl+J to open this list.'));
  loadDlIcons(items);
  checkMissing(items);
}
function refreshDownloadsView() {
  updateDlButton();
  if (sidebarOpen() && sb.view === 'downloads') renderSub();
}
/** Só atualiza a linha que mudou (o progresso chega várias vezes por segundo). */
function updateDlRow(x) {
  if (!sidebarOpen() || sb.view !== 'downloads') return;
  const row = $(`#sb-list [data-dl="${x.key}"]`);
  if (!row || row.classList.contains('paused') !== !!x.paused) { renderSub(); return; }
  $('.dl-status', row).textContent = dlStatus(x);
  const bar = $('.dl-bar i', row);
  if (bar && x.total > 0) bar.style.width = `${Math.min(100, (x.received / x.total) * 100).toFixed(1)}%`;
}

async function loadDlIcons(items) {
  const need = items.filter((x) => x.path && x.state === 'completed' && !dlIcons.has(x.path)).slice(0, 40);
  if (!need.length) return;
  for (const x of need) dlIcons.set(x.path, (await api?.downloadIcon(x.path)) || null);
  if (sidebarOpen() && sb.view === 'downloads') {
    for (const x of need) {
      const el = $(`#sb-list [data-dl="${x.key}"] .dl-icon`);
      const src = dlIcons.get(x.path);
      if (el && src) el.innerHTML = `<img src="${src}" alt="" draggable="false" />`;
    }
  }
}
let missingChecked = 0;
async function checkMissing(items) {
  if (Date.now() - missingChecked < 3000) return; // no máximo a cada 3 s
  missingChecked = Date.now();
  const done = items.filter((x) => x.state === 'completed' && x.path);
  if (!done.length) return;
  const exists = (await api?.downloadExists(done.map((x) => x.path))) || [];
  let changed = false;
  done.forEach((x, i) => { const miss = exists[i] === false; if (!!x.missing !== miss) { x.missing = miss; changed = true; } });
  if (changed && sidebarOpen() && sb.view === 'downloads') renderSub();
}

$('#sb-list').addEventListener('click', async (e) => {
  if (sb.view !== 'downloads') return;
  const row = e.target.closest('[data-dl]');
  if (!row) return;
  const x = downloadsList.get(row.dataset.dl);
  if (!x) return;
  e.stopPropagation();
  const act = e.target.closest('[data-dl-act]')?.dataset.dlAct;
  if (act === 'pause') { await api?.downloadPause(x.id); x.paused = true; updateDlRow(x); }
  else if (act === 'resume') { await api?.downloadResume(x.id); x.paused = false; updateDlRow(x); }
  else if (act === 'cancel') api?.downloadCancel(x.id);
  else if (act === 'show') api?.showDownload(x.path);
  else if (act === 'retry') { downloadsList.remove(x.key); api?.downloadRetry(x.url); }
  else if (act === 'remove') { downloadsList.remove(x.key); sfx.play('tick'); }
  else if (x.state === 'completed' && !x.missing) {
    // clicar num download concluído abre o arquivo
    const ok = await api?.downloadOpen(x.path);
    if (!ok) { x.missing = true; renderSub(); toast(tl('That file was moved or deleted')); }
  }
});
// Arrastar um download concluído para a área de trabalho, o Explorador ou outro programa
$('#sb-list').addEventListener('dragstart', (e) => {
  const row = e.target.closest?.('[data-dl]');
  if (!row) return;
  const x = downloadsList.get(row.dataset.dl);
  e.preventDefault();
  if (x?.path && x.state === 'completed' && !x.missing) api?.downloadDrag(x.path);
});

library.onChange((what) => {
  if (what === 'downloads' || what === 'profile') refreshDownloadsView();
});
updateDlButton();
