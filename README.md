# NEXO — Fase 1 completa (Auth + Projetos + Import + Dashboard + Apresentação)

Auth, projetos, import genérico com pré-visualização/validação, dashboard
dinâmico e agora **Apresentação** (slides em tela cheia + exportação PDF e
PPTX) — tudo lendo os mesmos `dataset_columns` genéricos, sem campo fixo.

## Configuração (uma vez só, antes de publicar)

Abra `js/supabase-client.js` e troque as duas primeiras linhas pela URL e
a **anon public key** do seu projeto Supabase (Project Settings → API):

```js
const SUPABASE_URL = 'https://SEU-PROJETO.supabase.co';
const SUPABASE_ANON_KEY = 'SUA-ANON-KEY-AQUI';
```

Essa chave é feita pra ficar exposta no navegador — quem protege os dados
de verdade é o RLS (as regras já vêm no `schema.sql`). O usuário final
**nunca vê nenhuma tela de configuração** — só login e projetos.

## Como rodar (com Go Live / servidor local)

Este projeto é só HTML/CSS/JS — sem build. Mas **não abra os arquivos em
`file://`** (duplo clique) depois desta etapa: o navegador bloqueia alguns
recursos (fetch de módulos, cookies de sessão do Supabase) nesse modo.
Sirva como um site local de verdade:

**Opção A — VS Code + extensão Go Live (mais fácil):**
1. Instale a extensão "Live Server" (Ritwick Dey) no VS Code.
2. Abra a pasta `nexo` inteira no VS Code (`Arquivo → Abrir Pasta`).
3. Clique com o botão direito em `index.html` → **"Open with Live Server"**
   (ou clique em "Go Live" na barra inferior azul do VS Code).
4. Abre sozinho em algo como `http://127.0.0.1:5500/index.html`. É por essa
   URL que você testa daqui pra frente — sempre, não só a primeira vez.

**Opção B — sem VS Code, com Python (já vem instalado na maioria dos PCs):**
```
cd nexo
python3 -m http.server 5500
```
Depois abra `http://localhost:5500/index.html` no navegador.

## Passo a passo do teste

1. Rode o `schema.sql` inteiro no SQL Editor do seu projeto Supabase (uma vez só).
2. Abra `http://127.0.0.1:5500/index.html` (ou a porta que o Go Live usar).
3. "Configurar conexão com Supabase" → cole URL + anon key → salvar.
4. Crie uma conta, confirme o e-mail se seu Supabase pedir, entre.
5. Crie um projeto → importe uma planilha (`.xlsx`/`.csv`).
6. Revise a pré-visualização (tipo/papel de cada coluna) → confirme.
7. O painel aparece. Clique em **"Apresentação"** pra ver os slides em tela
   cheia (setas do teclado navegam), **"Exportar PDF"** (abre a caixa de
   impressão do navegador — escolha "Salvar como PDF") ou **"Exportar .pptx"**
   pra baixar o PowerPoint.

## Por que não pode ser `file://`

O Supabase Auth guarda a sessão logada usando `localStorage`/cookies
vinculados à **origem** (protocolo + domínio + porta). `file://` não tem
uma origem estável — o navegador trata cada pasta/arquivo como uma origem
diferente ou simplesmente bloqueia. Servindo por `http://localhost`, a
origem é sempre a mesma entre `index.html`, `home.html` e `project.html`,
e a sessão de login se mantém ao navegar entre eles.

## O que já funciona (Fase 1 completa)

- Login/cadastro/logout, projetos com RLS real
- Import multi-aba com detecção automática da linha de cabeçalho
- Detecção de tipo por CONTEÚDO (data, número, booleano, categoria, texto)
- Pré-visualização/validação editável antes de gravar
- Dados salvos 100% genéricos (`records.dados jsonb`) — qualquer segmento
- Dashboard dinâmico: KPIs, rankings, indicadores, tendência mensal
- Insights automáticos (nunca inventados, só descrevem o que foi calculado)
- **Apresentação em slides** (tela cheia, navegação por teclado)
- **Exportação em PDF** (via impressão do navegador)
- **Exportação em .pptx** (PowerPoint real, com gráficos nativos)
- Filtro por planilha/aba dentro do projeto
- **Exportação em Excel** (.xlsx formatado: Resumo + uma aba por planilha)
- **Exclusão de planilha** importada, com confirmação

