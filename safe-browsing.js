'use strict';
// O2: proteção contra golpes e malware, como o Safe Browsing do Chrome, mas com listas abertas e
// sem conta: URLhaus (endereços que distribuem malware; desde 10/2026 o abuse.ch exige chave, então
// vem pelo espelho aberto do projeto malware-filter), OpenPhish e Phishing.Database (golpes).
// As listas são baixadas em segundo plano e cada endereço é conferido NESTE computador: nada do que
// se visita sai da máquina. Em memória, cada entrada vira uma "impressão digital" de 53 bits num
// Float64Array ordenado (alguns MB para centenas de milhares de entradas; busca binária instantânea).
// Opcional: com uma chave própria do Google Safe Browsing, o Google também confere (Lookup API).
const { app, net } = require('electron');
const fs = require('fs');
const path = require('path');

const SOURCES = [
  { id: 'urlhaus', threat: 'malware', url: 'https://malware-filter.gitlab.io/malware-filter/urlhaus-filter-online.txt' },
  { id: 'openphish', threat: 'phishing', url: 'https://openphish.com/feed.txt' },
  { id: 'phishdb', threat: 'phishing', url: 'https://raw.githubusercontent.com/mitchellkrogza/Phishing.Database/master/phishing-domains-ACTIVE.txt', domains: true },
];
const REFRESH = 6 * 3600 * 1000; // listas novas a cada 6 h
const DIR = () => path.join(app.getPath('userData'), 'safe-browsing');

// Plataformas grandes: uma lista de golpes pode trazer o domínio inteiro (ex.: "docs.google.com"),
// e bloquear isso quebraria a internet. Nelas só valem entradas de um endereço exato ou de um
// subdomínio próprio (ex.: "golpe.weebly.com"), nunca o domínio da plataforma.
const PLATFORMS = new Set(`google.com docs.google.com sites.google.com drive.google.com forms.gle goo.gl youtube.com youtu.be
  facebook.com instagram.com whatsapp.com wa.me messenger.com microsoft.com live.com office.com outlook.com sharepoint.com onedrive.live.com 1drv.ms
  apple.com icloud.com amazon.com amazon.com.br amazonaws.com cloudfront.net github.com github.io githubusercontent.com gitlab.com bitbucket.org
  dropbox.com box.com mega.nz cloudflare.com pages.dev workers.dev r2.dev vercel.app netlify.app firebaseapp.com web.app appspot.com
  blogspot.com wordpress.com weebly.com wix.com wixsite.com squarespace.com square.site webflow.io notion.site canva.com glitch.me
  herokuapp.com azurewebsites.net onrender.com repl.co replit.app ngrok.io ngrok-free.app bit.ly t.co tinyurl.com linktr.ee rebrand.ly
  discord.com discord.gg telegram.org t.me twitter.com x.com linkedin.com yahoo.com mercadolivre.com.br mercadopago.com.br paypal.com
  ipfs.io dweb.link wikipedia.org reddit.com medium.com substack.com typeform.com jotform.com surveymonkey.com`.split(/\s+/).filter(Boolean));

/** Impressão digital de 53 bits (cyrb53): rápida, e cabe num número do JavaScript sem perder bits. */
function hash(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

const cleanHost = (h) => h.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
const decode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

/** Entrada de uma lista → "host/caminho" (o caminho "/" vale para o site inteiro). */
function entryOf(line, domains) {
  // formato das listas de bloqueio de anúncios ("||site.com/caminho^$all"): tira as marcas
  let t = line.trim();
  if (!t || t.startsWith('#') || t.startsWith('!')) return null;
  if (t.startsWith('||')) t = t.slice(2).replace(/\^.*$/, '').replace(/\$.*$/, '');
  if (!t.includes('/') && !/^[a-z]+:/i.test(t)) domains = true; // só o domínio: vale para o site inteiro
  if (domains) {
    const h = cleanHost(t.split(/\s+/).pop());
    return /^[a-z0-9.-]+\.[a-z0-9-]+$/i.test(h) && !PLATFORMS.has(h) ? `${h}/` : null;
  }
  let u;
  try { u = new URL(/^[a-z]+:\/\//i.test(t) ? t : `http://${t}`); } catch { return null; }
  const h = cleanHost(u.hostname);
  const p = decode(u.pathname || '/') + u.search;
  if (p === '/' && PLATFORMS.has(h)) return null;
  return h + p;
}

/** As formas de um endereço que se procuram nas listas (como no Safe Browsing): o host e até 4
    domínios acima dele, com o caminho exato (com e sem a busca), as pastas e a raiz. */
function expressions(url) {
  let u;
  try { u = new URL(url); } catch { return []; }
  if (!/^https?:$/.test(u.protocol)) return [];
  const host = cleanHost(u.hostname);
  const hosts = [host];
  if (!/^[\d.]+$/.test(host) && !host.startsWith('[')) {
    const parts = host.split('.');
    for (let i = 1; i < parts.length - 1 && hosts.length < 5; i++) hosts.push(parts.slice(i).join('.'));
  }
  const p = decode(u.pathname || '/');
  const paths = new Set([p + u.search, p, '/']);
  const segs = p.split('/').filter(Boolean);
  for (let i = 1; i < segs.length && i <= 4; i++) paths.add(`/${segs.slice(0, i).join('/')}/`);
  const out = [];
  for (const h of hosts) for (const q of paths) out.push(h + q);
  return out;
}

function has(arr, x) {
  let lo = 0, hi = arr.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] === x) return true;
    if (arr[mid] < x) lo = mid + 1; else hi = mid - 1;
  }
  return false;
}

