/* ============================================================
   NEXO — export-excel.js
   Gera um .xlsx de verdade (formatado) com o que está na tela:

     • aba "Resumo"  → KPIs, rankings e mês a mês do painel
     • uma aba por planilha selecionada → os registros, já com
       número como número, data como data e Sim/Não legível

   Usa ExcelJS (o SheetJS da importação é a versão community e não
   escreve formatação). Nada aqui depende de coluna fixa: lê os
   mesmos dataset_columns do resto do sistema.
   ============================================================ */

const XLS_COR = {
  tinta:      'FF0A0E13',
  destaque:   'FF34C3B5',
  destaqueEsc:'FF0F5F58',
  cabecalho:  'FF12181F',
  faixa:      'FFF3F6F8',
  borda:      'FFD8DFE6',
  texto:      'FF1B242E',
  suave:      'FF6B7887'
};

/* ---------- utilidades ---------- */

/** Excel: nome de aba tem 31 caracteres e não aceita : \ / ? * [ ] */
function nomeAbaExcel(base, usados){
  let nome = String(base || 'Planilha').replace(/[:\\\/\?\*\[\]]/g, '-').trim().slice(0, 31) || 'Planilha';
  let final = nome, n = 2;
  while(usados.has(final.toLowerCase())){
    const sufixo = ` (${n++})`;
    final = nome.slice(0, 31 - sufixo.length) + sufixo;
  }
  usados.add(final.toLowerCase());
  return final;
}

function larguraColunas(ws, matriz, min=11, max=46){
  const larguras = [];
  matriz.forEach(linha => linha.forEach((v, i) => {
    const t = v === null || v === undefined ? 0 : String(v).length;
    larguras[i] = Math.max(larguras[i] || 0, t);
  }));
  larguras.forEach((l, i) => { ws.getColumn(i+1).width = Math.min(max, Math.max(min, l + 3)); });
}

function estiloCabecalho(row){
  row.eachCell(c => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
    c.fill = { type:'pattern', pattern:'solid', fgColor: { argb: XLS_COR.cabecalho } };
    c.alignment = { vertical:'middle', horizontal:'left' };
    c.border = { bottom: { style:'medium', color:{ argb: XLS_COR.destaque } } };
  });
  row.height = 22;
}

function tituloSecao(ws, texto, larguraMerge){
  const row = ws.addRow([texto]);
  row.getCell(1).font = { bold:true, size:12, color:{ argb: XLS_COR.destaqueEsc }, name:'Calibri' };
  row.getCell(1).alignment = { vertical:'middle' };
  row.height = 24;
  if(larguraMerge > 1) ws.mergeCells(row.number, 1, row.number, larguraMerge);
  return row;
}

function zebrar(ws, primeiraLinha, ultimaLinha, nColunas){
  for(let r = primeiraLinha; r <= ultimaLinha; r++){
    const row = ws.getRow(r);
    const par = (r - primeiraLinha) % 2 === 1;
    for(let c = 1; c <= nColunas; c++){
      const cell = row.getCell(c);
      if(par) cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb: XLS_COR.faixa } };
      cell.border = { bottom: { style:'thin', color:{ argb: XLS_COR.borda } } };
      if(!cell.font) cell.font = { size:10.5, name:'Calibri', color:{ argb: XLS_COR.texto } };
    }
  }
}

function fmtDataArquivo(d){
  const p = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}

/** 'YYYY-MM-DD' → Date (meio-dia UTC pra não escorregar de fuso). */
function paraDataExcel(v){
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
  if(!m) return null;
  return new Date(Date.UTC(+m[1], +m[2]-1, +m[3], 12, 0, 0));
}

/** Converte o valor cru do registro pro tipo certo no Excel. */
function valorParaExcel(valor, col){
  if(valor === null || valor === undefined || valor === '') return null;
  const tipo = col.tipo_detectado;
  // data continua saindo como data de verdade no Excel mesmo se a coluna
  // estiver classificada como categoria (e serial cru do Excel é traduzido)
  if(ehDataISO(valor)) return paraDataExcel(valor) || String(valor);
  if(nomeParecaDeData(col.nome_coluna) && ehSerialDeDataExcel(valor)){
    const iso = excelSerialParaISO(valor);
    if(iso) return paraDataExcel(iso);
  }
  if(tipo === 'data'){ return paraDataExcel(valor) || String(valor); }
  if(tipo === 'booleano'){ return toBool(valor) ? 'Sim' : 'Não'; }
  if(tipo === 'hora'){
    if(typeof valor === 'number' && valor >= 0 && valor < 3) return excelFracToHHMM(valor);
    return String(valor);
  }
  if(tipo === 'numero' || tipo === 'moeda' || tipo === 'percentual'){
    const n = toNumber(valor);
    return n === null ? String(valor) : n;
  }
  return String(valor);
}

