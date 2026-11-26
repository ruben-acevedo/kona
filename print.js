// Pré-visualização de impressão (N13). A tela é da interface (renderer/print-ui.js); aqui ficam a
// prévia (a página vira PDF com as mesmas opções que irão para a impressora), a lista de impressoras,
// a impressão direta na impressora escolhida e o "Salvar como PDF".
const { app, dialog, session, webContents } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { handleUi } = require('./ipc');

const PREVIEW_PARTITION = 'kona-print-preview'; // a prévia aparece num <webview> desta sessão (só na memória)
const tmpDir = () => path.join(app.getPath('temp'), 'kona-print');
const PAPER = { A4: 'A4', A3: 'A3', A5: 'A5', Letter: 'Letter', Legal: 'Legal', Tabloid: 'Tabloid' };
// margens: as mesmas medidas na prévia e na impressora (polegadas)
const MARGIN_IN = { default: 0.4, none: 0, minimum: 0.16 };

const pageOf = (wcId) => {
  const wc = webContents.fromId(Number(wcId));
  return wc && !wc.isDestroyed() && wc.getType() === 'webview' ? wc : null;
};

/** "1-3, 5" → [{from:0,to:2},{from:4,to:4}] (as páginas contam de 1 para a pessoa). null = inválido. */
function parseRanges(text, total = Infinity) {
  const s = String(text || '').trim();
  if (!s) return [];
  const out = [];
  for (const part of s.split(/[,;]/).map((x) => x.trim()).filter(Boolean)) {
    const m = /^(\d+)\s*(?:-\s*(\d*))?$/.exec(part);
    if (!m) return null;
    const from = Number(m[1]);
    const to = m[2] === undefined ? from : m[2] === '' ? total : Number(m[2]);
    if (!from || !to || to < from || from > total) return null;
    out.push({ from: from - 1, to: Math.min(to, total) - 1 });
  }
  return out;
}

function sanitize(o = {}) {
  const num = (v, lo, hi, def) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : def);
  return {
    landscape: !!o.landscape,
    color: o.color !== false,
    copies: Math.round(num(o.copies, 1, 99, 1)),
    pageSize: PAPER[o.pageSize] || 'A4',
    margins: Object.hasOwn(MARGIN_IN, o.margins) ? o.margins : 'default',
    scale: Math.round(num(o.scale, 10, 200, 100)),
    headerFooter: o.headerFooter !== false,
    background: !!o.background,
    pages: typeof o.pages === 'string' ? o.pages.slice(0, 200) : '',
    duplex: ['simplex', 'longEdge', 'shortEdge'].includes(o.duplex) ? o.duplex : 'simplex',
  };
}

// cabeçalho e rodapé como os do Chrome: data e título em cima, endereço e "1/3" embaixo
const HF = (inner) => `<div style="font-size:8px;font-family:system-ui,sans-serif;width:100%;display:flex;justify-content:space-between;padding:0 0.4in;color:#444">${inner}</div>`;
const pdfOptions = (o, ranges) => {
  const m = MARGIN_IN[o.margins];
  // com cabeçalho e rodapé, o Chromium precisa de espaço em cima e embaixo para eles
  const tb = o.headerFooter ? Math.max(m, 0.4) : m;
  return {
    landscape: o.landscape, printBackground: o.background, scale: o.scale / 100, pageSize: o.pageSize,
    margins: { top: tb, bottom: tb, left: m, right: m },
    pageRanges: ranges.map((r) => (r.from === r.to ? `${r.from + 1}` : `${r.from + 1}-${r.to + 1}`)).join(','),
    displayHeaderFooter: o.headerFooter,
    headerTemplate: HF('<span class="date"></span><span class="title" style="max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span>'),
    footerTemplate: HF('<span class="url" style="max-width:80%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span><span><span class="pageNumber"></span>/<span class="totalPages"></span></span>'),
  };
};
const countPages = (buf) => (buf.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) || []).length;

// total de páginas do documento inteiro (para validar "1-3, 5" e mostrar "de N"), por aba e opções
const totals = new Map();
async function totalPages(wc, o) {
  const key = `${wc.id}|${wc.getURL()}|${o.landscape}|${o.pageSize}|${o.margins}|${o.scale}|${o.headerFooter}`;
  if (!totals.has(key)) {
    const buf = await wc.printToPDF(pdfOptions(o, []));
    totals.set(key, countPages(buf));
    if (totals.size > 30) totals.delete(totals.keys().next().value);
  }
  return totals.get(key);
}