const state = {
  index: { malware: new Float64Array(0), phishing: new Float64Array(0) },
  meta: { updated: 0, counts: {}, etags: {} },
  updating: null,
  extra: { malware: [], phishing: [] }, // entradas dos testes (_inject): sobrevivem às atualizações
};

/** null, 'malware' ou 'phishing'. */
function check(url) {
  const ex = expressions(url);
  for (const threat of ['malware', 'phishing']) {
    const arr = state.index[threat];
    if (arr.length && ex.some((e) => has(arr, hash(e)))) return threat;
  }
  return null;
}

const readBin = (file) => { const b = fs.readFileSync(file); return new Float64Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };

async function load() {
  try {
    state.meta = JSON.parse(await fs.promises.readFile(path.join(DIR(), 'meta.json'), 'utf8'));
    for (const t of ['malware', 'phishing']) {
      const f = path.join(DIR(), `${t}.bin`);
      if (fs.existsSync(f)) state.index[t] = readBin(f);
    }
  } catch { /* primeira vez: as listas chegam na primeira atualização */ }
}

async function fetchText(src) {
  const file = path.join(DIR(), `${src.id}.txt`);
  const headers = {};
  const etag = state.meta.etags?.[src.id];
  if (etag && fs.existsSync(file)) headers['If-None-Match'] = etag;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60000);
    const res = await net.fetch(src.url, { headers, signal: ctrl.signal, bypassCustomProtocolHandlers: true });
    clearTimeout(timer);
    if (res.status === 304) return fs.promises.readFile(file, 'utf8');
    if (!res.ok) throw new Error(String(res.status));
    const text = await res.text();
    await fs.promises.writeFile(file, text);
    state.meta.etags = { ...state.meta.etags, [src.id]: res.headers.get('etag') || '' };
    return text;
  } catch {
    // sem internet ou a fonte fora do ar: usa a última cópia baixada
    try { return await fs.promises.readFile(file, 'utf8'); } catch { return ''; }
  }
}

/** Monta o índice aos poucos (sem travar o processo principal: pausa a cada 20 mil linhas). */
async function build(texts) {
  const out = { malware: [], phishing: [] };
  const counts = {};
  for (const [src, text] of texts) {
    const lines = text.split('\n');
    let n = 0;
    for (let i = 0; i < lines.length; i++) {
      const e = entryOf(lines[i], src.domains);
      if (e) { out[src.threat].push(hash(e)); n++; }
      if (i % 20000 === 19999) await new Promise((r) => setImmediate(r));
    }
    counts[src.id] = n;
  }
  const index = {};
  for (const t of ['malware', 'phishing']) index[t] = Float64Array.from(new Set([...out[t], ...state.extra[t]])).sort();
  return { index, counts };
}

async function update({ force = false } = {}) {
  if (state.updating) return state.updating;
  if (!force && Date.now() - (state.meta.updated || 0) < REFRESH) return null;
  state.updating = (async () => {
    await fs.promises.mkdir(DIR(), { recursive: true });
    const texts = [];
    for (const src of SOURCES) texts.push([src, await fetchText(src)]);
    if (!texts.some(([, t]) => t)) return; // nada baixado nem guardado: tenta de novo depois
    const { index, counts } = await build(texts);
    state.index = index;
    state.meta = { ...state.meta, updated: Date.now(), counts };
    for (const t of ['malware', 'phishing']) await fs.promises.writeFile(path.join(DIR(), `${t}.bin`), Buffer.from(index[t].buffer));
    await fs.promises.writeFile(path.join(DIR(), 'meta.json'), JSON.stringify(state.meta));
  })().catch(() => {}).finally(() => { state.updating = null; });
  return state.updating;
}

let timer = null;
function start() {
  load().then(() => setTimeout(() => update(), 8000)); // depois da abertura, sem disputar com ela
  clearInterval(timer);
  timer = setInterval(() => update(), 60 * 60 * 1000); // confere de hora em hora se já passaram 6 h
}

function status() {
  const c = state.meta.counts || {};
  return { updated: state.meta.updated || 0, entries: Object.values(c).reduce((a, b) => a + b, 0), updating: !!state.updating };
}

/* ───────────── Google Safe Browsing (opcional, com a chave da própria pessoa) ───────────── */
const googleCache = new Map(); // host+caminho → { threat, at }
async function checkGoogle(url, key) {
  if (!key || !/^https?:/i.test(url)) return null;
  const k = expressions(url)[1] || url;
  const hit = googleCache.get(k);
  if (hit && Date.now() - hit.at < 30 * 60 * 1000) return hit.threat;
  try {
    const res = await net.fetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client: { clientId: 'kona', clientVersion: app.getVersion() },
        threatInfo: {
          threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE'],
          platformTypes: ['ANY_PLATFORM'], threatEntryTypes: ['URL'], threatEntries: [{ url }],
        },
      }),
    });
    if (!res.ok) return null;
    const m = (await res.json()).matches?.[0];
    const threat = m ? (m.threatType === 'SOCIAL_ENGINEERING' ? 'phishing' : 'malware') : null;
    googleCache.set(k, { threat, at: Date.now() });
    if (googleCache.size > 2000) googleCache.delete(googleCache.keys().next().value);
    return threat;
  } catch { return null; }
}

/** Só para os testes: põe entradas na lista sem baixar nada. */
function _inject(lines, threat) {
  const extra = lines.map((l) => entryOf(l, false)).filter(Boolean).map(hash);
  state.extra[threat].push(...extra);
  state.index[threat] = Float64Array.from(new Set([...state.index[threat], ...extra])).sort();
}

module.exports = { start, check, update, status, checkGoogle, expressions, entryOf, hash, _inject };
