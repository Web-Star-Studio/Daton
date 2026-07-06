# SP6/B — Indicadores de Treinamento no módulo de Indicadores + Dashboard operacional

**Data:** 2026-07-01
**Branch:** `feat/gestao-aprendizagem`
**Sub-projeto:** SP6/B (último do módulo de Gestão de Aprendizagem)

## Objetivo

Fechar o módulo de Aprendizagem entregando as duas telas gerenciais do mockup do
cliente (`lms_gabardo (6).html`), **reaproveitando o módulo de Indicadores (KPI)
que já existe** em vez de duplicá-lo:

1. **Tela 11 do mockup ("Indicadores LMS")** → as métricas do LMS passam a ser
   **indicadores KPI de verdade** no módulo de Indicadores, com valor calculado
   automaticamente a partir dos dados do LMS. A cliente configura meta e
   tolerância onde já configura hoje, e ganha semáforo, histórico e plano de ação
   de graça.
2. **Tela 1 do mockup ("Dashboard")** → uma tela operacional nova, só leitura,
   dentro do LMS, construída fielmente ao mockup (raio-x do dia a dia).

## Contexto e decisões travadas

- **Caminho B** (aprovado): os números do LMS viram indicadores KPI reais, não uma
  tela paralela de "mini-indicadores". O módulo KPI já faz indicador com meta,
  semáforo, tratamento de desvio (justificativa OU plano de ação) e histórico.
- **Corporativo, não por filial:** criar os indicadores no nível da organização
  (um por métrica, calculado sobre todas as filiais). O mockup do cliente
  desenhou cartões corporativos + uma **tabela** "Desempenho por filial" — não 90
  indicadores. Por-filial fica como extensão futura ("ativar sob demanda").
- **Tolerância configurável:** hoje a tolerância do semáforo é fixa em 1% no
  código (`kpi-client.ts` `getTrafficLight`). Passa a ser configurável por
  indicador/ano, com **padrão 1%** para não mudar o comportamento atual da
  Gabardo.
- **Desvio → plano de ação:** reusa 100% o fluxo KPI existente
  (`sourceModule="kpi"`, `sourceRef.kpiMonthlyValueId`). Sem backend novo.
- **Entrega:** este sub-projeto entra no **PR único** do módulo inteiro, no final.

## Arquitetura

### O seam: "fonte computada = LMS" (espelha o rollup corporativo)

O módulo KPI já resolve o valor mensal *on-read*: em `kpi/index.ts` (GET do ano),
para cada indicador com `rollupStrategy` preenchido, recomputa os 12 meses via
`computeRollupValue` (compose-on-read a partir dos filhos). Vamos **espelhar**
esse mecanismo para uma nova fonte: um indicador cuja `computedSource = "lms"` tem
o valor de cada mês calculado por um *provider* do LMS, em vez de lançado à mão ou
agregado de filhos.

Como os indicadores LMS são `kpi_indicators` normais, **tudo o mais funciona sem
mudança**: semáforo, histórico, gráficos, dashboard do KPI, semáforo por
categoria, e o tratamento de desvio (justificativa/plano de ação).

### Mudanças de schema (DDL cirúrgico, padrão do repo)

- **`kpi_indicators`**: duas colunas novas, nullable (discriminador análogo a
  `rollupStrategy`):
  - `computed_source varchar(32)` — `NULL` normal, `'lms'` para indicador
    alimentado pelo LMS.
  - `computed_metric varchar(64)` — a chave da métrica (ver abaixo).
- **`kpi_year_configs`**: `tolerance numeric(20,8)` nullable — tolerância do
  semáforo por indicador/ano. `NULL` ⇒ usa o padrão atual (0.01).

Aplicar via DDL cirúrgico na base de integração (:55432) e adicionar ao script de
produção existente (`scripts/sql/`), no mesmo padrão do
`20260701_add_learning_management_module.sql`.

### O provider de métricas do LMS

Novo serviço `artifacts/api-server/src/services/kpi/lms-metrics.ts`:

```ts
export type LmsMetricKey =
  | "pat_completion"        // % cumprimento do PAT (↑, meta 80)
  | "effectiveness_overall" // % eficácia geral (↑, meta 80)
  | "mandatory_coverage"    // % cobertura de obrigatórios (↑, meta 100)
  | "hours_per_employee"    // horas de treinamento / colaborador (↑, meta 20)
  | "critical_gaps"         // colaboradores com gap crítico (↓, meta 0)
  | "expired_trainings";    // treinamentos vencidos (↓, meta 0)

// Valor do mês M (1–12) do ano Y para a organização (escopo corporativo).
export async function computeLmsMetric(args: {
  orgId: number;
  metric: LmsMetricKey;
  year: number;
  month: number;
  database: Database; // Pick<typeof db, "select">
}): Promise<number | null>;
```

**Definições (todas escopo corporativo = todas as filiais da org):**

| Métrica | Definição no mês M/ano Y | Direção / meta | Histórico |
|---|---|---|---|
| `pat_completion` | itens do `annual_training_program` do ano com `plannedMonth ≤ M` (ou sem mês) → `status='realizada'` ÷ total, ×100 | ↑ / 80% | ✅ recalculável |
| `effectiveness_overall` | `training_effectiveness_reviews` com `evaluationDate` no mês M → `isEffective` ÷ total, ×100 | ↑ / 80% | ✅ recalculável |
| `mandatory_coverage` | `employee_trainings` com `requirementId` não nulo → `status='concluido'` ÷ total, com `completionDate ≤ fim de M` (ou pendente até M), ×100 | ↑ / 100% | ✅ (aprox. por data) |
| `hours_per_employee` | Σ `workloadHours` de `employee_trainings` concluídos no ano até M ÷ nº de colaboradores ativos | ↑ / 20h | ✅ recalculável |
| `critical_gaps` | nº de colaboradores distintos com gap crítico (via cálculo de `competency-gaps`) — snapshot do momento | ↓ / 0 | ⚠️ **só do mês da ativação em diante** (a matriz de competência é um retrato do presente; não há histórico de níveis) |
| `expired_trainings` | nº de `employee_trainings` com `expirationDate ≤ fim de M` e sem conclusão posterior (não renovados) | ↓ / 0 | ✅ (aprox. por data) |

