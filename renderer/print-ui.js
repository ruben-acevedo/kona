'use strict';
// Pré-visualização de impressão (N13): Ctrl+P abre esta tela em vez de ir direto para a janela do
// Windows. À esquerda a prévia (a página vira PDF com as opções escolhidas, ver print.js); à direita
// destino (impressoras ou "Salvar como PDF"), páginas, cópias, orientação, cor e mais opções.

const PDF_DEST = '__pdf__';
const pr = { t: null, wcId: null, wv: null, seq: 0, timer: null, printers: [], pages: 0, total: 0, ok: false };

const prOpts = () => ({
  landscape: $('#pr-layout').value === 'landscape',
  color: $('#pr-color').value !== 'bw',
  copies: Number($('#pr-copies').value) || 1,
  pageSize: $('#pr-paper').value,
  margins: $('#pr-margins').value,
  scale: Number($('#pr-scale').value) || 100,
  headerFooter: $('#pr-hf').checked,
  background: $('#pr-bg').checked,
  pages: $('#pr-pages').value === 'custom' ? $('#pr-range').value : '',
  duplex: $('#pr-duplex').value,
});
const isPdfDest = () => $('#pr-dest').value === PDF_DEST;

/** Abre a tela para a página da aba (PDFs e páginas internas: a janela do Windows, como antes). */
async function openPrint(t = active()) {
  if (!t?.wv || !/^https?:|^file:/i.test(t.url)) return;
  let wcId;
  try { wcId = t.wv.getWebContentsId(); } catch { return; }
  if (/\.pdf([?#]|$)/i.test(t.url)) { api?.print.system(wcId); return; }
  pr.t = t; pr.wcId = wcId; pr.ok = false;
  // o que foi usado da última vez (como no Chrome); o resto volta ao padrão
  const last = settings.print || {};
  $('#pr-pages').value = 'all'; $('#pr-range').value = ''; $('#pr-range').hidden = true; $('#pr-range').classList.remove('bad');
  $('#pr-copies').value = 1;
  $('#pr-layout').value = 'portrait';
  $('#pr-color').value = last.color === false ? 'bw' : 'color';
  $('#pr-paper').value = last.pageSize || (/^en-US/.test(navigator.language) ? 'Letter' : 'A4');
  $('#pr-margins').value = 'default'; $('#pr-scale').value = '100'; $('#pr-duplex').value = 'simplex';
  $('#pr-hf').checked = last.headerFooter !== false; $('#pr-bg').checked = false;
  $('#pr-dest').innerHTML = `<option value="${PDF_DEST}">${tl('Save as PDF')}</option>`;
  $('#pr-count').textContent = '';
  openSheet('#print-sheet');
  updateDest();
  // a prévia (um processo novo com o leitor de PDF) só começa depois da animação de abrir a janela
  // (.45s): criada no meio dela, a janela perdia quadros
  $('#pr-busy').classList.add('show');
  preview(true, 470);
  pr.printers = (await api?.print.printers(wcId).catch(() => [])) || [];
  if (pr.t !== t) return;
  // a "Microsoft Print to PDF" e afins ficam na lista; o destino é o último usado ou a impressora padrão
  $('#pr-dest').innerHTML = `<option value="${PDF_DEST}">${tl('Save as PDF')}</option>`
    + pr.printers.map((p) => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.displayName)}</option>`).join('');
  const want = last.dest === PDF_DEST || pr.printers.some((p) => p.name === last.dest) ? last.dest : (pr.printers.find((p) => p.isDefault)?.name || PDF_DEST);
  $('#pr-dest').value = want;
  updateDest();
}

function updateDest() {
  const pdf = isPdfDest();
  $$('.pr-printer', $('#print-sheet')).forEach((el) => { el.hidden = pdf; });
  $('#pr-go').textContent = pdf ? tl('Save') : tl('Print');
  $('#pr-preview').classList.toggle('bw', !pdf && $('#pr-color').value === 'bw');
  showCount();
}
function showCount() {
  if (!pr.pages) { $('#pr-count').textContent = ''; return; }
  const copies = isPdfDest() ? 1 : Math.max(1, Number($('#pr-copies').value) || 1);
  const sheets = $('#pr-duplex').value !== 'simplex' && !isPdfDest() ? Math.ceil(pr.pages / 2) * copies : pr.pages * copies;
  $('#pr-count').textContent = isPdfDest() ? tln(pr.pages, '{n} page', '{n} pages') : tln(sheets, '{n} sheet of paper', '{n} sheets of paper');
}

/** Gera a prévia de novo (com uma pequena espera, para não refazer a cada tecla). */
function preview(now = false, delay = now ? 0 : 350) {
  clearTimeout(pr.timer);
  pr.timer = setTimeout(async () => {
    if (!pr.t) return;
    const my = ++pr.seq;
    $('#pr-busy').classList.add('show');
    const r = await api?.print.preview(pr.wcId, prOpts()).catch(() => null);
    if (my !== pr.seq || !pr.t) return;
    $('#pr-busy').classList.remove('show');
    const err = $('#pr-error');
    $('#pr-range').classList.toggle('bad', r?.error === 'pages');
    if (!r || r.error) {
      pr.ok = false;
      $('#pr-go').disabled = true;
      err.hidden = false;
      err.textContent = r?.error === 'pages' ? tl('Enter pages like 1-3, 5 (this page has {n}).', { n: r.total }) : r?.error === 'gone' ? tl('The tab was closed.') : tl('Couldn’t prepare the preview.');
      return;
    }
    err.hidden = true;
    pr.ok = true; pr.pages = r.pages; pr.total = r.total;
    $('#pr-go').disabled = false;
    if (!pr.wv) {
      const wv = document.createElement('webview');
      wv.setAttribute('partition', 'kona-print-preview');
      wv.setAttribute('plugins', '');
      wv.setAttribute('src', r.url);
      $('#pr-preview').prepend(wv);
      pr.wv = wv;
    } else pr.wv.loadURL(r.url).catch(() => {});
    showCount();
  }, delay);
}

function closePrint() {
  if (!pr.t) return;
  pr.t = null; pr.seq++;
  clearTimeout(pr.timer);
  // a prévia sai antes: enquanto ela mostra o PDF, o Windows não deixa apagá-lo
  pr.wv?.remove(); pr.wv = null;
  api?.print.done(pr.wcId);
  closeSheet('#print-sheet');
}

async function doPrint() {
  if (!pr.ok || !pr.t) return;
  const opts = prOpts();
  const dest = $('#pr-dest').value;
  settings.print = { dest, color: opts.color, pageSize: opts.pageSize, headerFooter: opts.headerFooter };
  saveSettings();
  $('#pr-go').disabled = true;
  const id = pr.wcId;
  if (dest === PDF_DEST) {
    const r = await api?.print.pdf(id, opts);
    if (r?.reason === 'canceled') { $('#pr-go').disabled = false; return; }
    closePrint();
    if (r?.ok) toast(tl('Saved as PDF'), { label: tl('Show in folder'), run: () => api.showDownload(r.path) });
    else toast(tl('Couldn’t save the PDF'));
    return;
  }
  closePrint();
  toast(tl('Printing…'));
  const r = await api?.print.run(id, dest, opts);
  if (!r?.ok && r?.reason !== 'cancelled') toast(tl('Couldn’t print: {reason}', { reason: r?.reason || tl('the printer didn’t respond') }));
}

$('#pr-dest').addEventListener('change', () => { updateDest(); });
$('#pr-pages').addEventListener('change', () => {
  const custom = $('#pr-pages').value === 'custom';
  $('#pr-range').hidden = !custom;
  if (custom) $('#pr-range').focus();
  preview();
});
$('#pr-range').addEventListener('input', () => preview());
$('#pr-copies').addEventListener('input', showCount);
$('#pr-color').addEventListener('change', updateDest);
$('#pr-duplex').addEventListener('change', showCount);
for (const id of ['#pr-layout', '#pr-paper', '#pr-margins', '#pr-scale', '#pr-hf', '#pr-bg']) $(id).addEventListener('change', () => preview());
$('#pr-more').addEventListener('click', () => {
  const open = $('#pr-extra').hidden;
  $('#pr-extra').hidden = !open;
  $('#pr-more').classList.toggle('open', open);
  sfx.play(open ? 'open' : 'close');
});
$('#pr-system').addEventListener('click', () => { const id = pr.wcId; closePrint(); api?.print.system(id); });
$('#pr-cancel').addEventListener('click', closePrint);
$('#pr-go').addEventListener('click', doPrint);
document.addEventListener('keydown', (e) => {
  if (!pr.t) return;
  if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); closePrint(); }
  else if (e.key === 'Enter' && !e.target.closest('select, button')) { e.preventDefault(); doPrint(); }
}, true);
hydrateIcons($('#print-sheet'));
