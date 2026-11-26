// N9: endereços e cartões — oferecer salvar ao enviar, preencher pela lista, Windows Hello antes do
// cartão (trocado por um falso aqui, para não abrir o de verdade), CVV nunca salvo, número
// criptografado no disco, formulário sem marcações (rótulos em português), cartão só em https,
// nada salvo no modo privado. Capturas do balão, da lista e da seção nas Configurações.
// Precisa do certificado de teste: openssl req -x509 -newkey rsa:2048 -nodes -keyout tests/fixtures/tls/key.pem
//   -out tests/fixtures/tls/cert.pem -days 3650 -subj "/CN=localhost" -addext "subjectAltName=IP:127.0.0.1"
const os = require('os'); const path = require('path'); const https = require('https'); const http = require('http'); const fs = require('fs');
const DATA = path.join(os.tmpdir(), `kona-autofill-${process.pid}`);
process.env.KONA_USER_DATA = DATA;
require('../../main.js');
const passwords = require('../../passwords');
let helloCalls = 0;
passwords.verifyUser = async () => { helloCalls++; return true; }; // Windows Hello falso (só neste teste)
const { app, BrowserWindow, webContents } = require('electron');
app.on('certificate-error', (e, _wc, url, _err, _cert, cb) => { if (url.startsWith('https://127.0.0.1')) { e.preventDefault(); cb(true); } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('R', ...a);
const OUT = path.join(os.tmpdir(), 'kona-autofill-shots');
fs.mkdirSync(OUT, { recursive: true });

const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map((m) => `<option value="${m}">${m}</option>`).join('');
const years = Array.from({ length: 10 }, (_, i) => 2026 + i).map((y) => `<option value="${y}">${y}</option>`).join('');
const CHECKOUT = `<!doctype html><title>Checkout</title><body style="font:14px sans-serif;margin:30px">
<form id="addr" action="/done"><h3>Entrega</h3>
 <input id="fullname" autocomplete="name"> <input id="rua" autocomplete="address-line1"> <input id="num" name="numero" placeholder="Número">
 <input id="comp" autocomplete="address-line2"> <label for="bairro">Bairro</label><input id="bairro" name="bairro">
 <input id="city" autocomplete="address-level2">
 <select id="uf" autocomplete="address-level1"><option value="">--</option><option value="SP">São Paulo</option><option value="RJ">Rio de Janeiro</option></select>
 <input id="cep" autocomplete="postal-code"> <input id="tel" type="tel" autocomplete="tel"> <input id="email" type="email" autocomplete="email">
 <button id="addr-go">Continuar</button></form>
<form id="card" action="/done"><h3>Pagamento</h3>
 <input id="ccname" autocomplete="cc-name"> <input id="ccnum" autocomplete="cc-number">
 <select id="ccm" autocomplete="cc-exp-month"><option value="">MM</option>${months}</select>
 <select id="ccy" autocomplete="cc-exp-year"><option value="">AAAA</option>${years}</select>
 <input id="cvc" autocomplete="cc-csc"> <button id="card-go">Pagar</button></form>`;
const NOLABELS = `<!doctype html><title>Cadastro</title><body style="font:14px sans-serif;margin:30px"><form action="/done">
 <label>Nome completo <input name="nome_completo" id="n"></label> <label for="c">CEP</label><input id="c" name="zip_code">
 <label>Rua <input name="logradouro" id="r"></label> <label>Número <input name="numero" id="nu"></label>
 <label>Bairro <input name="bairro" id="b"></label> <label>Cidade <input name="cidade" id="ci"></label>
 <label>Estado <input name="estado" id="e"></label> <button>Enviar</button></form>`;
const handler = (req, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(req.url.startsWith('/checkout') ? CHECKOUT : req.url.startsWith('/nolabels') ? NOLABELS : '<title>Done</title>ok'); };
const tls = { key: fs.readFileSync(path.join(__dirname, '../fixtures/tls/key.pem')), cert: fs.readFileSync(path.join(__dirname, '../fixtures/tls/cert.pem')) };
const server = https.createServer(tls, handler);
const plain = http.createServer(handler);

app.whenReady().then(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  await new Promise((r) => plain.listen(0, '127.0.0.1', r));
  const base = `https://127.0.0.1:${server.address().port}`;
  const httpBase = `http://127.0.0.1:${plain.address().port}`;
  let w; while (!(w = BrowserWindow.getAllWindows()[0])) await sleep(50);
  await sleep(3000);
  const js = (c) => w.webContents.executeJavaScript(c);
  await js("settings.sounds = false; setLanguage('pt-BR'); 0");
  const guest = async (url) => {
    await js(`navigate(active(), ${JSON.stringify(url)}); 0`);
    for (let i = 0; i < 50; i++) { const g = webContents.getAllWebContents().find((c) => c.getType() === 'webview' && c.getURL() === url && !c.isLoading()); if (g) { await sleep(400); return g; } await sleep(100); }
    throw new Error(`não carregou ${url}`);
  };
  const type = (g, values) => g.executeJavaScript(`(() => { for (const [id, v] of Object.entries(${JSON.stringify(values)})) { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
  const bubble = async () => { for (let i = 0; i < 40; i++) { if (await js("document.querySelector('#af-bubble').classList.contains('show')")) return js("document.querySelector('#af-bubble').innerText.replace(/\\s+/g, ' ').trim()"); await sleep(150); } return null; };
  const suggest = async (g, id) => {
    // clique de verdade no campo (focar por script, sem a página ter o foco, não dispara o evento)
    w.focus(); g.focus();
    await g.executeJavaScript('document.activeElement?.blur(); 0');
    const p = await g.executeJavaScript(`(() => { const r = document.getElementById('${id}').getBoundingClientRect(); return { x: Math.round(r.x + 8), y: Math.round(r.y + r.height / 2) }; })()`);
    g.sendInputEvent({ type: 'mouseDown', ...p, button: 'left', clickCount: 1 }); g.sendInputEvent({ type: 'mouseUp', ...p, button: 'left', clickCount: 1 });
    for (let i = 0; i < 30; i++) { if (await js("document.querySelector('#af-suggest').classList.contains('show')")) return js("[...document.querySelectorAll('#af-suggest .pw-opt')].map((o) => o.innerText.replace(/\\s+/g, ' ').trim()).join(' | ')"); await sleep(100); }
    return null;
  };
  // clique de mouse de verdade na janela (a página perde o foco e o recebe de volta, como com a pessoa)
  const pickFirst = async () => {
    const o = await js("(() => { const r = document.querySelector('#af-suggest .pw-opt[data-af]').getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()");
    w.webContents.sendInputEvent({ type: 'mouseDown', ...o, button: 'left', clickCount: 1 }); w.webContents.sendInputEvent({ type: 'mouseUp', ...o, button: 'left', clickCount: 1 });
  };
  const stayedClosed = async () => { await sleep(1500); return !(await js("document.querySelector('#af-suggest').classList.contains('show')")); };
  const values = (g, ids) => g.executeJavaScript(`JSON.stringify(Object.fromEntries(${JSON.stringify(ids)}.map((id) => [id, document.getElementById(id).value])))`);

  // 1) enviar um endereço → "Salvar endereço?"
  let g = await guest(`${base}/checkout`);
  await type(g, { fullname: 'Ana Souza', rua: 'Rua das Flores', num: '120', comp: 'Apto 3', bairro: 'Centro', city: 'São Paulo', cep: '01001-000', tel: '11 99999-0000', email: 'ana@example.com' });
  await g.executeJavaScript("document.getElementById('uf').value = 'SP'; document.getElementById('addr').requestSubmit(); 0");
  log('enviou endereço → balão:', await bubble());
  fs.writeFileSync(path.join(OUT, 'bubble-address.png'), (await w.webContents.capturePage()).toPNG());
  await js("document.querySelector('#af-bubble [data-afb=save]').click(); 0"); await sleep(600);
  log('   salvo → endereços:', await js("afState.list.addresses.map((a) => a.name + ' / ' + a.street + ', ' + a.number + ' / ' + a.neighborhood + ' / ' + a.state).join(' ; ')"));

  // 2) enviar um cartão (com CVV) → "Salvar cartão?"
  g = await guest(`${base}/checkout`);
  await type(g, { ccname: 'ANA SOUZA', ccnum: '4242 4242 4242 4242', cvc: '123' });
  await g.executeJavaScript("document.getElementById('ccm').value = '08'; document.getElementById('ccy').value = '2030'; document.getElementById('card').requestSubmit(); 0");
  log('enviou cartão → balão:', await bubble());
  fs.writeFileSync(path.join(OUT, 'bubble-card.png'), (await w.webContents.capturePage()).toPNG());
  await js("document.querySelector('#af-bubble [data-afb=save]').click(); 0"); await sleep(600);
  log('   salvo → cartões:', await js("JSON.stringify(afState.list.cards)"));
  const file = fs.readFileSync(path.join(DATA, 'autofill', 'persist_kona.json'), 'utf8');
  log('   no disco: número aberto?', file.includes('4242424242424242'), '· CVV?', /"123"|cvc|csc/.test(file));

  // 3) preencher o endereço pela lista
  g = await guest(`${base}/checkout`);
  log('foco no nome → lista:', await suggest(g, 'fullname'));
  fs.writeFileSync(path.join(OUT, 'suggest-address.png'), (await w.webContents.capturePage()).toPNG());
  await pickFirst(); await sleep(600);
  log('   preenchido:', await values(g, ['fullname', 'rua', 'num', 'comp', 'bairro', 'city', 'uf', 'cep', 'tel', 'email']), '· lista fechou e continuou fechada:', await stayedClosed());

  // 4) preencher o cartão (Windows Hello antes)
  const before = helloCalls;
  log('foco no número do cartão → lista:', await suggest(g, 'ccnum'));
  await pickFirst(); await sleep(800);
  log('   preenchido:', await values(g, ['ccname', 'ccnum', 'ccm', 'ccy', 'cvc']), '· Windows Hello pedido:', helloCalls - before, 'vez · lista fechou e continuou fechada:', await stayedClosed());

  // 5) cartão em http: não preenche
  g = await guest(`${httpBase}/checkout`);
  log('http: foco no cartão → lista:', await suggest(g, 'ccnum'));
  await pickFirst(); await sleep(600);
  log('   número preenchido em http?', !!JSON.parse(await values(g, ['ccnum'])).ccnum, '· aviso:', await js("document.querySelector('#toast').textContent"));

  // 6) formulário sem marcações (rótulos em português)
  g = await guest(`${base}/nolabels`);
  log('sem marcações: foco no nome → lista:', await suggest(g, 'n'));
  await pickFirst(); await sleep(600);
  log('   preenchido:', await values(g, ['n', 'c', 'r', 'nu', 'b', 'ci', 'e']));

  // 7) modo privado: nada é salvo
  await js("library.switchTo('private'); 0"); await sleep(1200);
  g = await guest(`${base}/checkout`);
  await type(g, { fullname: 'Outra Pessoa', rua: 'Rua Nova', num: '9', city: 'Rio', cep: '20000-000' });
  await g.executeJavaScript("document.getElementById('addr').requestSubmit(); 0");
  log('modo privado: balão apareceu?', !!(await bubble()));
  await js("library.switchTo('default'); 0"); await sleep(1200);

  // 8) Configurações
  await js("openSettings('enderecos'); 0"); await sleep(1200);
  await js("settingsPage.scrollTo('enderecos'); 0"); await sleep(900);
  fs.writeFileSync(path.join(OUT, 'settings.png'), (await w.webContents.capturePage()).toPNG());
  log('Configurações: seção:', await js("document.querySelector('#st-enderecos h2').textContent"), '· itens:', await js("[...document.querySelectorAll('#st-enderecos .af-row b')].map((b) => b.textContent).join(' | ')"));
  await js("document.querySelector('#st-enderecos [data-do=af-add][data-kind=card]').click(); 0"); await sleep(700);
  fs.writeFileSync(path.join(OUT, 'editor-card.png'), (await w.webContents.capturePage()).toPNG());
  log('capturas em:', OUT);
  server.close(); plain.close(); app.exit(0);
});
