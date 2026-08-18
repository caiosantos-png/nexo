/* ============================================================
   NEXO — presentation-engine.js
   Monta a lista de slides a partir do resultado do
   analysis-engine — só entra slide que tem dado de verdade.
   ============================================================ */

function buildSlideDefs(a){
  const insights = generateInsights(a);
  const defs = [{ type:'title' }, { type:'kpis' }];
  // planilhas com muitas colunas geram muitos insights — quebra em várias
  // telas de no máximo 8, pra caber sem cortar texto
  const INSIGHTS_POR_SLIDE = 8;
  for(let i=0; i<insights.length; i += INSIGHTS_POR_SLIDE){
    defs.push({ type:'insights', insights: insights.slice(i, i+INSIGHTS_POR_SLIDE), pagina: Math.floor(i/INSIGHTS_POR_SLIDE)+1, totalPaginas: Math.ceil(insights.length/INSIGHTS_POR_SLIDE) });
  }
  a.rankings.forEach(rk => defs.push({ type:'ranking', title:`Top "${rk.coluna}"`, data: rk.dados }));
  a.donuts.forEach(dn => defs.push({ type:'donut', title:`"${dn.coluna}"`, data: dn.dados }));
  a.tendencias.forEach(tend => {
    defs.push({ type:'line', title:`Tendência — "${tend.coluna}"`, data: tend.dados.map(t => ({ label:t.label, count:t.count })) });
  });
  defs.push({ type:'closing', insights: insights.slice(0,5) });
  return defs;
}