Para `critical_gaps`: o provider retorna o valor apenas para o mês corrente
(meses passados ⇒ `null`, ficam em branco no histórico). É a limitação honesta já
alinhada.

### Hook no ponto de resolução de valor

Em `kpi/index.ts` (GET do ano), no mesmo laço que hoje trata rollup: adicionar o
ramo `computedSource === "lms"`. Para cada um dos 12 meses:

1. `value = await computeLmsMetric({ orgId, metric: ind.computedMetric, year, month, database: db })`.
2. **Materializar** a célula em `kpi_monthly_values` (`upsert` por `(yearConfigId,
   month)`, `value`, `isComputed=true`, `isOverridden=false`) — necessário para
   que a célula tenha `id` e o desvio possa gerar plano de ação (que se liga ao
   `kpiMonthlyValueId`).

O ramo LMS **não** aceita override manual de lançamento (como o rollup).

### Semear/ativar os indicadores

Endpoint idempotente `POST /organizations/:orgId/kpi/lms-indicators/activate`:
cria (se não existir) os indicadores corporativos das 6 métricas para a
organização — nome, `measurement`, `direction`, `periodicity='monthly'`,
`category` (RH), `norms` (por métrica: 9001/10015), `computedSource='lms'`,
`computedMetric=<chave>`. Também cria o `kpi_year_config` do ano corrente com a
meta e a tolerância padrão da métrica (editáveis depois). Idempotente por
`(organizationId, computedMetric)`.

Botão "Ativar indicadores de treinamento" no módulo LMS (e/ou no de Indicadores),
gated por escrita.

## Frontend

### Módulo de Indicadores (mudanças pequenas)

- **Config de meta + tolerância:** na tela de indicador/ano, adicionar campo
  **Tolerância** ao lado da Meta (persiste em `kpi_year_configs.tolerance`). Para
  indicador LMS a meta é **editável** (diferente do rollup corporativo, cuja meta
  é calculada das filiais).
- **Semáforo:** `getTrafficLight(value, goal, direction, tolerance?)` passa a usar
  a tolerância configurada; fallback `0.01` preserva o comportamento atual.
- **Lançamento somente-leitura:** indicador com `computedSource='lms'` bloqueia
  entrada manual de valor (como o rollup) e exibe selo "↻ automático
  (Treinamento)".
- **Dashboards do KPI:** já agregam os novos indicadores automaticamente (sem
  fiação nova) — confirmado no code review.

### Tela nova: Dashboard operacional do LMS (mockup tela 1)

Rota `/aprendizagem/dashboard`, só leitura, fiel ao mockup:

- Filtro por filial + (futuro) exportar.
- **4 cartões:** cumprimento do programa, eficácia geral, colaboradores com gap,
  treinamentos vencidos (números ao vivo do LMS).
- **Cumprimento por filial** (barras) e **Eficácia por norma ISO** (barras;
  ressalva: só treino com norma marcada no catálogo).
- **Tabela de vencidos** (colaborador · filial · treinamento · venceu em).
- **Eficácia pendente** (lista com deep-link para a tela de Avaliação de
  eficácia).

Consome o endpoint de resumo (abaixo) + as listas já existentes; usa `recharts`
(já no projeto). Sem meta/semáforo configurável aqui — coloração intrínseca só
onde o alvo é óbvio.

### Endpoint de resumo do dashboard

`GET /organizations/:orgId/learning/summary?year=&unitId=` — agrega no banco e
devolve JSON compacto: os totais dos 4 cartões, quebra por filial
(cumprimento/eficácia/gap/status), quebra por norma (eficácia), lista de vencidos
e lista de eficácia pendente. Só leitura, escopo por org.

## Testes

- **Provider (`lms-metrics`):** teste de integração por métrica com dados
  semeados — valores esperados por mês (incl. `critical_gaps` só no mês corrente).
- **Seam de resolução:** ativar indicadores, GET do ano, conferir que os 12 meses
  vêm do provider e que as células são materializadas com `isComputed=true`.
- **Tolerância:** semáforo respeita `tolerance` configurada; `null` ⇒ 1%.
- **Ativação idempotente:** chamar 2× não duplica indicadores.
- **Desvio → plano de ação:** criar ação a partir de célula LMS vermelha
  (reusa fluxo KPI); `AcoesVinculadas` acha por `kpiMonthlyValueId`.
- **Endpoint de resumo:** shape + escopo por org (cross-tenant bloqueado).
- **Isolamento multi-tenant** em todas as rotas novas.

## Fora de escopo (follow-ups)

- Indicadores **por filial** (ativar sob demanda) — extensão futura.
- Histórico retroativo de `critical_gaps` (exige snapshots de competência).
- "Eficácia por norma" para treino de texto livre (sem norma no catálogo).
- Exportar relatório (botão do mockup) — placeholder.

## Validações de saída

`pnpm typecheck` verde; testes de integração novos + regressão do KPI verdes;
build web verde; DDL do SP6/B aplicado na base de integração e adicionado ao
script de produção; smoke de runtime (rotas novas montadas).
