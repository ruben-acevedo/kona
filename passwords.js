// Gerenciador de senhas do Kona (como o do Chrome): salvar ao entrar num site, preencher quando a
// pessoa escolhe a conta, gerar senha forte, importar/exportar CSV e gerenciar em Settings.
//
// Segurança:
// - As senhas ficam por perfil em <userData>/passwords/<perfil>.json, cada uma criptografada com a
//   proteção do Windows (safeStorage → DPAPI): só a conta do Windows da pessoa consegue ler.
// - A página nunca pede uma senha: o preload (page-passwords.js, num mundo isolado) avisa que um
//   campo foi focado; a interface mostra as contas; ao escolher, o processo principal confere que a
//   origem do frame bate com a da senha e só então a envia àquele frame.
// - A origem é sempre a do frame que mandou a mensagem (e.senderFrame), nunca um valor da página.
// - Mostrar, copiar e exportar senhas na tela de gerenciamento pedem o Windows Hello (60 s de folga).
const { app, ipcMain, safeStorage, dialog, clipboard, webContents } = require('electron');
const { execFile } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { handleUi } = require('./ipc');
const { tl } = require('./i18n');
const { siteOf } = require('./session-policy');

let currentPartition = () => 'persist:kona';
let win = () => null;
let broadcast = () => {};

/* ───────────── Armazenamento ───────────── */
const dir = () => path.join(app.getPath('userData'), 'passwords');
const fileFor = (partition) => path.join(dir(), `${partition.replace(/[^a-z0-9-]/gi, '_')}.json`);
const stores = new Map();
function store(partition = currentPartition()) {
  if (!stores.has(partition)) {
    let data = { entries: [], never: [] };
    try { data = { ...data, ...JSON.parse(fs.readFileSync(fileFor(partition), 'utf8')) }; } catch { /* novo */ }
    stores.set(partition, data);
  }
  return stores.get(partition);
}
function save(partition = currentPartition()) {
  fs.mkdirSync(dir(), { recursive: true });
  const tmp = `${fileFor(partition)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store(partition)));
  fs.renameSync(tmp, fileFor(partition));
  broadcast('pw:changed');
}
const enc = (text) => (safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text).toString('base64') : null);
const dec = (b64) => { try { return safeStorage.decryptString(Buffer.from(b64, 'base64')); } catch { return null; } };

const originOf = (url) => { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.origin : null; } catch { return null; } };
const hostOf = (origin) => { try { return new URL(origin).hostname; } catch { return ''; } };
/** Contas que servem para uma origem: a mesma origem primeiro, depois o mesmo site (subdomínios). */
function matches(origin, partition) {
  const host = hostOf(origin);
  const site = siteOf(host);
  return store(partition).entries
    .filter((e) => e.origin === origin || (siteOf(hostOf(e.origin)) === site && new URL(e.origin).protocol === new URL(origin).protocol))
    .sort((a, b) => (b.origin === origin) - (a.origin === origin) || (b.used || 0) - (a.used || 0));
}
const publicEntry = (e, origin) => ({ id: e.id, username: e.username, origin: e.origin, host: hostOf(e.origin), exact: !origin || e.origin === origin, used: e.used || 0, updated: e.updated || 0 });

function upsert({ origin, username, password }, partition = currentPartition()) {
  const s = store(partition);
  const now = Date.now();
  const old = s.entries.find((e) => e.origin === origin && e.username === username);
  const pass = enc(password);
  if (!pass) return null;
  if (old) Object.assign(old, { pass, updated: now });
  else s.entries.push({ id: crypto.randomUUID(), origin, username, pass, created: now, updated: now, used: 0 });
  s.never = s.never.filter((o) => o !== origin);
  save(partition);
  return old ? 'updated' : 'saved';
}

/* ───────────── Windows Hello ───────────── */
let authUntil = 0;
const HELLO_PS = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
[void][Windows.Security.Credentials.UI.UserConsentVerifier, Windows.Security.Credentials.UI, ContentType = WindowsRuntime]
function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
$avail = Await ([Windows.Security.Credentials.UI.UserConsentVerifier]::CheckAvailabilityAsync()) ([Windows.Security.Credentials.UI.UserConsentVerifierAvailability])
if ("$avail" -ne 'Available') { Write-Output "unavailable:$avail"; exit }
$r = Await ([Windows.Security.Credentials.UI.UserConsentVerifier]::RequestVerificationAsync($env:KONA_HELLO_MSG)) ([Windows.Security.Credentials.UI.UserConsentVerificationResult])
Write-Output "$r"
`;
/** Pede o Windows Hello (PIN, digital ou rosto). Sem Windows Hello configurado, segue liberado. */
function verifyUser() {
  if (Date.now() < authUntil) return Promise.resolve(true);
  if (process.platform !== 'win32') return Promise.resolve(true);
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', HELLO_PS], { windowsHide: true, timeout: 120000, env: { ...process.env, KONA_HELLO_MSG: tl('Kona wants to show or export your saved passwords.') } }, (err, out) => {
      const r = String(out || '').trim();
      const ok = !err && (r === 'Verified' || r.startsWith('unavailable:'));
      if (ok) authUntil = Date.now() + 60000;
      resolve(ok);
    });
  });
}