## Editar dados depois de importar

Dentro do projeto, a aba **Dados** (ao lado de "Painel") deixa:
- Editar qualquer célula direto na tabela — salva ao sair do campo e o
  Painel atualiza na hora (KPIs, gráficos e insights recalculados).
- **+ Adicionar registro** cria uma linha em branco na planilha escolhida.
- **+ Nova coluna** cria um campo novo do zero (vira coluna genérica,
  editável, mas não entra automaticamente em gráfico — like a
  identificador/nota livre).
- **✕** no fim da linha apaga o registro (com confirmação).

## Personalizar cor e logo do projeto

No topbar do projeto, **⚙ Configurações** deixa trocar o nome, a cor de
destaque (usada nos gráficos, no primeiro KPI, na apresentação e nas
exportações) e o logo. O logo fica num bucket público (`branding`) do
Supabase — precisa rodar o `schema-update-branding.sql` uma vez (além do
`schema.sql` já executado antes) pra essa parte funcionar.

## Ocultar/mostrar gráficos e reclassificar colunas sem reimportar

- Cada gráfico do Painel tem um **✕** no canto — oculta aquele gráfico e
  fica salvo no projeto (aparece um link "mostrar N oculto(s)" quando tiver
  algum escondido).
- Na aba **Dados**, o painel "Colunas desta seleção" (link "mostrar/ocultar")
  deixa trocar o tipo e o papel de qualquer coluna — por exemplo, promover
  uma coluna de texto pra métrica, ou uma que virou "ignorar" por engano
  pra dimensão — sem precisar reimportar a planilha.

## Regras fixas de coluna (aba **Regras**)

A detecção automática adivinha pelo conteúdo da coluna. As **regras fixas**
fazem o contrário: se o **nome** da coluna bate com uma regra, o tipo e o
papel da regra mandam — sem chute, sem depender da amostra de dados.

Já vêm 16 regras configuradas de fábrica:

| Coluna | Tipo | Papel |
|---|---|---|
| Quantidade (Qtd) | booleano | dimensao |
| EQUIPE (ACIONADA) | categoria | dimensao |
| EQUIPE (RESPONSÁVEL RECUPERAÇÃO) | categoria | dimensao |
| FINALIZADO | categoria | dimensao |
| EMPRESA CLIENTE | categoria | dimensao |
| Mês do evento | categoria | dimensao |
| Data do evento | categoria | dimensao |
| Marca | categoria | dimensao |
| Modelo do Veículo | categoria | dimensao |
| TIPO DE EVENTO | categoria | dimensao |
| Fipe | numero | metrica |
| Ano Fab/Modelo | categoria | dimensao |
| Bairro | categoria | dimensao |
| Município | categoria | dimensao |
| UF | categoria | dimensao |
| Quantidade de equipamentos (CONTINGÊNCIA) | numero | metrica |

Como funciona:

- **Na importação**, a pré-visualização já vem com essas colunas configuradas
  e marcadas com o selo `regra` no lugar do percentual de confiança. As colunas
  que nenhuma regra cobre continuam sendo detectadas automaticamente.
- **O nome é comparado inteiro**, ignorando maiúsculas, acentos e pontuação —
  `EQUIPE (ACIONADA)` e `equipe acionada` são a mesma coisa. Como a comparação
  nunca é por "contém", `Quantidade` não sequestra
  `Quantidade de equipamentos (CONTINGÊNCIA)`.
