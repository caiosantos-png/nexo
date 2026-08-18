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
css/style.css            → design system compartilhado
js/supabase-client.js     → conexão + helpers de sessão
js/home.js                 → lógica da home
js/type-detector.js         → classifica cada coluna pelo conteúdo
js/import-engine.js          → leitura de arquivo, abas, cabeçalho
js/analysis-engine.js         → KPIs, rankings, tendência (genérico)
js/insights-engine.js          → frases de insight a partir da análise
js/presentation-engine.js       → monta a lista de slides
js/project.js                    → orquestra tudo (import/preview/dashboard/apresentação/export)
schema.sql                        → schema completo (rode uma vez)
```