function register() {
  // a sessão da prévia não guarda nada e só abre arquivos da pasta de prévias (a sessão só existe
  // depois que o Electron fica pronto)
  app.whenReady().then(() => {
    session.fromPartition(PREVIEW_PARTITION).webRequest.onBeforeRequest((d, cb) => {
      if (d.url.startsWith('file:') && !decodeURIComponent(d.url).replace(/\\/g, '/').toLowerCase().includes(tmpDir().replace(/\\/g, '/').toLowerCase())) { cb({ cancel: true }); return; }
      cb({});
    });
  });

  handleUi('print:printers', async (_e, wcId) => {
    const wc = pageOf(wcId);
    const list = wc ? await wc.getPrintersAsync().catch(() => []) : [];
    return list.map((p) => ({ name: p.name, displayName: p.displayName || p.name, isDefault: !!p.isDefault }));
  });

  // a prévia: PDF numa pasta temporária (a anterior desta aba é apagada)
  const lastFile = new Map();
  handleUi('print:preview', async (_e, wcId, opts) => {
    const wc = pageOf(wcId);
    if (!wc) return { error: 'gone' };
    const o = sanitize(opts);
    try {
      const total = await totalPages(wc, o);
      const ranges = parseRanges(o.pages, total);
      if (ranges === null) return { error: 'pages', total };
      const buf = await wc.printToPDF(pdfOptions(o, ranges));
      fs.mkdirSync(tmpDir(), { recursive: true });
      const file = path.join(tmpDir(), `${crypto.randomBytes(6).toString('hex')}.pdf`);
      fs.writeFileSync(file, buf);
      const old = lastFile.get(wcId);
      if (old) fs.rm(old, { force: true }, () => {});
      lastFile.set(wcId, file);
      return { url: `file:///${file.replace(/\\/g, '/')}#toolbar=0&navpanes=0&view=Fit`, pages: countPages(buf), total };
    } catch (err) {
      return { error: 'failed', message: String(err?.message || err).slice(0, 200) };
    }
  });
  handleUi('print:done', (_e, wcId) => {
    const f = lastFile.get(wcId);
    if (f) fs.rm(f, { force: true }, () => {});
    lastFile.delete(wcId);
    return true;
  });

  // direto na impressora escolhida, com as opções da tela (sem a janela do Windows)
  handleUi('print:run', async (_e, wcId, printer, opts) => {
    const wc = pageOf(wcId);
    if (!wc || typeof printer !== 'string') return { ok: false, reason: 'gone' };
    const o = sanitize(opts);
    const total = await totalPages(wc, o).catch(() => Infinity);
    const ranges = parseRanges(o.pages, total);
    if (ranges === null) return { ok: false, reason: 'pages' };
    const m = { default: 'default', none: 'none', minimum: 'printableArea' }[o.margins];
    return new Promise((resolve) => {
      wc.print({
        silent: true, deviceName: printer, copies: o.copies, landscape: o.landscape, color: o.color,
        pageSize: o.pageSize, margins: { marginType: m }, scaleFactor: o.scale, printBackground: o.background,
        duplexMode: o.duplex, ...(ranges.length ? { pageRanges: ranges } : {}),
        ...(o.headerFooter ? { header: wc.getTitle(), footer: wc.getURL() } : {}),
      }, (ok, reason) => resolve({ ok, reason: ok ? '' : String(reason || '') }));
    });
  });
  // a janela de impressão do Windows (opções do driver da impressora)
  handleUi('print:system', (_e, wcId) => { const wc = pageOf(wcId); if (wc) wc.print({}, () => {}); return !!wc; });

  handleUi('print:pdf', async (e, wcId, opts) => {
    const wc = pageOf(wcId);
    if (!wc) return { ok: false };
    const o = sanitize(opts);
    const total = await totalPages(wc, o).catch(() => Infinity);
    const ranges = parseRanges(o.pages, total);
    if (ranges === null) return { ok: false, reason: 'pages' };
    const { BrowserWindow } = require('electron');
    const name = `${(wc.getTitle() || 'page').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 120) || 'page'}.pdf`;
    const target = process.env.KONA_PDF_TARGET; // testes: sem a janela de salvar
    const r = target ? { canceled: false, filePath: target } : await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), {
      defaultPath: path.join(app.getPath('downloads'), name), filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (r.canceled || !r.filePath) return { ok: false, reason: 'canceled' };
    const buf = await wc.printToPDF(pdfOptions(o, ranges));
    fs.writeFileSync(r.filePath, buf);
    return { ok: true, path: r.filePath, pages: countPages(buf) };
  });

  // ao fechar o Kona, as prévias que sobraram vão embora
  app.on('will-quit', () => { try { fs.rmSync(tmpDir(), { recursive: true, force: true }); } catch { /* em uso */ } });
}

module.exports = { register, PREVIEW_PARTITION, parseRanges };