- **Outros nomes** (apelidos) cobrem as variações que aparecem em planilhas
  diferentes: `Qtd`/`Qtde` caem na regra de Quantidade, `Cidade` na de Município,
  `Valor Fipe` na de Fipe, e assim por diante.

Na aba **Regras** (ao lado de Aproveitamento) dá pra:

- trocar o tipo e o papel de qualquer regra nos dois menus;
- editar o nome da coluna e a lista de "outros nomes";
- **+ Nova regra** pra cobrir uma coluna nova;
- **✕** pra remover uma regra;
- **Voltar ao padrão** pra restaurar as 16 originais;
- **Salvar regras** — grava no projeto (`projects.tema.regrasColunas`), então
  valem em todas as próximas importações;
- **Reaplicar agora** — reclassifica as colunas das planilhas que **já** estão
  importadas, sem precisar reimportar; o painel recalcula na hora. O quadro
  logo abaixo mostra, antes de aplicar, exatamente quais colunas mudariam e
  de que para quê.

> Observação: `Data do evento` entra como **categoria/dimensão** conforme
> pedido, então ela não aparece mais como eixo de tempo no Comparativo
> (as outras colunas de data, como `* Data acionamento`, continuam lá).
> Se quiser voltar atrás, é só trocar para `data`/`data` na aba Regras.

## Exportar Excel

No topo do painel, **Exportar Excel** baixa um `.xlsx` de verdade (não é CSV
renomeado) com o que está selecionado no filtro de planilhas:

- **Aba "Resumo"** — todos os KPIs, cada ranking com contagem e % do total,
  os indicadores Sim/Não e o mês a mês de cada coluna de data.
- **Uma aba por planilha importada** — os registros, já com **número como
  número**, **data como data** (formato `dd/mm/aaaa`), booleano como Sim/Não,
  cabeçalho fixo (freeze), filtro automático e largura de coluna ajustada.

O arquivo sai como `NEXO - <projeto> - <aaaa-mm-dd>.xlsx`. Usa a biblioteca
ExcelJS (carregada por CDN, junto com as outras) — o SheetJS da importação é
a versão community e não escreve formatação.

## Excluir uma planilha importada

Na aba **Dados**, o painel **Planilhas importadas** lista cada planilha do
projeto com aba de origem, nº de registros, nº de colunas e data de
importação. O botão **Excluir** abre uma confirmação mostrando exatamente
o que será apagado.

A exclusão remove a planilha, seus registros e suas colunas (via
`ON DELETE CASCADE` do `schema.sql` — nenhuma migração nova é necessária) e
o painel, o filtro e a aba Dados se atualizam na hora. Se era a última
planilha do projeto, a tela volta pra importação. **Não dá pra desfazer** —
só reimportando o arquivo original.

## Data que aparecia como número (46037)

O Excel guarda `15/01/2026` como o número **46037** (dias desde 30/12/1899).
A importação só traduzia esse número quando a coluna era do tipo `data` — então
uma coluna de data classificada como **categoria** por uma regra fixa gravava o
serial cru no banco, e o gráfico mostrava "46037".

Corrigido em três frentes:

1. **Na importação** — a conversão passou a seguir o **conteúdo** da coluna
   (`tipo_conteudo`, detectado antes das regras) e não o tipo final. Data
   classificada como categoria continua sendo gravada como `2026-01-15`.
2. **Na exibição** — rankings, tabela de dados e exportação Excel mostram
   `15/01/2026`; no Excel a célula sai como **data de verdade**, não texto.
3. **Nos dados que já estavam no banco** — quando o NEXO encontra datas
   gravadas como número, aparece um aviso no topo do painel com o botão
   **"Converter em data"**, que arruma tudo de uma vez.

O conserto é conservador de propósito: só mexe em coluna que é do tipo `data`
**ou** cujo nome fala de data (`Data do evento`, `* Data acionamento`,
`vencimento`, `emissão`...). Uma métrica como **Fipe**, que também tem valores
na casa dos 45.000, nunca é convertida.

## Legibilidade e estados vazios

