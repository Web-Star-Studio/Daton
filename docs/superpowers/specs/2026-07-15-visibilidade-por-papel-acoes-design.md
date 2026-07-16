# Visibilidade por papel no hub de Gestão de Ações

**Data:** 2026-07-15
**Módulo:** Gestão de Ações (`actionPlans`)
**Origem:** follow-up do #158 (ponto focal + co-responsáveis). Ao testar, um operador com o módulo
`actionPlans` via **todos** os planos da organização — visualização desnecessária e confusa.

---

## 1. Problema

Hoje o módulo `actionPlans` é **tudo-ou-nada**: quem o tem vê o hub inteiro (todos os planos da org);
quem não o tem não vê o hub e alcança seus planos só por "Suas Pendências". Isso mistura duas coisas
que deveriam ser separadas:

- **Módulo = "pode abrir a tela de Gestão de Ações"** (a UI).
- **Papel = "que planos aparecem lá dentro"** (o escopo dos dados).

O resultado: um operador com o módulo enxerga ações de toda a empresa, inclusive as que não são dele.

## 2. Decisão

Espelhar o modelo de visibilidade por papel **que já existe para os Indicadores**
(`services/kpi/access.ts` → `canActOnKpiIndicator`, matriz única espelhada no front em `kpi-access.ts`).
O módulo continua sendo o **portão da tela**; o **papel decide o escopo** dentro dela.

| Papel | Vê no hub de Ações |
|---|---|
| **admin** (`org_admin` / `platform_admin`) | todos os planos da org |
| **manager** (gestor) | planos cuja **filial** ∈ suas filiais (via `unit_managers`) **OU** planos **corporativos** (sem filial) **OU** onde está pessoalmente vinculado |
| **operator** | **só** onde está pessoalmente vinculado |
| **analyst** | **todos** os planos, **somente leitura** (perfil auditor da ISO) |

**Pessoalmente vinculado** = ponto focal **OU** co-responsável **OU** avaliador de eficácia — o mesmo
conjunto que o `requirePlanAccess` já reconhece hoje.

## 3. A filial de um plano de ação

Diferente do indicador, o plano **não tem filial** — ele é transversal (nasce de KPI, SWOT, NC, etc.,
ou é manual). Introduzimos `action_plans.unit_id`, **derivada e guardada** na criação, seguindo a
regra que a cliente definiu.

### 3.1 Regra de derivação (na criação e no backfill)

```
deriveUnitId(sourceModule, sourceRef, pontoFocalUserId) -> number | null
```

- **Plano com origem** (kpi, swot, nonconformity, audit_finding, risk, training, environmental,
  road_safety, incident, rac): herda a filial **da entidade de origem**.
  - Se a origem não tem filial resolvível → `null` (**corporativo**).
- **Plano manual** (sourceModule ∈ `manual`, `improvement`, `corrective`, `norm_requirement`): herda
  a filial **do ponto focal** (`users.unit_id`).
  - Sem ponto focal → `null` (**corporativo**).

**Não há fallback cruzado:** origem-sem-filial vira corporativo (não cai no ponto focal); manual usa
o ponto focal. (Decisão da cliente.)

**`unit_id` nulo = corporativo = todos os gestores veem.** Um `unit_id` preenchido = aquela filial.

### 3.2 Fixa na criação (sem recálculo)

`unit_id` é derivada **uma vez**, na criação (e no backfill), e **não recalcula** depois — nem quando
o ponto focal muda, nem quando a origem muda. Sem lógica de sincronização. (Decisão da cliente:
"fixada na criação".)

Consequência aceita: um plano manual cujo ponto focal troca de filial permanece na filial original.

### 3.3 De onde sai a filial de cada origem (confirmado no schema)

| origem | filial vem de | pode ser corporativo? |
|---|---|---|
| **kpi** | `sourceRef.kpiIndicatorId` → `kpi_indicators.unit_id` | sim (indicador corporativo/rollup) |
| **swot** | `sourceRef.swotFactorId` → `swot_factors.unit_id` | sim |
| **risk** | `sourceRef.riskOpportunityItemId` → `strategic_plan_risk_opportunity_items.unit_id` | sim |
| **environmental** | `sourceRef.laiaAssessmentId` → `laia_assessments.unit_id` | sim |
| **training** | `sourceRef.trainingId` → `employee_trainings.employee_id` → `employees.unit_id` | sim |
| **nonconformity, audit_finding, road_safety, rac, incident** | — (entidade org-level ou sem entidade) | **sempre corporativo** |