/* ───────────── CSV ───────────── */
function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}
const csvCell = (v) => (/[",\n\r]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

/* ───────────── Páginas (preload page-passwords.js) ───────────── */
const fromPage = (e) => e.sender.getType() === 'webview' && e.senderFrame && originOf(e.senderFrame.url);
const pending = new Map(); // webContents.id → { origin, username, password, t, frame }
let suggestSeq = 0;
const suggestions = new Map(); // id → { wcId, frame, origin }

function offerSave(wcId) {
  const p = pending.get(wcId);
  if (!p || !p.password) return;
  pending.delete(wcId);
  const s = store();
  // senha gerada pelo Kona e usada no cadastro: salva direto, como o Chrome
  if (p.generated) {
    upsert({ origin: p.origin, username: p.username, password: p.password });
    webContents.fromId(wcId)?.hostWebContents?.send('pw:saved', { host: hostOf(p.origin) });
    return;
  }
  if (s.never.includes(p.origin)) return;
  const same = s.entries.find((e) => e.origin === p.origin && e.username === p.username);
  if (same && dec(same.pass) === p.password) { same.used = Date.now(); save(); return; } // já salva
  const host = webContents.fromId(wcId)?.hostWebContents;
  const id = ++suggestSeq;
  suggestions.set(id, { save: p });
  host?.send('pw:offer-save', { id, wcId, host: hostOf(p.origin), username: p.username, update: !!same || (!p.username && matches(p.origin).length === 1) });
}

function registerPageChannels() {
  // campo de login focado: a interface mostra as contas (sem senhas) e o gerador em cadastros
  ipcMain.on('pw:focus', (e, info) => {
    const origin = fromPage(e);
    if (!origin || !info || typeof info !== 'object') return;
    const s = store();
    const accounts = matches(origin).map((x) => publicEntry(x, origin));
    const offerGenerate = !!info.newPassword && info.fieldType === 'password';
    if (!accounts.length && !offerGenerate) return;
    const id = ++suggestSeq;
    suggestions.set(id, { wcId: e.sender.id, frame: e.senderFrame, origin });
    e.sender.hostWebContents?.send('pw:suggest', {
      id, wcId: e.sender.id, top: e.senderFrame === e.sender.mainFrame, rect: info.rect, accounts,
      generate: offerGenerate ? generatePassword() : null, never: s.never.includes(origin),
    });
  });
  ipcMain.on('pw:blur', (e) => { e.sender.hostWebContents?.send('pw:suggest-hide', e.sender.id); });
  // login enviado: guarda para oferecer salvar depois que a página seguir (navegar) ou em 2 s (sites de uma página só)
  ipcMain.on('pw:submit', (e, data) => {
    const origin = fromPage(e);
    if (!origin || !data || typeof data.password !== 'string' || !data.password || data.password.length > 512) return;
    if (!settingsOffer()) return;
    const prev = pending.get(e.sender.id);
    const username = String(data.username || '').slice(0, 256) || (prev && prev.origin === origin ? prev.username : '');
    const generated = !!(prev?.generated && prev.password === data.password);
    pending.set(e.sender.id, { origin, username, password: data.password, t: Date.now(), generated });
    const wcId = e.sender.id;
    setTimeout(() => offerSave(wcId), 2000);
  });
  // primeira etapa de logins em duas telas (ex.: Google): o usuário, sem senha
  ipcMain.on('pw:username', (e, username) => {
    const origin = fromPage(e);
    if (!origin || typeof username !== 'string' || !username || username.length > 256) return;
    pending.set(e.sender.id, { origin, username, password: '', t: Date.now() });
  });
}

/* ───────────── Ajuste "Offer to save passwords" (vem da interface) ───────────── */
let offerEnabled = true;
const settingsOffer = () => offerEnabled;

function generatePassword() {
  // 15 caracteres, como o Chrome: letras maiúsculas e minúsculas, números e símbolos, sem ambíguos
  const sets = ['abcdefghijkmnpqrstuvwxyz', 'ABCDEFGHJKLMNPQRSTUVWXYZ', '23456789', '-_.!@#$%'];
  const all = sets.join('');
  const pick = (s) => s[crypto.randomInt(s.length)];
  const chars = sets.map(pick);
  while (chars.length < 15) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}

function registerPasswords(opts) {
  win = opts.win;
  broadcast = opts.broadcast;
  currentPartition = opts.currentPartition;
  registerPageChannels();
  handleUi('pw:set-offer', (_e, on) => { offerEnabled = !!on; return true; });

  // escolher uma conta (ou a senha gerada) na lista: preenche só o frame que pediu, se a origem bater
  handleUi('pw:fill', (_e, suggestId, accountId, generated) => {
    const sg = suggestions.get(Number(suggestId));
    if (!sg?.frame || sg.frame.isDestroyed?.()) return false;
    if (originOf(sg.frame.url) !== sg.origin) return false;
    if (generated) {
      if (typeof generated !== 'string' || generated.length > 64) return false;
      sg.frame.send('pw:fill', { password: generated, generated: true });
      pending.set(sg.wcId, { origin: sg.origin, username: '', password: generated, t: Date.now(), generated: true });
      return true;
    }
    const entry = matches(sg.origin).find((x) => x.id === accountId);
    if (!entry) return false;
    const password = dec(entry.pass);
    if (password == null) return false;
    entry.used = Date.now(); save();
    sg.frame.send('pw:fill', { username: entry.username, password });
    return true;
  });
  handleUi('pw:never-here', (_e, suggestId) => {
    const sg = suggestions.get(Number(suggestId));
    const origin = sg?.origin || sg?.save?.origin;
    if (!origin) return false;
    const s = store();
    if (!s.never.includes(origin)) s.never.push(origin);
    save();
    return true;
  });
  // balão "Save password?": salvar (com o usuário que a pessoa pode ter editado) ou nunca neste site
  handleUi('pw:save-answer', (_e, id, answer, username) => {
    const sg = suggestions.get(Number(id));
    suggestions.delete(Number(id));
    if (!sg?.save) return false;
    if (answer === 'never') { const s = store(); if (!s.never.includes(sg.save.origin)) s.never.push(sg.save.origin); save(); return 'never'; }
    if (answer !== 'save') return false;
    const user = typeof username === 'string' ? username.slice(0, 256) : sg.save.username;
    return upsert({ origin: sg.save.origin, username: user, password: sg.save.password });
  });

  // Gerenciamento (Settings → Passwords)
  handleUi('pw:list', () => {
    const s = store();
    return { entries: s.entries.map((e) => publicEntry(e)).sort((a, b) => a.host.localeCompare(b.host) || a.username.localeCompare(b.username)), never: [...s.never], encryption: safeStorage.isEncryptionAvailable() };
  });
  handleUi('pw:reveal', async (_e, id) => {
    const e = store().entries.find((x) => x.id === id);
    if (!e || !(await verifyUser())) return null;
    return dec(e.pass);
  });
  handleUi('pw:copy', async (_e, id) => {
    const e = store().entries.find((x) => x.id === id);
    if (!e || !(await verifyUser())) return false;
    clipboard.writeText(dec(e.pass) || '');
    return true;
  });
  handleUi('pw:edit', async (_e, id, { username, password } = {}) => {
    const e = store().entries.find((x) => x.id === id);
    if (!e || !(await verifyUser())) return false;
    if (typeof username === 'string') e.username = username.slice(0, 256);
    if (typeof password === 'string' && password) { const p = enc(password.slice(0, 512)); if (p) e.pass = p; }
    e.updated = Date.now();
    save();
    return true;
  });
  handleUi('pw:delete', (_e, id) => { const s = store(); s.entries = s.entries.filter((x) => x.id !== id); save(); return true; });
  handleUi('pw:never-remove', (_e, origin) => { const s = store(); s.never = s.never.filter((o) => o !== origin); save(); return true; });
  handleUi('pw:import', async () => {
    const r = await dialog.showOpenDialog(win(), { title: tl('Import passwords'), filters: [{ name: 'CSV', extensions: ['csv'] }], properties: ['openFile'] });
    if (r.canceled || !r.filePaths[0]) return null;
    const rows = parseCsv(fs.readFileSync(r.filePaths[0], 'utf8').replace(/^﻿/, ''));
    const head = (rows.shift() || []).map((h) => h.trim().toLowerCase());
    const col = (...names) => names.map((n) => head.indexOf(n)).find((i) => i >= 0);
    const iUrl = col('url', 'login_uri', 'website', 'origin');
    const iUser = col('username', 'login_username', 'login', 'email');
    const iPass = col('password', 'login_password');
    if (iUrl === undefined || iPass === undefined) return { error: tl('This file doesn’t look like a passwords export (it needs “url” and “password” columns).') };
    let added = 0, updated = 0, skipped = 0;
    for (const row of rows) {
      const origin = originOf((row[iUrl] || '').trim());
      const password = row[iPass] || '';
      if (!origin || !password) { skipped++; continue; }
      const res = upsert({ origin, username: iUser === undefined ? '' : (row[iUser] || '').trim(), password });
      if (res === 'saved') added++; else if (res === 'updated') updated++; else skipped++;
    }
    return { added, updated, skipped };
  });
  handleUi('pw:export', async () => {
    if (!(await verifyUser())) return { error: 'auth' };
    const r = await dialog.showSaveDialog(win(), { title: tl('Export passwords'), defaultPath: 'Kona Passwords.csv', filters: [{ name: 'CSV', extensions: ['csv'] }] });
    if (r.canceled || !r.filePath) return null;
    const lines = ['name,url,username,password,note'];
    for (const e of store().entries) lines.push([hostOf(e.origin), `${e.origin}/`, e.username, dec(e.pass) || '', ''].map(csvCell).join(','));
    fs.writeFileSync(r.filePath, `${lines.join('\n')}\n`);
    return { count: store().entries.length };
  });

  // navegou depois de enviar o login: hora de oferecer salvar
  app.on('web-contents-created', (_e, contents) => {
    if (contents.getType() !== 'webview') return;
    contents.on('did-navigate', () => { const p = pending.get(contents.id); if (p?.password) setTimeout(() => offerSave(contents.id), 400); });
    contents.on('destroyed', () => pending.delete(contents.id));
  });
}

module.exports = { registerPasswords, verifyUser };
