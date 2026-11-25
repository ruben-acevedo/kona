// Gera os ícones do app a partir de assets/icon.svg:
//   assets/icon.ico (16–256 px: janela, barra de tarefas, atalhos, instalador), de ICO_SOURCE:
//     icon-windows-tile.svg → abacaxi compacto sobre o fundo (mais claro e com borda, para não sumir na barra escura)
//     icon-windows.svg      → só o abacaxi, sem fundo (estilo Windows 11)
//   assets/icon-256.png, assets/icon-512.png de assets/icon.svg (com o fundo; README e telas do app)
// Uso: npx electron scripts/icons.js   (rodar de novo sempre que o icon.svg mudar)
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const ASSETS = path.join(__dirname, '..', 'assets');
const ICO_SOURCE = 'icon-windows-tile.svg';
const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const PNG_SIZES = [256, 512];

/** Junta PNGs num .ico (formato com PNG embutido, aceito desde o Windows Vista). */
function packIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  const entries = []; const datas = [];
  let offset = 6 + 16 * images.length;
  for (const { size, png } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); e.writeUInt8(0, 3); e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(png.length, 8); e.writeUInt32LE(offset, 12);
    offset += png.length; entries.push(e); datas.push(png);
  }
  return Buffer.concat([header, ...entries, ...datas]);
}

app.whenReady().then(async () => {
  const read = (f) => fs.readFileSync(path.join(ASSETS, f), 'utf8');
  const w = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await w.loadURL('data:text/html,<body></body>');
  const render = (size, svg) => w.webContents.executeJavaScript(`new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = ${size};
      const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
      x.drawImage(img, 0, 0, ${size}, ${size});
      ok(c.toDataURL('image/png').split(',')[1]);
    };
    img.onerror = fail;
    img.src = 'data:image/svg+xml;base64,' + ${JSON.stringify(Buffer.from(svg).toString('base64'))};
  })`).then((b64) => Buffer.from(b64, 'base64'));

  const ico = [];
  for (const size of ICO_SIZES) ico.push({ size, png: await render(size, read(ICO_SOURCE)) });
  fs.writeFileSync(path.join(ASSETS, 'icon.ico'), packIco(ico));
  for (const size of PNG_SIZES) fs.writeFileSync(path.join(ASSETS, `icon-${size}.png`), await render(size, read('icon.svg')));
  console.log('ícones gerados em', ASSETS);
  app.exit(0);
});
