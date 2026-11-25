'use strict';
// Configurações (kona://configuracoes), pedido de permissão dos sites e avisos de download.

const PERMS = [
  ['camera', 'Câmera', 'camera', 'usar sua câmera'],
  ['microphone', 'Microfone', 'mic', 'usar seu microfone'],
  ['location', 'Localização', 'pin', 'saber sua localização'],
  ['notifications', 'Notificações', 'bell', 'mostrar notificações'],
  ['clipboard', 'Ler a área de transferência', 'clipboard', 'ler sua área de transferência'],
  ['apps', 'Abrir aplicativos externos', 'external', 'abrir um aplicativo no seu computador'],
];
const PERM_INFO = Object.fromEntries(PERMS.map(([k, label, ic, verb]) => [k, { label, ic, verb }]));

const ST_SECTIONS = [
  ['geral', 'Geral', 'gear'],
  ['aparencia', 'Aparência', 'palette'],
  ['privacidade', 'Privacidade e segurança', 'shield'],
  ['permissoes', 'Permissões de sites', 'hand'],
  ['downloads', 'Downloads', 'download'],
  ['perfis', 'Perfis', 'user'],
  ['extensoes', 'Extensões', 'puzzle'],
  ['sobre', 'Sobre o Kona', 'info'],
];

/* ───────────── Controles ───────────── */
const stRow = (label, desc, control, extra = '') => `
  <div class="st-row${extra}">
    <div class="st-text"><b>${label}</b>${desc ? `<p>${desc}</p>` : ''}</div>
    <div class="st-ctrl">${control}</div>
  </div>`;
