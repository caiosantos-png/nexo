/* ============================================================
   NEXO — analysis-engine.js
   Calcula KPIs, rankings, donuts e tendência a partir das
   COLUNAS DETECTADAS (dataset_columns) — SEM limite de quantas:
   toda métrica, toda categoria, todo indicador e toda data da
   planilha viram widget no painel.
   ============================================================ */

function toNumber(v){
  if(v === null || v === undefined || v === '') return null;
  if(typeof v === 'number') return v;
  let s = String(v).trim().replace(/[R$€\s]/g,'');
  if(s.includes(',') && s.includes('.')) s = s.replace(/\./g,'').replace(',', '.');
  else if(s.includes(',')) s = s.replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}
function toBool(v){ return BOOLEAN_TRUE.includes(String(v).trim().toLowerCase()); }
function fmtMoney(n){ return (n||0).toLocaleString('pt-BR', { maximumFractionDigits: 0 }); }
function avg(arr){ return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }

function rankBy(records, coluna, limit=10){
  const counts = {};
  records.forEach(r => {
    const v = r.dados[coluna];
    if(v === '' || v === null || v === undefined){ counts['(vazio)'] = (counts['(vazio)']||0) + 1; return; }
    // data guardada como 2026-01-15 aparece no gráfico como 15/01/2026; e se
    // sobrou algum serial cru do Excel (46037), traduz na hora de exibir
    let k = String(v);
    if(ehDataISO(v)) k = fmtDataBR(v);
    else if(nomeParecaDeData(coluna) && ehSerialDeDataExcel(v)){
      const iso = excelSerialParaISO(v);
      if(iso) k = fmtDataBR(iso);
    }
    counts[k] = (counts[k]||0) + 1;
  });
  return Object.entries(counts).map(([label,count]) => ({label,count})).sort((a,b)=>b.count-a.count).slice(0,limit);
}

function fmtMonthLabel(m){
  const [y,mo] = m.split('-');
  const meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  return `${meses[parseInt(mo,10)-1]}/${y.slice(2)}`;
}

/**
 * columns: [{ nome_coluna, tipo_detectado, papel }]
 * records: [{ dados: {...} }]
 */
function computeAnalysis(columns, records){
  const total = records.length;
  const metricas = columns.filter(c => c.papel === 'metrica');
  const dimensoesCategoria = columns.filter(c => c.papel === 'dimensao' && c.tipo_detectado === 'categoria');
  const dimensoesBool = columns.filter(c => c.papel === 'dimensao' && c.tipo_detectado === 'booleano');
  const dataCols = columns.filter(c => c.papel === 'data');

  // KPIs: TODA métrica (total + média) e TODO indicador Sim/Não, sem limite
  const kpis = [{ label: 'Total de registros', value: total, format: 'int' }];
  metricas.forEach(m => {
    const vals = records.map(r => toNumber(r.dados[m.nome_coluna])).filter(v => v !== null);
    if(!vals.length) return;
    if(/conting/i.test(m.nome_coluna)){
      // "contingência" só existe de verdade quando há 2 equipamentos (o 2º é o
      // backup) — somar o valor bruto (1+1+2+0...) não tem esse significado
      const comContingencia = vals.filter(v => v === 2).length;
      kpis.push({ label: `${m.nome_coluna} — com contingência (2 equip.)`, value: comContingencia, format: 'int' });
      kpis.push({ label: `% com contingência`, value: records.length ? comContingencia/records.length*100 : 0, format: 'pct' });
      return;
    }
    if(m.tipo_detectado === 'percentual'){
      // percentual não se soma (não faz sentido somar taxas) — só a média
      kpis.push({ label: `Média de ${m.nome_coluna}`, value: vals.reduce((a,b)=>a+b,0)/vals.length, format: 'pct' });
      return;
    }
    const soma = vals.reduce((a,b)=>a+b,0);
    kpis.push({ label: `Total de ${m.nome_coluna}`, value: soma, format: 'money' });
    kpis.push({ label: `Média de ${m.nome_coluna}`, value: soma/vals.length, format: 'money' });
  });
  dimensoesBool.forEach(d => {
    const trues = records.filter(r => toBool(r.dados[d.nome_coluna])).length;
    kpis.push({ label: `${d.nome_coluna} = Sim`, value: total ? trues/total*100 : 0, format: 'pct' });
  });

  // Rankings: TODA coluna de categoria vira gráfico
  const rankings = dimensoesCategoria.map(d => ({ coluna: d.nome_coluna, dados: rankBy(records, d.nome_coluna) }));

  // Donuts: TODO indicador Sim/Não vira gráfico
  const donuts = dimensoesBool.map(d => {
    const trues = records.filter(r => toBool(r.dados[d.nome_coluna])).length;
    return { coluna: d.nome_coluna, dados: [{label:'Sim', count:trues}, {label:'Não', count: total-trues}] };
  });

  // Tendência: UMA linha do tempo pra CADA coluna de data (não só a primeira)
  const tendencias = dataCols.map(dataCol => {
    const metricaPrincipal = metricas[0];
    const porMes = {};
    records.forEach(r => {
      const d = r.dados[dataCol.nome_coluna];
      if(!d) return;
      const mes = String(d).slice(0,7);
      if(!/^\d{4}-\d{2}$/.test(mes)) return;
      if(!porMes[mes]) porMes[mes] = { count:0, soma:0 };
      porMes[mes].count++;
      if(metricaPrincipal){ const v = toNumber(r.dados[metricaPrincipal.nome_coluna]); if(v !== null) porMes[mes].soma += v; }
    });
    const meses = Object.keys(porMes).sort();
    if(meses.length < 2) return null;
    return {
      coluna: dataCol.nome_coluna, metrica: metricaPrincipal ? metricaPrincipal.nome_coluna : null,
      dados: meses.map(mes => ({ label: fmtMonthLabel(mes), count: porMes[mes].count, soma: porMes[mes].soma }))
    };
  }).filter(Boolean);

  return { total, kpis, rankings, donuts, tendencias, metricas, dimensoesCategoria, dimensoesBool, dataCols };
}
