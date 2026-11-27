// Preencher endereços e cartões (N9), como o Chrome.
//
// - Por perfil, em <userData>/autofill/<perfil>.json. O número do cartão fica criptografado pela
//   proteção do Windows (safeStorage → DPAPI); a lista mostra só bandeira e 4 últimos dígitos.
//   O código de segurança (CVV) nunca é guardado.
// - A página (page-autofill.js, mundo isolado) avisa o campo focado; a interface mostra a lista; ao
//   escolher, o processo principal confere a origem do frame e só então manda os dados a ele.
//   Cartão: só em https, e depois do Windows Hello.
// - Formulário enviado com dados novos → "Salvar endereço?" / "Salvar cartão?" (nada no modo privado).
const { app, ipcMain, safeStorage, webContents } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { handleUi } = require('./ipc');
const passwords = require('./passwords'); // Windows Hello (passwords.verifyUser)

let partitionFor = () => 'persist:kona'; // webContents (janela ou aba) → partição do perfil dela (O7)
let broadcast = () => {};
// ajustes por perfil (cada janela manda os do perfil dela; O7)
const prefsByPart = new Map();
const prefsOf = (P) => prefsByPart.get(P) || { addresses: true, cards: true };

/* ───────────── Armazenamento ───────────── */
const dir = () => path.join(app.getPath('userData'), 'autofill');
const fileFor = (partition) => path.join(dir(), `${partition.replace(/[^a-z0-9-]/gi, '_')}.json`);
const stores = new Map();
function store(partition) {
  if (!stores.has(partition)) {
    let data = { addresses: [], cards: [] };
    try { data = { ...data, ...JSON.parse(fs.readFileSync(fileFor(partition), 'utf8')) }; } catch { /* novo */ }
    stores.set(partition, data);
  }
  return stores.get(partition);
}
function save(partition) {
  fs.mkdirSync(dir(), { recursive: true });
  const tmp = `${fileFor(partition)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store(partition)));
  fs.renameSync(tmp, fileFor(partition));
  broadcast('af:changed');
}
const enc = (text) => (safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text).toString('base64') : null);
const dec = (b64) => { try { return safeStorage.decryptString(Buffer.from(b64, 'base64')); } catch { return null; } };

const ADDRESS_FIELDS = ['name', 'org', 'street', 'number', 'complement', 'neighborhood', 'city', 'state', 'postal', 'country', 'tel', 'email'];
const str = (v, n = 200) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
function cleanAddress(d) {
  const a = {};
  for (const k of ADDRESS_FIELDS) a[k] = str(d?.[k]);
  return a;
}
/** Um endereço que vale guardar: rua + (cidade ou CEP), ou nome + rua. */
const usefulAddress = (a) => !!a.street && !!(a.city || a.postal || a.name);
const sameAddress = (a, b) => ['street', 'number', 'postal', 'city'].every((k) => (a[k] || '').toLowerCase() === (b[k] || '').toLowerCase())
  && (!a.name || !b.name || a.name.toLowerCase() === b.name.toLowerCase());

/* cartões */
const digits = (s) => String(s || '').replace(/\D/g, '');
function luhn(num) {
  let sum = 0;
  for (let i = 0; i < num.length; i++) {
    let d = Number(num[num.length - 1 - i]);
    if (i % 2) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}
const validNumber = (n) => /^\d{12,19}$/.test(n) && luhn(n);
function brandOf(n) {
  if (/^4/.test(n)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(n)) return 'Mastercard';
  if (/^3[47]/.test(n)) return 'American Express';
  if (/^(4011|4312|4389|4514|4576|5041|5066|5067|509|6277|6362|6363|650|6516|6550)/.test(n)) return 'Elo';
  if (/^(606282|3841)/.test(n)) return 'Hipercard';
  if (/^(6011|65|64[4-9])/.test(n)) return 'Discover';
  if (/^3(0[0-5]|[68])/.test(n)) return 'Diners Club';
  if (/^35/.test(n)) return 'JCB';
  return 'Card';
}
/** Validade a partir dos campos do formulário ("08/27", "08/2027", mês e ano separados). */
function parseExp({ exp, expMonth, expYear }) {
  let m = digits(expMonth), y = digits(expYear);
  if ((!m || !y) && exp) { const p = String(exp).match(/(\d{1,2})\s*[/\-.\s]\s*(\d{2,4})/); if (p) { m = p[1]; y = p[2]; } }
  m = Number(m); y = Number(y);
  if (y && y < 100) y += 2000;
  return m >= 1 && m <= 12 && y >= 2000 && y < 2100 ? { expMonth: m, expYear: y } : { expMonth: 0, expYear: 0 };
}
const publicCard = (c) => ({ id: c.id, name: c.name, brand: c.brand, last4: c.last4, expMonth: c.expMonth, expYear: c.expYear, nickname: c.nickname || '' });
const publicAddress = (a) => ({ id: a.id, ...cleanAddress(a) });

/* ───────────── Páginas ───────────── */
const originOf = (url) => { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.origin : null; } catch { return null; } };
const fromPage = (e) => e.sender.getType() === 'webview' && e.senderFrame && originOf(e.senderFrame.url);
let seq = 0;
const suggestions = new Map(); // id → { wcId, frame, origin, kind } | { save: {...} }
const pending = new Map(); // webContents.id → { address, card, t }

function offerSave(wcId) {
  const p = pending.get(wcId);
  pending.delete(wcId);
  const host = webContents.fromId(wcId)?.hostWebContents;
  if (!p || !host) return;
  const P = partitionFor(webContents.fromId(wcId));
  if (!P) return;
  const prefs = prefsOf(P);
  const s = store(P);
  if (p.card && prefs.cards) {
    const old = s.cards.find((c) => dec(c.num) === p.card.number);
    const changed = !old || (p.card.expMonth && (old.expMonth !== p.card.expMonth || old.expYear !== p.card.expYear)) || (p.card.name && old.name !== p.card.name);
    if (changed) {
      const id = ++seq;
      suggestions.set(id, { save: { kind: 'card', data: p.card, oldId: old?.id }, P });
      host.send('af:offer-save', { id, kind: 'card', update: !!old, card: { brand: brandOf(p.card.number), last4: p.card.number.slice(-4), name: p.card.name, expMonth: p.card.expMonth, expYear: p.card.expYear } });
      return; // um balão por vez: o cartão primeiro
    }
  }
  if (p.address && prefs.addresses) {
    const old = s.addresses.find((a) => sameAddress(a, p.address));
    const changed = !old || ADDRESS_FIELDS.some((k) => p.address[k] && p.address[k] !== old[k]);
    if (!changed) return;
    const id = ++seq;
    suggestions.set(id, { save: { kind: 'address', data: p.address, oldId: old?.id }, P });
    host.send('af:offer-save', { id, kind: 'address', update: !!old, address: p.address });
  }
}

function registerPageChannels() {
  ipcMain.on('af:focus', (e, info) => {
    const origin = fromPage(e);
    if (!origin || !info || !['address', 'card'].includes(info.kind)) return;
    const P = partitionFor(e.sender);
    if (!P) return;
    const prefs = prefsOf(P);
    if (info.kind === 'address' && !prefs.addresses) return;
    if (info.kind === 'card' && !prefs.cards) return;
    const s = store(P);
    const items = info.kind === 'card'
      ? s.cards.slice().sort((a, b) => (b.used || 0) - (a.used || 0)).map(publicCard)
      : s.addresses.slice().sort((a, b) => (b.used || 0) - (a.used || 0)).map(publicAddress);
    if (!items.length) return;
    const id = ++seq;
    suggestions.set(id, { wcId: e.sender.id, frame: e.senderFrame, origin, kind: info.kind, P });
    e.sender.hostWebContents?.send('af:suggest', {
      id, wcId: e.sender.id, top: e.senderFrame === e.sender.mainFrame, rect: info.rect, kind: info.kind, items,
      secure: origin.startsWith('https:'),
    });
  });
  ipcMain.on('af:blur', (e) => { e.sender.hostWebContents?.send('af:suggest-hide', e.sender.id); });
  ipcMain.on('af:submit', (e, d) => {
    const origin = fromPage(e);
    if (!origin || !d || typeof d !== 'object') return;
    if (!e.sender.session.isPersistent()) return; // modo privado: nada é guardado
    const prefs = prefsOf(partitionFor(e.sender));
    let card = null, address = null;
    if (d.card && prefs.cards) {
      const number = digits(d.card.number);
      if (validNumber(number)) card = { number, name: str(d.card.name, 120), ...parseExp(d.card) };
    }
    if (d.address && prefs.addresses) {
      const a = cleanAddress(d.address);
      if (usefulAddress(a)) address = a;
    }
    if (!card && !address) return;
    pending.set(e.sender.id, { card, address, t: Date.now() });
    const wcId = e.sender.id;
    setTimeout(() => offerSave(wcId), 2000);
  });
}

function saveAddress(P, data, id) {
  if (!P) return false;
  const s = store(P);
  const a = cleanAddress(data);
  const old = id && s.addresses.find((x) => x.id === id);
  if (old) Object.assign(old, a, { updated: Date.now() });
  else s.addresses.push({ id: crypto.randomUUID(), ...a, created: Date.now(), used: 0 });
  save(P);
  return true;
}
function saveCard(P, data, id) {
  if (!P) return false;
  const s = store(P);
  const old = id && s.cards.find((x) => x.id === id);
  const number = digits(data.number);
  const exp = data.expMonth ? { expMonth: Number(data.expMonth) || 0, expYear: Number(data.expYear) || 0 } : parseExp(data);
  const fields = { name: str(data.name, 120), nickname: str(data.nickname, 40), ...exp };
  if (old) {
    if (number) {
      if (!validNumber(number)) return 'invalid';
      const num = enc(number); if (!num) return false;
      Object.assign(old, { num, last4: number.slice(-4), brand: brandOf(number) });
    }
    Object.assign(old, fields, { updated: Date.now() });
  } else {
    if (!validNumber(number)) return 'invalid';
    const num = enc(number);
    if (!num) return false;
    s.cards.push({ id: crypto.randomUUID(), num, last4: number.slice(-4), brand: brandOf(number), ...fields, created: Date.now(), used: 0 });
  }
  save(P);
  return true;
}

function registerAutofill(opts) {
  broadcast = opts.broadcast;
  partitionFor = opts.partitionFor;
  registerPageChannels();
  handleUi('af:set-prefs', (e, p) => { prefsByPart.set(partitionFor(e.sender), { addresses: p?.addresses !== false, cards: p?.cards !== false }); return true; });

  // escolher um item na lista: preenche só o frame que pediu, se a origem ainda for a mesma
  handleUi('af:fill', async (_e, suggestId, itemId) => {
    const sg = suggestions.get(Number(suggestId));
    if (!sg?.frame || sg.frame.isDestroyed?.() || originOf(sg.frame.url) !== sg.origin || !sg.P) return false;
    const s = store(sg.P);
    if (sg.kind === 'address') {
      const a = s.addresses.find((x) => x.id === itemId);
      if (!a) return false;
      a.used = Date.now(); save(sg.P);
      sg.frame.send('af:fill', { kind: 'address', data: cleanAddress(a) });
      return true;
    }
    const c = s.cards.find((x) => x.id === itemId);
    if (!c || !sg.origin.startsWith('https:')) return false;
    if (!(await passwords.verifyUser())) return 'auth';
    if (sg.frame.isDestroyed?.() || originOf(sg.frame.url) !== sg.origin) return false;
    const number = dec(c.num);
    if (!number) return false;
    c.used = Date.now(); save(sg.P);
    sg.frame.send('af:fill', { kind: 'card', data: { name: c.name, number, expMonth: c.expMonth, expYear: c.expYear } });
    return true;
  });
  // balão "Salvar?"
  handleUi('af:save-answer', (_e, id, answer) => {
    const sg = suggestions.get(Number(id));
    suggestions.delete(Number(id));
    if (!sg?.save || answer !== 'save') return false;
    const { kind, data, oldId } = sg.save;
    return kind === 'card' ? saveCard(sg.P, data, oldId) === true : saveAddress(sg.P, data, oldId);
  });

  // Gerenciamento (Settings → Addresses and cards)
  handleUi('af:list', (e) => {
    const s = store(partitionFor(e.sender));
    return { addresses: s.addresses.map(publicAddress), cards: s.cards.map(publicCard), encryption: safeStorage.isEncryptionAvailable() };
  });
  handleUi('af:save-address', (e, data, id) => saveAddress(partitionFor(e.sender), data || {}, typeof id === 'string' ? id : null));
  handleUi('af:save-card', (e, data, id) => saveCard(partitionFor(e.sender), data || {}, typeof id === 'string' ? id : null));
  handleUi('af:delete', (e, kind, id) => {
    const P = partitionFor(e.sender);
    const s = store(P);
    if (kind === 'card') s.cards = s.cards.filter((x) => x.id !== id);
    else s.addresses = s.addresses.filter((x) => x.id !== id);
    save(P);
    return true;
  });

  // navegou depois de enviar: hora de oferecer salvar
  app.on('web-contents-created', (_e, contents) => {
    if (contents.getType() !== 'webview') return;
    contents.on('did-navigate', () => { if (pending.has(contents.id)) setTimeout(() => offerSave(contents.id), 400); });
    contents.on('destroyed', () => pending.delete(contents.id));
  });
}

/** Endereços vindos da importação (Chrome/Edge/Brave): entram os que ainda não existem. */
function importAddresses(list, partition) {
  const s = store(partition);
  let added = 0;
  for (const d of Array.isArray(list) ? list : []) {
    const a = cleanAddress(d);
    if (!usefulAddress(a) || s.addresses.some((x) => sameAddress(x, a))) continue;
    s.addresses.push({ id: crypto.randomUUID(), ...a, created: Date.now(), used: 0 });
    added++;
  }
  if (added) save(partition);
  return added;
}

module.exports = { registerAutofill, importAddresses };
