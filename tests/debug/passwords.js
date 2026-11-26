// L4: gerenciador de senhas — salvar ao entrar (balão), preencher pela lista sob o campo, senha forte
// em cadastro (salva sozinha), "Never" num site, Settings → Passwords. Não chama o Windows Hello.
const os = require('os'); const fs = require('fs'); const path = require('path'); const http = require('http');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-pw-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow, webContents } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = path.join(__dirname, '..', 'output-windows', 'passwords'); fs.mkdirSync(OUT, { recursive: true });
const page = (body) => `<!doctype html><html><head><meta charset="utf-8"><title>t</title></head><body style="font:15px sans-serif;margin:40px">${body}</body></html>`;
const LOGIN = page(`<h1>Sign in</h1><form method="post" action="/welcome"><p><input id="u" name="email" type="email" autocomplete="username" placeholder="Email"></p><p><input id="p" name="password" type="password" autocomplete="current-password" placeholder="Password"></p><button>Sign in</button></form>`);
const SIGNUP = page(`<h1>Create account</h1><form method="post" action="/welcome"><p><input id="u" name="username" placeholder="Username"></p><p><input id="p" type="password" autocomplete="new-password" placeholder="Password"></p><p><input id="p2" type="password" autocomplete="new-password" placeholder="Confirm password"></p><button>Sign up</button></form>`);
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(req.url.startsWith('/welcome') ? page('<h1>Welcome</h1>') : req.url.startsWith('/signup') ? SIGNUP : LOGIN);
});
app.whenReady().then(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let wc; while (!(wc = BrowserWindow.getAllWindows()[0]?.webContents)) await sleep(50);
  await sleep(3500);
  wc.on('console-message', (e) => { if (e.level === 'error' || /Uncaught/.test(e.message)) console.log('C erro:', e.message); });
  const js = (c) => wc.executeJavaScript(c);
  const log = (...a) => console.log('R', ...a);
  const shot = async (n) => { await sleep(300); fs.writeFileSync(path.join(OUT, n), (await wc.capturePage()).toPNG()); };
  const until = async (c, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await js(c)) return true; await sleep(150); } return false; };
  const guest = async (prefix) => { for (let i = 0; i < 60; i++) { const g = webContents.getAllWebContents().find((w) => w.getType() === 'webview' && w.getURL().startsWith(prefix)); if (g) return g; await sleep(100); } return null; };
  const clickIn = async (g, sel) => {
    const p = await g.executeJavaScript(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: Math.round(r.x + 20), y: Math.round(r.y + r.height / 2) }; })()`);
    g.sendInputEvent({ type: 'mouseDown', ...p, button: 'left', clickCount: 1 }); g.sendInputEvent({ type: 'mouseUp', ...p, button: 'left', clickCount: 1 });
    await sleep(300);
  };
  const typeIn = async (g, sel, text) => { await g.executeJavaScript(`document.querySelector(${JSON.stringify(sel)}).focus(); 0`); for (const ch of text) { g.sendInputEvent({ type: 'char', keyCode: ch }); await sleep(10); } };
  await js(`settings.sounds = false; navigate(active(), ${JSON.stringify(base + '/login')}); 0`);
  let g = await guest(base + '/login'); await sleep(1200); g.focus();

  // 1. entrar → balão "Save password?"
  await typeIn(g, '#u', 'ruben@example.com'); await typeIn(g, '#p', 'S3cret-pass!');
  g.sendInputEvent({ type: 'keyDown', keyCode: 'Return' }); g.sendInputEvent({ type: 'char', keyCode: '\r' }); g.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
  log('balão apareceu:', await until(`document.querySelector('#pw-bubble').classList.contains('show')`), '·', await js(`document.querySelector('#pw-bubble')?.innerText.replace(/\\s+/g, ' ').slice(0, 90)`), '· usuário:', await js(`document.querySelector('#pwb-user')?.value`));
  await shot('save-bubble.png');
  await js(`document.querySelector('#pw-bubble [data-pwb="save"]').click(); 0`); await sleep(600);
  log('salva:', JSON.stringify((await js(`api.pw.list()`)).entries.map((e) => e.host + ' / ' + e.username)), '· arquivo sem a senha em texto:', !fs.readFileSync(path.join(process.env.KONA_USER_DATA, 'passwords', 'persist_kona.json'), 'utf8').includes('S3cret'));

  // 2. voltar ao login → lista sob o campo → preencher
  await js(`navigate(active(), ${JSON.stringify(base + '/login')}); 0`); await sleep(1500);
  g = await guest(base + '/login'); g.focus();
  await clickIn(g, '#u');
  log('lista sob o campo:', await until(`document.querySelector('#pw-suggest').classList.contains('show')`), '·', await js(`[...document.querySelectorAll('#pw-suggest .pw-opt b')].map((b) => b.textContent).join(' | ')`));
  await shot('suggest.png');
  await js(`document.querySelector('#pw-suggest [data-acc]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); document.querySelector('#pw-suggest [data-acc]').click(); 0`); await sleep(600);
  log('preencheu:', JSON.stringify(await g.executeJavaScript(`({ u: document.querySelector('#u').value, p: document.querySelector('#p').value === 'S3cret-pass!' })`)));

  // 3. cadastro → senha forte sugerida → salva sozinha ao enviar
  await js(`navigate(active(), ${JSON.stringify(base + '/signup')}); 0`); await sleep(1500);
  g = await guest(base + '/signup'); g.focus();
  await typeIn(g, '#u', 'newuser');
  await clickIn(g, '#p');
  log('sugere senha forte:', await until(`!!document.querySelector('#pw-suggest.show [data-gen]')`), '·', await js(`document.querySelector('#pw-suggest .pw-mono')?.textContent`));
  await shot('generate.png');
  await js(`document.querySelector('#pw-suggest [data-gen]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); document.querySelector('#pw-suggest [data-gen]').click(); 0`); await sleep(600);
  log('preencheu senha e confirmação iguais:', await g.executeJavaScript(`document.querySelector('#p').value.length >= 15 && document.querySelector('#p').value === document.querySelector('#p2').value`));
  await g.executeJavaScript(`document.querySelector('form').requestSubmit(); 0`);
  await sleep(2500);
  log('salva sozinha:', JSON.stringify((await js(`api.pw.list()`)).entries.map((e) => e.username)), '· aviso:', await js(`document.querySelector('#toast').textContent`));

  // 4. "Never" num site: não oferece de novo
  await js(`navigate(active(), ${JSON.stringify(base.replace('127.0.0.1', 'localhost') + '/login')}); 0`); await sleep(1500);
  g = await guest(base.replace('127.0.0.1', 'localhost') + '/login'); g.focus();
  await typeIn(g, '#u', 'x@y.com'); await typeIn(g, '#p', 'abc12345');
  await g.executeJavaScript(`document.querySelector('form').requestSubmit(); 0`);
  await until(`document.querySelector('#pw-bubble').classList.contains('show')`);
  await js(`document.querySelector('#pw-bubble [data-pwb="never"]').click(); 0`); await sleep(500);
  await js(`navigate(active(), ${JSON.stringify(base.replace('127.0.0.1', 'localhost') + '/login')}); 0`); await sleep(1500);
  g = await guest(base.replace('127.0.0.1', 'localhost') + '/login'); g.focus();
  await typeIn(g, '#u', 'x@y.com'); await typeIn(g, '#p', 'abc12345');
  await g.executeJavaScript(`document.querySelector('form').requestSubmit(); 0`);
  await sleep(3000);
  log('depois de "Never", não pergunta:', !(await js(`document.querySelector('#pw-bubble').classList.contains('show')`)), '· lista "nunca":', JSON.stringify((await js(`api.pw.list()`)).never));

  // 5. Settings → Passwords
  await js(`openPasswordSheet(); 0`); await sleep(700);
  log('tela de senhas:', await js(`document.querySelector('#pw-count').textContent + ' · ' + [...document.querySelectorAll('#pw-list .pw-row:not(.never) .sb-row-text')].map((x) => x.innerText.replace(/\\s+/g, ' ')).join(' | ')`));
  await shot('manage.png');
  server.close();
  app.exit(0);
});
