// O6: consumo de memória do Kona comparado com Chrome e Edge, com o mesmo método para os três.
// Mesmas páginas reais, perfis temporários, janela maximizada; mede depois de 40 s parado.
// Memória = soma do "conjunto de trabalho privado" (a coluna Memória do Gerenciador de Tarefas)
// de todos os processos do navegador; o conjunto de trabalho total (que conta a memória
// compartilhada várias vezes) vai junto como referência.
// Os processos de cada navegador: a árvore a partir do processo principal, mais os que levam o
// --user-data-dir temporário na linha de comando (um Chrome/Edge já aberto não entra na conta).
const os = require('os'); const path = require('path'); const fs = require('fs');
const { spawn, execFileSync } = require('child_process');
process.env.KONA_USER_DATA = path.join(os.tmpdir(), `kona-memcmp-${process.pid}`);
require('../../main.js');
const { app, BrowserWindow } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('R', ...a);
const SETTLE = 40000;

const PAGES = [
  'https://en.wikipedia.org/wiki/Web_browser',
  'https://www.youtube.com/',
  'https://github.com/electron/electron',
  'https://www.reddit.com/r/technology/',
  'https://www.bbc.com/news',
  'https://www.amazon.com/',
  'https://stackoverflow.com/questions',
  'https://www.theverge.com/',
  'https://docs.python.org/3/library/index.html',
  'https://www.nytimes.com/',
];
const BROWSERS = {
  Chrome: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  Edge: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
};

// Todos os processos do Windows: pid, pai, nome, linha de comando e memória
function snapshot() {
  const ps = `$ErrorActionPreference='SilentlyContinue';
    $p = Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine;
    $m = Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | Select-Object IDProcess,WorkingSetPrivate,WorkingSet;
    @{ p = $p; m = $m } | ConvertTo-Json -Depth 3 -Compress`;
  const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8', maxBuffer: 64e6 });
  const j = JSON.parse(out);
  const mem = new Map(j.m.map((x) => [x.IDProcess, x]));
  return j.p.map((x) => ({ ...x, priv: mem.get(x.ProcessId)?.WorkingSetPrivate || 0, ws: mem.get(x.ProcessId)?.WorkingSet || 0 }));
}

function measure(rootPid, marker, exe) {
  const procs = snapshot();
  const set = new Set([rootPid]);
  for (const p of procs) if (marker && p.CommandLine && p.CommandLine.toLowerCase().includes(marker.toLowerCase())) set.add(p.ProcessId);
  for (let grew = true; grew;) {
    grew = false;
    for (const p of procs) if (!set.has(p.ProcessId) && set.has(p.ParentProcessId)) { set.add(p.ProcessId); grew = true; }
  }
  // só os do próprio navegador (o PowerShell que o script abre para medir é filho do Kona)
  const mine = procs.filter((p) => set.has(p.ProcessId) && p.Name.toLowerCase() === exe.toLowerCase());
  const kinds = {};
  for (const p of mine) {
    const k = (p.CommandLine || '').match(/--type=([\w-]+)/)?.[1] || 'browser';
    kinds[k] = kinds[k] || { n: 0, mb: 0 };
    kinds[k].n++; kinds[k].mb += p.priv / 1048576;
  }
  return {
    procs: mine.length,
    privMB: Math.round(mine.reduce((s, p) => s + p.priv, 0) / 1048576),
    wsMB: Math.round(mine.reduce((s, p) => s + p.ws, 0) / 1048576),
    kinds: Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, `${v.n}× ${Math.round(v.mb)} MB`])),
  };
}

async function runChromium(name, exe, urls) {
  const dir = path.join(os.tmpdir(), `memcmp-${name}-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  const child = spawn(exe, [`--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check',
    '--start-maximized', '--new-window', ...urls], { stdio: 'ignore', detached: true });
  await sleep(SETTLE);
  const r = measure(child.pid, dir, path.win32.basename(exe));
  try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
  // os que escaparam da árvore (ex.: relançados) saem pela linha de comando
  for (const p of snapshot()) if (p.CommandLine && p.CommandLine.includes(dir)) try { process.kill(p.ProcessId); } catch {}
  await sleep(3000);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  return r;
}

const results = [];
const report = (browser, tabs, r) => {
  results.push({ browser, tabs, ...r });
  log(`${browser.padEnd(6)} ${String(tabs).padStart(2)} aba(s): ${String(r.privMB).padStart(5)} MB privados · ${String(r.wsMB).padStart(5)} MB conj. trabalho · ${r.procs} processos · ${JSON.stringify(r.kinds)}`);
};

app.whenReady().then(async () => {
  let w; while (!(w = BrowserWindow.getAllWindows()[0])) await sleep(50);
  await sleep(3000);
  const js = (c) => w.webContents.executeJavaScript(c);
  await js("settings.sounds = false; settings.memorySaver = false; 0");
  w.minimize();

  for (const [name, exe] of Object.entries(BROWSERS)) {
    if (!fs.existsSync(exe)) { log(name, 'não encontrado em', exe); continue; }
    report(name, 1, await runChromium(name, exe, PAGES.slice(0, 1)));
    report(name, 10, await runChromium(name, exe, PAGES));
  }

  // Kona: a mesma janela, primeiro com 1 aba, depois com as 10
  w.restore(); w.maximize(); w.focus();
  await js(`navigate(active(), ${JSON.stringify(PAGES[0])}); 0`);
  await sleep(SETTLE);
  report('Kona', 1, measure(process.pid, null, path.win32.basename(process.execPath)));
  await js(`${JSON.stringify(PAGES.slice(1))}.forEach((u) => newTab(u, false)); 0`);
  await sleep(SETTLE);
  log('abas do Kona:', await js('tabs.length'), '· webviews:', await js("document.querySelectorAll('#views webview').length"));
  report('Kona', 10, measure(process.pid, null, path.win32.basename(process.execPath)));

  fs.writeFileSync(path.join(os.tmpdir(), 'kona-memcmp.json'), JSON.stringify(results, null, 2));
  log('resultado em', path.join(os.tmpdir(), 'kona-memcmp.json'));
  app.exit(0);
});