const stSelect = (key, options, value = settings[key], attr = `data-set="${key}"`) => `
  <select class="st-select" ${attr}>${options.map(([v, l]) => `<option value="${v}"${String(v) === String(value) ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
const stSwitch = (key, on = !!settings[key]) => `<button class="sw${on ? ' on' : ''}" role="switch" aria-checked="${on}" data-toggle="${key}"><span></span></button>`;
const stButton = (label, act, cls = 'btn-secondary', data = '') => `<button class="${cls}" data-do="${act}" ${data}>${label}</button>`;

let appInfo = null;

const settingsPage = {
  built: false,

  render() {
    if (!this.built) this.build();
  },

  build() {
    this.built = true;
    $('#st-nav').innerHTML = ST_SECTIONS.map(([id, label, ic]) =>
      `<button class="st-nav-item" data-go="${id}"><span data-icon="${ic}">${icon(ic)}</span>${label}</button>`).join('');
    this.refresh();
    // navegação acompanha a seção visível
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) this.mark(e.target.id.slice(3));
    }, { root: $('#st-scroll'), rootMargin: '-30% 0px -60% 0px' });
    $$('.st-sec').forEach((s) => io.observe(s));
    if (!appInfo) api?.appInfo().then((info) => { appInfo = info; this.refresh(); });
  },

  mark(id) { $$('.st-nav-item').forEach((b) => b.classList.toggle('on', b.dataset.go === id)); },

  scrollTo(id) {
    this.render();
    const sec = $(`#st-${id}`);
    if (sec) $('#st-scroll').scrollTo({ top: sec.offsetTop - 12, behavior: 'smooth' });
    this.mark(id);
  },

  /** Redesenha o conteúdo (preservando a rolagem). */
  refresh() {
    if (!this.built) return;
    const scroll = $('#st-scroll').scrollTop;
    $('#st-main').innerHTML = [
      this.general(), this.appearance(), this.privacy(), this.permissions(),
      this.downloads(), this.profiles(), this.extensions(), this.about(),
    ].join('');
    $('#st-scroll').scrollTop = scroll;
  },

  section(id, title, body, intro = '') {
    return `<section class="st-sec" id="st-${id}"><h2>${title}</h2>${intro ? `<p class="st-intro">${intro}</p>` : ''}<div class="st-card">${body}</div></section>`;
  },

  general() {
    return this.section('geral', 'Geral',
      stRow('Ao abrir o Kona', 'As abas dos grupos são sempre mantidas.',
        stSelect('startup', [['newtab', 'Abrir uma nova aba'], ['restore', 'Restaurar as abas da última sessão']])) +
      stRow('Mecanismo de pesquisa', 'Usado na barra de endereço.',
        stSelect('searchEngine', Object.entries(ENGINES).map(([k, e]) => [k, e.name]))) +
      stRow('Sugestões de pesquisa', `Enquanto você digita na barra, o texto é enviado ao ${escapeHtml(engine().name)} para sugerir buscas.`,
        stSwitch('suggestions')) +
      stRow('Guardar histórico de navegação', 'Sites visitados e buscas ficam neste computador, no perfil atual.',
        stSwitch('saveHistory')));
  },

  appearance() {
    const theme = settings.theme;
    const seg = ['light', 'dark', 'system'].map((t) =>
      `<button class="${t === theme ? 'on' : ''}" data-theme-set="${t}">${{ light: 'Claro', dark: 'Escuro', system: 'Sistema' }[t]}</button>`).join('');
    return this.section('aparencia', 'Aparência',
      stRow('Tema', 'Vale para a interface e para as páginas que seguem o tema do sistema.', `<div class="seg st-seg">${seg}</div>`) +
      stRow('Fundo e seções da nova aba', 'Escolha o fundo, uma cor ou uma foto sua, e o que aparece na nova aba.',
        stButton('Personalizar…', 'customize')) +
      stRow('Sons da interface', 'Sons curtos ao abrir menus, navegar pelas abas e passar pelos favoritos.', stSwitch('sounds')) +
      stRow('Zoom padrão das páginas', null,
        stSelect('zoom', [[0.75, '75%'], [0.9, '90%'], [1, '100%'], [1.1, '110%'], [1.25, '125%'], [1.5, '150%']])));
  },

  privacy() {
    return this.section('privacidade', 'Privacidade e segurança',
      stRow('Cookies', {
        allow: 'Todos os sites podem guardar e ler cookies.',
        'block-third-party': 'Recomendado. Bloqueia os cookies que outros sites (anúncios, rastreadores) usam dentro da página que você está vendo.',
        'block-all': 'Nenhum site guarda cookies enviados pela rede. Logins e carrinhos de compra deixam de funcionar.',
      }[settings.cookies], stSelect('cookies', [['allow', 'Permitir todos'], ['block-third-party', 'Bloquear de terceiros'], ['block-all', 'Bloquear todos']])) +
      stRow('Apagar cookies e dados de sites ao fechar o Kona', 'Você sai de todas as contas a cada vez que fecha o Kona.', stSwitch('clearOnExit')) +
      stRow('Pedir aos sites para não vender nem compartilhar seus dados', 'Envia o sinal Global Privacy Control (GPC). Respeitá-lo é obrigatório por lei em alguns lugares.', stSwitch('gpc')) +
      stRow('Sempre usar conexões seguras', 'Abre os sites por HTTPS. Se um site não tiver HTTPS, ele carrega normalmente sem criptografia.', stSwitch('httpsFirst')) +
      stRow('DNS seguro', 'Criptografa as consultas de DNS (Quad9) e bloqueia sites conhecidos de golpes e malware. Desligue se algum endereço da rede da sua empresa não abrir.', stSwitch('secureDns')) +
      stRow('Dados de sites', 'Veja quais sites guardam cookies neste perfil e apague os que quiser.', stButton('Ver dados de sites…', 'sites')) +
      stRow('Limpar dados de navegação', 'Histórico, cookies e arquivos em cache.', stButton('Limpar…', 'clear-data')),
      'As opções valem para o perfil atual. O modo privado segue as mesmas regras e ainda apaga tudo ao sair.');
  },

  permissions() {
    const rows = PERMS.map(([k, label, ic]) => stRow(
      `<span class="st-ic">${icon(ic)}</span>${label}`, null,
      stSelect(null, [['ask', 'Perguntar'], ['allow', 'Permitir'], ['block', 'Bloquear']], settings.permissions[k], `data-perm="${k}"`),
    )).join('');
    const sites = Object.entries(settings.sites).filter(([, d]) => Object.keys(d).length);
    const list = sites.length
      ? sites.map(([origin, d]) => `
        <div class="st-site">
          <div class="st-site-head"><b>${escapeHtml(origin.replace(/^https?:\/\//, ''))}</b>${stButton('Esquecer', 'site-forget', 'btn-link', `data-origin="${escapeHtml(origin)}"`)}</div>
          <div class="st-site-perms">${Object.entries(d).map(([k, v]) => `
            <label class="st-chip"><span>${icon(PERM_INFO[k]?.ic || 'info')}${PERM_INFO[k]?.label || k}</span>
              ${stSelect(null, [['allow', 'Permitir'], ['block', 'Bloquear']], v, `data-site="${escapeHtml(origin)}" data-kind="${k}"`)}</label>`).join('')}
          </div>
        </div>`).join('')
      : '<p class="st-empty">Nenhuma decisão salva ainda. Quando um site pedir uma permissão, sua resposta aparece aqui.</p>';
    return this.section('permissoes', 'Permissões de sites', rows,
      'O que os sites podem fazer sem perguntar. Compartilhar a tela fica bloqueado nesta versão.') +
      `<div class="st-card st-sites"><h3>Decisões por site</h3>${list}</div>`;
  },

  downloads() {
    const dir = settings.downloadDir || appInfo?.downloads || 'Pasta Downloads do sistema';
    return this.section('downloads', 'Downloads',
      stRow('Salvar arquivos em', `<span class="st-path">${escapeHtml(dir)}</span>`,
        stButton('Alterar…', 'pick-folder') + (settings.downloadDir ? stButton('Padrão', 'reset-folder', 'btn-link') : '')) +
      stRow('Perguntar onde salvar cada arquivo', null, stSwitch('downloadAsk')));
  },

  profiles() {
    const rows = PROFILES.list.map((p) => `
      <div class="st-row">
        <div class="st-text st-profile">${avatarHtml(p.avatar, p.name, 'md')}<b>${escapeHtml(p.name)}</b>${p.id === PROFILES.current ? '<span class="st-tag">em uso</span>' : ''}</div>
        <div class="st-ctrl">${p.id !== PROFILES.current ? stButton('Usar', 'profile-use', 'btn-secondary', `data-id="${p.id}"`) : ''}${stButton('Editar…', 'profile-edit', 'btn-secondary', `data-id="${p.id}"`)}</div>
      </div>`).join('');
    return this.section('perfis', 'Perfis', rows + `<div class="st-row"><div class="st-text"></div><div class="st-ctrl">${stButton('Novo perfil', 'profile-new', 'btn-primary')}</div></div>`,
      'Cada perfil tem histórico, favoritos, ajustes, logins e extensões próprios.');
  },

  extensions() {
    const n = typeof extensions !== 'undefined' ? extensions.length : 0;
    return this.section('extensoes', 'Extensões',
      stRow(n ? `${n} ${n === 1 ? 'extensão instalada' : 'extensões instaladas'}` : 'Nenhuma extensão instalada',
        'Extensões da Chrome Web Store, por perfil. A compatibilidade pode variar.',
        stButton('Gerenciar…', 'extensions') + stButton('Chrome Web Store', 'store', 'btn-primary')));
  },

  about() {
    const v = appInfo || {};
    const keys = [
      ['Ctrl+T', 'Nova aba'], ['Ctrl+W', 'Fechar aba'], ['Ctrl+L', 'Barra de endereço'], ['Ctrl+Tab', 'Próxima aba'],
      ['Alt+Z', 'Menu lateral'], ['Ctrl+D', 'Favoritar página'], ['Ctrl+Shift+D', 'Guardar na Lista de Leitura'],
      ['Ctrl+H', 'Histórico'], ['Ctrl+Shift+N', 'Modo privado'], ['Ctrl+,', 'Configurações'], ['Alt+V', 'Todas as abas'],
    ];
    return this.section('sobre', 'Sobre o Kona',
      stRow('<img class="st-logo" src="../assets/icon.svg" alt="" />Kona', `Versão ${escapeHtml(v.version || '—')} · Electron ${escapeHtml(v.electron || '—')} · Chromium ${escapeHtml(v.chrome || '—')}`, '') +
      `<div class="st-keys">${keys.map(([k, d]) => `<div><kbd>${k}</kbd><span>${d}</span></div>`).join('')}</div>`);
  },
};

