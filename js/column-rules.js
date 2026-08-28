/* ============================================================
   NEXO — column-rules.js
   Regras fixas de classificação de coluna.

   O type-detector adivinha pelo CONTEÚDO. Aqui é o contrário: se
   o NOME da coluna bate com uma regra, a regra manda — sem chute,
   sem depender da amostra. É isso que garante que "Data do evento"
   sempre entre como dimensão, "Fipe" sempre como métrica etc.

   As regras são editáveis pelo usuário na aba "Regras" do projeto
   e ficam salvas no próprio projeto (projects.tema.regrasColunas).
   ============================================================ */

/* ---------- normalização ----------
   "EQUIPE (RESPONSÁVEL RECUPERAÇÃO)" e "Equipe responsavel recuperacao"
   viram exatamente a mesma chave: sem acento, minúsculo, pontuação
   e parênteses viram espaço, espaços repetidos colapsam. */
function normalizarNomeColuna(s){
  return String(s ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/* ---------- regras padrão (o pedido do cliente) ----------
   nome    = rótulo mostrado na aba Regras
   tipo    = um de TIPO_OPTIONS
   papel   = um de PAPEL_OPTIONS
   apelidos = outros jeitos que a mesma coluna aparece nas planilhas
   A comparação é SEMPRE por nome inteiro normalizado (nunca "contém"),
   pra "Quantidade" não sequestrar "Quantidade de equipamentos". */
const REGRAS_COLUNAS_PADRAO = [
  { nome: 'Quantidade',                              tipo: 'booleano',  papel: 'dimensao',  apelidos: ['qtd', 'qtde', 'qtd.', 'quant'] },
  { nome: 'EQUIPE (ACIONADA)',                       tipo: 'categoria', papel: 'dimensao',  apelidos: ['equipe acionada', 'equipe de acionamento'] },
  { nome: 'EQUIPE (RESPONSÁVEL RECUPERAÇÃO)',        tipo: 'categoria', papel: 'dimensao',  apelidos: ['equipe responsavel', 'equipe recuperacao', 'equipe responsavel pela recuperacao'] },
  { nome: 'FINALIZADO',                              tipo: 'categoria', papel: 'dimensao',  apelidos: ['finalizada', 'status finalizado'] },
  { nome: 'EMPRESA CLIENTE',                         tipo: 'categoria', papel: 'dimensao',  apelidos: ['cliente', 'empresa do cliente'] },
  { nome: 'Mês do evento',                           tipo: 'categoria', papel: 'dimensao',  apelidos: ['mes evento', 'mes'] },
  { nome: 'Data do evento',                          tipo: 'categoria', papel: 'dimensao',  apelidos: ['data evento'] },
  { nome: 'Marca',                                   tipo: 'categoria', papel: 'dimensao',  apelidos: ['marca do veiculo', 'marca veiculo'] },
  { nome: 'Modelo do Veículo',                       tipo: 'categoria', papel: 'dimensao',  apelidos: ['modelo', 'modelo veiculo'] },
  { nome: 'TIPO DE EVENTO',                          tipo: 'categoria', papel: 'dimensao',  apelidos: ['tipo evento'] },
  { nome: 'Fipe',                                    tipo: 'numero',    papel: 'metrica',   apelidos: ['valor fipe', 'fipe r$', 'valor da fipe', 'tabela fipe'] },
  { nome: 'Ano Fab/Modelo',                          tipo: 'categoria', papel: 'dimensao',  apelidos: ['ano fabricacao modelo', 'ano fab', 'ano modelo', 'ano fabricacao'] },
  { nome: 'Bairro',                                  tipo: 'categoria', papel: 'dimensao',  apelidos: [] },
  { nome: 'Município',                               tipo: 'categoria', papel: 'dimensao',  apelidos: ['cidade', 'municipio cidade'] },
  { nome: 'UF',                                      tipo: 'categoria', papel: 'dimensao',  apelidos: ['estado', 'uf estado'] },
  { nome: 'Quantidade de equipamentos (CONTINGÊNCIA)', tipo: 'numero',  papel: 'metrica',   apelidos: ['quantidade de equipamentos', 'qtd equipamentos', 'quantidade equipamentos contingencia', 'equipamentos contingencia'] }
];

/* ---------- regras ativas em memória ---------- */
let REGRAS_ATIVAS = clonarRegras(REGRAS_COLUNAS_PADRAO);

function clonarRegras(regras){
  return (regras || []).map(r => ({
    nome: r.nome,
    tipo: r.tipo,
    papel: r.papel,
    apelidos: Array.isArray(r.apelidos) ? [...r.apelidos] : []
  }));
}

function getRegras(){ return REGRAS_ATIVAS; }

/** Carrega o que veio do projeto; sem nada salvo, usa o padrão. */
function setRegras(regras){
  REGRAS_ATIVAS = (Array.isArray(regras) && regras.length)
    ? clonarRegras(regras).filter(r => r.nome && r.nome.trim())
    : clonarRegras(REGRAS_COLUNAS_PADRAO);
  reconstruirIndice();
  return REGRAS_ATIVAS;
}

function resetRegrasParaPadrao(){ return setRegras(null); }

/* ---------- índice nome normalizado → regra ---------- */
let INDICE_REGRAS = {};
function reconstruirIndice(){
  INDICE_REGRAS = {};
  REGRAS_ATIVAS.forEach(r => {
    const chaves = [r.nome, ...(r.apelidos || [])];
    chaves.forEach(k => {
      const chave = normalizarNomeColuna(k);
      if(chave && !(chave in INDICE_REGRAS)) INDICE_REGRAS[chave] = r; // 1ª regra vence em caso de empate
    });
  });
}
reconstruirIndice();

/** Devolve a regra que cobre esse cabeçalho, ou null. */
function acharRegra(header){
  return INDICE_REGRAS[normalizarNomeColuna(header)] || null;
}

/**
 * Aplica a regra (se houver) em cima do resultado da detecção automática.
 * Devolve o próprio objeto, com origem:'regra' quando a regra mandou.
 */
function aplicarRegraNaColuna(col){
  const regra = acharRegra(col.nome_coluna);
  if(!regra) { col.origem = 'auto'; return col; }
  col.tipo_detectado = regra.tipo;
  col.papel = regra.papel;
  col.confianca = 1;
  col.origem = 'regra';
  col.regra_nome = regra.nome;
  return col;
}

/** Aplica em uma lista inteira de colunas já analisadas. */
function aplicarRegrasNasColunas(colunas){
  return (colunas || []).map(aplicarRegraNaColuna);
}
