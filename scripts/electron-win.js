// O Electron para Windows usado pelo Kona (para rodar, testar e empacotar): a versão da castLabs,
// igual ao Electron oficial mais o Widevine (o componente de vídeo protegido que Netflix, Spotify,
// Prime Video e Disney+ exigem). Baixado direto dos Releases da castLabs e conferido pelo SHA-256
// publicado por eles. O npm do projeto continua com o Electron oficial (para o WSL/Linux).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TAG = 'v45.2.1+wvcus';
const VERSION = TAG.slice(1);                 // 45.2.1+wvcus
const PLAIN_VERSION = VERSION.split('+')[0];  // 45.2.1 (para o electron-builder)
const ASSET = `electron-${TAG}-win32-x64.zip`;
const BASE_URL = `https://github.com/castlabs/electron-releases/releases/download/${encodeURIComponent(TAG)}`;

const dirFor = (base) => path.join(base, `electron-${VERSION}`);

async function download(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${res.status} ao baixar ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Garante o Electron da castLabs em <base>/electron-<versão>; devolve a pasta. */
async function ensure(base) {
  const dir = dirFor(base);
  if (fs.existsSync(path.join(dir, 'electron.exe'))) return dir;
  console.log(`Baixando o Electron ${VERSION} (castLabs, com Widevine) para Windows (só na primeira vez)…`);
  const sums = (await download(`${BASE_URL}/SHASUMS256.txt`)).toString('utf8');
  const expected = (sums.split('\n').find((l) => l.trim().endsWith(ASSET)) || '').trim().split(/\s+/)[0];
  if (!/^[a-f0-9]{64}$/.test(expected)) throw new Error(`SHA-256 de ${ASSET} não encontrado`);
  const zip = await download(`${BASE_URL}/${ASSET}`);
  const got = crypto.createHash('sha256').update(zip).digest('hex');
  if (got !== expected) throw new Error(`SHA-256 não confere para ${ASSET}`);
  const AdmZip = require('adm-zip');
  fs.mkdirSync(dir, { recursive: true });
  new AdmZip(zip).extractAllTo(dir, true);
  return dir;
}

module.exports = { VERSION, PLAIN_VERSION, dirFor, ensure };
