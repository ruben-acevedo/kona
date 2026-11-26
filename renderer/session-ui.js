'use strict';
// Recuperar a sessão (N6), na interface:
// - na abertura depois de um travamento: barra "O Kona não fechou corretamente · Restaurar abas"
//   (com "Restore tabs" ligado, restaura direto);
// - janela reaberta (ou interface recarregada depois de travar): as abas dela voltam;
// - aba cuja página travou: aviso no lugar da página, com "Recarregar";
// - página que parou de responder: "Esperar" ou "Fechar página".

const restoreBar = { open: false, data: null };

/** Abas guardadas → esta janela. Uma janela só com a nova aba vazia é trocada; senão, as abas entram no fim. */
function openRecoveredTabs(snap) {
  const list = (snap?.tabs || []).filter((x) => x?.url);
  if (!list.length || library.isPrivate()) return;
  const own = tabs.filter((t) => !t.pinned);
  const fresh = own.length === 1 && own[0].url === START && !own[0].wv;
  if (fresh) { library.openSnapshot({ tabs: list, active: snap.active || 0 }); return; }
  const first = tabs.length;
  for (const s of list) makeTab(s.url, { title: s.title });
  activate(tabs[Math.min(first + (snap.active || 0), tabs.length - 1)].id);
  prewarmTabs();
}

async function restoreSession() {
  const data = restoreBar.data;
  closeRestoreBar();
  if (!data) return;
  const [mine] = data.windows;
  // a janela principal: um grupo já voltou sozinho (fica guardado), e com "Restore tabs" as abas
  // sem grupo também; senão elas entram aqui
  if (mine && mine.set === 'default' && settings.startup !== 'restore') openRecoveredTabs(mine);
  await api?.sessionRestore();
  sfx.play('select');
}

function closeRestoreBar() {
  if (!restoreBar.open) return;
  restoreBar.open = false;
  document.body.classList.remove('infobar-on');
  if (typeof checkDefault === 'function') setTimeout(checkDefault, 400);
}

function showRestoreBar() {
  restoreBar.open = true;
  $('#ib-text').textContent = tl('Kona didn’t close properly.');
  $('#ib-yes').textContent = tl('Restore tabs');
  document.body.classList.add('infobar-on');
}
$('#ib-yes').addEventListener('click', () => { if (restoreBar.open) restoreSession(); });
$('#ib-close').addEventListener('click', () => {
  if (!restoreBar.open) return;
  sfx.play('close');
  restoreBar.data = null;
  api?.sessionDismiss();
  closeRestoreBar();
});

// Abertura: só a 1ª janela pergunta (as outras são reabertas pelo processo principal)
(async () => {
  if (!library.primary || params.get('role') === 'secondary') return;
  const r = await api?.sessionRecovery?.();
  if (!r?.crashed || !r.windows?.length) return;
  restoreBar.data = r;
  if (settings.startup === 'restore') restoreSession();
  else showRestoreBar();
})();

// Janela reaberta depois de um travamento, ou interface recarregada: as abas que ela tinha
api?.on('session:restore-tabs', (snap) => {
  // a principal num grupo: o grupo já voltou pela sessão guardada
  if (library.primary && snap?.set && snap.set !== 'default') return;
  openRecoveredTabs(snap);
});

/* ───────────── Aba que travou ───────────── */
const tabByWcId = (id) => tabs.find((t) => { try { return t.wv?.getWebContentsId() === id; } catch { return false; } });
function paintCrash() {
  const a = active();
  $('#crash-pane').hidden = !a?.crashed;
}
api?.on('tab:crashed', ({ id }) => {
  const t = tabByWcId(id);
  if (!t) return;
  t.crashed = true;
  t.loading = false;
  render();
  paintCrash();
});
$('#crash-reload').addEventListener('click', () => {
  const t = active();
  if (!t?.crashed) return;
  t.crashed = false;
  paintCrash();
  // o processo da página acabou: a aba renasce no mesmo endereço
  t.wv?.remove();
  t.wv = null;
  ensureWebview(t);
  render();
});
library.onChange((what) => { if (what === 'tabs') paintCrash(); });

/* ───────────── Página que parou de responder ───────────── */
let hungTab = null;
api?.on('tab:responsive', async ({ id, ok }) => {
  const t = tabByWcId(id);
  if (!t) return;
  if (ok) {
    // voltou a responder: o aviso some sozinho
    if (hungTab === t && $('#ask-sheet').classList.contains('show')) answerAsk(false);
    return;
  }
  if (hungTab) return;
  hungTab = t;
  activate(t.id);
  const close = await ask({
    title: tl('The page isn’t responding'),
    text: tl('You can wait for {host} to respond or close the page.', { host: hostOf(t.url) }),
    ok: tl('Close page'),
    cancel: tl('Wait'),
    danger: true,
  });
  hungTab = null;
  if (!close || !tabs.includes(t)) return;
  try { await api?.tabKill(t.wv.getWebContentsId()); } catch { /* já fechou */ }
  closeTab(t.id, { force: true });
});

hydrateIcons($('#crash-pane'));
