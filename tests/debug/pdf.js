// L2: um PDF abre na aba (leitor do Chromium) em vez de ser baixado.
const os = require('os'); const fs = require('fs'); const path = require('path'); const http = require('http');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-pdf-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow, webContents } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = path.join(__dirname, '..', 'output-windows', 'pdf'); fs.mkdirSync(OUT, { recursive: true });
// PDF mínimo de uma página com um texto
function makePdf(text) {
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const stream = `BT /F1 28 Tf 72 760 Td (${text}) Tj ET`;
  objs[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  let out = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}
const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/pdf' }); res.end(makePdf('Hello from a PDF in Kona')); });
app.whenReady().then(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/report.pdf`;
  let wc; while (!(wc = BrowserWindow.getAllWindows()[0]?.webContents)) await sleep(50);
  await sleep(3500);
  const js = (c) => wc.executeJavaScript(c);
  await js(`settings.sounds = false; navigate(active(), ${JSON.stringify(url)}); 0`);
  await sleep(4000);
  console.log('R aba:', await js(`active().url + ' · título: ' + active().title`));
  console.log('R downloads iniciados:', await js(`downloadsList.items.length`));
  fs.writeFileSync(path.join(OUT, 'pdf.png'), (await wc.capturePage()).toPNG());
  server.close();
  app.exit(0);
});