/* ───────────── Interações da página ───────────── */
function afterSetting(key) {
  saveSettings();
  if (key === 'zoom') for (const t of tabs) t.wv?.setZoomFactor(settings.zoom);
  if (key === 'searchEngine' || key === 'suggestions') omnibox.cache.clear();
  if (key === 'sounds') { applySections(); if (settings.sounds) sfx.play('select'); }
  settingsPage.refresh();
}

$('#st-main').addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.set) {
    settings[el.dataset.set] = el.dataset.set === 'zoom' ? Number(el.value) : el.value;
    afterSetting(el.dataset.set);
  } else if (el.dataset.perm) {
    settings.permissions[el.dataset.perm] = el.value;
    afterSetting('permissions');
  } else if (el.dataset.site) {
    settings.sites[el.dataset.site][el.dataset.kind] = el.value;
    afterSetting('sites');
  }
});

$('#st-main').addEventListener('click', async (e) => {
  const sw = e.target.closest('[data-toggle]');
  if (sw) { const k = sw.dataset.toggle; settings[k] = !settings[k]; afterSetting(k); return; }
  const th = e.target.closest('[data-theme-set]');
  if (th) { settings.theme = th.dataset.themeSet; saveSettings(); applyTheme(true); settingsPage.refresh(); return; }
  const b = e.target.closest('[data-do]');
  if (!b) return;
  switch (b.dataset.do) {
    case 'customize': newTab(START, false); requestAnimationFrame(() => toggleCustomize(true)); break;
    case 'clear-data': openClearSheet({ historyOnly: false }); break;
    case 'sites': openSitesSheet(); break;
    case 'pick-folder': {
      const dir = await api?.pickFolder();
      if (dir) { settings.downloadDir = dir; afterSetting('downloadDir'); }
      break;
    }
    case 'reset-folder': settings.downloadDir = null; afterSetting('downloadDir'); break;
    case 'site-forget': delete settings.sites[b.dataset.origin]; afterSetting('sites'); break;
    case 'profile-use': switchProfile(b.dataset.id); break;
    case 'profile-edit': openProfileSheet('edit', b.dataset.id); break;
    case 'profile-new': openProfileSheet('new'); break;
    case 'extensions': openExtensions(); break;
    case 'store': newTab(STORE_URL, false); break;
    default:
  }
});
$('#st-nav').addEventListener('click', (e) => {
  const b = e.target.closest('[data-go]');
  if (b) settingsPage.scrollTo(b.dataset.go);
});
$('#sb-settings').addEventListener('click', () => openSettings());

