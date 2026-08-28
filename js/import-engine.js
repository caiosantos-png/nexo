/* ============================================================
   NEXO — import-engine.js
   Lê o arquivo (.xlsx/.csv), detecta abas com dados reais e
   acha sozinho a linha de cabeçalho (nem sempre é a primeira).
   ============================================================ */

function detectHeaderRow(rows){
  let bestIdx = 0, bestScore = -1;
  for(let i = 0; i < Math.min(10, rows.length); i++){
    const row = rows[i] || [];
    const score = row.filter(c => typeof c === 'string' && c.trim().length > 2 && isNaN(c)).length;
    if(score > bestScore){ bestScore = score; bestIdx = i; }
  }
  return bestIdx;
}

const SHEET_EXCLUDE_KEYWORDS = ['RESUMO','ÍNDICE','INDICE','NÃO ACIONAD','NAO ACIONAD','FIPE'];

function guessRotuloFromSheetName(name){
  return name.replace(/^\d+[_\-\s]*/,'').trim() || name;
}

// ----------------------------------------------------------------
// PLANILHAS "RELATÓRIO" — várias tabelinhas empilhadas (Indicador × Mês),
// comuns em relatórios gerenciais/Kaizen. Detecta e converte pra registros
// genéricos (Seção, Indicador, Período, Valor) que o resto do sistema entende.
// ----------------------------------------------------------------
function looksLikeHeaderRow(row){
  const rest = row.slice(1).filter(c => c !== '' && c !== null && c !== undefined);
  if(!rest.length) return false;
  const shortText = rest.filter(c => typeof c === 'string' && c.length <= 30).length;
  return shortText / rest.length >= 0.6;
}

function splitIntoBlocks(rows){
  const blocks = [];
  let current = [];
  rows.forEach(row => {
    const empty = row.every(c => c === '' || c === null || c === undefined);
    if(empty){ if(current.length) blocks.push(current); current = []; }
    else current.push(row);
  });
  if(current.length) blocks.push(current);
  return blocks;
}

function isReportStyleSheet(rows){
  const blocks = splitIntoBlocks(rows);
  let tabularBlocks = 0;
  blocks.forEach(b => {
    for(let i=0; i<Math.min(3,b.length); i++){
      if(looksLikeHeaderRow(b[i]) && b.length > i+1){ tabularBlocks++; break; }
    }
  });
  return blocks.length >= 3 && tabularBlocks >= 2;
}

function parseReportSheet(rows){
  const blocks = splitIntoBlocks(rows);
  const records = [];
  let secao = '';
  blocks.forEach(block => {
    let headerIdx = -1;
    for(let i=0; i<Math.min(3,block.length); i++){
      if(looksLikeHeaderRow(block[i])){ headerIdx = i; break; }
    }
    if(headerIdx === -1){
      block.forEach(row => {
        const nonEmpty = row.filter(c => c !== '' && c !== null && c !== undefined);
        if(nonEmpty.length === 1 && typeof row[0] === 'string' && row[0].trim()) secao = row[0].trim();
      });
      return;
    }
    for(let i=0; i<headerIdx; i++){
      if(typeof block[i][0] === 'string' && block[i][0].trim()) secao = block[i][0].trim();
    }
    const header = block[headerIdx];
    block.slice(headerIdx+1).forEach(row => {
      const indicador = row[0];
      if(indicador === '' || indicador === null || indicador === undefined) return;
      for(let j=1; j<header.length; j++){
        const periodoRaw = header[j];
        const valor = row[j];
        if(periodoRaw === '' || periodoRaw === null || periodoRaw === undefined) continue;
        if(valor === '' || valor === null || valor === undefined) continue;
        const periodo = String(periodoRaw).trim();
        if(/variaç|var\.|delta/i.test(periodo)) continue; // pula colunas já calculadas (variação/delta)
        records.push([secao, String(indicador).trim(), periodo, valor]);
      }
    });
  });
  return records;
}

