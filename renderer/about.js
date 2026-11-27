'use strict';
// Settings → About Kona (O4): "Relatar um problema" e as licenças de código aberto.

const REPO_URL = 'https://github.com/ruben-acevedo/kona';

/* ───────────── Relatar um problema ─────────────
   Abre uma issue nova no GitHub já preenchida com o ambiente. Nada é enviado pelo Kona: a pessoa
   revê o texto no GitHub e publica (ou não). Sem endereços, extensões nem histórico. */
async function reportProblem() {
  const v = appInfo || (await api?.appInfo()) || {};
  const lang = i18n.choice === 'auto' ? `${i18n.lang} (automatic)` : i18n.lang;
  const body = [
    '### What happened?',
    '<!-- Describe the problem. A screenshot helps. -->',
    '',
    '',
    '### Steps to reproduce',
    '1. ',
    '2. ',
    '3. ',
    '',
    '### What did you expect to happen?',
    '',
    '',
    '### Environment',
    `- Kona: ${v.version || '?'}${v.packaged === false ? ' (development)' : ''}`,
    `- Chromium: ${v.chrome || '?'} (Electron ${v.electron || '?'})`,
    `- OS: ${v.os || '?'}, ${v.arch || '?'}`,
    `- Interface language: ${lang}`,
    '',
  ].join('\n');
  newTab(`${REPO_URL}/issues/new?body=${encodeURIComponent(body)}`);
}

/* ───────────── Licenças de código aberto ───────────── */
let licData = null;
async function openLicenses() {
  openSheet('#lic-sheet');
  if (!licData) {
    $('#lic-list').innerHTML = `<p class="st-empty">${tl('Loading…')}</p>`;
    licData = await api?.appLicenses().catch(() => null);
    if (!appInfo) appInfo = await api?.appInfo();
  }
  renderLicenses();
  $('#lic-list .lic-head')?.focus();
}

function renderLicenses() {
  if (!licData) { $('#lic-list').innerHTML = `<p class="st-empty">${tl('Couldn’t load the licenses.')}</p>`; return; }
  const row = (p, i) => `
    <div class="lic-item" data-lic="${i}">
      <button class="lic-head" aria-expanded="false">
        <span class="lic-name"><b>${escapeHtml(p.name)}</b>${p.version ? `<span>${escapeHtml(p.version)}</span>` : ''}</span>
        <span class="lic-type">${escapeHtml(p.license)}</span>
        <span class="lic-chev">${icon('chevron')}</span>
      </button>
      <div class="lic-body" hidden>
        ${p.note ? `<p class="lic-note">${escapeHtml(tl(p.note))}</p>` : ''}
        ${p.text ? `<pre class="lic-text">${escapeHtml(p.text)}</pre>` : ''}
        <button class="btn-link" data-lic-open="${escapeHtml(p.url)}">${tl('Website')}</button>
      </div>
    </div>`;
  const all = [licData.kona, licData.electron, ...licData.packages];
  const chromium = appInfo?.chromiumLicenses;
  $('#lic-list').innerHTML = `
    <h3 class="lic-sec">Kona</h3>${row(all[0], 0)}
    <h3 class="lic-sec">${tl('Browser engine')}</h3>
    <div class="lic-item lic-chromium">
      <div class="lic-head static"><span class="lic-name"><b>Chromium</b></span><span class="lic-type">BSD-3-Clause ${tl('and others')}</span></div>
      ${chromium ? `<button class="btn-link" data-lic-open="${escapeHtml(chromium)}">${tl('View licenses')}</button>` : ''}
    </div>
    ${row(all[1], 1)}
    <h3 class="lic-sec">${tl('Libraries')}</h3>${all.slice(2).map((p, i) => row(p, i + 2)).join('')}
    <h3 class="lic-sec">${tl('Scam and malware lists')}</h3>${licData.data.map((d, i) => row(d, `d${i}`)).join('')}`;
}

$('#lic-list').addEventListener('click', (e) => {
  const open = e.target.closest('[data-lic-open]');
  if (open) { closeSheet('#lic-sheet'); newTab(open.dataset.licOpen); return; }
  const head = e.target.closest('button.lic-head');
  if (!head) return;
  const body = head.nextElementSibling;
  const show = body.hidden;
  body.hidden = !show;
  head.setAttribute('aria-expanded', String(show));
  head.parentElement.classList.toggle('open', show);
});
$('#lic-close').addEventListener('click', () => closeSheet('#lic-sheet'));
hydrateIcons($('#lic-sheet'));