/* ───────────── Dados de sites ───────────── */
let siteData = [];
async function openSitesSheet() {
  openSheet('#sites-sheet');
  $('#sites-q').value = '';
  $('#sites-list').innerHTML = '<p class="st-empty">Carregando…</p>';
  siteData = (await api?.sitesList(PROFILES.currentProfile().partition)) || [];
  renderSites();
}
function renderSites() {
  const q = $('#sites-q').value.trim().toLowerCase();
  const list = siteData.filter((s) => s.site.includes(q));
  $('#sites-count').textContent = `${siteData.length} ${siteData.length === 1 ? 'site' : 'sites'}`;
  $('#sites-list').innerHTML = list.length ? list.map((s) => `
    <div class="sb-row" data-site="${escapeHtml(s.site)}">
      <span class="sb-fav"><span class="mono">${escapeHtml(s.site[0].toUpperCase())}</span></span>
      <div class="sb-row-text"><b>${escapeHtml(s.site)}</b><span>${s.count} ${s.count === 1 ? 'cookie' : 'cookies'}</span></div>
      <button class="btn-link" data-remove-site="${escapeHtml(s.site)}">Remover</button>
    </div>`).join('')
    : `<p class="st-empty">${siteData.length ? 'Nenhum site combina com a busca.' : 'Nenhum site guarda cookies neste perfil.'}</p>`;
}
$('#sites-q').addEventListener('input', renderSites);
$('#sites-list').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-remove-site]');
  if (!b) return;
  await api?.sitesRemove(PROFILES.currentProfile().partition, b.dataset.removeSite);
  siteData = siteData.filter((s) => s.site !== b.dataset.removeSite);
  renderSites();
});
$('#sites-all').addEventListener('click', async () => {
  const yes = await ask({ title: 'Remover os dados de todos os sites?', text: 'Você sairá das contas em que está conectado neste perfil.', ok: 'Remover tudo', danger: true });
  if (!yes) return;
  await api?.clearBrowsingData(PROFILES.currentProfile().partition, { cookies: true });
  siteData = [];
  renderSites();
  openSheet('#sites-sheet');
});
$('#sites-close').addEventListener('click', () => closeSheet('#sites-sheet'));

