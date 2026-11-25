// Servidor que devolve (e imprime) os cabeçalhos recebidos — para inspecionar a identidade do navegador.
const http = require('http');
http.createServer((req, res) => {
  console.log('HEADERS', JSON.stringify(req.headers));
  res.writeHead(200, { 'content-type': 'text/html', 'accept-ch': 'Sec-CH-UA-Platform-Version, Sec-CH-UA-Full-Version-List, Sec-CH-UA-Arch, Sec-CH-UA-Model, Sec-CH-UA-Bitness' });
  res.end('<!doctype html><title>eco</title><p>ok</p>');
}).listen(47123, '0.0.0.0', () => console.log('pronto'));