/** Lê o ArrayBuffer do arquivo e devolve uma lista de abas candidatas (com dados). */
function parseWorkbook(arrayBuffer){
  const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array', cellDates: false });
  return wb.SheetNames.map(name => {
    const sheet = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    let headers, dataRows, isReport = false;
    if(isReportStyleSheet(rows)){
      headers = ['Seção','Indicador','Período','Valor'];
      dataRows = parseReportSheet(rows);
      isReport = true;
    }else{
      const headerIdx = detectHeaderRow(rows);
      const rawHeader = rows[headerIdx] || [];
      // mantém o alinhamento com as colunas originais: um cabeçalho em branco
      // no MEIO da planilha vira "Coluna N" em vez de simplesmente sumir da
      // lista (o que empurrava os dados das colunas seguintes pro nome errado)
      let lastNonEmpty = -1;
      rawHeader.forEach((h,i) => { if(String(h).trim()) lastNonEmpty = i; });
      headers = rawHeader.slice(0, lastNonEmpty+1).map((h,i) => String(h).trim().replace(/\s+/g, ' ') || `Coluna ${i+1}`);
      dataRows = rows.slice(headerIdx + 1).filter(r => r.slice(0, headers.length).some(c => c !== '' && c !== null && c !== undefined));
    }

    const excluded = SHEET_EXCLUDE_KEYWORDS.some(k => name.toUpperCase().includes(k));
    return {
      name, headers, dataRows, isReport,
      rowCount: dataRows.length,
      defaultInclude: !excluded && headers.length > 0 && dataRows.length > 0,
      rotulo: guessRotuloFromSheetName(name)
    };
  }).filter(s => s.headers.length > 0);

  // se a maioria das abas (não-relatório) compartilha o mesmo conjunto de
  // colunas — comum em planilhas mensais recorrentes — uma aba com estrutura
  // bem diferente provavelmente é resumo/referência, mesmo que o nome dela
  // não bata com nenhuma palavra-chave de exclusão conhecida
  const contagemPorAssinatura = {};
  sheets.forEach(s => {
    if(s.isReport) return;
    const assinatura = [...s.headers].sort().join('|');
    contagemPorAssinatura[assinatura] = (contagemPorAssinatura[assinatura] || 0) + 1;
  });
  const maioria = Object.entries(contagemPorAssinatura).sort((a,b) => b[1]-a[1])[0];
  if(maioria && maioria[1] >= 2){
    const colunasDaMaioria = new Set(maioria[0].split('|'));
    sheets.forEach(s => {
      if(s.isReport || !s.defaultInclude) return;
      const sobreposicao = s.headers.filter(h => colunasDaMaioria.has(h)).length / Math.max(s.headers.length, 1);
      if(sobreposicao < 0.4) s.defaultInclude = false; // estrutura destoante — provável resumo/referência
    });
  }

  return sheets;
}

/** Converte as linhas cruas de uma aba em registros genéricos { header: valor }. */
function rowsToRecords(headers, dataRows, columnDefs){
  // IMPORTANTE: a conversão segue o CONTEÚDO da coluna (tipo_conteudo), não o
  // tipo final. Uma coluna de data classificada como "categoria" por uma regra
  // fixa continua sendo gravada como 2026-01-15 — senão o serial cru do Excel
  // (46037) ia parar no banco e aparecia assim nos gráficos.
  const ehTipo = (c, tipo) => c.tipo_conteudo === tipo || c.tipo_detectado === tipo;
  const dateColSet = new Set(columnDefs.filter(c => ehTipo(c,'data')).map(c => c.nome_coluna));
  const timeColSet = new Set(columnDefs.filter(c => ehTipo(c,'hora') && !dateColSet.has(c.nome_coluna)).map(c => c.nome_coluna));
  const pctColSet  = new Set(columnDefs.filter(c => ehTipo(c,'percentual')).map(c => c.nome_coluna));
  return dataRows.map(row => {
    const dados = {};
    headers.forEach((h, idx) => {
      let v = row[idx];
      if(v === '' || v === null || v === undefined) return;
      if(dateColSet.has(h)){
        const parsed = parseDateLoose(v) || (ehSerialDeDataExcel(v) ? excelSerialParaISO(v) : null);
        if(parsed) v = parsed;
      }else if(timeColSet.has(h) && typeof v === 'number'){
        v = excelFracToHHMM(v);
      }else if(pctColSet.has(h) && typeof v === 'number'){
        v = Math.round(v * 10000) / 100; // 0,5833952 -> 58,34
      }
      dados[h] = v;
    });
    return dados;
  });
}
