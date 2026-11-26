'use strict';
// Sites como aplicativo (N11): o ícone "Instalar app" / "Abrir no app" da barra de endereço, a janela
// de instalar, a seção Apps das Configurações e o menu ⋮ da janela de um app (modo app, APP_MODE).
// Quem guarda os apps, cria os atalhos do Windows e abre as janelas é o processo principal (apps.js).

let installedApps = [];
const refreshApps = () => api?.apps.list().then((l) => { installedApps = l || []; settingsPage.refresh?.(); });
refreshApps();
api?.on('apps:changed', (l) => {
  installedApps = Array.isArray(l) ? l : [];
  settingsPage.refresh?.();
  for (const t of tabs) if (t.appState) checkApp(t); // a barra de endereço acompanha
});

/** A página carregou: ela oferece app (manifest) ou já tem um instalado? */
async function checkApp(t) {
  if (APP_MODE || library.isPrivate() || !t.wv || !/^https?:\/\//.test(t.url)) return;
  let id;
  try { id = t.wv.getWebContentsId(); } catch { return; }
  const url = t.url;
  const r = await api?.apps.check(id, t.partition).catch(() => null);
  if (!r || t.url !== url) return;
  t.appState = { url, manifest: r.manifest, installed: r.installed };
  if (t === active()) render();
}

/** Ícone da barra: abre no app (já instalado) ou mostra a janela de instalar. */
function appButton(t) {
  if (t.appState?.installed) openInApp(t, t.appState.installed);
  else openInstallSheet(t);
}
/** Como no Chrome: a página passa para a janela do app e a aba fecha. */
function openInApp(t, id) {
  api?.apps.open(id, t.url);
  if (tabs.length > 1) closeTab(t.id);
}

/* ───────────── Janela de instalar ───────────── */
const appSheet = { t: null, info: null };

/** Ícone com a inicial do nome, quando o site não tem um que sirva (256 px, PNG). */
function letterIcon(name, color) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  let hue = 0;
  for (const ch of name) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
  g.fillStyle = /^#[0-9a-f]{3,8}$/i.test(color || '') ? color : `hsl(${hue} 55% 45%)`;
  g.beginPath(); g.roundRect(8, 8, 240, 240, 56); g.fill();
  g.fillStyle = '#fff';
  g.font = '600 140px "Inter Variable", system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText((name.trim()[0] || '?').toUpperCase(), 128, 140);
  return c.toDataURL('image/png');
}

async function openInstallSheet(t = active()) {
  if (!t?.wv || !/^https?:\/\//.test(t.url) || library.isPrivate() || APP_MODE) return;
  appSheet.t = t; appSheet.info = null;
  $('#app-icon').innerHTML = '<span class="app-spin"></span>';
  $('#app-name').value = t.title || hostOf(t.url);
  $('#app-origin').textContent = hostOf(t.url);
  $('#app-desktop').checked = false;
  $('#app-install').disabled = true;
  openSheet('#app-sheet');
  let info = null;
  try { info = await api?.apps.inspect(t.wv.getWebContentsId()); } catch { /* a aba fechou */ }
  if (appSheet.t !== t) return;
  if (!info) { closeSheet('#app-sheet'); toast(tl('This page can’t be installed as an app')); return; }
  info.icon ||= letterIcon(info.name, info.themeColor);
  appSheet.info = info;
  $('#app-icon').innerHTML = `<img src="${escapeHtml(info.icon)}" alt="" draggable="false" />`;
  $('#app-name').value = info.name;
  $('#app-origin').textContent = hostOf(info.startUrl) + (new URL(info.scope).pathname !== '/' ? new URL(info.scope).pathname : '');
  $('#app-install').disabled = false;
  $('#app-name').focus();
  $('#app-name').select();
}
async function installFromSheet() {
  const { t, info } = appSheet;
  const name = $('#app-name').value.trim();
  if (!info || !name) return;
  $('#app-install').disabled = true;
  const res = await api?.apps.install({ ...info, name, desktop: $('#app-desktop').checked, partition: t.partition, openUrl: t.url });
  closeSheet('#app-sheet');
  if (!res) { toast(tl('Couldn’t install the app')); return; }
  toast(tl('“{name}” installed', { name: res.name }));
  if (tabs.includes(t) && tabs.length > 1) closeTab(t.id);
}
$('#app-install').addEventListener('click', installFromSheet);
$('#app-cancel').addEventListener('click', () => { appSheet.t = null; closeSheet('#app-sheet'); });
$('#app-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') installFromSheet(); });
$('#app-name').addEventListener('input', () => { $('#app-install').disabled = !appSheet.info || !$('#app-name').value.trim(); });

