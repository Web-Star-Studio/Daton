# Gestão de Treinamentos — Paridade com o mockup (13)

**Data:** 2026-07-20
**Módulo:** Aprendizagem → Gestão de treinamentos (`/aprendizagem/gestao-treinamentos`)
**Objetivo:** Fechar a paridade da tela atual (`artifacts/web/src/pages/app/aprendizagem/gestao/index.tsx`) com o mockup `lms_gabardo (13) (1).html` (seção `#screen-gestao-treinamentos`, linhas 581–768). A cliente notou faltarem cards, exportação e outros elementos.

## Contexto / estado atual

A página já tem uma boa base:
- 3 abas: **Por colaborador** (tabela), **Por turma** (tabela), **Por prazo** (a mesma tabela reordenada por vencimento).
- 4 metric cards clicáveis: Vencidos, A vencer em 30 dias, Pendentes, **Concluídos**.
- Filtros: filial, cargo, norma.
- "Carregar mais" (paginação incremental até 500).

Fonte de dados:
- Lista/counts de treinos: `GET /organizations/:orgId/employees/trainings` (`useListOrganizationTrainings`), retorna `{ data: OrganizationTraining[], stats: { vencido, pendente, concluido }, pagination }`. Suporta params `unitId`, `position`, `normId`, `status` (`vencido|pendente|concluido`), `expiringWithinDays`, `page`, `pageSize`.
- "A vencer 30d": query separada com `expiringWithinDays: 30`, usa `pagination.total`.
- Turmas: `GET .../training-classes` (`useListTrainingClasses`), item `TrainingClass` com `participantCount`, `status` (`agendada|em_andamento|realizada|cancelada`).
- Catálogo: `useAllTrainingCatalog` já carregado na página. Item de catálogo tem `normIds: number[]` e `isCritical: boolean`.

## Gaps × mockup (todos em escopo — "paridade total, em fatias")

1. Botão **Exportar** (topo direito) — inexistente.
2. Card **Programados** (turma confirmada) — inexistente.
3. Card **Realizados no mês** — o "Concluídos" atual não tem recorte de mês.
4. Linha de **pills de status** — hoje só o clique no card filtra.
5. Campo de **busca** "Buscar colaborador…".
6. Colunas **Norma** e **Crítico** na tabela "Por colaborador".
7. Colunas **Confirmados** e **Realizados** na tabela "Por turma".
8. Aba **"Por prazo"** como painel de 3 colunas (timeline), não tabela reordenada.

## Decisões (confirmadas)

- **5 cards, fiéis ao mockup:** Vencidos · A vencer 30d · Pendentes · Programados · Realizados no mês. O card verde **substitui** o "Concluídos" all-time por "Realizados no mês" (o all-time sai).
- **Exportação em `.xlsx`**, client-side, no padrão de `artifacts/web/src/pages/app/qualidade/regulatorios/_export.ts` (`XLSX.writeFile`; lib `xlsx` já é dependência). Sem endpoint novo de export.
- **"Programado"** = treino com `status='pendente'` cujo colaborador é **participante de uma turma ativa** (`training_class_participants` numa `training_classes` com status `agendada` ou `em_andamento`) do **mesmo item de catálogo** (`catalog_item_id`). Turma `realizada`/`cancelada` não conta.
- **"Realizado no mês"** = `status='concluido'` com `completion_date` dentro do **mês corrente** (`date_trunc('month', current_date)`).
- **"Pendentes sem turma"** (coluna do "Por prazo") = `pendente` ∧ **não** programado.
- **Norma / Crítico** na tabela: resolvidos **client-side**. **Norma** = `catalogItemId → training_catalog.normIds → rótulos` (catálogo já carregado). **Crítico** = `requirementId → training_requirements.isCritical` (obrigatoriedade; `training_catalog` NÃO tem `isCritical`), via `useListTrainingRequirements`. Treino sem `catalogItemId` (legado) exibe "—" na Norma; treino sem `requirementId` (ou obrigatoriedade não-crítica) é não-crítico.

## Semântica dos 6 estados (buckets) — fonte única

Os cards e as pills compartilham o mesmo `statusFilter`. Definição por bucket (aplicada tanto na contagem quanto no filtro da lista):

| Bucket | Definição |
|---|---|
| `vencido` | `status='vencido'` OU (`expiration_date` não-nula e `< current_date`) |
| `a_vencer` | não-vencido e `expiration_date` entre hoje e hoje+30d |
| `pendente` | `status='pendente'` |
| `programado` | `pendente` ∧ participante de turma ativa (ver acima) |
| `realizado` (mês) | `status='concluido'` ∧ `completion_date` no mês corrente |

Observação: `programado ⊂ pendente`. O card "Pendentes" continua contando **todos** os pendentes (inclui os programados); a coluna "Pendentes sem turma" do "Por prazo" é `pendente − programado`.

## Arquitetura da solução

Evoluir a página **no lugar** (sem tela nova), extraindo sub-componentes apresentacionais e utilitários puros para manter o arquivo gerenciável e testável.

### Frontend (`aprendizagem/gestao/`)

