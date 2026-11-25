// Gera o relatório em Markdown a partir dos resultados das passadas.
const fs = require('fs');

const ICON = { PASS: '✅', WARN: '⚠️', FAIL: '❌', INFO: 'ℹ️' };
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

function buildReport(passes, file, platformLabel) {
  const all = passes.flatMap((p) => p.results);
  const count = (s) => all.filter((r) => r.status === s).length;
  let md = `# Relatório de testes do Kona — ${platformLabel}\n\n${new Date().toLocaleString('pt-BR')}\n\n`;
  md += `**${count('PASS')} ok · ${count('WARN')} alertas · ${count('FAIL')} falhas** (${all.length} verificações)\n\n`;
  md += 'Passada **cold**: perfil novo (nada em cache, como na primeira vez que alguém abre o app). '
    + 'Passada **warm**: mesmo perfil aberto de novo, painéis abertos logo após a abertura.\n\n';
  md += 'Desempenho: “quadro perdido” = quadro que passou de 1,5× o tempo de um quadro do monitor. '
    + '“Thread principal livre” = o código da interface não estava ocupado; o custo foi na GPU/compositor.\n\n';
  const problems = all.filter((r) => r.status === 'FAIL' || r.status === 'WARN');
  if (problems.length) {
    md += '## Problemas encontrados\n\n| | Passada | Grupo | Verificação | Detalhes |\n|---|---|---|---|---|\n';
    for (const r of problems) md += `| ${ICON[r.status]} | ${r.pass} | ${esc(r.suite)} | ${esc(r.name)} | ${esc(r.detail)} |\n`;
    md += '\n';
  }
  for (const p of passes) {
    md += `## Passada ${p.pass}\n\n`;
    for (const g of [...new Set(p.results.map((r) => r.suite))]) {
      md += `### ${g}\n\n| | Verificação | Detalhes |\n|---|---|---|\n`;
      for (const r of p.results.filter((x) => x.suite === g)) md += `| ${ICON[r.status]} | ${esc(r.name)} | ${esc(r.detail)} |\n`;
      md += '\n';
    }
  }
  md += 'Capturas de tela na pasta `screens/` ao lado deste relatório. Referências visuais em `tests/baseline/<sistema>/`.\n';
  fs.writeFileSync(file, md);
  return { pass: count('PASS'), warn: count('WARN'), fail: count('FAIL') };
}

module.exports = { buildReport };
