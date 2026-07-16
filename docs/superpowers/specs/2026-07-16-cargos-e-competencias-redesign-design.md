# Redesenho "Cargos e competências" + consolidação do CRUD de cargos — Design

**Data:** 2026-07-16
**Status:** Aprovado (aguardando revisão do spec antes do plano)
**Área:** Aprendizagem (`/aprendizagem/cargos`) + Organização (remoção) + backend positions
**Mockup de referência:** `C:\Users\joaop\Downloads\lms_gabardo (13).html` (seção "4. CARGOS E COMPETÊNCIAS")

## Objetivo

Fazer de "Cargos e competências" (Aprendizagem) o **lar único** dos cargos: além da
matriz de competências que já mostra, passa a **criar/editar/excluir cargos** e a exibir
o cargo no formato do mockup (tabela Cargo/Área/Competências/ISO + busca + filtro de área
+ painel de detalhe com abas Descrição/Competências/Habilidades). Em seguida, o item
"Cargos" sai do menu de Organização e a rota antiga é redirecionada.

Hoje o CRUD de cargos vive só em Organização → Cargos; a tela de Aprendizagem só lista e
mostra competências. Consolidar remove a duplicidade e alinha ao mockup da cliente.

## Decisões (aprovadas)

1. **Fidelidade ao mockup**, incluindo os **2 campos novos** que faltam: **Área** e **Norma
   ISO principal**.
2. **Norma ISO principal referencia o catálogo de normas** existente (`regulatory_norms`),
   por id — consistente com KPIs/obrigatoriedades (não string solta).
3. **"Habilidades" reusa o campo livre `requirements`** que já existe no cargo (o mockup
   "aposentou" esse campo como coluna separada; a aba/campo "Habilidades requeridas" passa a
   escrever/ler `requirements`). Sem entidade nova de habilidades.
4. **CRUD por linha** (novo/editar/excluir) com **diálogo na interface**; sem exclusão em
   massa no v1.
5. Remover "Cargos" do menu de Organização e **redirecionar** `/organizacao/cargos` →
   `/aprendizagem/cargos`.

## Modelo de dados (2 colunas novas em `positions`)

`lib/db/src/schema/departments.ts` (`positionsTable`):

- `area text` (nullable) — setor do cargo (Operações/Logística/Qualidade/Manutenção/
  Administrativo/TI). Texto livre; o form oferece um select com os valores comuns e o filtro
  da tela deriva as áreas distintas presentes.
- `principalNormId integer` (nullable, **FK → `regulatory_norms.id` ON DELETE SET NULL**) —
  a norma ISO principal do cargo, escolhida do catálogo de normas da organização.

Campos que **já existem** e serão reusados (sem alteração de schema):

| Campo do mockup | Coluna |
|---|---|
| Nome | `name` |
| Escolaridade mínima | `education` |
| Experiência mínima | `experience` |
| Nível (Operacional/Tático/Estratégico) | `level` |
| Descrição da função | `description` |
| Habilidades requeridas | `requirements` (reuso) |
| Competências (matriz + contagem) | `position_competency_requirements` |

`minSalary`/`maxSalary`/`responsibilities` continuam no banco, mas **não** entram no form do
mockup (ficam sem edição por esta tela — ver "Fora de escopo").

### DDL de produção (aditivo, seguro)

```sql
ALTER TABLE positions ADD COLUMN IF NOT EXISTS area text;
ALTER TABLE positions ADD COLUMN IF NOT EXISTS principal_norm_id integer
  REFERENCES regulatory_norms(id) ON DELETE SET NULL;
```

Nullable + aditivo → nenhum dado existente é afetado. Aplicar na prod **sob autorização**
(o `db push` puro está proibido — DDL cirúrgico).

## Backend

`artifacts/api-server/src/routes/positions.ts`:

- **GET list** (`/organizations/:orgId/positions`, linha 47): incluir `area`,
  `principalNormId` e um **`competencyCount`** agregado (LEFT JOIN + count em
  `position_competency_requirements`) — necessário para a coluna "N competências" da tabela
  sem N chamadas.
- **POST create** (linha 59) e **PATCH update** (linha 83): aceitar `area` e
  `principalNormId` (validar que a norma pertence à organização quando informada).

OpenAPI (`lib/api-spec/openapi.yaml`, `Position` e bodies de create/update em
`/organizations/{orgId}/positions` linha 2199 e `/{posId}` linha 2268): adicionar `area`,
`principalNormId` e `competencyCount` (este último read-only na resposta). Rodar
`pnpm --filter @workspace/api-spec codegen` (regenera api-zod + api-client-react).

## Frontend — redesenho de `artifacts/web/src/pages/app/aprendizagem/cargos/index.tsx`

Layout do mockup:

- **Cabeçalho:** título "Cargos e competências" + subtítulo "Matriz de competências
  requeridas por cargo — ISO 10015 §4.2" + botão **"Novo cargo"** (topo-direita).
- **Toolbar:** busca "Buscar cargo…" (filtra por nome) + select **"Todas as áreas"**
  (opções = áreas distintas presentes).
- **Tabela "Cargos cadastrados":** colunas **Cargo | Área | Competências | ISO**; linha
  clicável **seleciona** o cargo (alimenta o painel). Contagem via `competencyCount`; a ISO
  mostra o **rótulo da norma do catálogo** (`regulatory_norms.label`, como está cadastrado —
  sem inventar formato curto). Badge "N cargos".