- `index.tsx` — orquestra estado (`statusFilter`, `search`, `tab`, filtros), monta cards/pills/abas.
- `_export.ts` (novo) — `exportGestaoXlsx(view, rows|classes, filtros)` no padrão `regulatorios/_export.ts`. Cabeçalhos por aba; nome `gestao-treinamentos_<timestamp>.xlsx`.
- `_lib/catalog-meta.ts` (novo) — `buildCatalogMeta(catalog)` → `Map<catalogItemId, { normLabels: string[]; isCritical: boolean }>` (puro, testável).
- `_components/MetricCards.tsx` — 5 cards (recebe counts + `statusFilter` + onToggle).
- `_components/StatusPills.tsx` — pills espelhando os cards (mesmo `statusFilter`).
- `_components/PorColaboradorTable.tsx` — tabela com colunas [Colaborador, Cargo, Filial, Treinamento, **Norma**, Situação, Vencimento/prazo, **Crítico**].
- `_components/PorTurmaTable.tsx` — colunas [Turma, Treinamento, Data, Filial, Inscritos, **Confirmados**, **Realizados**, Status, ação].
- `_components/PorPrazoPanel.tsx` — 3 colunas (Vencidos / A vencer 30d / Pendentes sem turma) com lista compacta, badge de contagem e CTA.

### Backend

- **`GET /organizations/:orgId/employees/trainings`** (rota `employees.ts`, serviço correlato + OpenAPI):
  - `stats` ganha `programado` e `realizadoMes` (além de `vencido|pendente|concluido`).
  - Novos params de filtro **virtuais**, no espírito do `expiringWithinDays` já existente: `onlyProgramado=true` (pendente ∩ turma ativa) e `realizadoInCurrentMonth=true`. O `status` cru continua `vencido|pendente|concluido`.
  - Novo param `search` (case-insensitive em `employee.name`).
- **`GET .../training-classes`**: cada item ganha `confirmedCount` e `realizadoCount`, derivados dos `training_class_participants`: **Confirmados** = `attendance = 'presente'`; **Realizados** = `result = 'aprovado'` (vocabulário já usado em `complete-class.ts`/`detail-panel.tsx`: `attendance ∈ {presente, faltou}`, `result ∈ {aprovado, reprovado}`). "Inscritos" continua sendo o `participantCount`.
- Alterações de contrato passam pelo OpenAPI (`lib/api-spec/openapi.yaml`) + `pnpm --filter @workspace/api-spec codegen` (nunca editar arquivos gerados à mão).

## Fatias de implementação (ordem)

**A — Exportar (frontend).** `_export.ts` + botão no topbar. Exporta a aba ativa honrando filtros/busca. Sem backend.

**B — Pills + Busca (frontend + 1 param backend).** `StatusPills` compartilhando `statusFilter`; campo de busca. Adiciona `search` ao endpoint de trainings (+OpenAPI+codegen) para busca correta sob paginação.

**C — Colunas Norma + Crítico (frontend).** `catalog-meta.ts` + `PorColaboradorTable` com as 2 colunas. Legado sem item de catálogo → "—"/não-crítico.

**D — Cards Programados + Realizados-mês (backend + frontend).** Estende `stats` e adiciona os filtros virtuais `onlyProgramado`/`realizadoInCurrentMonth`; a página passa a 5 cards e os cards/pills desses 2 buckets filtram a lista. Re-escopo do card verde para o mês.

**E — Colunas Confirmados/Realizados na "Por turma" (backend + frontend).** `confirmedCount`/`realizadoCount` no item de turma + `PorTurmaTable`.

**F — "Por prazo" painel de 3 colunas (frontend).** `PorPrazoPanel` substitui a tabela reordenada. Cada coluna busca seu bucket (Vencidos / A vencer 30d / Pendentes sem turma); CTAs: "Ver todos" muda para a aba colaborador já filtrada; "Criar turma" → `/aprendizagem/turmas`.

## Testes

- **Unitários (web-unit, JSDOM):** `buildCatalogMeta` (mapa norma/crítico, legado sem item); `_export.ts` (linhas/cabeçalhos por aba a partir de rows fake — sem escrever arquivo, testar a montagem `aoa`/matriz); componentes apresentacionais `MetricCards`/`StatusPills`/`PorColaboradorTable`/`PorPrazoPanel` (render com props, os 3 estados de coluna, contagens).
- **Integração (node, TEST_ENV=integration):** contagens `programado`/`realizadoMes` e os filtros virtuais no endpoint de trainings; `confirmedCount`/`realizadoCount` no endpoint de turmas; `search` por nome. Usar `createTestContext()` com colaborador + turma ativa + turma realizada.
- Todas as fatias passam `pnpm typecheck`.

## Fora de escopo (YAGNI)

- Nenhuma mudança de schema/DDL (todos os dados já existem: `training_class_participants`, `completion_date`, `training_catalog.is_critical`/`normIds`).
- Sem endpoint de export server-side (client-side basta).
- Sem editar/criar turma a partir desta tela (CTA apenas navega para Turmas).
- Sem alterar as demais telas do módulo (dashboard, catálogo, eficácia, etc.).