O `source-context.ts` já faz esses joins por origem (batched, um SELECT por módulo) e **já resolve a
filial do SWOT**. O resolvedor de unidade (`deriveUnitId`) reusa exatamente esse padrão: acrescentar
`unit_id` ao `select` das 4 origens que já estão no join (kpi, risk, environmental, training) e
manter as demais como `null`.

## 4. O predicado único de visibilidade

Espelhando `canActOnKpiIndicator`, um predicado puro (sem DB), **compartilhado front/back**:

```ts
// services/action-plans/access.ts (back) + lib/action-plans-access.ts (front) — manter em sync.
// Espelha KpiRequesterScope: o gestor tem UMA filial (users.unit_id), como no KPI.
interface ActionPlanRequesterScope {
  role: UserRole;
  userId: number;
  /** Filial do gestor (users.unit_id); null para os demais perfis. */
  unitId: number | null;
}
interface ActionPlanAccessFields {
  unitId: number | null;            // null = corporativo
  responsibleUserId: number | null; // ponto focal
  coResponsibleUserIds: number[];   // co-responsáveis
  effectivenessEvaluatorUserId: number | null;
}
function canViewActionPlan(scope, plan): boolean {
  if (isAdmin(scope.role)) return true;             // org_admin / platform_admin
  if (scope.role === "analyst") return true;        // leitura; a escrita é barrada por requireWriteAccess
  const personallyInvolved =
    plan.responsibleUserId === scope.userId ||
    plan.coResponsibleUserIds.includes(scope.userId) ||
    plan.effectivenessEvaluatorUserId === scope.userId;
  if (personallyInvolved) return true;
  if (scope.role === "manager") {
    // corporativo (unit nulo) OU a filial do gestor
    return plan.unitId === null || (scope.unitId !== null && plan.unitId === scope.unitId);
  }
  return false; // operator: só pessoalmente vinculado
}
```

O analista vê tudo mas nunca escreve — a escrita já é barrada pelo `requireWriteAccess` existente
(analyst é read-only). O predicado só governa **visibilidade**.

**Divergência deliberada do KPI (decisão da cliente):** no KPI o analista vê só o que é dele + LMS;
aqui o analista vê **tudo** (perfil auditor). É a única diferença de matriz entre os dois módulos.

## 5. Onde o escopo se aplica

O escopo tem que valer nos **três** lugares, senão vaza:

1. **Listagem do hub** (`GET .../action-plans`) — vira **filtro SQL** equivalente ao predicado (o
   caso "pessoalmente vinculado" inclui um `EXISTS` na junção de co-responsáveis, como o #158 já faz).
2. **Abrir/editar um plano** (`requirePlanAccess`) — recebe o **mesmo** predicado por-plano. Sem isso,
   o operador esconde o plano da lista mas o abre pela URL direta.
3. **Dashboards / summary** (`computeActionPlanSummary`) — as contagens refletem o mesmo escopo (o
   "vencidas: N" do operador passa a ser o dele).

**Inalterados:**
- **Escalonamento** — já mira os responsáveis (ponto focal + co-responsáveis); não muda.
- **Widget "Ações vinculadas"** nas telas de origem (`?sourceModule=X` + módulo dono da origem) — é
  uma via de acesso separada, contextual à origem que o usuário já enxerga. Mantém o comportamento
  atual; **não** recebe o escopo por papel do hub. (Fronteira explícita — ver §8.)
- **"Atribuídas a mim"** — continua como sub-filtro dentro da visão já escopada.

### 5.1 Interação com o `requirePlanAccess` atual

Hoje: `pontoFocal || avaliador || hasModule(actionPlans) || hasModule(originOwner) || coResponsável`.

O que muda: a cláusula **`hasModule(actionPlans)`** (que dá acesso irrestrito ao hub) é **substituída**
pelo predicado role-scoped. As demais vias continuam:

```
allowed =
  canViewActionPlan(scope, plan)                                  // NOVO: hub role-scoped (cobre pessoal + gestor + admin/analyst)
  || (originOwner !== "actionPlans" && hasModule(originOwner))    // via origem genuína (kpi, governance, ...) — inalterada
```

`canViewActionPlan` já cobre "pessoalmente vinculado", então a checagem fica mais simples, não mais
complexa. A via de origem só sobra para origens **não-manuais** (para manual, `originOwner` é o próprio
`actionPlans`, que agora é role-scoped — é exatamente o buraco que fechamos).

## 6. Como o gestor obtém a filial

**Exatamente como o KPI** (`getRequesterKpiScope`, `routes/kpi/index.ts:143`): o gestor tem UMA
filial, `users.unit_id` (obrigatória na camada de app para o papel `manager`). O `scope` é montado no
início da rota: `{ role, userId, unitId }`, onde `unitId = users.unit_id` quando `role === "manager"`,
senão `null`. **Não** usa `unit_managers` — para manter paridade com o KPI (a tabela `unit_managers`
existe para outra finalidade; se um dia a visibilidade virar multi-filial, muda-se KPI e Ações juntos).

## 7. Migração (produção)

1. **DDL:** `ALTER TABLE action_plans ADD COLUMN unit_id integer REFERENCES units(id) ON DELETE SET NULL;`
   \+ índice `(organization_id, unit_id)` para o filtro do gestor. Aditivo, nullable, sem downtime.
2. **Backfill:** script que percorre todos os planos e grava `unit_id = deriveUnitId(...)` (resolve a
   origem ou o ponto focal por plano). Idempotente. `unit_id` nulo = corporativo (não é erro).
3. **Deploy do código.** Ordem: DDL → backfill → deploy (como no #158). Nunca `db push`.

O `ON DELETE SET NULL`: se a filial for apagada, o plano vira corporativo (não some). Aceitável.

## 8. Fora de escopo (explícito)

- **Recalcular `unit_id`** quando ponto focal/origem mudam — decisão foi "fixa na criação".
- **Escopar o widget "Ações vinculadas"** por papel — ele segue a via da origem (§5). Só o hub é
  role-scoped. (Se no futuro a cliente quiser, é aditivo.)
- **Escalonamento por filial** (gestor receber alerta dos planos vencidos da filial) — hoje o
  escalonamento mira só os responsáveis; estender para gestores é outra frente.
- **Campo de filial editável na UI** — a filial é **derivada**, nunca escolhida pelo usuário.
- **Novo papel/permissão** — reusa `manager`/`operator`/`analyst`/`admin` que já existem.

## 9. Testes

**Unit (node) — o predicado `canViewActionPlan`** (puro, sem DB), a peça mais crítica:
- admin/analyst → vê qualquer plano (inclusive de outra filial e órfão).
- operator → vê só onde é ponto focal / co-responsável / avaliador; não vê plano de filial alheia.
- manager → vê plano da sua filial, plano corporativo (`unitId` nulo), e onde é pessoal; **não** vê
  plano de filial que não administra.
- gestor de múltiplas filiais (unit_managers com 2 unidades) → vê as duas.

**Unit (node) — `deriveUnitId`:**
- origem com filial → a filial da origem; origem corporativa → null; origem sem entidade → null.
- manual com ponto focal → filial do ponto focal; manual sem ponto focal → null.

**Integração (`TEST_ENV=integration`):**
- Listagem escopada: operador vê só os seus; gestor vê filial + corporativo; admin vê todos.
- `requirePlanAccess`: operador recebe **403** ao abrir por id um plano de outra filial em que não
  está vinculado; gestor recebe 200 num plano da filial dele; via de origem (kpi) ainda abre.
- Summary: as contagens de um operador refletem só os planos dele.
- Backfill: deriva a filial correta por origem e por ponto focal; idempotente.

**Front (web-unit):** o espelho `lib/action-plans-access.ts` casa com o back (mesmos casos do predicado).

**E2E (opcional):** operador logado não vê no hub um plano de outra filial; gestor vê a filial.

## 10. Espelhamento front/back

Como no KPI (`kpi-access.ts` ↔ `services/kpi/access.ts`), o predicado vive nos dois lados e **deve ser
mantido em sync**. O back é a fonte de verdade (barra de fato); o front usa para esconder/mostrar sem
ida ao servidor. Um teste em cada lado com os mesmos casos garante a paridade.
