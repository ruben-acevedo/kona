// Diagnóstico: a primeira busca no Google com um perfil novo cai na verificação "não sou um robô"?
// KONA_CAP_MODE=typed  → digita na barra de endereço (com as sugestões, como a pessoa faz) e Enter
// KONA_CAP_MODE=direct → abre a busca direto, sem digitar (sem sugestões)
// Usa poucas buscas de propósito: muitas seguidas do mesmo IP provocam a verificação de verdade.
const os = require('os'); const path = require('path');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-cap-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow, webContents, session } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MODE = process.env.KONA_CAP_MODE || 'typed';
const QUERY = process.env.KONA_CAP_QUERY || 'receita de bolo de cenoura';
const START_URL = 'kona://start';
app.whenReady().then(async () => {
  let wc; while (!(wc = BrowserWindow.getAllWindows()[0]?.webContents)) await sleep(50);
  await sleep(3500);
  const js = (c) => wc.executeJavaScript(c);
  const log = (...a) => console.log('R', ...a);
  // registra os pedidos feitos ao Google (sugestões e navegação), com os cabeçalhos
  const ses = session.fromPartition('persist:kona');
  const seen = [];
  const watch = (s) => s.webRequest.onSendHeaders({ urls: ['https://*.google.com/*', 'https://suggestqueries.google.com/*'] }, (d) => {
    seen.push({ t: Date.now(), type: d.resourceType, url: d.url.slice(0, 90), h: Object.keys(d.requestHeaders).map((k) => k.toLowerCase()).sort().join(',') });
  });
  watch(ses); watch(session.fromPartition('kona-suggest'));
  await js(`settings.sounds = false; 0`);
  if (MODE === 'typed') {
    await js(`focusAddress(); 0`); await sleep(400);
    for (const ch of QUERY) { wc.sendInputEvent({ type: 'char', keyCode: ch }); await sleep(90); }
    await sleep(600);
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' }); wc.sendInputEvent({ type: 'char', keyCode: '\r' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
    await sleep(500);
    // se o Enter simulado não chegou ao campo, envia o formulário como o Enter faria
    if ((await js(`active().url`)) === START_URL) await js(`document.querySelector('#tabs .tab.active form').requestSubmit(); 0`);
  } else {
    await js(`navigate(active(), searchUrl(${JSON.stringify(QUERY)})); 0`);
  }
  await sleep(1500);
  log('aba ativa depois do Enter:', await js(`active().url`));
  let guest; for (let i = 0; i < 80 && !guest; i++) { guest = webContents.getAllWebContents().find((w) => w.getType() === 'webview' && /google\./.test(w.getURL())); await sleep(100); }
  await sleep(5000);
  const url = guest?.getURL() || '(sem aba)';
  const text = guest ? await guest.executeJavaScript(`document.body ? document.body.innerText.slice(0, 300) : ''`).catch(() => '') : '';
  const robot = /\/sorry\//.test(url) || /unusual traffic|tráfego incomum|not a robot|não sou um robô/i.test(text);
  log(`modo ${MODE} · verificação de robô: ${robot ? 'SIM' : 'não'} · ${url.slice(0, 100)}`);
  const sugg = seen.filter((s) => s.url.includes('suggestqueries'));
  log(`pedidos de sugestão: ${sugg.length}${sugg[0] ? ` · cabeçalhos: ${sugg[0].h}` : ''}`);
  const nav = seen.find((s) => s.type === 'mainFrame');
  if (nav) log(`navegação: cabeçalhos: ${nav.h}`);
  log('cookies do Google no perfil depois da busca:', (await ses.cookies.get({ domain: 'google.com' })).map((c) => c.name).join(', ') || 'nenhum');
  log('cookies na sessão das sugestões:', (await session.fromPartition('kona-suggest').cookies.get({})).length);
  if (robot) log('texto:', text.replace(/\s+/g, ' ').slice(0, 160));
  app.exit(0);
});
