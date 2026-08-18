/* ============================================================
   NEXO — insights-engine.js
   Escreve frases em português a partir do resultado do
   analysis-engine — nunca inventa números, só descreve o que
   já foi calculado.
   ============================================================ */

function generateInsights(analysis){
  const out = [];
  if(!analysis.total) return out;

  analysis.rankings.forEach(rk => {
    if(rk.dados.length >= 3){
      const top3 = rk.dados.slice(0,3);
      const soma = top3.reduce((s,r) => s+r.count, 0);
      out.push(`Em "${rk.coluna}", os 3 valores mais frequentes (${top3.map(r=>r.label).join(', ')}) concentram ${(soma/analysis.total*100).toFixed(0)}% dos registros.`);
    }
  });

  analysis.donuts.forEach(dn => {
    const sim = dn.dados.find(d => d.label === 'Sim')?.count || 0;
    const pct = analysis.total ? sim/analysis.total*100 : 0;
    out.push(`${pct.toFixed(0)}% dos registros têm "${dn.coluna}" = Sim.`);
  });

  analysis.tendencias.forEach(tend => {
    if(tend.dados.length < 2) return;
    const arr = tend.dados;
    const meio = Math.floor(arr.length/2);
    const m1 = avg(arr.slice(0,meio).map(t=>t.count));
    const m2 = avg(arr.slice(meio).map(t=>t.count));
    if(m1 > 0 && Math.abs(m2-m1)/m1 >= 0.15){
      out.push(`Por "${tend.coluna}", o volume de registros ao longo do tempo está ${m2>m1 ? 'em alta' : 'em queda'} no período mais recente (${m2>m1?'+':''}${((m2-m1)/m1*100).toFixed(0)}%).`);
    }
  });

  const moneyKpi = analysis.kpis.find(k => k.format === 'money' && k.label.startsWith('Total de'));
  if(moneyKpi){
    out.push(`${moneyKpi.label}: ${fmtMoney(moneyKpi.value)}.`);
  }

  return out;
}