function numFmtDaColuna(col){
  if(col.tipo_detectado === 'data') return 'dd/mm/yyyy';
  if(col.tipo_detectado === 'percentual') return '0.0"%"';
  if(col.tipo_detectado === 'moeda') return 'R$ #,##0.00';
  if(col.tipo_detectado === 'numero') return '#,##0.##';
  return null;
}

/* ---------- aba RESUMO ---------- */
function montarAbaResumo(wb, ctx){
  const ws = wb.addWorksheet('Resumo', { views:[{ showGridLines:false }] });
  const LARG = 6;

  const t = ws.addRow([ctx.nomeProjeto]);
  t.getCell(1).font = { bold:true, size:20, color:{ argb: XLS_COR.tinta }, name:'Calibri' };
  t.height = 30;
  ws.mergeCells(t.number, 1, t.number, LARG);

  const s = ws.addRow([`Painel NEXO · gerado em ${new Date().toLocaleString('pt-BR')}`]);
  s.getCell(1).font = { size:10.5, color:{ argb: XLS_COR.suave }, italic:true, name:'Calibri' };
  ws.mergeCells(s.number, 1, s.number, LARG);

  const f = ws.addRow([`Planilhas incluídas: ${ctx.rotulos.join(' · ')}`]);
  f.getCell(1).font = { size:10.5, color:{ argb: XLS_COR.suave }, name:'Calibri' };
  ws.mergeCells(f.number, 1, f.number, LARG);
  ws.addRow([]);

  /* --- KPIs --- */
  tituloSecao(ws, 'INDICADORES', LARG);
  const cabKpi = ws.addRow(['Indicador', 'Valor']);
  estiloCabecalho(cabKpi);
  const iniKpi = cabKpi.number + 1;
  (ctx.analysis.kpis || []).forEach(k => {
    const linha = ws.addRow([k.label, k.value]);
    const cv = linha.getCell(2);
    cv.numFmt = k.format === 'pct' ? '0.0"%"' : (k.format === 'money' ? '#,##0.00' : '#,##0');
    cv.font = { bold:true, size:11, color:{ argb: XLS_COR.tinta }, name:'Calibri' };
    cv.alignment = { horizontal:'right' };
  });
  zebrar(ws, iniKpi, ws.lastRow.number, 2);
  ws.addRow([]);

  /* --- rankings --- */
  (ctx.analysis.rankings || []).forEach(rk => {
    if(!rk.dados || !rk.dados.length) return;
    tituloSecao(ws, `RANKING · ${rk.coluna}`.toUpperCase(), LARG);
    const cab = ws.addRow([rk.coluna, 'Registros', '% do total']);
    estiloCabecalho(cab);
    const ini = cab.number + 1;
    rk.dados.forEach(d => {
      const linha = ws.addRow([d.label, d.count, ctx.analysis.total ? d.count / ctx.analysis.total * 100 : 0]);
      linha.getCell(2).numFmt = '#,##0';
      linha.getCell(2).alignment = { horizontal:'right' };
      linha.getCell(3).numFmt = '0.0"%"';
      linha.getCell(3).alignment = { horizontal:'right' };
    });
    zebrar(ws, ini, ws.lastRow.number, 3);
    ws.addRow([]);
  });

  /* --- indicadores Sim/Não --- */
  (ctx.analysis.donuts || []).forEach(d => {
    if(!d.dados || !d.dados.length) return;
    tituloSecao(ws, `${d.coluna}`.toUpperCase(), LARG);
    const cab = ws.addRow(['Resposta', 'Registros', '% do total']);
    estiloCabecalho(cab);
    const ini = cab.number + 1;
    d.dados.forEach(x => {
      const linha = ws.addRow([x.label, x.count, ctx.analysis.total ? x.count / ctx.analysis.total * 100 : 0]);
      linha.getCell(2).numFmt = '#,##0'; linha.getCell(2).alignment = { horizontal:'right' };
      linha.getCell(3).numFmt = '0.0"%"'; linha.getCell(3).alignment = { horizontal:'right' };
    });
    zebrar(ws, ini, ws.lastRow.number, 3);
    ws.addRow([]);
  });

  /* --- mês a mês --- */
  (ctx.analysis.tendencias || []).forEach(t2 => {
    if(!t2.dados || t2.dados.length < 2) return;
    tituloSecao(ws, `MÊS A MÊS · ${t2.coluna}`.toUpperCase(), LARG);
    const temMetrica = !!t2.metrica;
    const cab = ws.addRow(temMetrica ? ['Mês', 'Registros', `Total de ${t2.metrica}`] : ['Mês', 'Registros']);
    estiloCabecalho(cab);
    const ini = cab.number + 1;
    t2.dados.forEach(p => {
      const linha = ws.addRow(temMetrica ? [p.label, p.count, p.soma] : [p.label, p.count]);
      linha.getCell(2).numFmt = '#,##0'; linha.getCell(2).alignment = { horizontal:'right' };
      if(temMetrica){ linha.getCell(3).numFmt = '#,##0.00'; linha.getCell(3).alignment = { horizontal:'right' }; }
    });
    zebrar(ws, ini, ws.lastRow.number, temMetrica ? 3 : 2);
    ws.addRow([]);
  });

  ws.getColumn(1).width = 46;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 18;
  ws.getColumn(4).width = 14;
  ws.getColumn(5).width = 14;
  ws.getColumn(6).width = 14;
  return ws;
}