- **Painel de detalhe** (cargo selecionado):
  - Cabeçalho: nome, sub "Área · N competências · ISO ⟨norma⟩", badge da norma à direita.
  - **Abas:**
    - **Descrição:** dois boxes (Escolaridade mínima = `education`, Experiência mínima =
      `experience`) + texto `description` (com `white-space: pre-line`, preservando as
      "Principais atribuições" em bullets que o usuário digitar).
    - **Competências:** a matriz atual (`position_competency_requirements`, read-only), com a
      régua de crítica (≥ 4) já existente. Botão "Ver gaps da equipe" pode linkar para
      gestão de treinamentos. **Edição da matriz fica fora do v1** (ver escopo).
    - **Habilidades:** renderiza `requirements` (texto) — o campo "Habilidades requeridas".
- **Modal "Novo cargo" / "Editar cargo"** (`PositionFormDialog`, componente novo):
  campos do mockup → colunas: Nome\* (`name`), Área\* (`area`), Nível (`level`), Norma ISO
  principal (`principalNormId`, picker do catálogo de normas ativas), Escolaridade mínima
  (`education`), Experiência mínima (`experience`), Descrição da função (`description`),
  Habilidades requeridas (`requirements`). Create/Update via os hooks existentes
  (`useCreatePosition`/`useUpdatePosition`).
- **Excluir:** ícone por linha → diálogo de confirmação na interface (padrão adotado),
  `useDeletePosition`.

### Permissões

- Acesso à página: módulo `employees` (como hoje).
- Botões de CRUD de cargo: gated por `canWriteModule("positions")` (casa com o
  `requireWriteAccess()` das rotas de positions). **Nuance aceita:** um operador que tivesse
  só `positions` e não `employees` perderia acesso — cenário improvável (admins têm ambos).

## Navegação / rota

- `artifacts/web/src/components/layout/AppLayout.tsx`: remover o item
  `{ href: "/organizacao/cargos", label: "Cargos" }` de `organizacaoLinks` (linhas ~468–470)
  e limpar o breadcrumb correspondente (linha ~341) se ficar órfão.
- `artifacts/web/src/pages/app/organizacao/cargos.tsx`: passa a renderizar
  `<Redirect to="/aprendizagem/cargos" />` (wouter). Cobrir as duas rotas registradas em
  `App.tsx` (`/organizacao/cargos` e `/app/organizacao/cargos`).
- A seção `section="cargos"` da `OrganizacaoPage` fica **órfã** (inacessível pelo redirect);
  removê-la da página gigante fica como limpeza de follow-up (não bloqueia).

## Edição da matriz de competências (adicionada durante a implementação)

A pedido do usuário, a aba **Competências** deixou de ser read-only: passou a
**vincular/gerenciar** os requisitos do cargo (`position_competency_requirements`),
reusando o CRUD que já existia no backend.

- **Vincular competência:** combobox do banco (`competency_catalog`) com **criar-na-hora**
  (`SearchableSelect` + `onCreateOption`) — se a competência não existe, cria no banco e
  vincula; tipo do requisito e nível (Básico=1/Intermediário=3/Avançado=5) escolhidos no form.
- **Editar nível** (pílula colorida por nível) e **remover** por linha.
- O painel do banco saiu do rodapé e virou o modal **"Gerenciar competências"** aberto pela aba.
- Contagem "N competências" da tabela atualiza ao vincular/remover
  (`onCompetenciesChanged` invalida requisitos + lista de cargos).
- **Ressalva de taxonomia:** o banco usa CHA (`conhecimento/habilidade/atitude`) e o requisito
  usa o enum `formacao/experiencia/habilidade` — vocabulários distintos do sistema legado. O
  vínculo é desacoplado (banco fornece só o nome; tipo do requisito é escolhido à parte;
  criar-na-hora grava no banco o tipo neutro `habilidade`). Unificar as taxonomias fica p/ depois.

## Fora de escopo (YAGNI)

- **Entidade estruturada de habilidades** (reusa `requirements` como texto livre).
- **Exclusão em massa** de cargos (só por linha no v1).
- **Salário e responsabilidades** no form do mockup (permanecem no banco, sem edição aqui).
- **Área como catálogo gerenciável** (texto livre + select de valores comuns no v1).

## Testes

- **Backend (integração):** GET positions retorna `area`/`principalNormId`/`competencyCount`;
  POST/PATCH aceitam e persistem `area` e `principalNormId`; norma de outra organização é
  rejeitada.
- **Frontend (unit):** extrair e testar os utilitários puros — derivação das áreas distintas
  para o filtro, filtro por busca+área, montagem da linha "sub" (Área · N · ISO). A casca de
  render fica sem teste pesado.

## Arquivos afetados

- `lib/db/src/schema/departments.ts` — +`area`, +`principalNormId` (FK)
- `artifacts/api-server/src/routes/positions.ts` — list (+competencyCount/area/norm),
  create/update (aceitar novos campos)
- `lib/api-spec/openapi.yaml` — `Position` + bodies → codegen (api-zod, api-client-react)
- `artifacts/web/src/pages/app/aprendizagem/cargos/index.tsx` — redesenho
- **Novo:** `PositionFormDialog` (modal de cargo) + utilitários puros testáveis
- `artifacts/web/src/pages/app/organizacao/cargos.tsx` — redirect
- `artifacts/web/src/components/layout/AppLayout.tsx` — remover item de menu (+breadcrumb)
- **DDL de produção** (aditiva) aplicada sob autorização

## Sequência sugerida (para o plano)

1. Schema + DDL local (docker) → backend (list/create/update) → OpenAPI + codegen.
2. `PositionFormDialog` + redesenho da tela (tabela/filtros/abas) consumindo o novo contrato.
3. Remoção do menu + redirect.
4. Testes (integração backend + unit dos utilitários).
5. DDL de prod sob autorização + verificação.
