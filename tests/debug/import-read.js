// G2: o que a importação encontra nos navegadores desta máquina (só lê; não muda nada).
const { app } = require('electron');
const { sources, read } = require('../../importer.js');
console.log('R início');
app.whenReady().then(() => {
  console.log('R pronto');
  const list = sources();
  console.log('R fontes:', JSON.stringify(list.map(({ id, browser, profile }) => ({ id, browser, profile }))));
  for (const s of list) {
    const t0 = Date.now();
    const r = read(s.id);
    const folders = (l) => l.filter((b) => b.folder).map((b) => `${b.title}(${b.children.length})`);
    console.log('R', s.id, `· ${Date.now() - t0} ms`);
    console.log('R   favoritos:', r.bookmarkCount, '· nível principal:', r.bookmarks.length, '· pastas:', folders(r.bookmarks).join(', '));
    console.log('R   histórico:', r.history.visits.length, 'sites ·', r.history.searches.length, 'buscas · mais recente:', new Date(r.history.visits[0]?.t || 0).toISOString());
    console.log('R   extensões:', r.extensions.map((e) => `${e.name}${e.enabled ? '' : ' (desligada)'}${e.icon ? '' : ' [sem ícone]'}`).join(' | '));
    if (r.errors.length) console.log('R   erros:', r.errors.join('; '));
  }
  app.exit(0);
});
