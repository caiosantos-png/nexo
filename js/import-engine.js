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

const SHEET_EXCLUDE_KEYWORDS = ['RESUMO','ÍNDICE','INDICE','NÃO ACIONAD','NAO ACIONAD'];

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
      headers = (rows[headerIdx] || []).map(h => String(h).trim()).filter(Boolean);
      dataRows = rows.slice(headerIdx + 1).filter(r => r.some(c => c !== '' && c !== null && c !== undefined));
    }

    const excluded = SHEET_EXCLUDE_KEYWORDS.some(k => name.toUpperCase().includes(k));
    return {
      name, headers, dataRows, isReport,
      rowCount: dataRows.length,
      defaultInclude: !excluded && headers.length > 0 && dataRows.length > 0,
      rotulo: guessRotuloFromSheetName(name)
    };
  }).filter(s => s.headers.length > 0);
}

/** Converte as linhas cruas de uma aba em registros genéricos { header: valor }. */
function rowsToRecords(headers, dataRows, columnDefs){
  const dateColSet = new Set(columnDefs.filter(c => c.tipo_detectado === 'data').map(c => c.nome_coluna));
  const timeColSet = new Set(columnDefs.filter(c => c.tipo_detectado === 'hora').map(c => c.nome_coluna));
  return dataRows.map(row => {
    const dados = {};
    headers.forEach((h, idx) => {
      let v = row[idx];
      if(v === '' || v === null || v === undefined) return;
      if(dateColSet.has(h)){
        const parsed = parseDateLoose(v);
        if(parsed) v = parsed;
      }else if(timeColSet.has(h) && typeof v === 'number'){
        v = excelFracToHHMM(v);
      }
      dados[h] = v;
    });
    return dados;
  });
}