/* ───────────── Pedido de permissão de um site ───────────── */
const permQueue = [];
let permCurrent = null;
function nextPerm() {
  if (permCurrent || !permQueue.length) return;
  permCurrent = permQueue.shift();
  const { origin, kinds } = permCurrent;
  const host = origin.replace(/^https?:\/\//, '');
  $('#perm-icon').innerHTML = icon(PERM_INFO[kinds[0]]?.ic || 'info');
  $('#perm-title').textContent = `“${host}” quer ${kinds.map((k) => PERM_INFO[k]?.verb || k).join(' e ')}`;
  $('#perm-text').textContent = permCurrent.private
    ? 'No modo privado, a resposta vale só para esta sessão.'
    : 'O Kona lembra a sua resposta. Dá para mudar depois em Configurações › Permissões de sites.';
  openSheet('#perm-sheet');
}
function answerPerm(allow) {
  if (!permCurrent) return;
  const { id, origin, kinds } = permCurrent;
  api?.permReply(id, allow);
  if (!permCurrent.private) {
    settings.sites[origin] ||= {};
    for (const k of kinds) settings.sites[origin][k] = allow ? 'allow' : 'block';
    saveSettings();
    settingsPage.refresh();
  }
  permCurrent = null;
  closeSheet('#perm-sheet');
  setTimeout(nextPerm, 250);
}
api?.on('perm:ask', (req) => { permQueue.push(req); nextPerm(); });
$('#perm-yes').addEventListener('click', () => answerPerm(true));
$('#perm-no').addEventListener('click', () => answerPerm(false));

/* ───────────── Downloads ───────────── */
api?.on('download:start', ({ name }) => toast(`Baixando “${name}”…`));
api?.on('download:done', ({ name, path, state }) => {
  if (state === 'completed') toast(`“${name}” baixado`, { label: 'Mostrar na pasta', run: () => api.showDownload(path) });
  else if (state === 'cancelled') toast('Download cancelado');
  else toast(`Não foi possível baixar “${name}”`);
});

hydrateIcons($('#perm-sheet'));
if (active()?.url === SETTINGS) settingsPage.render();
