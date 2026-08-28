/* ============================================================
   NEXO — type-detector.js
   Classifica cada coluna pelo CONTEÚDO (não pelo nome): data,
   número, booleano, categoria ou texto — e sugere um papel
   (dimensão, métrica, data, identificador, ignorar).
   ============================================================ */

const MESES_PT = { janeiro:1,fevereiro:2,marco:3,'março':3,abril:4,maio:5,junho:6,julho:7,agosto:8,setembro:9,outubro:10,novembro:11,dezembro:12,
  jan:1,fev:2,mar:3,abr:4,mai:5,jun:6,jul:7,ago:8,set:9,out:10,nov:11,dez:12 };

function parseDateLoose(v){
  if(v === null || v === undefined || v === '') return null;
  if(typeof v === 'number'){
    if(typeof XLSX !== 'undefined' && XLSX.SSF){
      const d = XLSX.SSF.parse_date_code(v);
      if(d && d.y >= 1990 && d.y <= 2100) return new Date(Date.UTC(d.y, d.m-1, d.d)).toISOString().slice(0,10);
    }
    return null;
  }
  const s = String(v).trim().replace(/\s*-?\s*\d{1,2}:\d{2}(:\d{2})?\s*$/, '').trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if(m){ let [,d,mo,y] = m; if(y.length===2) y = '20'+y; return `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`; }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if(m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  // "Maio/26", "Maio/2026", "mai/26" — comum em relatórios gerenciais
  m = s.match(/^([A-Za-zÀ-ÿ]+)\/(\d{2,4})$/);
  if(m){
    const nome = m[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const mesNum = MESES_PT[nome];
    if(mesNum){ let y = m[2]; if(y.length===2) y = '20'+y; return `${y}-${String(mesNum).padStart(2,'0')}-01`; }
  }
  return null;
}

function parseNumberLoose(v){
  if(v === null || v === undefined || v === '') return null;
  if(typeof v === 'number') return v;
  let s = String(v).trim().replace(/[R$€%\s]/g,'');
  if(!s || /[a-zA-Z]/.test(s)) return null;
  if(s.includes(',') && s.includes('.')) s = s.replace(/\./g,'').replace(',', '.');
  else if(s.includes(',')) s = s.replace(',', '.');
  // exige que a string INTEIRA seja um número — sem isso, "04/08/2026 - 02:05"
  // passava porque parseFloat lê só o "04" antes da barra e ignora o resto
  if(!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

const BOOLEAN_TRUE = ['sim','yes','true','1','verdadeiro'];
const BOOLEAN_FALSE = ['nao','não','no','false','0','falso'];
function parseBooleanLoose(v){
  const s = String(v).trim().toLowerCase();
  if(BOOLEAN_TRUE.includes(s)) return true;
  if(BOOLEAN_FALSE.includes(s)) return false;
  return null;
}

/**
 * Analisa uma coluna (nome + amostra de valores) e devolve tipo/papel sugeridos.
 */
function analyzeColumn(header, values){
  const nonEmpty = values.filter(v => v !== '' && v !== null && v !== undefined);
  const total = values.length;
  const filled = nonEmpty.length;

  if(!filled){
    return { nome_coluna: header, tipo_detectado: 'texto', papel: 'ignorar', confianca: 0, vazios: total, amostra: [] };
  }

  const dateScore = nonEmpty.filter(v => parseDateLoose(v) !== null).length / filled;
  const boolScore = nonEmpty.filter(v => parseBooleanLoose(v) !== null).length / filled;
  const numScore  = nonEmpty.filter(v => parseNumberLoose(v) !== null).length / filled;
  const distinct = new Set(nonEmpty.map(String));
  const uniqueRatio = distinct.size / filled;

  // coluna de ANO (1900–2100, inteiro): faz mais sentido como categoria do
  // que como métrica somável — "total de ano" não significa nada
  const numericVals = nonEmpty.map(v => parseNumberLoose(v)).filter(v => v !== null);
  const looksLikeYear = numericVals.length >= filled*0.6 &&
    numericVals.every(v => Number.isInteger(v) && v >= 1900 && v <= 2100);

  // coluna de HORA do dia (fração Excel: 0,75 = 18:00) — identificada pelo
  // nome da coluna + valores fracionários entre 0 e 3 (cobre durações também)
  const looksLikeTime = /hora|horário|horario|tempo/i.test(header) &&
    numericVals.length >= filled*0.6 &&
    numericVals.every(v => v >= 0 && v < 3) &&
    numericVals.some(v => v % 1 !== 0);

  // coluna de PERCENTUAL (Excel guarda 58,33% como fração 0,5833...) —
  // identificada pelo nome + valores fracionários entre -1 e 1
  const looksLikePercent = /percentual|porcentagem|aproveitamento|taxa|^%|indice|índice/i.test(header) &&
    numericVals.length >= filled*0.6 &&
    numericVals.every(v => v >= -1 && v <= 1) &&
    numericVals.some(v => v % 1 !== 0);

  let tipo, papel, confianca;
  if(dateScore >= 0.6){
    tipo = 'data'; papel = 'data'; confianca = dateScore;
  }else if(boolScore === 1 && distinct.size <= 2){
    // só é booleano se TODOS os valores forem sim/não/etc — evita confundir
    // com colunas numéricas pequenas (0,1,2...) onde "0" e "1" também bateriam
    tipo = 'booleano'; papel = 'dimensao'; confianca = 1;
  }else if(looksLikeTime){
    tipo = 'hora'; papel = 'ignorar'; confianca = 0.6;
  }else if(looksLikePercent){
    tipo = 'percentual'; papel = 'metrica'; confianca = 0.7;
  }else if(looksLikeYear && distinct.size <= 60){
    tipo = 'categoria'; papel = 'dimensao'; confianca = 0.7;
  }else if(numScore >= 0.6){
    tipo = 'numero'; papel = 'metrica'; confianca = numScore;
  }else if(distinct.size >= 2 && distinct.size <= 40 && uniqueRatio <= 0.6){
    tipo = 'categoria'; papel = 'dimensao'; confianca = 1 - uniqueRatio;
  }else if(uniqueRatio > 0.6){
    // sem buraco entre categoria e identificador: acima de 0.6 já é identificador
    tipo = 'texto'; papel = 'identificador'; confianca = uniqueRatio;
  }else{
    tipo = 'texto'; papel = 'ignorar'; confianca = 0.3;
  }

  // ramal, telefone, CEP etc. são números mas não fazem sentido como métrica
  // somável — viram identificador mesmo passando no teste de "número"
  if(papel === 'metrica' && /\bramal\b|telefone|celular|\bcep\b|whatsapp/i.test(header)){
    papel = 'identificador';
  }

  return {
    nome_coluna: header,
    tipo_detectado: tipo,
    // o que o CONTEÚDO é, independente do que a regra fixa vai mandar depois.
    // É por aqui que a importação sabe converter o número serial do Excel em
    // data mesmo quando a coluna foi classificada como categoria/dimensão.
    tipo_conteudo: tipo,
    papel,
    confianca: Math.round(confianca * 100) / 100,
    vazios: total - filled,
    amostra: nonEmpty.slice(0, 3).map(String)
  };
}

/** Roda analyzeColumn pra todas as colunas de uma aba já lida (headers + dataRows).
 *  Depois da detecção automática, as REGRAS FIXAS (column-rules.js) passam por
 *  cima do que bateu com o nome de alguma regra — é o que deixa a
 *  pré-visualização já vir configurada no padrão do cliente. */
function analyzeSheetColumns(headers, dataRows){
  const cols = headers.map((h, idx) => analyzeColumn(h, dataRows.slice(0, 200).map(r => r[idx])));
  return (typeof aplicarRegrasNasColunas === 'function') ? aplicarRegrasNasColunas(cols) : cols;
}

const TIPO_OPTIONS = ['data','hora','percentual','numero','moeda','booleano','categoria','texto'];
const PAPEL_OPTIONS = ['data','metrica','dimensao','identificador','ignorar'];

/** Excel guarda hora do dia como fração (0,75 = 18:00). Converte pra "HH:MM". */
function excelFracToHHMM(frac){
  const totalMin = Math.round((frac % 1) * 24 * 60);
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
}

/* ============================================================
   DATAS QUE VÊM COMO NÚMERO DO EXCEL
   O Excel guarda 15/01/2026 como 46037 (dias desde 30/12/1899).
   Se a coluna acabar classificada como categoria/texto, esse número
   ia parar cru no banco e aparecia "46037" no gráfico. Estas funções
   são o tradutor usado na importação, na exibição e no conserto.
   ============================================================ */

/** Faixa plausível pra data em serial do Excel: 1954 → 2064. */
const EXCEL_SERIAL_MIN = 20000;
const EXCEL_SERIAL_MAX = 60000;

function ehSerialDeDataExcel(v){
  const n = typeof v === 'number' ? v : (typeof v === 'string' && /^\d{4,5}(\.\d+)?$/.test(v.trim()) ? parseFloat(v) : NaN);
  return Number.isFinite(n) && n >= EXCEL_SERIAL_MIN && n <= EXCEL_SERIAL_MAX;
}

/** 46037 → '2026-01-15' (30/12/1899 + n dias; parte fracionária é a hora). */
function excelSerialParaISO(v){
  const n = typeof v === 'number' ? v : parseFloat(v);
  if(!Number.isFinite(n)) return null;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000);
  if(isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** true pra '2026-01-15' (o formato em que o NEXO guarda data). */
function ehDataISO(v){
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim());
}

/** '2026-01-15' → '15/01/2026' (só pra mostrar; o banco continua ISO). */
function fmtDataBR(v){
  if(!ehDataISO(v)) return v;
  const [y, m, d] = String(v).trim().split('-');
  return `${d}/${m}/${y}`;
}

/** O nome da coluna fala de data? (usado pra não confundir com Fipe e afins) */
function nomeParecaDeData(nome){
  return /\bdata\b|\bdatas\b|\bdate\b|\bdt\b|vencimento|emissao|emissão|nascimento|acionamento|ocorrencia|ocorrência/i
    .test(String(nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
}