/* ---------- abas de DADOS ---------- */
function montarAbaDados(wb, dataset, colunas, registros, usados){
  const ws = wb.addWorksheet(nomeAbaExcel(dataset.rotulo || dataset.nome_aba, usados), { views:[{ state:'frozen', ySplit:1, showGridLines:false }] });

  const cab = ws.addRow(colunas.map(c => c.nome_coluna));
  estiloCabecalho(cab);

  const matriz = [colunas.map(c => c.nome_coluna)];
  registros.forEach(r => {
    const valores = colunas.map(c => valorParaExcel(r.dados[c.nome_coluna], c));
    const linha = ws.addRow(valores);
    colunas.forEach((c, i) => {
      const cell = linha.getCell(i+1);
      const fmt = (cell.value instanceof Date) ? 'dd/mm/yyyy' : numFmtDaColuna(c);
      if(fmt && typeof cell.value !== 'string') cell.numFmt = fmt;
      if(typeof cell.value === 'number') cell.alignment = { horizontal:'right' };
    });
    matriz.push(valores.map(v => v instanceof Date ? '00/00/0000' : v));
  });

  if(registros.length) zebrar(ws, 2, ws.lastRow.number, colunas.length);
  larguraColunas(ws, matriz);
  if(colunas.length) ws.autoFilter = { from:{ row:1, column:1 }, to:{ row:1, column: colunas.length } };
  return ws;
}

/* ---------- ponto de entrada ---------- */
async function exportarExcel(){
  if(typeof ExcelJS === 'undefined'){
    alert('A biblioteca de Excel não carregou (sem internet?). Recarregue a página e tente de novo.');
    return;
  }
  const datasetIds = activeDatasetIds();
  const datasets = state.datasets.filter(d => datasetIds.includes(d.id));
  if(!datasets.length){ alert('Selecione ao menos uma planilha no filtro acima.'); return; }

  const registrosSel = state.records.filter(r => datasetIds.includes(r.dataset_id));
  const colunasSel = mergedColumnsFor(datasetIds);
  const analysis = state.currentAnalysis || computeAnalysis(colunasSel, registrosSel);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'NEXO';
  wb.created = new Date();

  montarAbaResumo(wb, {
    nomeProjeto: state.project.nome,
    rotulos: datasets.map(d => d.rotulo || d.nome_aba),
    analysis
  });

  const usados = new Set(['resumo']);
  datasets.forEach(d => {
    const colunas = state.columns
      .filter(c => c.dataset_id === d.id)
      .sort((a,b) => (a.ordem ?? 999) - (b.ordem ?? 999));
    const registros = state.records.filter(r => r.dataset_id === d.id);
    montarAbaDados(wb, d, colunas.length ? colunas : colunasSel, registros, usados);
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  // nome de arquivo sem acento: alguns navegadores/sistemas ignoram o atributo
  // "download" quando ele tem caractere fora do ASCII e salvam como "download"
  const nomeArquivo = `NEXO - ${state.project.nome} - ${fmtDataArquivo(new Date())}.xlsx`
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\\/:*?"<>|]/g, '-')
    .replace(/\s{2,}/g, ' ');

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  // o Chrome só respeita o atributo "download" se o link continuar no DOM
  // por um instante depois do clique — remover na hora vira "download.xlsx"
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  return nomeArquivo;
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btnExportXlsx');
  if(!btn) return;
  btn.addEventListener('click', async () => {
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Gerando...';
    try{
      await exportarExcel();
      btn.textContent = 'Baixado ✓';
    }catch(e){
      console.error(e);
      alert('Não consegui gerar o Excel: ' + (e.message || e));
      btn.textContent = original;
    }finally{
      setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1600);
    }
  });
});