- **Menus suspensos** abriam com a lista quase invisível (o navegador desenhava
  o popup nativo a partir de um fundo translúcido). Corrigido com
  `color-scheme: dark` e cor sólida nas `<option>` — de quebra o seletor de
  data também ficou escuro.
- **Texto dos painéis** ficou mais claro em toda a interface (rótulos, dicas,
  tabelas, insights).
- **Nenhum painel aparece vazio**: "Planilhas importadas" já abre aberto,
  "Colunas desta seleção" mostra um resumo quando recolhido
  (`27 colunas · 18 dimensões · 2 métricas...`), e o Comparativo explica o que
  fazer quando não há coluna com o papel `data`.
- **Aba Aproveitamento**: cada campo de "De onde vem cada informação" agora
  lista **todas** as colunas (as do tipo esperado em cima, em "recomendadas").
  Antes só aparecia o tipo exato — então uma coluna como `FINALIZADO`
  (categoria SIM/NÃO) não podia ser escolhida como recuperação e o campo ficava
  travado em "— nenhuma —" com o aproveitamento zerado. Também há um aviso
  explicando isso enquanto a coluna de recuperação não for escolhida, e um
  campo novo pra escolher a coluna de data do filtro Mês/Ano.

## Logo

A logo fica em `img/` e aparece em:

- **topbar** das três telas (login, projetos, projeto) — 38px, com brilho suave
  e um leve realce ao passar o mouse;
- **tela de login**, maior (76px) e centralizada acima do nome;
- **favicon / ícone da aba** e ícone de atalho no celular (apple-touch-icon);
- **marca d'água discreta** no canto da apresentação em tela cheia.

Arquivos:

```
img/logo.png              → o pin recortado, fundo transparente (256px)
img/favicon.png           → o disco escuro completo, bom em aba clara ou escura
img/apple-touch-icon.png  → mesmo disco, 180px, pra atalho no celular
```

Pra trocar a logo depois, basta substituir esses arquivos mantendo os nomes —
nada no código precisa mudar. O `logo.png` deve ter fundo transparente, porque
ele aparece direto sobre o fundo escuro da interface.

> A logo é azul e o destaque padrão do sistema é verde-água. Se quiser tudo na
> mesma cor, dá pra trocar o destaque do projeto em **⚙ Configurações** — por
> exemplo `#1EA8FF`, o azul do pin. Isso muda gráficos, KPIs, apresentação e
> exportações daquele projeto.

## Fase 1 — completa

Login, projetos, import universal com pré-visualização, dashboard dinâmico,
edição completa dos dados, apresentação + PDF/PPTX, personalização visual
e customização do painel — tudo com persistência real no Supabase e RLS.
Os próximos passos (Fase 2 do roadmap: compartilhamento, múltiplos
dashboards por projeto, histórico de versões, mapas/dispersão) ficam pra
quando fizerem falta de verdade — o sistema já está pronto pra uso real.

## Estrutura

```
index.html          → login/cadastro
setup.html           → configurar URL/chave do Supabase
home.html             → lista de projetos + criar/excluir
project.html           → upload → pré-visualização → painel → dados → apresentação
img/                     → logo, favicon e ícone de atalho
css/style.css             → design system compartilhado
js/supabase-client.js     → conexão + helpers de sessão
js/home.js                 → lógica da home
js/column-rules.js          → regras fixas nome-da-coluna → tipo/papel
js/export-excel.js           → geração do .xlsx formatado (Resumo + dados)
js/type-detector.js          → classifica cada coluna pelo conteúdo
js/import-engine.js          → leitura de arquivo, abas, cabeçalho
js/analysis-engine.js         → KPIs, rankings, tendência (genérico)
js/insights-engine.js          → frases de insight a partir da análise
js/presentation-engine.js       → monta a lista de slides
js/project.js                    → orquestra tudo (import/preview/dashboard/apresentação/export)
schema.sql                        → schema completo (rode uma vez)
```