/** Itens do menu da página (botão direito) e do menu da aba. */
function appMenuItems(t) {
  if (APP_MODE || library.isPrivate() || !/^https?:\/\//.test(t?.url || '')) return [];
  const inst = installedApps.find((a) => a.partition === t.partition && t.url.startsWith(a.scope));
  return inst
    ? [{ label: tl('Open in {name}', { name: inst.name }), run: () => openInApp(t, inst.id) }]
    : [{ label: tl('Install as app…'), run: () => openInstallSheet(t) }];
}

/* ───────────── Configurações › Apps ───────────── */
function appsSettingsSection() {
  const rows = installedApps.length
    ? installedApps.map((a) => `
      <div class="st-row st-app">
        <span class="st-app-ic">${a.icon ? `<img src="${escapeHtml(a.icon)}" alt="" />` : ''}</span>
        <div class="st-text"><b>${escapeHtml(a.name)}</b><p>${escapeHtml(a.scope.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</p></div>
        <div class="st-ctrl">${stButton(tl('Open'), 'app-open', 'btn-secondary', `data-app="${a.id}"`)}${stButton(tl('Uninstall'), 'app-uninstall', 'btn-link', `data-app="${a.id}"`)}</div>
      </div>`).join('')
    : `<p class="st-empty">${tl('No apps yet. On a site you use a lot, click Install app in the address bar, or right-click the page and choose Install as app.')}</p>`;
  return settingsPage.section('apps', /*i18n*/'Apps', rows,
    tl('Sites installed as apps open in their own window, with an icon in the Start menu and on the taskbar.'));
}
async function uninstallApp(id) {
  const a = installedApps.find((x) => x.id === id);
  if (!a) return;
  const yes = await ask({ title: tl('Uninstall “{name}”?', { name: a.name }), text: tl('The shortcuts are removed. You stay signed in to the site in Kona.'), ok: tl('Uninstall'), danger: true });
  if (yes) await api?.apps.uninstall(id);
}

/* ───────────── A janela do app ───────────── */
if (APP_MODE) {
  const btn = $('#btn-appmenu');
  btn.hidden = false;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const r = btn.getBoundingClientRect();
    const t = active();
    showMenu([
      { label: APP_MODE.name, disabled: true },
      '-',
      { label: tl('Reload'), key: 'Ctrl+R', run: () => t?.wv?.reload() },
      { label: tl('Copy link'), run: () => copyText(t.url), disabled: !/^https?:/.test(t?.url || '') },
      { label: tl('Find…'), key: 'Ctrl+F', run: () => findBar.open() },
      { label: tl('Print…'), key: 'Ctrl+P', run: () => { try { api?.ctxDo(t.wv.getWebContentsId(), 'print'); } catch { /* sem página */ } } },
      { label: tl('Zoom in'), key: 'Ctrl++', run: () => zoomStep(1) },
      { label: tl('Zoom out'), key: 'Ctrl+-', run: () => zoomStep(-1) },
      '-',
      { label: tl('Open in Kona'), run: () => api?.apps.toBrowser(t.url) },
      '-',
      { label: tl('Uninstall {name}…', { name: APP_MODE.name }), run: async () => {
        await refreshApps();
        uninstallApp(APP_MODE.id);
      } },
    ], r.right - 240, r.bottom + 6);
  });
  api?.on('app:navigate', (url) => { const t = active(); if (t && /^https?:\/\//.test(url)) navigate(t, url); });
}
