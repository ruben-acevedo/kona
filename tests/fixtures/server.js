// Servidor local com páginas de teste determinísticas (sem depender da internet).
const http = require('http');

const WORDS = ('navegador janela página texto rolagem desempenho camada vidro desfoque aba barra '
  + 'conteúdo leitura parágrafo tipografia movimento quadro animação interface usuário sistema '
  + 'memória processo cor tema fundo transição suave elegante rápido leve estável').split(' ');

// Gerador pseudoaleatório fixo: o texto é sempre o mesmo entre execuções
function rng(seed) {
  return () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

function paragraph(rand, n = 70) {
  const w = Array.from({ length: n }, () => WORDS[Math.floor(rand() * WORDS.length)]);
  w[0] = w[0][0].toUpperCase() + w[0].slice(1);
  return w.join(' ') + '.';
}

const page = (title, body, head = '') => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">${head}</head>
<body>${body}</body></html>`;

function textPage() {
  const rand = rng(42);
  let body = '';
  for (let s = 1; s <= 12; s++) {
    body += `<h2 id="s${s}">Seção ${s}</h2>`;
    for (let p = 0; p < 6; p++) body += `<p>${paragraph(rand)}</p>`;
    if (s % 3 === 0) body += `<figure><div class="fig"></div><figcaption>Figura ${s / 3}</figcaption></figure>`;
  }
  return page('Artigo de teste', `
    <header id="sticky">Kona · artigo de teste</header>
    <main><h1>Um artigo longo para medir rolagem</h1>${body}</main>`, `
    <meta name="theme-color" content="#f4efe6">
    <style>
      body { margin: 0; font: 17px/1.65 Georgia, serif; color: #222; background: #fff; }
      #sticky { position: sticky; top: 0; height: 48px; display: flex; align-items: center; padding: 0 24px;
                background: #1f3b5a; color: #fff; font: 600 15px system-ui; z-index: 5; }
      main { max-width: 720px; margin: 0 auto; padding: 24px; }
      .fig { height: 220px; border-radius: 12px; background: linear-gradient(135deg, #9ec5ff, #f7c2e1); }
      figcaption { font-size: 13px; color: #666; }
    </style>`);
}

function heavyPage() {
  const rand = rng(7);
  let cards = '';
  for (let i = 0; i < 360; i++) {
    const h = Math.floor(rand() * 360);
    cards += `<div class="card" style="--h:${h}"><div class="img"></div><b>Cartão ${i + 1}</b><p>${paragraph(rand, 18)}</p>${i % 12 === 0 ? '<i class="spin"></i>' : ''}</div>`;
  }
  return page('Página pesada', `<h1>Página pesada</h1><canvas id="c" width="900" height="160"></canvas><div class="grid">${cards}</div>
    <script>
      const c = document.getElementById('c').getContext('2d'); let t = 0;
      (function draw() { t += 0.03; c.clearRect(0, 0, 900, 160);
        for (let i = 0; i < 60; i++) { c.fillStyle = 'hsl(' + (i * 6 + t * 40) % 360 + ',70%,60%)';
          c.beginPath(); c.arc(15 + i * 15, 80 + Math.sin(t + i / 4) * 50, 6, 0, 7); c.fill(); }
        requestAnimationFrame(draw); })();
    </script>`, `
    <style>
      body { margin: 0; padding: 20px; font: 14px system-ui; background: #f3f3f6; }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
      .card { position: relative; background: #fff; border-radius: 16px; padding: 12px;
              box-shadow: 0 1px 2px rgba(0,0,0,.08), 0 8px 24px rgba(0,0,0,.08); }
      .img { height: 110px; border-radius: 10px; background: linear-gradient(135deg, hsl(var(--h),70%,70%), hsl(calc(var(--h) + 60),70%,55%)); }
      .spin { position: absolute; top: 18px; right: 18px; width: 20px; height: 20px; border-radius: 50%;
              border: 3px solid rgba(255,255,255,.4); border-top-color: #fff; animation: r 1s linear infinite; }
      @keyframes r { to { transform: rotate(360deg); } }
    </style>`);
}

const fixedPage = () => page('Cabeçalho fixo', `
  <header id="fixed">Menu fixo do site</header>
  <main>${Array.from({ length: 40 }, (_, i) => `<p>Linha ${i + 1} do conteúdo.</p>`).join('')}</main>`, `
  <style>
    body { margin: 0; font: 15px system-ui; }
    #fixed { position: fixed; top: 0; left: 0; right: 0; height: 56px; background: #c0392b; color: #fff;
             display: flex; align-items: center; padding: 0 20px; z-index: 10; }
    main { padding: 70px 20px 20px; }
  </style>`);

const popupPage = () => page('Popup', `<button id="open" onclick="window.open('/text')">Abrir janela</button>`);

// Sugestões falsas no formato do Google (client=firefox): [consulta, [sugestões]]
function suggestRoute(url) {
  const q = new URL(url, 'http://x').searchParams.get('q') || '';
  return JSON.stringify([q, [`${q} tutorial`, `${q} significado`, `${q} 2026`, `${q} download`]]);
}

const ROUTES = {
  '/text': textPage,
  '/heavy': heavyPage,
  '/fixed': fixedPage,
  '/popup': popupPage,
  '/blank': () => page('Em branco', ''),
  '/geo': () => page('Localização', '<p>Página que pede a localização.</p>'),
};

module.exports = function startServer() {
  return new Promise((resolve) => {
    const cache = {};
    const srv = http.createServer((req, res) => {
      // Páginas dinâmicas das Configurações (cookies de terceiros, GPC, permissão, download)
      const port = srv.address().port;
      const u = req.url.split('?')[0];
      if (u === '/setcookie') {
        res.writeHead(200, { 'content-type': 'image/svg+xml', 'set-cookie': 'kona_tp=1; Path=/; Max-Age=3600; SameSite=None; Secure', 'cache-control': 'no-store' });
        res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');
        return;
      }
      if (u === '/3p') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(page('Terceiros', `<p>Imagem de outro site:</p><img id="tp" src="http://localhost:${port}/setcookie?${Date.now()}">`));
        return;
      }
      if (u === '/echo') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(page('Eco', `<pre id="h">${JSON.stringify(req.headers).replace(/</g, '&lt;')}</pre>`));
        return;
      }
      if (u === '/file.txt') {
        res.writeHead(200, { 'content-type': 'text/plain', 'content-disposition': 'attachment; filename="kona-teste.txt"' });
        res.end('arquivo de teste do Kona\n');
        return;
      }
      if (req.url.startsWith('/complete/search')) {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(suggestRoute(req.url));
        return;
      }
      const route = ROUTES[req.url.split('?')[0]];
      if (!route) { res.writeHead(404); res.end('404'); return; }
      cache[req.url] ??= route();
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(cache[req.url]);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, base: `http://127.0.0.1:${srv.address().port}` }));
  });
};
