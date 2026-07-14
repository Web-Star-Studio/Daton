# Tratativas configuráveis + múltiplas ações no Plano de Ação — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao Plano de Ação oito métodos de análise de causa ("tratativas") com editor estruturado, ligáveis/desligáveis por empresa, e substituir o bloco 5W2H único por uma lista de ações rastreáveis (responsável, prazo, status).

**Architecture:** Um catálogo org-scoped (`action_plan_analysis_methods`, molde do catálogo de Normas) governa quais tratativas a empresa usa. O plano ganha uma coluna `analyses` (jsonb, união discriminada por `key`) e uma tabela satélite `action_plan_actions`. Na UI, 5 primitivos reutilizáveis compõem 8 adaptadores finos registrados num registry por `key`.

**Tech Stack:** TypeScript, pnpm workspace, Drizzle ORM + PostgreSQL (Neon), Express 5, OpenAPI 3.1 → Orval (zod + React Query), React 19 + Vite + TailwindCSS 4, Radix/shadcn, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-14-tratativas-plano-de-acao-design.md` (commit `7cbca4a`)

## Global Constraints

- **`pnpm typecheck` limpo é a condição de saída de cada task** — rodar antes de cada commit.
  **Exceção única e deliberada:** as Tasks 4, 5 e 8 são uma migração de contrato indivisível
  (o contrato muda antes dos consumidores). Nelas o typecheck fica quebrado **apenas** nos
  arquivos que a própria task anuncia, e a Task 8 fecha o servidor / a Task 15 fecha o front.
  Fora dessas, typecheck quebrado = task não terminada. **Nunca** "consertar" um erro que a
  task diz explicitamente que é esperado — isso desfaria a migração.
- **Convenção de teste (o `CLAUDE.md` está DESATUALIZADO neste ponto — vale o `vitest.config.ts`):**
  um arquivo `*.test.ts` "puro" **não é descoberto por nenhum projeto do Vitest**. Os globs reais são:
  - `web-unit` (jsdom): **`artifacts/web/tests/**/*.unit.test.{ts,tsx}`** — teste de componente/hook mora aqui, **não** em `tests/web/`. Importe o código sob teste pelo alias `@/` (→ `artifacts/web/src`).
  - `node-unit`: `tests/**/*.unit.test.ts` (+ `artifacts/**/tests/`, `lib/**/tests/`; exclui `artifacts/web/tests/`).
  - `integration`: `tests/**/*.integration.test.ts`.
- **`zod` importa-se como `zod/v4`** em `lib/db/src/schema/*` — é a convenção de todos os schemas existentes.
- **Nunca editar arquivos gerados** (`lib/api-zod/src/generated/`, `lib/api-client-react/src/generated/`). Mudou o contrato → editar `lib/api-spec/openapi.yaml` e rodar `pnpm --filter @workspace/api-spec codegen` (precisa de `python3` no PATH).
- **Testes de integração SEMPRE com `TEST_ENV=integration`.** Sem isso o Vitest carrega o `.env` e bate no **Neon de produção**. Subir o banco de teste com `pnpm test:integration:up` e aplicar schema com `pnpm test:integration:db:push` — **nunca** `pnpm --filter @workspace/db push` (aponta para produção).
- **Nunca subir servidor de dev** sem pedido explícito. A porta 3001 é o backend de dev do usuário e aponta para o **Neon de produção**.
- **Nunca commitar/pushar sem pedido explícito** — exceto o fluxo de entrega final descrito na Task 22.
- **Sem texto livre onde há vocabulário fechado:** categorias, escalas, tipos, status, portas, responsável e prazo são `enum` / select / datepicker.
- **Vocabulário de status da ação = o do plano:** `open | in_progress | completed | cancelled` (reusa `actionPlanStatusEnum`). Rótulos PT-BR: Pendente / Em andamento / Concluída / Cancelada.
- **`SearchableSelect`** (Popover + cmdk), nunca `<Select>` nativo, em qualquer seletor novo com busca.
- **Prettier:** 2 espaços, aspas duplas, trailing commas. `PascalCase` para componentes, `camelCase` para funções, arquivos de rota/schema em minúsculas-com-hífen.
- **O front NÃO importa `@workspace/db`** (só `@workspace/api-client-react`). Os tipos das tratativas vivem duas vezes: no Drizzle (verdade do servidor) e no OpenAPI (gera os tipos do front). Mantenha os dois em sincronia.
- **As 8 chaves de tratativa** (ordem canônica): `five_whys`, `ishikawa`, `a3`, `fmea`, `fault_tree`, `kepner_tregoe`, `rca_apollo`, `barrier_analysis`.

## File Structure

**Criar**
| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/action-plan-analysis-methods.ts` | Enum de chaves, tabela do catálogo, e os tipos de `data` das 8 tratativas |
| `artifacts/api-server/src/services/action-plans/analyses.ts` | Zod da união discriminada + `normalizeAnalyses` + `analysisHasContent` |
| `artifacts/api-server/src/services/action-plans/analysis-methods.ts` | `DEFAULT_ANALYSIS_METHODS` + `ensureAnalysisMethods(orgId)` |
| `artifacts/api-server/src/middlewares/plan-access.ts` | `requirePlanAccess()` extraído de `routes/action-plans.ts` (agora usado por dois routers) |
| `artifacts/api-server/src/routes/action-plan-analysis-methods.ts` | GET + PATCH do catálogo |
| `artifacts/api-server/src/routes/action-plan-actions.ts` | CRUD das ações do plano |
| `artifacts/api-server/src/services/pendencias/providers/action-plan-actions.ts` | Provider de pendências das ações |
| `artifacts/web/src/pages/app/planos-acao/_components/analises/types.ts` | Tipos das tratativas no front + `emptyDataFor` |
| `artifacts/web/src/pages/app/planos-acao/_components/analises/registry.tsx` | `key → { componente, dataVazio, resumo }` |
| `artifacts/web/src/pages/app/planos-acao/_components/analises/primitivos/*.tsx` | 5 primitivos (cadeia, lista agrupada, tabela, árvore, seções) |
| `artifacts/web/src/pages/app/planos-acao/_components/analises/metodos/*.tsx` | 8 adaptadores |
| `artifacts/web/src/pages/app/planos-acao/_components/tratativas.tsx` | Seção "Tratativas" da ficha |
| `artifacts/web/src/pages/app/planos-acao/_components/acoes-do-plano.tsx` | Seção "Ações" da ficha |
| `artifacts/web/src/components/settings/OrganizationAnalysisMethodsSettingsSection.tsx` | Aba de Configurações |
| `scripts/src/migrate/tratativas-e-acoes-backfill.ts` | Semente + backfill de tratativas e ações |

**Modificar**
| Arquivo | Mudança |
|---|---|
| `lib/db/src/schema/action-plans.ts` | Coluna `analyses`; tabela `action_plan_actions`; 3 valores novos no enum do activity log; variante `action` em `ActionPlanActivityChanges` |
| `lib/db/src/schema/index.ts` | Re-exportar o novo schema |
| `lib/api-spec/openapi.yaml` | Schemas + paths do catálogo, de `analyses` e das ações |
| `artifacts/api-server/src/services/action-plans/planning.ts` | `PlanningBlock` = `{ rootCause, analyses }` |
| `artifacts/api-server/src/services/action-plans/serializers.ts` | Serializa `analyses`, `actionsTotal/actionsDone`; novo `serializeAction` |
| `artifacts/api-server/src/routes/action-plans.ts` | POST/PATCH com `analyses`; usa `requirePlanAccess` importado; agregados na listagem |
| `artifacts/api-server/src/routes/auth.ts:129` | Chamar `ensureAnalysisMethods` no registro da org |
| `artifacts/api-server/src/routes/index.ts` | Registrar os 2 routers novos |
| `artifacts/api-server/src/services/pendencias/types.ts` | Source `action_plan_action` + label |
| `artifacts/api-server/src/services/pendencias/registry.ts` | Registrar o provider novo |
| `artifacts/web/src/lib/action-plans-client.ts` | Hooks do catálogo e das ações; estágio da timeline |
| `artifacts/web/src/pages/app/planos-acao/[id].tsx` | Seção Planejamento reescrita |
| `artifacts/web/src/pages/app/planos-acao/_components/nova-acao-dialog.tsx` | Campo Tratativas + renomeação |
| `artifacts/web/src/pages/app/configuracoes/sistema.tsx` | Aba "Tratativas" |
| `artifacts/web/src/pages/app/planos-acao/_components/planning-versions.ts` | Diff legível de `analyses` |

**Remover**
- `artifacts/web/src/pages/app/planos-acao/_components/causa-raiz.tsx` (vira `metodos/cinco-porques.tsx` + campo `rootCause` na ficha)
- `artifacts/web/src/pages/app/planos-acao/_components/plano-5w2h.tsx` (substituído pela tabela de ações)

---

## Fase 1 — Dados e contratos

### Task 1: Schema do catálogo de tratativas + tipos das 8 tratativas

**Files:**
- Create: `lib/db/src/schema/action-plan-analysis-methods.ts`
- Modify: `lib/db/src/schema/index.ts`
- Test: `tests/db/analysis-method-keys.unit.test.ts`

**Interfaces:**
- Produces: `ACTION_PLAN_ANALYSIS_METHOD_KEYS`, `ActionPlanAnalysisMethodKey`, `actionPlanAnalysisMethodKeyEnum`, `actionPlanAnalysisMethodsTable`, `ActionPlanAnalysisMethod`, `ISHIKAWA_CATEGORIES`, `KT_DIMENSIONS`, `BARRIER_TYPES`, `BARRIER_STATUSES`, `FiveWhysData`, `IshikawaData`, `A3Data`, `FmeaData`, `FaultTreeData`, `FaultTreeNode`, `KepnerTregoeData`, `RcaApolloData`, `RcaApolloNode`, `BarrierAnalysisData`, `ActionPlanAnalysis`

- [ ] **Step 1: Escrever o teste que falha**

`tests/db/analysis-method-keys.unit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ACTION_PLAN_ANALYSIS_METHOD_KEYS,
  ISHIKAWA_CATEGORIES,
  KT_DIMENSIONS,
  BARRIER_TYPES,
  BARRIER_STATUSES,
} from "@workspace/db";

describe("vocabulários fechados das tratativas", () => {
  it("expõe as 8 chaves na ordem canônica", () => {
    expect(ACTION_PLAN_ANALYSIS_METHOD_KEYS).toEqual([
      "five_whys",
      "ishikawa",
      "a3",
      "fmea",
      "fault_tree",
      "kepner_tregoe",
      "rca_apollo",
      "barrier_analysis",
    ]);
  });

  it("Ishikawa tem exatamente as 6M", () => {
    expect(ISHIKAWA_CATEGORIES).toEqual([
      "metodo",
      "maquina",
      "mao_de_obra",
      "material",
      "medicao",
      "meio_ambiente",
    ]);
  });

  it("Kepner-Tregoe tem exatamente as 4 dimensões", () => {
    expect(KT_DIMENSIONS).toEqual(["o_que", "onde", "quando", "extensao"]);
  });

  it("Barreiras têm tipo e status fechados", () => {
    expect(BARRIER_TYPES).toEqual(["fisica", "administrativa", "humana", "procedimental"]);
    expect(BARRIER_STATUSES).toEqual(["ausente", "falhou", "ineficaz", "funcionou"]);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `pnpm exec vitest run tests/db/analysis-method-keys.unit.test.ts --project node-unit`
Expected: FAIL — `ACTION_PLAN_ANALYSIS_METHOD_KEYS` não é exportado por `@workspace/db`.

- [ ] **Step 3: Criar o schema**

`lib/db/src/schema/action-plan-analysis-methods.ts`:

```ts
import { z } from "zod";
import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { organizationsTable } from "./organizations";

/**
 * As tratativas (métodos de análise de causa) que um plano de ação pode usar.
 *
 * A ESTRUTURA de cada método vive no código (schema + editor no front), por isso a
 * chave é um enum fechado e o catálogo não tem POST nem DELETE: a empresa liga,
 * desliga, renomeia e reordena — mas não inventa um método sem editor.
 *
 * O plano referencia a tratativa por `key`, NÃO pelo id desta tabela. A chave é
 * estável por organização (índice único), então renomear o rótulo propaga sozinho e
 * desativar não quebra plano antigo. (Normas fazem o oposto — lá o rótulo é texto
 * livre do usuário e não tem identidade estável, por isso referenciam por id.)
 */
export const ACTION_PLAN_ANALYSIS_METHOD_KEYS = [
  "five_whys",
  "ishikawa",
  "a3",
  "fmea",
  "fault_tree",
  "kepner_tregoe",
  "rca_apollo",
  "barrier_analysis",
] as const;

export type ActionPlanAnalysisMethodKey =
  (typeof ACTION_PLAN_ANALYSIS_METHOD_KEYS)[number];

export const actionPlanAnalysisMethodKeyEnum = pgEnum(
  "action_plan_analysis_method_key",
  ACTION_PLAN_ANALYSIS_METHOD_KEYS,
);

export const actionPlanAnalysisMethodsTable = pgTable(
  "action_plan_analysis_methods",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    key: actionPlanAnalysisMethodKeyEnum("key").notNull(),
    label: text("label").notNull(),
    active: boolean("active").notNull().default(true),
    isDefault: boolean("is_default").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("action_plan_analysis_method_org_key_unique").on(
      table.organizationId,
      table.key,
    ),
  ],
);

export const insertActionPlanAnalysisMethodSchema = createInsertSchema(
  actionPlanAnalysisMethodsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertActionPlanAnalysisMethod = z.infer<
  typeof insertActionPlanAnalysisMethodSchema
>;
export type ActionPlanAnalysisMethod =
  typeof actionPlanAnalysisMethodsTable.$inferSelect;

// ─── Vocabulários fechados de cada método ────────────────────────────────────

/** Os 6M do diagrama de Ishikawa. */
export const ISHIKAWA_CATEGORIES = [
  "metodo",
  "maquina",
  "mao_de_obra",
  "material",
  "medicao",
  "meio_ambiente",
] as const;
export type IshikawaCategory = (typeof ISHIKAWA_CATEGORIES)[number];

/** As 4 dimensões da matriz É / NÃO É do Kepner-Tregoe. Linhas FIXAS. */
export const KT_DIMENSIONS = ["o_que", "onde", "quando", "extensao"] as const;
export type KTDimension = (typeof KT_DIMENSIONS)[number];

export const BARRIER_TYPES = [
  "fisica",
  "administrativa",
  "humana",
  "procedimental",
] as const;
export type BarrierType = (typeof BARRIER_TYPES)[number];

export const BARRIER_STATUSES = [
  "ausente",
  "falhou",
  "ineficaz",
  "funcionou",
] as const;
export type BarrierStatus = (typeof BARRIER_STATUSES)[number];

/** Portas lógicas da Árvore de Falhas. Só fazem sentido em nó com filhos. */
export const FAULT_TREE_GATES = ["AND", "OR"] as const;
export type FaultTreeGate = (typeof FAULT_TREE_GATES)[number];

/** No RCA Apollo, toda causa é uma Condição (estado) ou uma Ação (evento). */
export const RCA_APOLLO_CAUSE_TYPES = ["condition", "action"] as const;
export type RcaApolloCauseType = (typeof RCA_APOLLO_CAUSE_TYPES)[number];

/** Escalas do FMEA: 1..10. O RPN (S×O×D) é DERIVADO — nunca digitado, nunca persistido. */
export const FMEA_SCALE_MIN = 1;
export const FMEA_SCALE_MAX = 10;
/** Acima disso a linha é destacada como crítica. */
export const FMEA_RPN_ALERT = 100;

// ─── `data` de cada método ───────────────────────────────────────────────────
// Tudo opcional: a ficha salva parcial o tempo todo. Ids de linha/nó são gerados
// no cliente e servem para seleção e reordenação estáveis.

export const MAX_WHYS = 5;

export type FiveWhysData = { whys: string[] };

export type IshikawaData = {
  causes: Array<{ id: string; category: IshikawaCategory; text: string }>;
  /** A causa mais provável — alvo dos 5 porquês. */
  selectedCauseId?: string;
  whys: string[];
};

export type A3Data = {
  background?: string;
  currentState?: string;
  goal?: string;
  analysis?: string;
  countermeasures?: string;
};

export type FmeaRow = {
  id: string;
  failureMode?: string;
  effect?: string;
  severity?: number;
  cause?: string;
  occurrence?: number;
  currentControl?: string;
  detection?: number;
  recommendedAction?: string;
};
export type FmeaData = { rows: FmeaRow[] };

export type FaultTreeNode = {
  id: string;
  text?: string;
  gate: FaultTreeGate;
  children: FaultTreeNode[];
};
export type FaultTreeData = { topEvent?: string; nodes: FaultTreeNode[] };

export type KepnerTregoeData = {
  /** Sempre as 4 dimensões, sempre nesta ordem. */
  rows: Array<{
    dimension: KTDimension;
    is?: string;
    isNot?: string;
    distinction?: string;
    change?: string;
  }>;
  possibleCauses: Array<{
    id: string;
    text?: string;
    verification?: string;
    verified?: boolean;
  }>;
  mostProbableCauseId?: string;
};

export type RcaApolloNode = {
  id: string;
  text?: string;
  type: RcaApolloCauseType;
  evidence?: string;
  children: RcaApolloNode[];
};
export type RcaApolloData = { primaryEffect?: string; causes: RcaApolloNode[] };

export type BarrierAnalysisData = {
  hazard?: string;
  target?: string;
  barriers: Array<{
    id: string;
    name?: string;
    type?: BarrierType;
    status?: BarrierStatus;
    failureReason?: string;
  }>;
};

/** Uma tratativa aplicada a um plano. Discriminada por `key`. */
export type ActionPlanAnalysis =
  | { key: "five_whys"; data: FiveWhysData }
  | { key: "ishikawa"; data: IshikawaData }
  | { key: "a3"; data: A3Data }
  | { key: "fmea"; data: FmeaData }
  | { key: "fault_tree"; data: FaultTreeData }
  | { key: "kepner_tregoe"; data: KepnerTregoeData }
  | { key: "rca_apollo"; data: RcaApolloData }
  | { key: "barrier_analysis"; data: BarrierAnalysisData };
```

- [ ] **Step 4: Re-exportar do índice do schema**

Em `lib/db/src/schema/index.ts`, junto dos demais `export *`, adicionar:

```ts
export * from "./action-plan-analysis-methods";
```

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `pnpm exec vitest run tests/db/analysis-method-keys.unit.test.ts --project node-unit`
Expected: PASS (4 testes)

Run: `pnpm typecheck`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add lib/db/src/schema/action-plan-analysis-methods.ts lib/db/src/schema/index.ts tests/db/analysis-method-keys.unit.test.ts
git commit -m "feat(db): catálogo de tratativas e tipos das 8 análises de causa"
```

---

### Task 2: Coluna `analyses`, tabela `action_plan_actions` e enum do activity log

**Files:**
- Modify: `lib/db/src/schema/action-plans.ts`
- Test: `tests/db/action-plan-actions-schema.unit.test.ts`

**Interfaces:**
- Consumes: `ActionPlanAnalysis` (Task 1)
- Produces: `actionPlanActionsTable`, `ActionPlanAction`, `InsertActionPlanAction`, `ActionPlanActivityChanges` com a variante `{ kind: "action" }`

- [ ] **Step 1: Escrever o teste que falha**

`tests/db/action-plan-actions-schema.unit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { actionPlanActionsTable, actionPlansTable } from "@workspace/db";
import { getTableColumns } from "drizzle-orm";

describe("schema das ações do plano", () => {
  it("a tabela de ações tem o 5W2H, o responsável, o prazo e o status", () => {
    const cols = Object.keys(getTableColumns(actionPlanActionsTable));
    expect(cols).toEqual(
      expect.arrayContaining([
        "id",
        "organizationId",
        "actionPlanId",
        "what",
        "why",
        "whereAt",
        "how",
        "howMuch",
        "responsibleUserId",
        "dueDate",
        "status",
        "completedAt",
        "notes",
        "sortOrder",
      ]),
    );
  });

  it("não usa `where` como nome de coluna (palavra reservada em SQL)", () => {
    const cols = Object.keys(getTableColumns(actionPlanActionsTable));
    expect(cols).not.toContain("where");
  });

  it("o plano tem a coluna analyses", () => {
    const cols = Object.keys(getTableColumns(actionPlansTable));
    expect(cols).toContain("analyses");
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `pnpm exec vitest run tests/db/action-plan-actions-schema.unit.test.ts --project node-unit`
Expected: FAIL — `actionPlanActionsTable` não é exportado.

- [ ] **Step 3: Adicionar a coluna `analyses` ao plano**

Em `lib/db/src/schema/action-plans.ts`, importar o tipo no topo do arquivo (junto dos demais imports):

```ts
import type { ActionPlanAnalysis } from "./action-plan-analysis-methods";
```

Substituir o bloco de planejamento em `actionPlansTable` (linhas 181-184):

```ts
    // ─── Structured planning (5W2H) + root cause (5 whys) ──────────────────────
    plan5w2h: jsonb("plan_5w2h").$type<ActionPlan5W2H>(),
    rootCause: text("root_cause"),
    rootCauseWhys: jsonb("root_cause_whys").$type<string[]>(),
```

por:

```ts
    // ─── Análise de causa ──────────────────────────────────────────────────────
    /** A conclusão da análise — uma só, qualquer que seja a tratativa usada. */
    rootCause: text("root_cause"),
    /** As tratativas aplicadas a este plano (união discriminada por `key`). */
    analyses: jsonb("analyses").$type<ActionPlanAnalysis[]>(),
    /** @deprecated Migradas para `analyses` / `action_plan_actions` em 2026-07.
     *  Mantidas sem leitura nem escrita como rede de rollback; derrubar em follow-up. */
    plan5w2h: jsonb("plan_5w2h").$type<ActionPlan5W2H>(),
    rootCauseWhys: jsonb("root_cause_whys").$type<string[]>(),
```

- [ ] **Step 4: Estender o enum do activity log e o tipo de `changes`**

Em `lib/db/src/schema/action-plans.ts`, no `actionPlanActivityActionEnum` (linha 152), acrescentar os três valores ao final da lista (a ordem importa: `ALTER TYPE ADD VALUE` só acrescenta ao fim):

```ts
export const actionPlanActivityActionEnum = pgEnum("action_plan_activity_action", [
  "created",
  "updated",
  "status_changed",
  "evidence_added",
  "evidence_removed",
  "effectiveness_evaluated",
  "escalated",
  "reopened",
  "action_added",
  "action_updated",
  "action_removed",
]);
```

No tipo `ActionPlanActivityChanges` (linha 66), acrescentar a variante de ação à união:

```ts
  | {
      kind: "action";
      actionId: number;
      /** Snapshotado: o log precisa sobreviver à remoção da linha (mesma razão do `userName`). */
      what: string;
      fields?: Record<string, { from: unknown; to: unknown }>;
    }
```

- [ ] **Step 5: Criar a tabela de ações**

Em `lib/db/src/schema/action-plans.ts`, logo depois de `actionPlansTable` (após a linha 215) e antes de `actionPlanEvidencesTable`:

```ts
/**
 * As ações do plano — o que antes era o bloco `plan5w2h` único.
 *
 * Cada linha é um 5W2H rastreável: "Quem" é um usuário do sistema (não texto), "Quando"
 * é uma data (não texto) e há status por ação. É isso que permite cobrar: a ação entra
 * em "Suas Pendências" do responsável dela e vence sozinha.
 *
 * Tabela, e não um jsonb no plano, justamente porque precisa ser CONSULTÁVEL por
 * responsável e por prazo — um array jsonb não indexa.
 */
export const actionPlanActionsTable = pgTable(
  "action_plan_actions",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
    actionPlanId: integer("action_plan_id").notNull().references(() => actionPlansTable.id, { onDelete: "cascade" }),
    // ─── 5W2H da ação ──────────────────────────────────────────────────────────
    // Todos anuláveis: a ficha salva parcial o tempo todo. "+ Incluir ação" cria a
    // linha vazia na hora, e o usuário volta para preencher.
    what: text("what"),
    why: text("why"),
    /** Onde. `where` é palavra reservada em SQL — não usar como nome de coluna. */
    whereAt: text("where_at"),
    how: text("how"),
    howMuch: text("how_much"),
    responsibleUserId: integer("responsible_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    dueDate: timestamp("due_date", { withTimezone: true }),
    // ─── Execução ──────────────────────────────────────────────────────────────
    status: actionPlanStatusEnum("status").notNull().default("open"),
    /** Gravado pelo servidor quando o status vira `completed`; limpo ao reabrir. */
    completedAt: timestamp("completed_at", { withTimezone: true }),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdByUserId: integer("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("action_plan_actions_plan_idx").on(table.actionPlanId, table.sortOrder),
    // Serve "Suas Pendências" e o cálculo de atraso.
    index("action_plan_actions_org_responsible_idx").on(
      table.organizationId,
      table.responsibleUserId,
      table.status,
    ),
  ],
);

export const insertActionPlanActionSchema = createInsertSchema(actionPlanActionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertActionPlanAction = z.infer<typeof insertActionPlanActionSchema>;
export type ActionPlanAction = typeof actionPlanActionsTable.$inferSelect;

/** Ação atrasada = venceu e não foi concluída nem cancelada. Derivado, nunca persistido. */
export function isActionPlanActionOverdue(
  action: Pick<ActionPlanAction, "status" | "dueDate">,
  now: Date,
): boolean {
  if (action.status === "completed" || action.status === "cancelled") return false;
  if (!action.dueDate) return false;
  return action.dueDate.getTime() < now.getTime();
}
```

- [ ] **Step 6: Rodar o teste e ver passar**

Run: `pnpm exec vitest run tests/db/action-plan-actions-schema.unit.test.ts --project node-unit`
Expected: PASS (3 testes)

Run: `pnpm typecheck`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add lib/db/src/schema/action-plans.ts tests/db/action-plan-actions-schema.unit.test.ts
git commit -m "feat(db): coluna analyses no plano e tabela action_plan_actions"
```

---

### Task 3: Validação e normalização das tratativas

**Files:**
- Create: `artifacts/api-server/src/services/action-plans/analyses.ts`
- Test: `tests/api-server/action-plan-analyses.unit.test.ts`

**Interfaces:**
- Consumes: tipos da Task 1
- Produces: `analysesSchema` (zod), `parseAnalyses(value)`, `normalizeAnalyses(list)`, `analysisHasContent(analysis)`, `emptyAnalysisData(key)`

- [ ] **Step 1: Escrever os testes que falham**

`tests/api-server/action-plan-analyses.unit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  analysisHasContent,
  emptyAnalysisData,
  normalizeAnalyses,
  parseAnalyses,
} from "../../artifacts/api-server/src/services/action-plans/analyses";
import { ACTION_PLAN_ANALYSIS_METHOD_KEYS } from "@workspace/db";

describe("parseAnalyses", () => {
  it("aceita uma tratativa válida", () => {
    const r = parseAnalyses([{ key: "five_whys", data: { whys: ["a", "b"] } }]);
    expect(r.ok).toBe(true);
  });

  it("rejeita chave duplicada", () => {
    const r = parseAnalyses([
      { key: "five_whys", data: { whys: [] } },
      { key: "five_whys", data: { whys: [] } },
    ]);
    expect(r.ok).toBe(false);
  });

  it("rejeita chave desconhecida", () => {
    const r = parseAnalyses([{ key: "seis_sigma", data: {} }]);
    expect(r.ok).toBe(false);
  });

  it("rejeita data que não casa com a chave", () => {
    const r = parseAnalyses([{ key: "fmea", data: { whys: ["a"] } }]);
    expect(r.ok).toBe(false);
  });

  it("rejeita escala FMEA fora de 1..10", () => {
    const r = parseAnalyses([
      { key: "fmea", data: { rows: [{ id: "1", severity: 11 }] } },
    ]);
    expect(r.ok).toBe(false);
  });

  it("rejeita Kepner-Tregoe sem as 4 dimensões fixas", () => {
    const r = parseAnalyses([
      {
        key: "kepner_tregoe",
        data: { rows: [{ dimension: "o_que" }], possibleCauses: [] },
      },
    ]);
    expect(r.ok).toBe(false);
  });

  it("aceita árvore aninhada", () => {
    const r = parseAnalyses([
      {
        key: "fault_tree",
        data: {
          topEvent: "Veículo rodou irregular",
          nodes: [
            {
              id: "n1",
              text: "Teste não conferido",
              gate: "OR",
              children: [{ id: "n2", text: "Sem treinamento", gate: "OR", children: [] }],
            },
          ],
        },
      },
    ]);
    expect(r.ok).toBe(true);
  });
});

describe("emptyAnalysisData", () => {
  it("produz um data vazio VÁLIDO para cada uma das 8 chaves", () => {
    for (const key of ACTION_PLAN_ANALYSIS_METHOD_KEYS) {
      const r = parseAnalyses([{ key, data: emptyAnalysisData(key) }]);
      expect(r.ok, `chave ${key}`).toBe(true);
    }
  });

  it("o KT vazio já vem com as 4 dimensões", () => {
    const data = emptyAnalysisData("kepner_tregoe") as { rows: unknown[] };
    expect(data.rows).toHaveLength(4);
  });
});

describe("normalizeAnalyses", () => {
  it("descarta porquês vazios mas preserva a ordem (é uma cadeia, não um conjunto)", () => {
    const [a] = normalizeAnalyses([
      { key: "five_whys", data: { whys: ["  a  ", "", "   ", "b"] } },
    ]);
    expect(a).toEqual({ key: "five_whys", data: { whys: ["a", "b"] } });
  });

  it("descarta linha de FMEA sem nenhum campo preenchido", () => {
    const [a] = normalizeAnalyses([
      {
        key: "fmea",
        data: {
          rows: [
            { id: "1", failureMode: "Falha real" },
            { id: "2" },
          ],
        },
      },
    ]);
    expect((a.data as { rows: unknown[] }).rows).toHaveLength(1);
  });

  it("PRESERVA a tratativa cujo data ficou vazio — o usuário a adicionou de propósito", () => {
    const out = normalizeAnalyses([{ key: "a3", data: {} }]);
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe("a3");
  });

  it("zera selectedCauseId órfão em vez de rejeitar (a causa pode ter sido apagada)", () => {
    const [a] = normalizeAnalyses([
      {
        key: "ishikawa",
        data: {
          causes: [{ id: "c1", category: "metodo", text: "Sem conferência" }],
          selectedCauseId: "c99",
          whys: [],
        },
      },
    ]);
    expect((a.data as { selectedCauseId?: string }).selectedCauseId).toBeUndefined();
  });

  it("descarta nó de árvore sem texto, junto da sua subárvore vazia", () => {
    const [a] = normalizeAnalyses([
      {
        key: "fault_tree",
        data: {
          nodes: [
            { id: "n1", text: "real", gate: "OR", children: [] },
            { id: "n2", gate: "OR", children: [{ id: "n3", gate: "OR", children: [] }] },
          ],
        },
      },
    ]);
    expect((a.data as { nodes: unknown[] }).nodes).toHaveLength(1);
  });

  it("um nó sem texto MAS com filho com texto sobrevive (não pode sumir com o filho)", () => {
    const [a] = normalizeAnalyses([
      {
        key: "fault_tree",
        data: {
          nodes: [
            { id: "n2", gate: "AND", children: [{ id: "n3", text: "real", gate: "OR", children: [] }] },
          ],
        },
      },
    ]);
    expect((a.data as { nodes: unknown[] }).nodes).toHaveLength(1);
  });
});

describe("analysisHasContent", () => {
  it("tratativa recém-adicionada não tem conteúdo", () => {
    expect(analysisHasContent({ key: "a3", data: emptyAnalysisData("a3") } as never)).toBe(false);
  });

  it("tratativa preenchida tem conteúdo", () => {
    expect(
      analysisHasContent({ key: "five_whys", data: { whys: ["porque sim"] } }),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run tests/api-server/action-plan-analyses.unit.test.ts --project node-unit`
Expected: FAIL — o módulo `analyses` não existe.

- [ ] **Step 3: Implementar `analyses.ts`**

`artifacts/api-server/src/services/action-plans/analyses.ts`:

```ts
import { z } from "zod";
import {
  ACTION_PLAN_ANALYSIS_METHOD_KEYS,
  BARRIER_STATUSES,
  BARRIER_TYPES,
  FAULT_TREE_GATES,
  FMEA_SCALE_MAX,
  FMEA_SCALE_MIN,
  ISHIKAWA_CATEGORIES,
  KT_DIMENSIONS,
  MAX_WHYS,
  RCA_APOLLO_CAUSE_TYPES,
  type ActionPlanAnalysis,
  type ActionPlanAnalysisMethodKey,
  type FaultTreeNode,
  type RcaApolloNode,
} from "@workspace/db";

// ─── Zod: uma união discriminada por `key` ───────────────────────────────────
// Escrita à mão de propósito. O OpenAPI descreve a mesma forma (para tipar o
// front), mas a validação de escrita não pode depender de como o Orval resolve
// `oneOf` + `discriminator` — se a geração degradar, o servidor continua estrito.

const trimmed = z.string();
const scale = z.number().int().min(FMEA_SCALE_MIN).max(FMEA_SCALE_MAX);
const whys = z.array(trimmed).max(MAX_WHYS);

const fiveWhysData = z.object({ whys });

const ishikawaData = z.object({
  causes: z.array(
    z.object({
      id: trimmed,
      category: z.enum(ISHIKAWA_CATEGORIES),
      text: trimmed,
    }),
  ),
  selectedCauseId: trimmed.optional(),
  whys,
});

const a3Data = z.object({
  background: trimmed.optional(),
  currentState: trimmed.optional(),
  goal: trimmed.optional(),
  analysis: trimmed.optional(),
  countermeasures: trimmed.optional(),
});

const fmeaData = z.object({
  rows: z.array(
    z.object({
      id: trimmed,
      failureMode: trimmed.optional(),
      effect: trimmed.optional(),
      severity: scale.optional(),
      cause: trimmed.optional(),
      occurrence: scale.optional(),
      currentControl: trimmed.optional(),
      detection: scale.optional(),
      recommendedAction: trimmed.optional(),
    }),
  ),
});

const faultTreeNode: z.ZodType<FaultTreeNode> = z.lazy(() =>
  z.object({
    id: trimmed,
    text: trimmed.optional(),
    gate: z.enum(FAULT_TREE_GATES),
    children: z.array(faultTreeNode),
  }),
);
const faultTreeData = z.object({
  topEvent: trimmed.optional(),
  nodes: z.array(faultTreeNode),
});

const kepnerTregoeData = z.object({
  // As 4 dimensões são linhas FIXAS: exatamente 4, exatamente nesta ordem.
  rows: z
    .array(
      z.object({
        dimension: z.enum(KT_DIMENSIONS),
        is: trimmed.optional(),
        isNot: trimmed.optional(),
        distinction: trimmed.optional(),
        change: trimmed.optional(),
      }),
    )
    .refine(
      (rows) =>
        rows.length === KT_DIMENSIONS.length &&
        rows.every((r, i) => r.dimension === KT_DIMENSIONS[i]),
      { message: "Kepner-Tregoe exige exatamente as 4 dimensões, na ordem canônica" },
    ),
  possibleCauses: z.array(
    z.object({
      id: trimmed,
      text: trimmed.optional(),
      verification: trimmed.optional(),
      verified: z.boolean().optional(),
    }),
  ),
  mostProbableCauseId: trimmed.optional(),
});

const rcaApolloNode: z.ZodType<RcaApolloNode> = z.lazy(() =>
  z.object({
    id: trimmed,
    text: trimmed.optional(),
    type: z.enum(RCA_APOLLO_CAUSE_TYPES),
    evidence: trimmed.optional(),
    children: z.array(rcaApolloNode),
  }),
);
const rcaApolloData = z.object({
  primaryEffect: trimmed.optional(),
  causes: z.array(rcaApolloNode),
});

const barrierAnalysisData = z.object({
  hazard: trimmed.optional(),
  target: trimmed.optional(),
  barriers: z.array(
    z.object({
      id: trimmed,
      name: trimmed.optional(),
      type: z.enum(BARRIER_TYPES).optional(),
      status: z.enum(BARRIER_STATUSES).optional(),
      failureReason: trimmed.optional(),
    }),
  ),
});

export const analysisSchema = z.discriminatedUnion("key", [
  z.object({ key: z.literal("five_whys"), data: fiveWhysData }),
  z.object({ key: z.literal("ishikawa"), data: ishikawaData }),
  z.object({ key: z.literal("a3"), data: a3Data }),
  z.object({ key: z.literal("fmea"), data: fmeaData }),
  z.object({ key: z.literal("fault_tree"), data: faultTreeData }),
  z.object({ key: z.literal("kepner_tregoe"), data: kepnerTregoeData }),
  z.object({ key: z.literal("rca_apollo"), data: rcaApolloData }),
  z.object({ key: z.literal("barrier_analysis"), data: barrierAnalysisData }),
]);

export const analysesSchema = z.array(analysisSchema).superRefine((list, ctx) => {
  const seen = new Set<string>();
  for (const item of list) {
    if (seen.has(item.key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `A tratativa "${item.key}" aparece mais de uma vez no plano`,
      });
      return;
    }
    seen.add(item.key);
  }
});

export type ParseResult =
  | { ok: true; value: ActionPlanAnalysis[] }
  | { ok: false; error: string };

export function parseAnalyses(value: unknown): ParseResult {
  const r = analysesSchema.safeParse(value);
  if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? "Tratativa inválida" };
  return { ok: true, value: r.data as ActionPlanAnalysis[] };
}

// ─── `data` vazio de cada método ─────────────────────────────────────────────

/** O estado inicial de uma tratativa recém-adicionada. Deve SEMPRE passar em `parseAnalyses`. */
export function emptyAnalysisData(key: ActionPlanAnalysisMethodKey): ActionPlanAnalysis["data"] {
  switch (key) {
    case "five_whys":
      return { whys: [] };
    case "ishikawa":
      return { causes: [], whys: [] };
    case "a3":
      return {};
    case "fmea":
      return { rows: [] };
    case "fault_tree":
      return { nodes: [] };
    case "kepner_tregoe":
      // As 4 linhas nascem com a tratativa: a matriz É / NÃO É não é editável em estrutura.
      return { rows: KT_DIMENSIONS.map((dimension) => ({ dimension })), possibleCauses: [] };
    case "rca_apollo":
      return { causes: [] };
    case "barrier_analysis":
      return { barriers: [] };
  }
}

// ─── Normalização ────────────────────────────────────────────────────────────

function clean(value: string | undefined): string | undefined {
  const t = value?.trim();
  return t ? t : undefined;
}

/** Remove as chaves `undefined` para que o JSON persistido seja canônico
 *  (`{a: undefined}` e `{}` precisam comparar como iguais no diff de versões). */
function compact<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as T;
}

function normalizeWhys(list: string[]): string[] {
  return list.map((w) => w.trim()).filter(Boolean).slice(0, MAX_WHYS);
}

/** Um nó sobrevive se tem texto próprio OU se algum descendente tem — senão sumiria
 *  com filhos preenchidos junto. */
function normalizeTree<T extends { text?: string; children: T[] }>(nodes: T[]): T[] {
  const out: T[] = [];
  for (const node of nodes) {
    const children = normalizeTree(node.children ?? []);
    const text = clean(node.text);
    if (!text && children.length === 0) continue;
    out.push(compact({ ...node, text, children }));
  }
  return out;
}

/**
 * Forma canônica de `analyses`, aplicada NA ESCRITA.
 *
 * Descarta linha / nó / porquê inteiramente vazio (senão um autosave que só passeou
 * pelo formulário viraria uma "versão" no histórico), mas PRESERVA a tratativa cujo
 * `data` ficou vazio: adicionar a tratativa foi uma decisão do usuário, não ruído.
 */
export function normalizeAnalyses(list: ActionPlanAnalysis[]): ActionPlanAnalysis[] {
  return list.map((analysis): ActionPlanAnalysis => {
    switch (analysis.key) {
      case "five_whys":
        return { key: "five_whys", data: { whys: normalizeWhys(analysis.data.whys ?? []) } };

      case "ishikawa": {
        const causes = (analysis.data.causes ?? [])
          .map((c) => ({ ...c, text: c.text?.trim() ?? "" }))
          .filter((c) => c.text !== "");
        const ids = new Set(causes.map((c) => c.id));
        const selectedCauseId = analysis.data.selectedCauseId;
        return {
          key: "ishikawa",
          data: compact({
            causes,
            // Órfão vira `undefined` em vez de erro: a causa selecionada pode ter sido apagada.
            selectedCauseId: selectedCauseId && ids.has(selectedCauseId) ? selectedCauseId : undefined,
            whys: normalizeWhys(analysis.data.whys ?? []),
          }),
        };
      }

      case "a3":
        return {
          key: "a3",
          data: compact({
            background: clean(analysis.data.background),
            currentState: clean(analysis.data.currentState),
            goal: clean(analysis.data.goal),
            analysis: clean(analysis.data.analysis),
            countermeasures: clean(analysis.data.countermeasures),
          }),
        };

      case "fmea": {
        const rows = (analysis.data.rows ?? [])
          .map((r) =>
            compact({
              id: r.id,
              failureMode: clean(r.failureMode),
              effect: clean(r.effect),
              severity: r.severity,
              cause: clean(r.cause),
              occurrence: r.occurrence,
              currentControl: clean(r.currentControl),
              detection: r.detection,
              recommendedAction: clean(r.recommendedAction),
            }),
          )
          .filter((r) => Object.keys(r).length > 1); // sobrou só o `id` → linha vazia
        return { key: "fmea", data: { rows } };
      }

      case "fault_tree":
        return {
          key: "fault_tree",
          data: compact({
            topEvent: clean(analysis.data.topEvent),
            nodes: normalizeTree(analysis.data.nodes ?? []),
          }),
        };

      case "kepner_tregoe": {
        // As 4 linhas são estruturais: reconstrói sempre, para nunca sair uma matriz torta.
        const byDimension = new Map(
          (analysis.data.rows ?? []).map((r) => [r.dimension, r] as const),
        );
        const rows = KT_DIMENSIONS.map((dimension) => {
          const r = byDimension.get(dimension);
          return compact({
            dimension,
            is: clean(r?.is),
            isNot: clean(r?.isNot),
            distinction: clean(r?.distinction),
            change: clean(r?.change),
          });
        });
        const possibleCauses = (analysis.data.possibleCauses ?? [])
          .map((c) =>
            compact({
              id: c.id,
              text: clean(c.text),
              verification: clean(c.verification),
              verified: c.verified,
            }),
          )
          .filter((c) => Object.keys(c).length > 1);
        const ids = new Set(possibleCauses.map((c) => c.id));
        const mostProbableCauseId = analysis.data.mostProbableCauseId;
        return {
          key: "kepner_tregoe",
          data: compact({
            rows,
            possibleCauses,
            mostProbableCauseId:
              mostProbableCauseId && ids.has(mostProbableCauseId) ? mostProbableCauseId : undefined,
          }),
        };
      }

      case "rca_apollo":
        return {
          key: "rca_apollo",
          data: compact({
            primaryEffect: clean(analysis.data.primaryEffect),
            causes: normalizeTree(analysis.data.causes ?? []),
          }),
        };

      case "barrier_analysis": {
        const barriers = (analysis.data.barriers ?? [])
          .map((b) =>
            compact({
              id: b.id,
              name: clean(b.name),
              type: b.type,
              status: b.status,
              failureReason: clean(b.failureReason),
            }),
          )
          .filter((b) => Object.keys(b).length > 1);
        return {
          key: "barrier_analysis",
          data: compact({
            hazard: clean(analysis.data.hazard),
            target: clean(analysis.data.target),
            barriers,
          }),
        };
      }
    }
  });
}

/** Tem alguma coisa escrita? Usado pelo estágio da timeline e pelo resumo do card. */
export function analysisHasContent(analysis: ActionPlanAnalysis): boolean {
  const [normalized] = normalizeAnalyses([analysis]);
  const data = normalized.data as Record<string, unknown>;
  return Object.values(data).some((v) => {
    if (Array.isArray(v)) {
      // O KT nasce com as 4 linhas vazias — um array de objetos só com `dimension` não é conteúdo.
      return v.some((item) =>
        typeof item === "object" && item !== null
          ? Object.keys(item as object).some((k) => k !== "dimension" && k !== "id")
          : Boolean(item),
      );
    }
    return v !== undefined && v !== null && v !== "";
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm exec vitest run tests/api-server/action-plan-analyses.unit.test.ts --project node-unit`
Expected: PASS (todos os describes)

Run: `pnpm typecheck`

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/services/action-plans/analyses.ts tests/api-server/action-plan-analyses.unit.test.ts
git commit -m "feat(api): validação e normalização das tratativas do plano de ação"
```

---

### Task 4: Bloco de planejamento passa a versionar as tratativas

**Files:**
- Modify: `artifacts/api-server/src/services/action-plans/planning.ts`
- Test: `tests/api-server/action-plan-planning.unit.test.ts` (já existe — estender; se não existir, criar)

**Interfaces:**
- Consumes: `normalizeAnalyses` (Task 3)
- Produces: `PlanningBlock = { rootCause: string | null; analyses: ActionPlanAnalysis[] | null }`, `extractPlanning`, `normalizePlanning`, `planningChanged` (assinaturas mantidas)

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar a `tests/api-server/action-plan-planning.unit.test.ts` (criando o arquivo com estes imports se ele não existir):

```ts
import { describe, expect, it } from "vitest";
import {
  extractPlanning,
  normalizePlanning,
  planningChanged,
} from "../../artifacts/api-server/src/services/action-plans/planning";

describe("PlanningBlock com tratativas", () => {
  it("extrai causa raiz e tratativas", () => {
    const block = extractPlanning({
      rootCause: "Falta de treinamento",
      analyses: [{ key: "five_whys", data: { whys: ["a"] } }],
    });
    expect(block).toEqual({
      rootCause: "Falta de treinamento",
      analyses: [{ key: "five_whys", data: { whys: ["a"] } }],
    });
  });

  it("não carrega mais plan5w2h nem rootCauseWhys", () => {
    const block = normalizePlanning({ rootCause: "x", analyses: null });
    expect(block).not.toHaveProperty("plan5w2h");
    expect(block).not.toHaveProperty("rootCauseWhys");
  });

  it("colapsa lista vazia de tratativas para null", () => {
    expect(normalizePlanning({ rootCause: null, analyses: [] }).analyses).toBeNull();
  });

  it("normaliza o conteúdo de dentro da tratativa", () => {
    const block = normalizePlanning({
      rootCause: "  ",
      analyses: [{ key: "five_whys", data: { whys: ["  a  ", ""] } }],
    });
    expect(block.rootCause).toBeNull();
    expect(block.analyses).toEqual([{ key: "five_whys", data: { whys: ["a"] } }]);
  });

  it("detecta mudança DENTRO de uma tratativa", () => {
    const before = { rootCause: null, analyses: [{ key: "five_whys" as const, data: { whys: ["a"] } }] };
    const after = { rootCause: null, analyses: [{ key: "five_whys" as const, data: { whys: ["a", "b"] } }] };
    expect(planningChanged(before, after)).toBe(true);
  });

  it("um autosave que só passeia pelo formulário NÃO é uma mudança", () => {
    const before = { rootCause: "x", analyses: [{ key: "a3" as const, data: { goal: "meta" } }] };
    const after = { rootCause: " x ", analyses: [{ key: "a3" as const, data: { goal: "  meta  " } }] };
    expect(planningChanged(before, after)).toBe(false);
  });

  it("adicionar uma tratativa vazia É uma mudança (foi decisão do usuário)", () => {
    const before = { rootCause: null, analyses: null };
    const after = { rootCause: null, analyses: [{ key: "fmea" as const, data: { rows: [] } }] };
    expect(planningChanged(before, after)).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run tests/api-server/action-plan-planning.unit.test.ts --project node-unit`
Expected: FAIL — `normalizePlanning` ainda devolve `plan5w2h`/`rootCauseWhys`.

- [ ] **Step 3: Reescrever `planning.ts`**

Substituir o conteúdo inteiro de `artifacts/api-server/src/services/action-plans/planning.ts` por:

```ts
import type { ActionPlanAnalysis } from "@workspace/db";
import { normalizeAnalyses } from "./analyses";

/**
 * O bloco de análise de causa, versionado como UM campo lógico.
 *
 * O activity log guarda diffs por campo e o único snapshot que ele mantém é o da
 * criação (code/title/sourceModule/status). Reproduzir diffs, portanto, não recompõe
 * "o bloco às 12:34" — uma entrada que só tocou a causa raiz nada diz sobre as
 * tratativas naquele instante. Guardar o bloco inteiro em `from`/`to` faz de todo `to`
 * uma versão completa, e restaurar vira simplesmente aplicá-lo.
 *
 * As AÇÕES do plano ficam de fora deste bloco de propósito: elas têm status e data de
 * conclusão reais, e restaurar um snapshot delas apagaria trabalho executado. Elas têm
 * trilha própria no activity log (`action_added` / `action_updated` / `action_removed`).
 */
export interface PlanningBlock {
  rootCause: string | null;
  analyses: ActionPlanAnalysis[] | null;
}

interface PlanningSource {
  rootCause?: string | null;
  analyses?: ActionPlanAnalysis[] | null;
}

export function extractPlanning(row: PlanningSource): PlanningBlock {
  return {
    rootCause: row.rootCause ?? null,
    analyses: row.analyses ?? null,
  };
}

/** `null`, `""` e `[]` todos querem dizer "vazio" — colapsa-os, para que um autosave que
 *  apenas roda um bloco vazio de ida e volta nunca vire uma versão no histórico. */
export function normalizePlanning(block: PlanningSource): PlanningBlock {
  const rootCause = block.rootCause?.trim() || null;
  const analyses = normalizeAnalyses(block.analyses ?? []);
  return { rootCause, analyses: analyses.length ? analyses : null };
}

/** Igualdade profunda com as chaves de objeto ordenadas, para que `{what, why}` seja igual
 *  a `{why, what}`. Arrays continuam sensíveis à ordem: os 5 porquês são uma cadeia, não um
 *  conjunto — e a ordem das tratativas é a ordem em que o usuário as adicionou. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(source)
        .sort()
        .map((key) => [key, canonical(source[key])]),
    );
  }
  return value ?? null;
}

export function planningChanged(
  before: PlanningSource,
  after: PlanningSource,
): boolean {
  return (
    JSON.stringify(canonical(normalizePlanning(before))) !==
    JSON.stringify(canonical(normalizePlanning(after)))
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm exec vitest run tests/api-server/action-plan-planning.unit.test.ts --project node-unit`
Expected: PASS

`pnpm typecheck` vai **quebrar** em `routes/action-plans.ts` (ainda passa `plan5w2h`/`rootCauseWhys` ao bloco). Isso é esperado e será resolvido na Task 8 — não tente consertar aqui.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/services/action-plans/planning.ts tests/api-server/action-plan-planning.unit.test.ts
git commit -m "feat(api): bloco de planejamento versiona tratativas (não mais 5W2H)"
```

---

### Task 5: Contratos OpenAPI + codegen

**Files:**
- Modify: `lib/api-spec/openapi.yaml`
- Regenerate: `lib/api-zod/src/generated/`, `lib/api-client-react/src/generated/` (nunca editar à mão)

**Interfaces:**
- Produces (zod, de `@workspace/api-zod`): `ListAnalysisMethodsParams`, `UpdateAnalysisMethodParams`, `UpdateAnalysisMethodBody`, `ListActionPlanActionsParams`, `CreateActionPlanActionParams`, `CreateActionPlanActionBody`, `UpdateActionPlanActionParams`, `UpdateActionPlanActionBody`, `DeleteActionPlanActionParams`
- Produces (hooks, de `@workspace/api-client-react`): `useListAnalysisMethods`, `getListAnalysisMethodsQueryKey`, `useUpdateAnalysisMethod`, `useListActionPlanActions`, `getListActionPlanActionsQueryKey`, `useCreateActionPlanAction`, `useUpdateActionPlanAction`, `useDeleteActionPlanAction`; tipos `ActionPlanAnalysisMethod`, `ActionPlanAction`, `ActionPlanAnalysis`

- [ ] **Step 1: Declarar as tags e os schemas**

Em `lib/api-spec/openapi.yaml`, na lista de `tags` (perto da linha 70, onde está `norms`), acrescentar:

```yaml
  - name: action-plan-analysis-methods
    description: Catálogo de tratativas (métodos de análise de causa) da organização
```

Em `components.schemas`, acrescentar (perto dos demais schemas de `ActionPlan*`, ~linha 18769):

```yaml
    ActionPlanAnalysisMethodKey:
      type: string
      enum: [five_whys, ishikawa, a3, fmea, fault_tree, kepner_tregoe, rca_apollo, barrier_analysis]

    ActionPlanAnalysisMethod:
      type: object
      required: [id, organizationId, key, label, active, isDefault, sortOrder]
      properties:
        id: { type: integer }
        organizationId: { type: integer }
        key: { $ref: "#/components/schemas/ActionPlanAnalysisMethodKey" }
        label: { type: string }
        active: { type: boolean }
        isDefault: { type: boolean }
        sortOrder: { type: integer }

    UpdateAnalysisMethodBody:
      type: object
      properties:
        label: { type: string, minLength: 1 }
        active: { type: boolean }
        isDefault: { type: boolean }
        sortOrder: { type: integer }

    # ─── `data` de cada tratativa ──────────────────────────────────────────────
    FiveWhysData:
      type: object
      required: [whys]
      properties:
        whys: { type: array, maxItems: 5, items: { type: string } }

    IshikawaData:
      type: object
      required: [causes, whys]
      properties:
        causes:
          type: array
          items:
            type: object
            required: [id, category, text]
            properties:
              id: { type: string }
              category:
                type: string
                enum: [metodo, maquina, mao_de_obra, material, medicao, meio_ambiente]
              text: { type: string }
        selectedCauseId: { type: string }
        whys: { type: array, maxItems: 5, items: { type: string } }

    A3Data:
      type: object
      properties:
        background: { type: string }
        currentState: { type: string }
        goal: { type: string }
        analysis: { type: string }
        countermeasures: { type: string }

    FmeaData:
      type: object
      required: [rows]
      properties:
        rows:
          type: array
          items:
            type: object
            required: [id]
            properties:
              id: { type: string }
              failureMode: { type: string }
              effect: { type: string }
              severity: { type: integer, minimum: 1, maximum: 10 }
              cause: { type: string }
              occurrence: { type: integer, minimum: 1, maximum: 10 }
              currentControl: { type: string }
              detection: { type: integer, minimum: 1, maximum: 10 }
              recommendedAction: { type: string }

    FaultTreeNode:
      type: object
      required: [id, gate, children]
      properties:
        id: { type: string }
        text: { type: string }
        gate: { type: string, enum: [AND, OR] }
        children:
          type: array
          items: { $ref: "#/components/schemas/FaultTreeNode" }

    FaultTreeData:
      type: object
      required: [nodes]
      properties:
        topEvent: { type: string }
        nodes:
          type: array
          items: { $ref: "#/components/schemas/FaultTreeNode" }

    KepnerTregoeData:
      type: object
      required: [rows, possibleCauses]
      properties:
        rows:
          type: array
          minItems: 4
          maxItems: 4
          items:
            type: object
            required: [dimension]
            properties:
              dimension: { type: string, enum: [o_que, onde, quando, extensao] }
              is: { type: string }
              isNot: { type: string }
              distinction: { type: string }
              change: { type: string }
        possibleCauses:
          type: array
          items:
            type: object
            required: [id]
            properties:
              id: { type: string }
              text: { type: string }
              verification: { type: string }
              verified: { type: boolean }
        mostProbableCauseId: { type: string }

    RcaApolloNode:
      type: object
      required: [id, type, children]
      properties:
        id: { type: string }
        text: { type: string }
        type: { type: string, enum: [condition, action] }
        evidence: { type: string }
        children:
          type: array
          items: { $ref: "#/components/schemas/RcaApolloNode" }

    RcaApolloData:
      type: object
      required: [causes]
      properties:
        primaryEffect: { type: string }
        causes:
          type: array
          items: { $ref: "#/components/schemas/RcaApolloNode" }

    BarrierAnalysisData:
      type: object
      required: [barriers]
      properties:
        hazard: { type: string }
        target: { type: string }
        barriers:
          type: array
          items:
            type: object
            required: [id]
            properties:
              id: { type: string }
              name: { type: string }
              type: { type: string, enum: [fisica, administrativa, humana, procedimental] }
              status: { type: string, enum: [ausente, falhou, ineficaz, funcionou] }
              failureReason: { type: string }

    # União discriminada por `key`. Se a saída do Orval para isto degradar (ver Step 3),
    # o servidor continua estrito via `services/action-plans/analyses.ts`.
    ActionPlanAnalysis:
      oneOf:
        - type: object
          required: [key, data]
          properties:
            key: { type: string, enum: [five_whys] }
            data: { $ref: "#/components/schemas/FiveWhysData" }
        - type: object
          required: [key, data]
          properties:
            key: { type: string, enum: [ishikawa] }
            data: { $ref: "#/components/schemas/IshikawaData" }
        - type: object
          required: [key, data]
          properties:
            key: { type: string, enum: [a3] }
            data: { $ref: "#/components/schemas/A3Data" }
        - type: object
          required: [key, data]
          properties:
            key: { type: string, enum: [fmea] }
            data: { $ref: "#/components/schemas/FmeaData" }
        - type: object
          required: [key, data]
          properties:
            key: { type: string, enum: [fault_tree] }
            data: { $ref: "#/components/schemas/FaultTreeData" }
        - type: object
          required: [key, data]
          properties:
            key: { type: string, enum: [kepner_tregoe] }
            data: { $ref: "#/components/schemas/KepnerTregoeData" }
        - type: object
          required: [key, data]
          properties:
            key: { type: string, enum: [rca_apollo] }
            data: { $ref: "#/components/schemas/RcaApolloData" }
        - type: object
          required: [key, data]
          properties:
            key: { type: string, enum: [barrier_analysis] }
            data: { $ref: "#/components/schemas/BarrierAnalysisData" }

    # ─── Ações do plano ────────────────────────────────────────────────────────
    ActionPlanAction:
      type: object
      required: [id, actionPlanId, status, sortOrder, createdAt]
      properties:
        id: { type: integer }
        actionPlanId: { type: integer }
        what: { type: string, nullable: true }
        why: { type: string, nullable: true }
        whereAt: { type: string, nullable: true }
        how: { type: string, nullable: true }
        howMuch: { type: string, nullable: true }
        responsibleUserId: { type: integer, nullable: true }
        responsibleUserName: { type: string, nullable: true }
        dueDate: { type: string, format: date-time, nullable: true }
        status: { type: string, enum: [open, in_progress, completed, cancelled] }
        completedAt: { type: string, format: date-time, nullable: true }
        notes: { type: string, nullable: true }
        sortOrder: { type: integer }
        createdAt: { type: string, format: date-time }

    CreateActionPlanActionBody:
      type: object
      properties:
        what: { type: string, nullable: true }
        why: { type: string, nullable: true }
        whereAt: { type: string, nullable: true }
        how: { type: string, nullable: true }
        howMuch: { type: string, nullable: true }
        responsibleUserId: { type: integer, nullable: true }
        dueDate: { type: string, format: date-time, nullable: true }
        status: { type: string, enum: [open, in_progress, completed, cancelled] }
        notes: { type: string, nullable: true }

    UpdateActionPlanActionBody:
      type: object
      properties:
        what: { type: string, nullable: true }
        why: { type: string, nullable: true }
        whereAt: { type: string, nullable: true }
        how: { type: string, nullable: true }
        howMuch: { type: string, nullable: true }
        responsibleUserId: { type: integer, nullable: true }
        dueDate: { type: string, format: date-time, nullable: true }
        status: { type: string, enum: [open, in_progress, completed, cancelled] }
        notes: { type: string, nullable: true }
        sortOrder: { type: integer }
```

- [ ] **Step 2: Ajustar os schemas do plano**

No schema **`ActionPlan`** (~linha 18902): **remover** as propriedades `plan5w2h` e `rootCauseWhys`, e **acrescentar**:

```yaml
        analyses:
          type: array
          nullable: true
          items: { $ref: "#/components/schemas/ActionPlanAnalysis" }
        actionsTotal: { type: integer }
        actionsDone: { type: integer }
```

No schema **`ActionPlanListItem`** (~linha 19034): acrescentar `actionsTotal` e `actionsDone` (mesmos tipos). **Não** acrescentar `analyses` — a listagem não mostra tratativa.

Em **`CreateActionPlanBody`** (~linha 19094) e **`UpdateActionPlanBody`** (~linha 19186): **remover** `plan5w2h` e `rootCauseWhys`, e **acrescentar** em ambos:

```yaml
        analyses:
          type: array
          nullable: true
          items: { $ref: "#/components/schemas/ActionPlanAnalysis" }
```

- [ ] **Step 3: Declarar os paths**

Acrescentar em `paths` (junto dos demais de action-plans, ~linha 9228):

```yaml
  /organizations/{orgId}/action-plan-analysis-methods:
    get:
      operationId: listAnalysisMethods
      tags: [action-plan-analysis-methods]
      summary: Catálogo de tratativas da organização (ativas e inativas)
      parameters:
        - name: orgId
          in: path
          required: true
          schema: { type: integer }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: array
                items: { $ref: "#/components/schemas/ActionPlanAnalysisMethod" }

  /organizations/{orgId}/action-plan-analysis-methods/{methodId}:
    patch:
      operationId: updateAnalysisMethod
      tags: [action-plan-analysis-methods]
      summary: Liga/desliga, renomeia, marca como padrão ou reordena uma tratativa
      parameters:
        - name: orgId
          in: path
          required: true
          schema: { type: integer }
        - name: methodId
          in: path
          required: true
          schema: { type: integer }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/UpdateAnalysisMethodBody" }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ActionPlanAnalysisMethod" }

  /organizations/{orgId}/action-plans/{planId}/actions:
    get:
      operationId: listActionPlanActions
      tags: [action-plans]
      parameters:
        - name: orgId
          in: path
          required: true
          schema: { type: integer }
        - name: planId
          in: path
          required: true
          schema: { type: integer }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: array
                items: { $ref: "#/components/schemas/ActionPlanAction" }
    post:
      operationId: createActionPlanAction
      tags: [action-plans]
      parameters:
        - name: orgId
          in: path
          required: true
          schema: { type: integer }
        - name: planId
          in: path
          required: true
          schema: { type: integer }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/CreateActionPlanActionBody" }
      responses:
        "201":
          description: Criada
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ActionPlanAction" }

  /organizations/{orgId}/action-plans/{planId}/actions/{actionId}:
    patch:
      operationId: updateActionPlanAction
      tags: [action-plans]
      parameters:
        - name: orgId
          in: path
          required: true
          schema: { type: integer }
        - name: planId
          in: path
          required: true
          schema: { type: integer }
        - name: actionId
          in: path
          required: true
          schema: { type: integer }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/UpdateActionPlanActionBody" }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ActionPlanAction" }
    delete:
      operationId: deleteActionPlanAction
      tags: [action-plans]
      parameters:
        - name: orgId
          in: path
          required: true
          schema: { type: integer }
        - name: planId
          in: path
          required: true
          schema: { type: integer }
        - name: actionId
          in: path
          required: true
          schema: { type: integer }
      responses:
        "204":
          description: Removida
```

- [ ] **Step 4: Regerar e INSPECIONAR a saída**

Run: `pnpm --filter @workspace/api-spec codegen`

Depois **abra** `lib/api-zod/src/generated/api.ts` e procure por `ActionPlanAnalysis`.

Expected (caminho feliz): um `z.union([...])` ou `z.discriminatedUnion(...)` com os 8 membros, e o tipo TS em `lib/api-client-react/src/generated/` sendo uma união utilizável.

**Se a saída degradar** (ex.: virar `z.any()`, `unknown`, ou um objeto achatado com todas as propriedades opcionais): isso é **aceitável e esperado como plano B**. O servidor não depende disso — a validação de escrita é a da Task 3 (`services/action-plans/analyses.ts`), que é estrita e escrita à mão. Nesse caso o front usa os tipos locais da Task 12 (`analises/types.ts`) em vez do tipo gerado. **Registre no commit qual dos dois caminhos ocorreu.**

- [ ] **Step 5: Verificar que os hooks nasceram**

Run: `grep -c "useListAnalysisMethods\|useCreateActionPlanAction\|useUpdateActionPlanAction\|useDeleteActionPlanAction\|useListActionPlanActions" lib/api-client-react/src/generated/*.ts`
Expected: > 0

Run: `pnpm typecheck`
Expected: erros SOMENTE em `routes/action-plans.ts` e em `[id].tsx` (ainda usam `plan5w2h`/`rootCauseWhys`, removidos do contrato). Resolvidos nas Tasks 8 e 15.

- [ ] **Step 6: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod/src/generated lib/api-client-react/src/generated
git commit -m "feat(api-spec): contratos do catálogo de tratativas, de analyses e das ações do plano"
```

---

## Fase 2 — Backend

### Task 6: Semente do catálogo + rotas GET/PATCH

**Files:**
- Create: `artifacts/api-server/src/services/action-plans/analysis-methods.ts`
- Create: `artifacts/api-server/src/routes/action-plan-analysis-methods.ts`
- Modify: `artifacts/api-server/src/routes/auth.ts` (linha ~129, junto de `ensureDefaultNorms`)
- Modify: `artifacts/api-server/src/routes/index.ts`
- Test: `tests/api-server/analysis-methods.integration.test.ts`

**Interfaces:**
- Produces: `DEFAULT_ANALYSIS_METHODS`, `ensureAnalysisMethods(orgId): Promise<void>`

- [ ] **Step 1: Escrever o teste de integração que falha**

`tests/api-server/analysis-methods.integration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { db, actionPlanAnalysisMethodsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authHeader, createTestContext, createTestUser } from "../support/backend";
import { ensureAnalysisMethods } from "../../artifacts/api-server/src/services/action-plans/analysis-methods";

describe("catálogo de tratativas", () => {
  it("semeia as 8 tratativas, com 5 Porquês como o único padrão", async () => {
    const ctx = await createTestContext();
    await ensureAnalysisMethods(ctx.orgId);

    const rows = await db
      .select()
      .from(actionPlanAnalysisMethodsTable)
      .where(eq(actionPlanAnalysisMethodsTable.organizationId, ctx.orgId));

    expect(rows).toHaveLength(8);
    expect(rows.every((r) => r.active)).toBe(true);
    const defaults = rows.filter((r) => r.isDefault).map((r) => r.key);
    expect(defaults).toEqual(["five_whys"]);
  });

  it("é idempotente — rodar duas vezes não duplica", async () => {
    const ctx = await createTestContext();
    await ensureAnalysisMethods(ctx.orgId);
    await ensureAnalysisMethods(ctx.orgId);

    const rows = await db
      .select()
      .from(actionPlanAnalysisMethodsTable)
      .where(eq(actionPlanAnalysisMethodsTable.organizationId, ctx.orgId));
    expect(rows).toHaveLength(8);
  });

  it("GET semeia preguiçosamente (org que nunca passou pelo backfill não vê lista vazia)", async () => {
    const ctx = await createTestContext();
    const res = await fetch(
      `${ctx.baseUrl}/api/organizations/${ctx.orgId}/action-plan-analysis-methods`,
      { headers: authHeader(ctx.token) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(8);
  });

  it("PATCH exige org_admin — operator leva 403", async () => {
    const ctx = await createTestContext();
    await ensureAnalysisMethods(ctx.orgId);
    const [method] = await db
      .select()
      .from(actionPlanAnalysisMethodsTable)
      .where(eq(actionPlanAnalysisMethodsTable.organizationId, ctx.orgId));

    const operator = await createTestUser(ctx.orgId, { role: "operator" });
    const res = await fetch(
      `${ctx.baseUrl}/api/organizations/${ctx.orgId}/action-plan-analysis-methods/${method.id}`,
      {
        method: "PATCH",
        headers: { ...authHeader(operator.token), "content-type": "application/json" },
        body: JSON.stringify({ active: false }),
      },
    );
    expect(res.status).toBe(403);
  });

  it("desativar uma tratativa marcada como padrão desmarca o padrão junto", async () => {
    const ctx = await createTestContext();
    await ensureAnalysisMethods(ctx.orgId);
    const [fiveWhys] = await db
      .select()
      .from(actionPlanAnalysisMethodsTable)
      .where(eq(actionPlanAnalysisMethodsTable.key, "five_whys"));

    const res = await fetch(
      `${ctx.baseUrl}/api/organizations/${ctx.orgId}/action-plan-analysis-methods/${fiveWhys.id}`,
      {
        method: "PATCH",
        headers: { ...authHeader(ctx.token), "content-type": "application/json" },
        body: JSON.stringify({ active: false }),
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.active).toBe(false);
    expect(body.isDefault).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test:integration:up && pnpm test:integration:db:push`
Run: `TEST_ENV=integration pnpm exec vitest run tests/api-server/analysis-methods.integration.test.ts --project integration`
Expected: FAIL — módulo inexistente / rota 404.

> **Lembrete:** sem `TEST_ENV=integration` este comando bate no **Neon de produção**.

- [ ] **Step 3: Implementar a semente**

`artifacts/api-server/src/services/action-plans/analysis-methods.ts`:

```ts
import { db, actionPlanAnalysisMethodsTable, type ActionPlanAnalysisMethodKey } from "@workspace/db";

/**
 * As 8 tratativas que o produto conhece. A ESTRUTURA de cada uma vive no código, por isso
 * o catálogo é semeado (não há POST): a empresa liga, desliga, renomeia e reordena.
 *
 * Só `five_whys` nasce como padrão — é exatamente o comportamento de hoje, então nenhuma
 * organização existente vê seu fluxo mudar. As demais a empresa adota quando quiser.
 */
export const DEFAULT_ANALYSIS_METHODS: ReadonlyArray<{
  key: ActionPlanAnalysisMethodKey;
  label: string;
  isDefault: boolean;
}> = [
  { key: "five_whys", label: "5 Porquês", isDefault: true },
  { key: "ishikawa", label: "Ishikawa + 5 Porquês", isDefault: false },
  { key: "a3", label: "A3", isDefault: false },
  { key: "fmea", label: "FMEA", isDefault: false },
  { key: "fault_tree", label: "Árvore de Falhas", isDefault: false },
  { key: "kepner_tregoe", label: "Kepner-Tregoe", isDefault: false },
  { key: "rca_apollo", label: "RCA Apollo", isDefault: false },
  { key: "barrier_analysis", label: "Análise de Barreiras", isDefault: false },
];

/**
 * Garante que a organização tem as 8 linhas. Idempotente por `(organizationId, key)`, e é
 * isso que faz um método NOVO lançado no futuro entrar nas orgs existentes só rodando isto
 * de novo — sem tocar no que a empresa já configurou (label/active/isDefault preservados).
 */
export async function ensureAnalysisMethods(orgId: number): Promise<void> {
  for (let i = 0; i < DEFAULT_ANALYSIS_METHODS.length; i++) {
    const method = DEFAULT_ANALYSIS_METHODS[i];
    await db
      .insert(actionPlanAnalysisMethodsTable)
      .values({
        organizationId: orgId,
        key: method.key,
        label: method.label,
        isDefault: method.isDefault,
        sortOrder: i,
      })
      .onConflictDoNothing();
  }
}
```

- [ ] **Step 4: Implementar as rotas**

`artifacts/api-server/src/routes/action-plan-analysis-methods.ts`:

```ts
import { Router, type IRouter } from "express";
import { and, asc, eq } from "drizzle-orm";
import { db, actionPlanAnalysisMethodsTable } from "@workspace/db";
import {
  ListAnalysisMethodsParams,
  UpdateAnalysisMethodBody,
  UpdateAnalysisMethodParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { ensureAnalysisMethods } from "../services/action-plans/analysis-methods";

const router: IRouter = Router();

function serializeMethod(r: typeof actionPlanAnalysisMethodsTable.$inferSelect) {
  return {
    id: r.id,
    organizationId: r.organizationId,
    key: r.key,
    label: r.label,
    active: r.active,
    isDefault: r.isDefault,
    sortOrder: r.sortOrder,
  };
}

// Leitura liberada a qualquer usuário autenticado da org (o seletor de tratativa da
// ficha precisa dela); escrita restrita a admin — ligar/desligar tratativa é decisão
// do SGI, não do operador do dia a dia.

router.get(
  "/organizations/:orgId/action-plan-analysis-methods",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListAnalysisMethodsParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    // Semeia preguiçosamente: uma org que ainda não passou pelo backfill (ou nasceu antes
    // desta feature) jamais pode ver o catálogo vazio.
    await ensureAnalysisMethods(params.data.orgId);

    // Devolve ativas E inativas: o front filtra ativas nos seletores, mas a ficha de um
    // plano que já usa uma tratativa desativada precisa continuar exibindo o rótulo dela.
    const rows = await db
      .select()
      .from(actionPlanAnalysisMethodsTable)
      .where(eq(actionPlanAnalysisMethodsTable.organizationId, params.data.orgId))
      .orderBy(asc(actionPlanAnalysisMethodsTable.sortOrder));

    res.json(rows.map(serializeMethod));
  },
);

router.patch(
  "/organizations/:orgId/action-plan-analysis-methods/:methodId",
  requireAuth,
  requireRole("org_admin"),
  async (req, res): Promise<void> => {
    const params = UpdateAnalysisMethodParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const body = UpdateAnalysisMethodBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const [current] = await db
      .select()
      .from(actionPlanAnalysisMethodsTable)
      .where(and(
        eq(actionPlanAnalysisMethodsTable.id, params.data.methodId),
        eq(actionPlanAnalysisMethodsTable.organizationId, params.data.orgId),
      ));
    if (!current) { res.status(404).json({ error: "Tratativa não encontrada" }); return; }

    const update: Record<string, unknown> = {};

    if (body.data.label !== undefined) {
      const label = body.data.label.trim();
      if (!label) { res.status(400).json({ error: "Informe o rótulo da tratativa" }); return; }
      update.label = label;
    }
    if (body.data.isDefault !== undefined) update.isDefault = body.data.isDefault;
    if (body.data.sortOrder !== undefined) update.sortOrder = body.data.sortOrder;
    if (body.data.active !== undefined) {
      update.active = body.data.active;
      // Uma tratativa desativada não pode continuar sendo pré-marcada na criação do plano
      // — seria oferecer o que o catálogo diz que a empresa não usa.
      if (body.data.active === false) update.isDefault = false;
    }

    const [row] = await db
      .update(actionPlanAnalysisMethodsTable)
      .set(Object.keys(update).length > 0 ? update : { updatedAt: new Date() })
      .where(and(
        eq(actionPlanAnalysisMethodsTable.id, params.data.methodId),
        eq(actionPlanAnalysisMethodsTable.organizationId, params.data.orgId),
      ))
      .returning();

    res.json(serializeMethod(row));
  },
);

export default router;
```

- [ ] **Step 5: Registrar o router e a semente no registro da org**

Em `artifacts/api-server/src/routes/index.ts`, junto do import de `regulatoryNormsRouter` (linha ~41):

```ts
import actionPlanAnalysisMethodsRouter from "./action-plan-analysis-methods";
```

e junto do `router.use(...)` de `regulatoryNormsRouter` (linha ~249):

```ts
router.use(requireAuth, requireCompletedOnboarding, actionPlanAnalysisMethodsRouter);
```

Em `artifacts/api-server/src/routes/auth.ts`, na linha ~129 (logo depois do insert em `organizations`, onde já se chama `ensureDefaultNorms`), acrescentar:

```ts
  await ensureAnalysisMethods(organization.id);
```

e o import correspondente no topo:

```ts
import { ensureAnalysisMethods } from "../services/action-plans/analysis-methods";
```

- [ ] **Step 6: Rodar e ver passar**

Run: `TEST_ENV=integration pnpm exec vitest run tests/api-server/analysis-methods.integration.test.ts --project integration`
Expected: PASS (5 testes)

Run: `pnpm typecheck` (erros remanescentes em `routes/action-plans.ts` e `[id].tsx` continuam esperados)

- [ ] **Step 7: Commit**

```bash
git add artifacts/api-server/src/services/action-plans/analysis-methods.ts artifacts/api-server/src/routes/action-plan-analysis-methods.ts artifacts/api-server/src/routes/index.ts artifacts/api-server/src/routes/auth.ts tests/api-server/analysis-methods.integration.test.ts
git commit -m "feat(api): catálogo de tratativas por organização (semente + GET/PATCH admin)"
```

---

### Task 7: Extrair `requirePlanAccess` para middleware compartilhado

Preparação para a Task 9 — as rotas de ação precisam da mesma guarda que as rotas do plano, e ela hoje é uma função local de `routes/action-plans.ts`.

**Files:**
- Create: `artifacts/api-server/src/middlewares/plan-access.ts`
- Modify: `artifacts/api-server/src/routes/action-plans.ts` (remove a função local, importa)

**Interfaces:**
- Produces: `requirePlanAccess()` — mesma assinatura e mesmo comportamento de hoje

- [ ] **Step 1: Mover a função**

Recortar o corpo de `requirePlanAccess()` (hoje em `routes/action-plans.ts:126`) para `artifacts/api-server/src/middlewares/plan-access.ts`, **sem alterar comportamento**, exportando-a:

```ts
// artifacts/api-server/src/middlewares/plan-access.ts
// Extraída de routes/action-plans.ts: as rotas das AÇÕES do plano (action-plan-actions.ts)
// precisam da mesma guarda de acesso ao plano de origem.
```

Copiar o corpo exato da função original (incluindo os comentários) e os imports de que ela depende.

- [ ] **Step 2: Importar em `routes/action-plans.ts`**

Remover a definição local e acrescentar:

```ts
import { requirePlanAccess } from "../middlewares/plan-access";
```

- [ ] **Step 3: Verificar que nada mudou**

Run: `TEST_ENV=integration pnpm exec vitest run --project integration -t "action-plan"`
Expected: os testes de integração já existentes do plano seguem passando (nenhuma mudança de comportamento).

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src/middlewares/plan-access.ts artifacts/api-server/src/routes/action-plans.ts
git commit -m "refactor(api): extrai requirePlanAccess para middleware compartilhado"
```

---

### Task 8: Plano aceita `analyses` (POST/PATCH) e para de usar 5W2H/whys

Esta task **fecha** os erros de typecheck deixados pelas Tasks 4 e 5 no servidor.

**Files:**
- Modify: `artifacts/api-server/src/routes/action-plans.ts`
- Modify: `artifacts/api-server/src/services/action-plans/serializers.ts`
- Modify: `artifacts/api-server/src/services/action-plans/ai-draft.ts` (só o tipo de retorno, se necessário)
- Test: `tests/api-server/action-plans-analyses.integration.test.ts`

**Interfaces:**
- Consumes: `parseAnalyses`, `normalizeAnalyses` (Task 3); `PlanningBlock` (Task 4)

- [ ] **Step 1: Escrever o teste de integração que falha**

`tests/api-server/action-plans-analyses.integration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { authHeader, createTestContext } from "../support/backend";

async function createPlan(ctx: Awaited<ReturnType<typeof createTestContext>>, body: object) {
  const res = await fetch(`${ctx.baseUrl}/api/organizations/${ctx.orgId}/action-plans`, {
    method: "POST",
    headers: { ...authHeader(ctx.token), "content-type": "application/json" },
    body: JSON.stringify({
      sourceModule: "manual",
      sourceRef: {},
      title: "Plano de teste",
      ...body,
    }),
  });
  return { res, body: await res.json() };
}

describe("tratativas no plano", () => {
  it("POST persiste as tratativas", async () => {
    const ctx = await createTestContext();
    const { res, body } = await createPlan(ctx, {
      analyses: [{ key: "ishikawa", data: { causes: [], whys: ["porque sim"] } }],
    });
    expect(res.status).toBe(201);
    expect(body.analyses).toEqual([
      { key: "ishikawa", data: { causes: [], whys: ["porque sim"] } },
    ]);
  });

  it("POST rejeita tratativa duplicada", async () => {
    const ctx = await createTestContext();
    const { res } = await createPlan(ctx, {
      analyses: [
        { key: "a3", data: {} },
        { key: "a3", data: {} },
      ],
    });
    expect(res.status).toBe(400);
  });

  it("PATCH parcial NÃO apaga a tratativa que não foi enviada", async () => {
    const ctx = await createTestContext();
    const { body: plan } = await createPlan(ctx, {
      analyses: [{ key: "fmea", data: { rows: [{ id: "r1", failureMode: "Falha" }] } }],
    });

    const res = await fetch(
      `${ctx.baseUrl}/api/organizations/${ctx.orgId}/action-plans/${plan.id}`,
      {
        method: "PATCH",
        headers: { ...authHeader(ctx.token), "content-type": "application/json" },
        body: JSON.stringify({ title: "Outro título" }),
      },
    );
    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated.analyses).toHaveLength(1);
    expect(updated.analyses[0].key).toBe("fmea");
  });

  it("aceita tratativa cuja chave está INATIVA no catálogo (plano antigo tem de continuar salvável)", async () => {
    const ctx = await createTestContext();
    // desativa `a3` no catálogo
    const listRes = await fetch(
      `${ctx.baseUrl}/api/organizations/${ctx.orgId}/action-plan-analysis-methods`,
      { headers: authHeader(ctx.token) },
    );
    const methods = await listRes.json();
    const a3 = methods.find((m: { key: string }) => m.key === "a3");
    await fetch(
      `${ctx.baseUrl}/api/organizations/${ctx.orgId}/action-plan-analysis-methods/${a3.id}`,
      {
        method: "PATCH",
        headers: { ...authHeader(ctx.token), "content-type": "application/json" },
        body: JSON.stringify({ active: false }),
      },
    );

    const { res } = await createPlan(ctx, {
      analyses: [{ key: "a3", data: { goal: "meta" } }],
    });
    expect(res.status).toBe(201);
  });

  it("o activity log grava a versão do planejamento com as tratativas", async () => {
    const ctx = await createTestContext();
    const { body: plan } = await createPlan(ctx, {
      analyses: [{ key: "five_whys", data: { whys: ["a"] } }],
    });

    const res = await fetch(
      `${ctx.baseUrl}/api/organizations/${ctx.orgId}/action-plans/${plan.id}/activity`,
      { headers: authHeader(ctx.token) },
    );
    const entries = await res.json();
    const planning = entries.find(
      (e: { changes?: { fields?: { planning?: unknown } } }) => e.changes?.fields?.planning,
    );
    expect(planning.changes.fields.planning.to.analyses).toEqual([
      { key: "five_whys", data: { whys: ["a"] } },
    ]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `TEST_ENV=integration pnpm exec vitest run tests/api-server/action-plans-analyses.integration.test.ts --project integration`
Expected: FAIL

- [ ] **Step 3: Ajustar o POST**

Em `routes/action-plans.ts`, no bloco de `db.insert(actionPlansTable).values({...})` (linhas 408-410), substituir:

```ts
    plan5w2h: body.data.plan5w2h ?? null,
    rootCause: body.data.rootCause ?? derived.rootCause ?? null,
    rootCauseWhys: body.data.rootCauseWhys ?? null,
```

por:

```ts
    rootCause: body.data.rootCause ?? derived.rootCause ?? null,
    analyses: normalizedAnalyses,
```

e, **antes** do insert (logo depois da validação de independência avaliador/responsável, linha ~388), acrescentar:

```ts
  // As tratativas chegam validadas pelo zod do OpenAPI, mas a forma de `data` por chave e a
  // unicidade da chave são regra nossa — reforçadas aqui, independentemente de como o Orval
  // resolveu a união discriminada.
  let normalizedAnalyses: ActionPlanAnalysis[] | null = null;
  if (body.data.analyses != null) {
    const parsed = parseAnalyses(body.data.analyses);
    if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
    const list = normalizeAnalyses(parsed.value);
    normalizedAnalyses = list.length ? list : null;
  }
```

Ajustar o bloco do planejamento inicial (linhas 442-443):

```ts
  const emptyPlanning: PlanningBlock = { rootCause: null, analyses: null };
```

Imports novos no topo de `routes/action-plans.ts`:

```ts
import { normalizeAnalyses, parseAnalyses } from "../services/action-plans/analyses";
import type { ActionPlanAnalysis } from "@workspace/db";
```

- [ ] **Step 4: Ajustar o PATCH**

Em `routes/action-plans.ts`, substituir o bloco de normalização do planejamento (linhas 532-547) por:

```ts
  // Normaliza o bloco de análise NA ESCRITA, para que o banco guarde a forma canônica e
  // valha a invariante "toda mudança persistida é logada": `planningChanged` e o activity
  // log comparam blocos NORMALIZADOS, então persistir um valor cru poderia gravar uma
  // edição só-de-espaços que entrada nenhuma registra. Faz o merge do que veio sobre a
  // linha atual, normaliza, e grava só os campos que o chamador realmente enviou (um PATCH
  // que omite um campo não pode passar a persisti-lo).
  if (body.data.analyses !== undefined) {
    if (body.data.analyses === null) {
      update.analyses = null;
    } else {
      const parsed = parseAnalyses(body.data.analyses);
      if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
      const list = normalizeAnalyses(parsed.value);
      update.analyses = list.length ? list : null;
    }
  }
  if (body.data.rootCause !== undefined || body.data.analyses !== undefined) {
    const normalized = normalizePlanning(
      extractPlanning({
        rootCause: body.data.rootCause !== undefined ? body.data.rootCause : existing.rootCause,
        analyses:
          body.data.analyses !== undefined
            ? (update.analyses as ActionPlanAnalysis[] | null)
            : existing.analyses,
      }),
    );
    if (body.data.rootCause !== undefined) update.rootCause = normalized.rootCause;
  }
```

- [ ] **Step 5: Ajustar o serializer**

Em `services/action-plans/serializers.ts`, em `serializePlan` (linhas 82-84), substituir:

```ts
    plan5w2h: p.plan5w2h ?? null,
    rootCause: p.rootCause ?? null,
    rootCauseWhys: p.rootCauseWhys ?? null,
```

por:

```ts
    rootCause: p.rootCause ?? null,
    analyses: p.analyses ?? null,
```

- [ ] **Step 6: Rodar e ver passar**

Run: `TEST_ENV=integration pnpm exec vitest run tests/api-server/action-plans-analyses.integration.test.ts --project integration`
Expected: PASS (5 testes)

Run: `pnpm typecheck`
Expected: erros SOMENTE no front (`[id].tsx`, `plano-5w2h.tsx`, `causa-raiz.tsx`) — resolvidos nas Tasks 15/16. O servidor deve estar limpo.

- [ ] **Step 7: Commit**

```bash
git add artifacts/api-server/src/routes/action-plans.ts artifacts/api-server/src/services/action-plans/serializers.ts tests/api-server/action-plans-analyses.integration.test.ts
git commit -m "feat(api): plano de ação persiste e versiona as tratativas"
```

---

### Task 9: CRUD das ações do plano

**Files:**
- Create: `artifacts/api-server/src/routes/action-plan-actions.ts`
- Modify: `artifacts/api-server/src/services/action-plans/serializers.ts` (novo `serializeAction`)
- Modify: `artifacts/api-server/src/routes/index.ts`
- Test: `tests/api-server/action-plan-actions.integration.test.ts`

**Interfaces:**
- Consumes: `requirePlanAccess` (Task 7), `actionPlanActionsTable` (Task 2), `notifyActionPlanAssignment` (existente)
- Produces: `serializeAction(a, responsibleUserName)`

- [ ] **Step 1: Escrever o teste de integração que falha**

`tests/api-server/action-plan-actions.integration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { authHeader, createTestContext, createTestUser } from "../support/backend";

async function newPlan(ctx: Awaited<ReturnType<typeof createTestContext>>) {
  const res = await fetch(`${ctx.baseUrl}/api/organizations/${ctx.orgId}/action-plans`, {
    method: "POST",
    headers: { ...authHeader(ctx.token), "content-type": "application/json" },
    body: JSON.stringify({ sourceModule: "manual", sourceRef: {}, title: "Plano" }),
  });
  return res.json();
}

function actionsUrl(ctx: { baseUrl: string; orgId: number }, planId: number, actionId?: number) {
  const base = `${ctx.baseUrl}/api/organizations/${ctx.orgId}/action-plans/${planId}/actions`;
  return actionId ? `${base}/${actionId}` : base;
}

describe("ações do plano", () => {
  it("cria uma ação vazia (a linha nasce em branco no `+ Incluir ação`)", async () => {
    const ctx = await createTestContext();
    const plan = await newPlan(ctx);
    const res = await fetch(actionsUrl(ctx, plan.id), {
      method: "POST",
      headers: { ...authHeader(ctx.token), "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(201);
    const action = await res.json();
    expect(action.status).toBe("open");
    expect(action.what).toBeNull();
  });

  it("PATCH grava completedAt ao concluir e o limpa ao reabrir", async () => {
    const ctx = await createTestContext();
    const plan = await newPlan(ctx);
    const created = await (
      await fetch(actionsUrl(ctx, plan.id), {
        method: "POST",
        headers: { ...authHeader(ctx.token), "content-type": "application/json" },
        body: JSON.stringify({ what: "Treinar motoristas" }),
      })
    ).json();

    const done = await (
      await fetch(actionsUrl(ctx, plan.id, created.id), {
        method: "PATCH",
        headers: { ...authHeader(ctx.token), "content-type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      })
    ).json();
    expect(done.completedAt).not.toBeNull();

    const reopened = await (
      await fetch(actionsUrl(ctx, plan.id, created.id), {
        method: "PATCH",
        headers: { ...authHeader(ctx.token), "content-type": "application/json" },
        body: JSON.stringify({ status: "in_progress" }),
      })
    ).json();
    expect(reopened.completedAt).toBeNull();
  });

  it("concluir uma ação SEM `what` é 400 — ação sem enunciado não pode ser dada como feita", async () => {
    const ctx = await createTestContext();
    const plan = await newPlan(ctx);
    const created = await (
      await fetch(actionsUrl(ctx, plan.id), {
        method: "POST",
        headers: { ...authHeader(ctx.token), "content-type": "application/json" },
        body: JSON.stringify({}),
      })
    ).json();

    const res = await fetch(actionsUrl(ctx, plan.id, created.id), {
      method: "PATCH",
      headers: { ...authHeader(ctx.token), "content-type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejeita responsável de outra organização", async () => {
    const ctx = await createTestContext();
    const other = await createTestContext();
    const plan = await newPlan(ctx);
    const res = await fetch(actionsUrl(ctx, plan.id), {
      method: "POST",
      headers: { ...authHeader(ctx.token), "content-type": "application/json" },
      body: JSON.stringify({ what: "x", responsibleUserId: other.userId }),
    });
    expect(res.status).toBe(400);
  });

  it("o plano expõe actionsTotal / actionsDone", async () => {
    const ctx = await createTestContext();
    const plan = await newPlan(ctx);
    for (const what of ["A", "B"]) {
      await fetch(actionsUrl(ctx, plan.id), {
        method: "POST",
        headers: { ...authHeader(ctx.token), "content-type": "application/json" },
        body: JSON.stringify({ what }),
      });
    }
    const list = await (await fetch(actionsUrl(ctx, plan.id), { headers: authHeader(ctx.token) })).json();
    await fetch(actionsUrl(ctx, plan.id, list[0].id), {
      method: "PATCH",
      headers: { ...authHeader(ctx.token), "content-type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });

    const reloaded = await (
      await fetch(`${ctx.baseUrl}/api/organizations/${ctx.orgId}/action-plans/${plan.id}`, {
        headers: authHeader(ctx.token),
      })
    ).json();
    expect(reloaded.actionsTotal).toBe(2);
    expect(reloaded.actionsDone).toBe(1);
  });

  it("plano encerrado devolve 409 ao criar ação", async () => {
    const ctx = await createTestContext();
    const plan = await newPlan(ctx);
    // encerra: completed + veredito de eficácia
    await fetch(`${ctx.baseUrl}/api/organizations/${ctx.orgId}/action-plans/${plan.id}`, {
      method: "PATCH",
      headers: { ...authHeader(ctx.token), "content-type": "application/json" },
      body: JSON.stringify({ status: "completed", effectivenessResult: "effective" }),
    });

    const res = await fetch(actionsUrl(ctx, plan.id), {
      method: "POST",
      headers: { ...authHeader(ctx.token), "content-type": "application/json" },
      body: JSON.stringify({ what: "tarde demais" }),
    });
    expect(res.status).toBe(409);
  });

  it("DELETE remove e o activity log guarda o `what`", async () => {
    const ctx = await createTestContext();
    const plan = await newPlan(ctx);
    const created = await (
      await fetch(actionsUrl(ctx, plan.id), {
        method: "POST",
        headers: { ...authHeader(ctx.token), "content-type": "application/json" },
        body: JSON.stringify({ what: "Bloquear no sistema" }),
      })
    ).json();

    const del = await fetch(actionsUrl(ctx, plan.id, created.id), {
      method: "DELETE",
      headers: authHeader(ctx.token),
    });
    expect(del.status).toBe(204);

    const entries = await (
      await fetch(`${ctx.baseUrl}/api/organizations/${ctx.orgId}/action-plans/${plan.id}/activity`, {
        headers: authHeader(ctx.token),
      })
    ).json();
    const removed = entries.find((e: { action: string }) => e.action === "action_removed");
    expect(removed.changes.what).toBe("Bloquear no sistema");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `TEST_ENV=integration pnpm exec vitest run tests/api-server/action-plan-actions.integration.test.ts --project integration`
Expected: FAIL — 404 nas rotas.

- [ ] **Step 3: Serializer da ação**

Acrescentar em `services/action-plans/serializers.ts`:

```ts
export function serializeAction(
  a: DbActionPlanAction,
  responsibleUserName: string | null = null,
) {
  return {
    id: a.id,
    actionPlanId: a.actionPlanId,
    what: a.what ?? null,
    why: a.why ?? null,
    whereAt: a.whereAt ?? null,
    how: a.how ?? null,
    howMuch: a.howMuch ?? null,
    responsibleUserId: a.responsibleUserId ?? null,
    responsibleUserName,
    dueDate: a.dueDate ? a.dueDate.toISOString() : null,
    status: a.status,
    completedAt: a.completedAt ? a.completedAt.toISOString() : null,
    notes: a.notes ?? null,
    sortOrder: a.sortOrder,
    createdAt: a.createdAt.toISOString(),
  };
}
```

com o import de tipo no topo:

```ts
  type ActionPlanAction as DbActionPlanAction,
```

- [ ] **Step 4: Agregados no plano**

Em `services/action-plans/serializers.ts`, acrescentar `actionsTotal`/`actionsDone` ao `extras` de `serializePlan` e ao objeto retornado:

```ts
  extras: {
    responsibleUserName: string | null;
    createdByUserName: string | null;
    effectivenessEvaluatorUserName: string | null;
    evidences: ReturnType<typeof serializeEvidence>[];
    actionsTotal: number;
    actionsDone: number;
  },
```

```ts
    actionsTotal: extras.actionsTotal,
    actionsDone: extras.actionsDone,
```

Em `routes/action-plans.ts`, em `loadAndSerializePlan`, contar as ações do plano:

```ts
  const actionRows = await db
    .select({ status: actionPlanActionsTable.status })
    .from(actionPlanActionsTable)
    .where(eq(actionPlanActionsTable.actionPlanId, planId));
  const actionsTotal = actionRows.length;
  const actionsDone = actionRows.filter((a) => a.status === "completed").length;
```

e passá-los em `extras`. Na listagem (`GET .../action-plans`, ~linha 223), acrescentar os mesmos agregados ao item da lista com um `GROUP BY action_plan_id` — um único `select` agrupado, **não** uma consulta por plano (N+1):

```ts
  const counts = await db
    .select({
      actionPlanId: actionPlanActionsTable.actionPlanId,
      total: sql<number>`count(*)::int`,
      done: sql<number>`count(*) filter (where ${actionPlanActionsTable.status} = 'completed')::int`,
    })
    .from(actionPlanActionsTable)
    .where(eq(actionPlanActionsTable.organizationId, orgId))
    .groupBy(actionPlanActionsTable.actionPlanId);
  const countByPlan = new Map(counts.map((c) => [c.actionPlanId, c]));
```

e no map do item: `actionsTotal: countByPlan.get(p.id)?.total ?? 0, actionsDone: countByPlan.get(p.id)?.done ?? 0,`

- [ ] **Step 5: Implementar as rotas das ações**

`artifacts/api-server/src/routes/action-plan-actions.ts`:

```ts
import { Router, type IRouter } from "express";
import { and, asc, eq, max } from "drizzle-orm";
import {
  db,
  actionPlanActionsTable,
  actionPlansTable,
  isActionPlanEncerrado,
} from "@workspace/db";
import {
  CreateActionPlanActionBody,
  CreateActionPlanActionParams,
  DeleteActionPlanActionParams,
  ListActionPlanActionsParams,
  UpdateActionPlanActionBody,
  UpdateActionPlanActionParams,
} from "@workspace/api-zod";
import { requireAuth, requireWriteAccess } from "../middlewares/auth";
import { requirePlanAccess } from "../middlewares/plan-access";
import { logActionPlanActivity } from "../services/action-plans/activity";
import { notifyActionPlanActionAssignment } from "../services/action-plans/notify-assignment";
import {
  assertUserBelongsToOrg,
  resolveUserNames,
  serializeAction,
} from "../services/action-plans/serializers";
import { currentUserName } from "../services/action-plans/activity";

const router: IRouter = Router();

/** Carrega o plano e recusa a edição se ele estiver encerrado. */
async function loadEditablePlan(orgId: number, planId: number) {
  const [plan] = await db
    .select()
    .from(actionPlansTable)
    .where(and(eq(actionPlansTable.id, planId), eq(actionPlansTable.organizationId, orgId)));
  if (!plan) return { error: { status: 404, message: "Plano não encontrado" } } as const;
  if (isActionPlanEncerrado(plan)) {
    return {
      error: {
        status: 409,
        message: "Plano encerrado. Reabra o plano (ato de administrador SGI) para editá-lo.",
      },
    } as const;
  }
  return { plan } as const;
}

router.get(
  "/organizations/:orgId/action-plans/:planId/actions",
  requireAuth,
  requirePlanAccess(),
  async (req, res): Promise<void> => {
    const params = ListActionPlanActionsParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const rows = await db
      .select()
      .from(actionPlanActionsTable)
      .where(and(
        eq(actionPlanActionsTable.actionPlanId, params.data.planId),
        eq(actionPlanActionsTable.organizationId, params.data.orgId),
      ))
      .orderBy(asc(actionPlanActionsTable.sortOrder), asc(actionPlanActionsTable.id));

    const names = await resolveUserNames(rows.map((r) => r.responsibleUserId));
    res.json(rows.map((r) => serializeAction(r, r.responsibleUserId ? names.get(r.responsibleUserId) ?? null : null)));
  },
);

router.post(
  "/organizations/:orgId/action-plans/:planId/actions",
  requireAuth,
  requirePlanAccess(),
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = CreateActionPlanActionParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const body = CreateActionPlanActionBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const loaded = await loadEditablePlan(params.data.orgId, params.data.planId);
    if ("error" in loaded) { res.status(loaded.error.status).json({ error: loaded.error.message }); return; }

    if (body.data.responsibleUserId != null) {
      const ok = await assertUserBelongsToOrg(body.data.responsibleUserId, params.data.orgId);
      if (!ok) { res.status(400).json({ error: "responsibleUserId não corresponde a um usuário desta organização" }); return; }
    }

    const [{ value: currentMax } = { value: null }] = await db
      .select({ value: max(actionPlanActionsTable.sortOrder) })
      .from(actionPlanActionsTable)
      .where(eq(actionPlanActionsTable.actionPlanId, params.data.planId));

    const [row] = await db
      .insert(actionPlanActionsTable)
      .values({
        organizationId: params.data.orgId,
        actionPlanId: params.data.planId,
        what: body.data.what ?? null,
        why: body.data.why ?? null,
        whereAt: body.data.whereAt ?? null,
        how: body.data.how ?? null,
        howMuch: body.data.howMuch ?? null,
        responsibleUserId: body.data.responsibleUserId ?? null,
        dueDate: body.data.dueDate ? new Date(body.data.dueDate) : null,
        status: body.data.status ?? "open",
        notes: body.data.notes ?? null,
        sortOrder: (currentMax ?? -1) + 1,
        createdByUserId: req.auth!.userId,
      })
      .returning();

    const userName = await currentUserName(req.auth!.userId);
    await logActionPlanActivity({
      orgId: params.data.orgId,
      actionPlanId: params.data.planId,
      action: "action_added",
      userId: req.auth!.userId,
      userName,
      changes: { kind: "action", actionId: row.id, what: row.what ?? "(sem enunciado)" },
    });

    await notifyActionPlanActionAssignment(loaded.plan, row, req.auth!.userId);

    const names = await resolveUserNames([row.responsibleUserId]);
    res.status(201).json(
      serializeAction(row, row.responsibleUserId ? names.get(row.responsibleUserId) ?? null : null),
    );
  },
);

router.patch(
  "/organizations/:orgId/action-plans/:planId/actions/:actionId",
  requireAuth,
  requirePlanAccess(),
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = UpdateActionPlanActionParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const body = UpdateActionPlanActionBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const loaded = await loadEditablePlan(params.data.orgId, params.data.planId);
    if ("error" in loaded) { res.status(loaded.error.status).json({ error: loaded.error.message }); return; }

    const [existing] = await db
      .select()
      .from(actionPlanActionsTable)
      .where(and(
        eq(actionPlanActionsTable.id, params.data.actionId),
        eq(actionPlanActionsTable.actionPlanId, params.data.planId),
        eq(actionPlanActionsTable.organizationId, params.data.orgId),
      ));
    if (!existing) { res.status(404).json({ error: "Ação não encontrada" }); return; }

    if (body.data.responsibleUserId != null) {
      const ok = await assertUserBelongsToOrg(body.data.responsibleUserId, params.data.orgId);
      if (!ok) { res.status(400).json({ error: "responsibleUserId não corresponde a um usuário desta organização" }); return; }
    }

    const update: Record<string, unknown> = {};
    for (const field of ["what", "why", "whereAt", "how", "howMuch", "notes"] as const) {
      if (body.data[field] !== undefined) {
        const value = body.data[field];
        update[field] = typeof value === "string" ? value.trim() || null : null;
      }
    }
    if (body.data.responsibleUserId !== undefined) update.responsibleUserId = body.data.responsibleUserId;
    if (body.data.dueDate !== undefined) update.dueDate = body.data.dueDate ? new Date(body.data.dueDate) : null;
    if (body.data.sortOrder !== undefined) update.sortOrder = body.data.sortOrder;

    if (body.data.status !== undefined && body.data.status !== existing.status) {
      // Uma ação sem enunciado não pode ser dada como feita — o registro ficaria sem sentido
      // para o auditor ("concluída: (vazio)").
      const what = body.data.what !== undefined ? body.data.what : existing.what;
      if (body.data.status === "completed" && !what?.trim()) {
        res.status(400).json({ error: "Descreva o que será feito (campo \"O quê\") antes de concluir a ação." });
        return;
      }
      update.status = body.data.status;
      update.completedAt = body.data.status === "completed" ? new Date() : null;
    }

    const [row] = await db
      .update(actionPlanActionsTable)
      .set(Object.keys(update).length > 0 ? update : { updatedAt: new Date() })
      .where(eq(actionPlanActionsTable.id, params.data.actionId))
      .returning();

    // Log só do que mudou de fato — um autosave que reenvia o mesmo valor não vira entrada.
    const fields: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of Object.keys(update)) {
      const before = (existing as Record<string, unknown>)[key];
      const after = (row as Record<string, unknown>)[key];
      if (JSON.stringify(before ?? null) !== JSON.stringify(after ?? null)) {
        fields[key] = { from: before ?? null, to: after ?? null };
      }
    }
    if (Object.keys(fields).length > 0) {
      const userName = await currentUserName(req.auth!.userId);
      await logActionPlanActivity({
        orgId: params.data.orgId,
        actionPlanId: params.data.planId,
        action: "action_updated",
        userId: req.auth!.userId,
        userName,
        changes: { kind: "action", actionId: row.id, what: row.what ?? "(sem enunciado)", fields },
      });
    }

    if (row.responsibleUserId !== existing.responsibleUserId) {
      await notifyActionPlanActionAssignment(loaded.plan, row, req.auth!.userId);
    }

    const names = await resolveUserNames([row.responsibleUserId]);
    res.json(serializeAction(row, row.responsibleUserId ? names.get(row.responsibleUserId) ?? null : null));
  },
);

router.delete(
  "/organizations/:orgId/action-plans/:planId/actions/:actionId",
  requireAuth,
  requirePlanAccess(),
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = DeleteActionPlanActionParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const loaded = await loadEditablePlan(params.data.orgId, params.data.planId);
    if ("error" in loaded) { res.status(loaded.error.status).json({ error: loaded.error.message }); return; }

    const [removed] = await db
      .delete(actionPlanActionsTable)
      .where(and(
        eq(actionPlanActionsTable.id, params.data.actionId),
        eq(actionPlanActionsTable.actionPlanId, params.data.planId),
        eq(actionPlanActionsTable.organizationId, params.data.orgId),
      ))
      .returning();
    if (!removed) { res.status(404).json({ error: "Ação não encontrada" }); return; }

    // O `what` vai snapshotado: a linha deixou de existir, mas o auditor vai perguntar
    // qual ação foi removida (mesma razão do `userName` no log).
    const userName = await currentUserName(req.auth!.userId);
    await logActionPlanActivity({
      orgId: params.data.orgId,
      actionPlanId: params.data.planId,
      action: "action_removed",
      userId: req.auth!.userId,
      userName,
      changes: { kind: "action", actionId: removed.id, what: removed.what ?? "(sem enunciado)" },
    });

    res.status(204).end();
  },
);

export default router;
```

> Se `logActionPlanActivity` / `currentUserName` não estiverem em `services/action-plans/activity.ts`, localize-os com `grep -rn "export async function logActionPlanActivity\|export async function currentUserName" artifacts/api-server/src` e ajuste o import.

- [ ] **Step 6: Notificação de atribuição de ação**

Em `services/action-plans/notify-assignment.ts`, acrescentar (reusando o transporte de e-mail já existente no arquivo — copiar o padrão de `notifyActionPlanAssignment`):

```ts
/** Avisa o responsável de que uma AÇÃO do plano ficou sob sua responsabilidade.
 *  Pula quando não há responsável ou quando a pessoa atribuiu a si mesma. */
export async function notifyActionPlanActionAssignment(
  plan: ActionPlanNotifyTarget,
  action: { id: number; what: string | null; responsibleUserId: number | null; dueDate: Date | null },
  actorUserId: number,
): Promise<void> {
  if (action.responsibleUserId == null) return;
  if (action.responsibleUserId === actorUserId) return;
  // ... mesmo corpo de notifyActionPlanAssignment: resolve o e-mail do usuário e envia,
  // com assunto "Nova ação sob sua responsabilidade" e link para
  // `/planos-acao/${plan.id}#acao-${action.id}`.
}
```

- [ ] **Step 7: Registrar o router**

Em `routes/index.ts`, junto do `actionPlansRouter`:

```ts
import actionPlanActionsRouter from "./action-plan-actions";
// ...
router.use(requireAuth, requireCompletedOnboarding, actionPlanActionsRouter);
```

- [ ] **Step 8: Rodar e ver passar**

Run: `TEST_ENV=integration pnpm exec vitest run tests/api-server/action-plan-actions.integration.test.ts --project integration`
Expected: PASS (7 testes)

Run: `pnpm typecheck`

- [ ] **Step 9: Commit**

```bash
git add artifacts/api-server/src/routes/action-plan-actions.ts artifacts/api-server/src/routes/index.ts artifacts/api-server/src/routes/action-plans.ts artifacts/api-server/src/services/action-plans/serializers.ts artifacts/api-server/src/services/action-plans/notify-assignment.ts tests/api-server/action-plan-actions.integration.test.ts
git commit -m "feat(api): CRUD das ações do plano, com responsável, prazo, status e agregados"
```

---

### Task 10: Ações em "Suas Pendências"

**Files:**
- Create: `artifacts/api-server/src/services/pendencias/providers/action-plan-actions.ts`
- Modify: `artifacts/api-server/src/services/pendencias/types.ts`
- Modify: `artifacts/api-server/src/services/pendencias/registry.ts`
- Test: `tests/api-server/pendencias-action-plan-actions.integration.test.ts`

**Interfaces:**
- Consumes: `PendenciaProvider`, `classifyUrgency`, `dayBounds` (existentes)
- Produces: `actionPlanActionPendenciaProvider`

- [ ] **Step 1: Escrever o teste que falha**

`tests/api-server/pendencias-action-plan-actions.integration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { authHeader, createTestContext, createTestUser } from "../support/backend";

describe("pendências das ações do plano", () => {
  it("a ação aparece para o responsável DELA, e o plano continua aparecendo para o responsável do plano", async () => {
    const ctx = await createTestContext();          // ctx.userId = responsável do plano
    const executor = await createTestUser(ctx.orgId, { role: "operator" });

    const plan = await (
      await fetch(`${ctx.baseUrl}/api/organizations/${ctx.orgId}/action-plans`, {
        method: "POST",
        headers: { ...authHeader(ctx.token), "content-type": "application/json" },
        body: JSON.stringify({
          sourceModule: "manual",
          sourceRef: {},
          title: "Plano com ações",
          responsibleUserId: ctx.userId,
        }),
      })
    ).json();

    await fetch(`${ctx.baseUrl}/api/organizations/${ctx.orgId}/action-plans/${plan.id}/actions`, {
      method: "POST",
      headers: { ...authHeader(ctx.token), "content-type": "application/json" },
      body: JSON.stringify({ what: "Treinar motoristas", responsibleUserId: executor.userId }),
    });

    // O executor vê a AÇÃO dele.
    const suas = await (
      await fetch(`${ctx.baseUrl}/api/organizations/${ctx.orgId}/pendencias`, {
        headers: authHeader(executor.token),
      })
    ).json();
    const sources = (suas.items ?? suas).map((p: { source: string }) => p.source);
    expect(sources).toContain("action_plan_action");

    // O responsável do plano continua vendo o PLANO.
    const doGestor = await (
      await fetch(`${ctx.baseUrl}/api/organizations/${ctx.orgId}/pendencias`, {
        headers: authHeader(ctx.token),
      })
    ).json();
    const sourcesGestor = (doGestor.items ?? doGestor).map((p: { source: string }) => p.source);
    expect(sourcesGestor).toContain("action_plan");
  });

  it("ação concluída sai das pendências", async () => {
    const ctx = await createTestContext();
    const plan = await (
      await fetch(`${ctx.baseUrl}/api/organizations/${ctx.orgId}/action-plans`, {
        method: "POST",
        headers: { ...authHeader(ctx.token), "content-type": "application/json" },
        body: JSON.stringify({ sourceModule: "manual", sourceRef: {}, title: "P" }),
      })
    ).json();
    const action = await (
      await fetch(`${ctx.baseUrl}/api/organizations/${ctx.orgId}/action-plans/${plan.id}/actions`, {
        method: "POST",
        headers: { ...authHeader(ctx.token), "content-type": "application/json" },
        body: JSON.stringify({ what: "Fazer", responsibleUserId: ctx.userId }),
      })
    ).json();

    await fetch(
      `${ctx.baseUrl}/api/organizations/${ctx.orgId}/action-plans/${plan.id}/actions/${action.id}`,
      {
        method: "PATCH",
        headers: { ...authHeader(ctx.token), "content-type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      },
    );

    const suas = await (
      await fetch(`${ctx.baseUrl}/api/organizations/${ctx.orgId}/pendencias`, {
        headers: authHeader(ctx.token),
      })
    ).json();
    const ids = (suas.items ?? suas).map((p: { id: string }) => p.id);
    expect(ids).not.toContain(`action_plan_action:${action.id}`);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `TEST_ENV=integration pnpm exec vitest run tests/api-server/pendencias-action-plan-actions.integration.test.ts --project integration`
Expected: FAIL

- [ ] **Step 3: Registrar a fonte nova**

Em `services/pendencias/types.ts`:

```ts
export type PendenciaSource =
  | "kpi"
  | "action_plan"
  | "action_plan_action"
  | "nonconformity"
  | "regulatory_document";
```

```ts
export const SOURCE_LABELS: Record<PendenciaSource, string> = {
  kpi: "Indicador",
  action_plan: "Plano de ação",
  action_plan_action: "Ação de plano",
  nonconformity: "Não conformidade",
  regulatory_document: "Documento regulatório",
};
```

- [ ] **Step 4: Implementar o provider**

`artifacts/api-server/src/services/pendencias/providers/action-plan-actions.ts`:

```ts
import { and, eq, gte, inArray, isNotNull, lt } from "drizzle-orm";
import { db, actionPlanActionsTable, actionPlansTable } from "@workspace/db";
import {
  classifyUrgency,
  SOURCE_LABELS,
  type Pendencia,
  type PendenciaProvider,
  type PendenciaProviderContext,
} from "../types";
import { dayBounds } from "./action-plans";

const STATUS_LABELS: Record<string, string> = {
  open: "Pendente",
  in_progress: "Em andamento",
};

/**
 * As AÇÕES do plano, para quem as executa.
 *
 * Distinto do provider de plano, que segue existindo para o responsável do PLANO: conduzir
 * o plano e executar uma ação são coisas diferentes, e quem acumula os dois papéis vê os
 * dois itens.
 */
export const actionPlanActionPendenciaProvider: PendenciaProvider = {
  source: "action_plan_action",

  async listPending(ctx: PendenciaProviderContext): Promise<Pendencia[]> {
    if (ctx.responsibleUserIds.length === 0) return [];
    const rows = await db
      .select({
        id: actionPlanActionsTable.id,
        what: actionPlanActionsTable.what,
        status: actionPlanActionsTable.status,
        dueDate: actionPlanActionsTable.dueDate,
        responsibleUserId: actionPlanActionsTable.responsibleUserId,
        planId: actionPlansTable.id,
        planCode: actionPlansTable.code,
        planTitle: actionPlansTable.title,
      })
      .from(actionPlanActionsTable)
      .innerJoin(actionPlansTable, eq(actionPlanActionsTable.actionPlanId, actionPlansTable.id))
      .where(
        and(
          eq(actionPlanActionsTable.organizationId, ctx.orgId),
          isNotNull(actionPlanActionsTable.responsibleUserId),
          inArray(actionPlanActionsTable.responsibleUserId, ctx.responsibleUserIds),
          inArray(actionPlanActionsTable.status, ["open", "in_progress"]),
        ),
      );

    return rows.map((r): Pendencia => {
      const dueIso = r.dueDate ? r.dueDate.toISOString() : null;
      return {
        id: `action_plan_action:${r.id}`,
        source: "action_plan_action",
        sourceLabel: SOURCE_LABELS.action_plan_action,
        title: r.what?.trim() || "Ação sem enunciado",
        subtitle: r.planCode ?? r.planTitle,
        statusLabel: STATUS_LABELS[r.status] ?? r.status,
        dueDate: dueIso,
        urgency: classifyUrgency(dueIso, ctx.now, ctx.dueSoonDays),
        responsibleUserId: r.responsibleUserId as number,
        link: { route: `/planos-acao/${r.planId}#acao-${r.id}`, ctaLabel: "Ver ação" },
        meta: { planId: r.planId, planCode: r.planCode, status: r.status },
      };
    });
  },

  async listCompletedToday(ctx: PendenciaProviderContext): Promise<Pendencia[]> {
    if (ctx.responsibleUserIds.length === 0) return [];
    const { start, end } = dayBounds(ctx.now);
    const rows = await db
      .select({
        id: actionPlanActionsTable.id,
        what: actionPlanActionsTable.what,
        completedAt: actionPlanActionsTable.completedAt,
        responsibleUserId: actionPlanActionsTable.responsibleUserId,
        planId: actionPlansTable.id,
        planCode: actionPlansTable.code,
      })
      .from(actionPlanActionsTable)
      .innerJoin(actionPlansTable, eq(actionPlanActionsTable.actionPlanId, actionPlansTable.id))
      .where(
        and(
          eq(actionPlanActionsTable.organizationId, ctx.orgId),
          isNotNull(actionPlanActionsTable.responsibleUserId),
          inArray(actionPlanActionsTable.responsibleUserId, ctx.responsibleUserIds),
          eq(actionPlanActionsTable.status, "completed"),
          gte(actionPlanActionsTable.completedAt, start),
          lt(actionPlanActionsTable.completedAt, end),
        ),
      );

    return rows.map((r): Pendencia => ({
      id: `action_plan_action:${r.id}`,
      source: "action_plan_action",
      sourceLabel: SOURCE_LABELS.action_plan_action,
      title: r.what?.trim() || "Ação sem enunciado",
      subtitle: r.planCode ?? undefined,
      statusLabel: "Concluída hoje",
      dueDate: r.completedAt ? r.completedAt.toISOString() : null,
      urgency: "no_due",
      responsibleUserId: r.responsibleUserId as number,
      link: { route: `/planos-acao/${r.planId}#acao-${r.id}`, ctaLabel: "Ver ação" },
      meta: { planId: r.planId, completed: true },
    }));
  },
};
```

- [ ] **Step 5: Registrar no registry**

Em `services/pendencias/registry.ts`:

```ts
import { actionPlanActionPendenciaProvider } from "./providers/action-plan-actions";
// ... e acrescentá-lo à lista de providers, logo depois de actionPlanPendenciaProvider
```

- [ ] **Step 6: Rodar e ver passar**

Run: `TEST_ENV=integration pnpm exec vitest run tests/api-server/pendencias-action-plan-actions.integration.test.ts --project integration`
Expected: PASS (2 testes)

Run: `pnpm typecheck`

> Se o front tiver um mapa de ícone/rótulo por `PendenciaSource` (procurar com `grep -rn "action_plan" artifacts/web/src --include=*.tsx | grep -i pendenc`), acrescentar `action_plan_action` lá também — um `source` sem entrada no mapa renderiza em branco.

- [ ] **Step 7: Commit**

```bash
git add artifacts/api-server/src/services/pendencias tests/api-server/pendencias-action-plan-actions.integration.test.ts
git commit -m "feat(api): ações do plano viram pendência própria do seu responsável"
```

---

## Fase 3 — Frontend

### Task 11: Tipos e primitivos de UI

**Files:**
- Create: `artifacts/web/src/pages/app/planos-acao/_components/analises/types.ts`
- Create: `artifacts/web/src/pages/app/planos-acao/_components/analises/primitivos/cadeia-porques.tsx`
- Create: `.../primitivos/lista-agrupada.tsx`
- Create: `.../primitivos/tabela-estruturada.tsx`
- Create: `.../primitivos/editor-arvore.tsx`
- Create: `.../primitivos/secoes-texto.tsx`
- Create: `.../primitivos/tree-ops.ts`
- Test: `artifacts/web/tests/analises-primitivos.unit.test.tsx`

**Interfaces:**
- Produces: os tipos (espelho do OpenAPI), `newId()`, e os 5 primitivos. `tree-ops.ts` produz `indentNode`, `outdentNode`, `removeNode`, `updateNode`, `addSibling`.

> **Por que tipos locais e não os gerados:** o front não pode importar `@workspace/db`, e a saída do Orval para a união discriminada pode degradar (Task 5, Step 4). Estes tipos são a fonte para os componentes; se os gerados saírem bons, `types.ts` pode reexportá-los em vez de redeclarar.

- [ ] **Step 1: Escrever os testes que falham**

`artifacts/web/tests/analises-primitivos.unit.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import {
  addSibling,
  indentNode,
  outdentNode,
  removeNode,
  updateNode,
} from "@/pages/app/planos-acao/_components/analises/primitivos/tree-ops";

type N = { id: string; text?: string; children: N[] };
const tree = (): N[] => [
  { id: "a", text: "A", children: [{ id: "a1", text: "A1", children: [] }] },
  { id: "b", text: "B", children: [] },
];

describe("tree-ops", () => {
  it("indentar torna o nó filho do irmão anterior", () => {
    const out = indentNode(tree(), "b");
    expect(out).toHaveLength(1);
    expect(out[0].children.map((c) => c.id)).toEqual(["a1", "b"]);
  });

  it("indentar o primeiro nó do nível não faz nada (não há irmão anterior)", () => {
    expect(indentNode(tree(), "a")).toEqual(tree());
  });

  it("desindentar sobe o nó para o nível do pai, logo depois dele", () => {
    const out = outdentNode(tree(), "a1");
    expect(out.map((n) => n.id)).toEqual(["a", "a1", "b"]);
    expect(out[0].children).toHaveLength(0);
  });

  it("desindentar um nó de raiz não faz nada", () => {
    expect(outdentNode(tree(), "a")).toEqual(tree());
  });

  it("remover um nó leva a subárvore junto e não deixa órfão", () => {
    const out = removeNode(tree(), "a");
    expect(out.map((n) => n.id)).toEqual(["b"]);
    expect(JSON.stringify(out)).not.toContain("a1");
  });

  it("atualizar só toca o nó alvo, em qualquer profundidade", () => {
    const out = updateNode(tree(), "a1", (n) => ({ ...n, text: "editado" }));
    expect(out[0].children[0].text).toBe("editado");
    expect(out[1].text).toBe("B");
  });

  it("addSibling insere logo depois do alvo, no mesmo nível", () => {
    const out = addSibling(tree(), "a1", { id: "novo", children: [] });
    expect(out[0].children.map((c) => c.id)).toEqual(["a1", "novo"]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run artifacts/web/tests/analises-primitivos.unit.test.tsx --project web-unit`
Expected: FAIL — `tree-ops` não existe.

- [ ] **Step 3: `types.ts`**

`artifacts/web/src/pages/app/planos-acao/_components/analises/types.ts`:

```ts
/**
 * Espelho, no front, dos tipos de tratativa definidos em `lib/db/src/schema/
 * action-plan-analysis-methods.ts` e no OpenAPI. O front não importa `@workspace/db`
 * (dependência de servidor), e a saída do Orval para a união discriminada não é confiável
 * o bastante para tipar os editores — então estes tipos são a fonte aqui.
 *
 * MANTER EM SINCRONIA com o schema e o OpenAPI. Mudou a forma de um método? Mudou nos três.
 */

export const ANALYSIS_METHOD_KEYS = [
  "five_whys",
  "ishikawa",
  "a3",
  "fmea",
  "fault_tree",
  "kepner_tregoe",
  "rca_apollo",
  "barrier_analysis",
] as const;
export type AnalysisMethodKey = (typeof ANALYSIS_METHOD_KEYS)[number];

export const MAX_WHYS = 5;
export const FMEA_RPN_ALERT = 100;

export const ISHIKAWA_CATEGORIES = [
  "metodo",
  "maquina",
  "mao_de_obra",
  "material",
  "medicao",
  "meio_ambiente",
] as const;
export type IshikawaCategory = (typeof ISHIKAWA_CATEGORIES)[number];
export const ISHIKAWA_CATEGORY_LABELS: Record<IshikawaCategory, string> = {
  metodo: "Método",
  maquina: "Máquina",
  mao_de_obra: "Mão de obra",
  material: "Material",
  medicao: "Medição",
  meio_ambiente: "Meio ambiente",
};

export const KT_DIMENSIONS = ["o_que", "onde", "quando", "extensao"] as const;
export type KTDimension = (typeof KT_DIMENSIONS)[number];
export const KT_DIMENSION_LABELS: Record<KTDimension, string> = {
  o_que: "O quê (identidade)",
  onde: "Onde (localização)",
  quando: "Quando (tempo)",
  extensao: "Extensão (magnitude)",
};

export const BARRIER_TYPES = ["fisica", "administrativa", "humana", "procedimental"] as const;
export type BarrierType = (typeof BARRIER_TYPES)[number];
export const BARRIER_TYPE_LABELS: Record<BarrierType, string> = {
  fisica: "Física",
  administrativa: "Administrativa",
  humana: "Humana",
  procedimental: "Procedimental",
};

export const BARRIER_STATUSES = ["ausente", "falhou", "ineficaz", "funcionou"] as const;
export type BarrierStatus = (typeof BARRIER_STATUSES)[number];
export const BARRIER_STATUS_LABELS: Record<BarrierStatus, string> = {
  ausente: "Ausente",
  falhou: "Falhou",
  ineficaz: "Ineficaz",
  funcionou: "Funcionou",
};

export type FaultTreeGate = "AND" | "OR";
export const FAULT_TREE_GATE_LABELS: Record<FaultTreeGate, string> = { AND: "E", OR: "OU" };

export type RcaApolloCauseType = "condition" | "action";
export const RCA_APOLLO_TYPE_LABELS: Record<RcaApolloCauseType, string> = {
  condition: "Condição",
  action: "Ação",
};

/** Escalas do FMEA. O texto de cada nível é o que impede o usuário de "chutar" o número. */
export const FMEA_SEVERITY_SCALE: Record<number, string> = {
  1: "1 — Sem efeito perceptível",
  2: "2 — Efeito muito leve",
  3: "3 — Efeito leve",
  4: "4 — Incômodo menor",
  5: "5 — Incômodo moderado",
  6: "6 — Degradação de desempenho",
  7: "7 — Perda de função principal",
  8: "8 — Perda total de função",
  9: "9 — Risco de segurança com aviso",
  10: "10 — Risco de segurança sem aviso",
};
export const FMEA_OCCURRENCE_SCALE: Record<number, string> = {
  1: "1 — Improvável",
  2: "2 — Muito rara",
  3: "3 — Rara",
  4: "4 — Baixa",
  5: "5 — Ocasional",
  6: "6 — Moderada",
  7: "7 — Frequente",
  8: "8 — Alta",
  9: "9 — Muito alta",
  10: "10 — Quase certa",
};
export const FMEA_DETECTION_SCALE: Record<number, string> = {
  1: "1 — Detecção quase certa",
  2: "2 — Detecção muito alta",
  3: "3 — Detecção alta",
  4: "4 — Detecção moderadamente alta",
  5: "5 — Detecção moderada",
  6: "6 — Detecção baixa",
  7: "7 — Detecção muito baixa",
  8: "8 — Detecção remota",
  9: "9 — Detecção muito remota",
  10: "10 — Detecção quase impossível",
};

export type FiveWhysData = { whys: string[] };
export type IshikawaData = {
  causes: Array<{ id: string; category: IshikawaCategory; text: string }>;
  selectedCauseId?: string;
  whys: string[];
};
export type A3Data = {
  background?: string;
  currentState?: string;
  goal?: string;
  analysis?: string;
  countermeasures?: string;
};
export type FmeaRow = {
  id: string;
  failureMode?: string;
  effect?: string;
  severity?: number;
  cause?: string;
  occurrence?: number;
  currentControl?: string;
  detection?: number;
  recommendedAction?: string;
};
export type FmeaData = { rows: FmeaRow[] };
export type FaultTreeNode = { id: string; text?: string; gate: FaultTreeGate; children: FaultTreeNode[] };
export type FaultTreeData = { topEvent?: string; nodes: FaultTreeNode[] };
export type KepnerTregoeData = {
  rows: Array<{
    dimension: KTDimension;
    is?: string;
    isNot?: string;
    distinction?: string;
    change?: string;
  }>;
  possibleCauses: Array<{ id: string; text?: string; verification?: string; verified?: boolean }>;
  mostProbableCauseId?: string;
};
export type RcaApolloNode = {
  id: string;
  text?: string;
  type: RcaApolloCauseType;
  evidence?: string;
  children: RcaApolloNode[];
};
export type RcaApolloData = { primaryEffect?: string; causes: RcaApolloNode[] };
export type BarrierAnalysisData = {
  hazard?: string;
  target?: string;
  barriers: Array<{
    id: string;
    name?: string;
    type?: BarrierType;
    status?: BarrierStatus;
    failureReason?: string;
  }>;
};

export type AnalysisData =
  | FiveWhysData
  | IshikawaData
  | A3Data
  | FmeaData
  | FaultTreeData
  | KepnerTregoeData
  | RcaApolloData
  | BarrierAnalysisData;

export type ActionPlanAnalysis =
  | { key: "five_whys"; data: FiveWhysData }
  | { key: "ishikawa"; data: IshikawaData }
  | { key: "a3"; data: A3Data }
  | { key: "fmea"; data: FmeaData }
  | { key: "fault_tree"; data: FaultTreeData }
  | { key: "kepner_tregoe"; data: KepnerTregoeData }
  | { key: "rca_apollo"; data: RcaApolloData }
  | { key: "barrier_analysis"; data: BarrierAnalysisData };

/** RPN = S × O × D. `null` enquanto faltar qualquer um dos três. */
export function fmeaRpn(row: Pick<FmeaRow, "severity" | "occurrence" | "detection">): number | null {
  if (!row.severity || !row.occurrence || !row.detection) return null;
  return row.severity * row.occurrence * row.detection;
}

/** Id estável de linha/nó. Gerado no cliente; só precisa ser único dentro da tratativa. */
export function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Math.random().toString(36).slice(2, 10)}`;
}
```

- [ ] **Step 4: `tree-ops.ts`** (a lógica de árvore, testável sem React)

`.../analises/primitivos/tree-ops.ts`:

```ts
/** Operações de árvore compartilhadas pela Árvore de Falhas e pelo RCA Apollo.
 *  Puras e imutáveis — o editor só as chama e passa o resultado adiante. */

export type TreeNode<T> = T & { id: string; children: Array<TreeNode<T>> };

type AnyNode = { id: string; children: AnyNode[] };

export function updateNode<T extends AnyNode>(
  nodes: T[],
  id: string,
  fn: (node: T) => T,
): T[] {
  return nodes.map((node) => {
    if (node.id === id) return fn(node);
    return { ...node, children: updateNode(node.children as T[], id, fn) } as T;
  });
}

export function removeNode<T extends AnyNode>(nodes: T[], id: string): T[] {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) => ({ ...node, children: removeNode(node.children as T[], id) }) as T);
}

/** Insere `node` logo DEPOIS de `afterId`, no mesmo nível. */
export function addSibling<T extends AnyNode>(nodes: T[], afterId: string, node: T): T[] {
  const out: T[] = [];
  for (const current of nodes) {
    out.push({ ...current, children: addSibling(current.children as T[], afterId, node) } as T);
    if (current.id === afterId) out.push(node);
  }
  return out;
}

/** Torna o nó filho do IRMÃO ANTERIOR. Sem irmão anterior, não há para onde indentar. */
export function indentNode<T extends AnyNode>(nodes: T[], id: string): T[] {
  const index = nodes.findIndex((n) => n.id === id);
  if (index > 0) {
    const previous = nodes[index - 1];
    const moving = nodes[index];
    const next = [...nodes];
    next[index - 1] = { ...previous, children: [...previous.children, moving] } as T;
    next.splice(index, 1);
    return next;
  }
  if (index === 0) return nodes; // primeiro do nível: nada a fazer
  return nodes.map((n) => ({ ...n, children: indentNode(n.children as T[], id) }) as T);
}

/** Sobe o nó para o nível do pai, logo DEPOIS dele. Um nó de raiz não tem para onde subir. */
export function outdentNode<T extends AnyNode>(nodes: T[], id: string): T[] {
  // Um filho direto de algum `nodes[i]` sobe para este nível.
  const out: T[] = [];
  let moved = false;
  for (const node of nodes) {
    const childIndex = node.children.findIndex((c) => c.id === id);
    if (childIndex >= 0) {
      const child = node.children[childIndex] as T;
      out.push({ ...node, children: node.children.filter((c) => c.id !== id) } as T);
      out.push(child);
      moved = true;
      continue;
    }
    out.push({ ...node, children: outdentNode(node.children as T[], id) } as T);
  }
  // `moved` existe só para deixar explícito que a raiz não sobe: se `id` estava na raiz,
  // nenhum ramo acima o encontrou como filho e a árvore volta inalterada.
  void moved;
  return out;
}
```

- [ ] **Step 5: Rodar os testes de árvore e ver passar**

Run: `pnpm exec vitest run artifacts/web/tests/analises-primitivos.unit.test.tsx --project web-unit`
Expected: PASS (7 testes)

- [ ] **Step 6: Escrever os 5 primitivos**

Todos recebem `readOnly` e o encaminham aos campos. Reusar `AutoGrowTextarea` (`_components/auto-grow-textarea.tsx`), `Input`, `Button`, `Switch` e `SearchableSelect` do design system.

`.../primitivos/cadeia-porques.tsx` — cadeia ordenada, máx. N. É o corpo de `causa-raiz.tsx` (linhas 32-66) **sem** o campo "Causa raiz identificada" (que agora é do plano, não do método), com `label` parametrizável:

```tsx
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AutoGrowTextarea } from "../../auto-grow-textarea";
import { MAX_WHYS } from "../types";

export function CadeiaPorques({
  whys,
  onChange,
  readOnly = false,
  max = MAX_WHYS,
}: {
  whys: string[];
  onChange: (next: string[]) => void;
  readOnly?: boolean;
  max?: number;
}) {
  const list = whys.length > 0 ? whys : [""];
  const setWhy = (i: number, text: string) =>
    onChange(list.map((w, idx) => (idx === i ? text : w)));

  return (
    <div className="space-y-2">
      {list.map((why, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="w-16 shrink-0 pt-2 text-[11px] font-medium text-muted-foreground">
            {i + 1}º porquê
          </span>
          <AutoGrowTextarea
            value={why}
            onChange={(e) => setWhy(i, e.target.value)}
            placeholder={i === 0 ? "Por que o problema ocorreu?" : "Por quê?"}
            readOnly={readOnly}
          />
          {!readOnly && list.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mt-1 h-7 w-7 shrink-0 text-muted-foreground"
              onClick={() => onChange(list.filter((_, idx) => idx !== i))}
              aria-label={`Remover ${i + 1}º porquê`}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ))}
      {!readOnly && list.length < max && (
        <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={() => onChange([...list, ""])}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Adicionar porquê
        </Button>
      )}
    </div>
  );
}
```

`.../primitivos/secoes-texto.tsx` — blocos de texto com títulos fixos:

```tsx
import { AutoGrowTextarea } from "../../auto-grow-textarea";

export type Secao<K extends string> = { key: K; label: string; placeholder?: string };

export function SecoesTexto<K extends string>({
  secoes,
  value,
  onChange,
  readOnly = false,
}: {
  secoes: ReadonlyArray<Secao<K>>;
  value: Partial<Record<K, string>>;
  onChange: (next: Partial<Record<K, string>>) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-3">
      {secoes.map((secao) => (
        <div key={secao.key}>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {secao.label}
          </label>
          <AutoGrowTextarea
            value={value[secao.key] ?? ""}
            onChange={(e) => onChange({ ...value, [secao.key]: e.target.value })}
            placeholder={secao.placeholder}
            readOnly={readOnly}
          />
        </div>
      ))}
    </div>
  );
}
```

`.../primitivos/lista-agrupada.tsx` — itens dentro de categorias de um conjunto fechado (Ishikawa 6M). Cada grupo é uma coluna com "+ Adicionar causa"; o item tem texto e um rádio "causa mais provável" opcional (`selectable`):

```tsx
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ItemAgrupado<C extends string> = { id: string; category: C; text: string };

export function ListaAgrupada<C extends string>({
  categorias,
  rotulos,
  itens,
  onChange,
  selectedId,
  onSelect,
  readOnly = false,
  novoItem,
}: {
  categorias: ReadonlyArray<C>;
  rotulos: Record<C, string>;
  itens: Array<ItemAgrupado<C>>;
  onChange: (next: Array<ItemAgrupado<C>>) => void;
  /** Quando presente, cada item ganha um rádio "causa mais provável". */
  selectedId?: string;
  onSelect?: (id: string | undefined) => void;
  readOnly?: boolean;
  novoItem: (category: C) => ItemAgrupado<C>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {categorias.map((categoria) => {
        const doGrupo = itens.filter((i) => i.category === categoria);
        return (
          <div key={categoria} className="rounded-lg border bg-muted/20 p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {rotulos[categoria]}
            </p>
            <div className="space-y-1.5">
              {doGrupo.map((item) => (
                <div key={item.id} className="flex items-center gap-1.5">
                  {onSelect && (
                    <input
                      type="radio"
                      name="ishikawa-causa-provavel"
                      className="shrink-0 cursor-pointer"
                      checked={selectedId === item.id}
                      disabled={readOnly}
                      onChange={() => onSelect(item.id)}
                      aria-label={`Marcar "${item.text || "causa"}" como causa mais provável`}
                    />
                  )}
                  <Input
                    className={cn("h-8 text-[13px]", selectedId === item.id && "border-primary")}
                    value={item.text}
                    readOnly={readOnly}
                    placeholder="Causa"
                    onChange={(e) =>
                      onChange(itens.map((i) => (i.id === item.id ? { ...i, text: e.target.value } : i)))
                    }
                  />
                  {!readOnly && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground"
                      aria-label="Remover causa"
                      onClick={() => {
                        // A causa selecionada some junto — quem escolher outra reativa o vínculo.
                        if (selectedId === item.id) onSelect?.(undefined);
                        onChange(itens.filter((i) => i.id !== item.id));
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              {!readOnly && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => onChange([...itens, novoItem(categoria)])}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Causa
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

`.../primitivos/tabela-estruturada.tsx` — colunas tipadas + coluna calculada. É o primitivo que carrega FMEA, KT e Barreiras:

```tsx
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";

export type ColunaTexto<R> = {
  kind: "text";
  key: keyof R & string;
  header: string;
  placeholder?: string;
  width?: string;
};
export type ColunaSelect<R> = {
  kind: "select";
  key: keyof R & string;
  header: string;
  options: Array<{ value: string; label: string }>;
  width?: string;
};
export type ColunaCalculada<R> = {
  kind: "computed";
  header: string;
  width?: string;
  render: (row: R) => React.ReactNode;
};
export type Coluna<R> = ColunaTexto<R> | ColunaSelect<R> | ColunaCalculada<R>;

/** Tabela de linhas com colunas tipadas. Nada de campo aberto onde há vocabulário fechado:
 *  a coluna `select` só aceita os valores que ela oferece, e a `computed` o usuário não digita. */
export function TabelaEstruturada<R extends { id: string }>({
  colunas,
  rows,
  onChange,
  onAdd,
  addLabel = "Adicionar linha",
  readOnly = false,
  /** Linhas estruturais (ex.: as 4 dimensões do Kepner-Tregoe) não se adicionam nem se removem. */
  fixedRows = false,
  rowClassName,
}: {
  colunas: ReadonlyArray<Coluna<R>>;
  rows: R[];
  onChange: (next: R[]) => void;
  onAdd?: () => void;
  addLabel?: string;
  readOnly?: boolean;
  fixedRows?: boolean;
  rowClassName?: (row: R) => string | undefined;
}) {
  const setCell = (id: string, key: string, value: unknown) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, [key]: value } : r)));

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead>
            <tr className="border-b bg-muted/40">
              {colunas.map((c) => (
                <th
                  key={c.header}
                  className="px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.header}
                </th>
              ))}
              {!readOnly && !fixedRows && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={rowClassName?.(row)}>
                {colunas.map((coluna) => (
                  <td key={coluna.header} className="border-t px-1.5 py-1 align-top">
                    {coluna.kind === "computed" ? (
                      <div className="px-1 py-1.5">{coluna.render(row)}</div>
                    ) : coluna.kind === "select" ? (
                      <SearchableSelect
                        value={(row[coluna.key] as string | undefined)?.toString() ?? ""}
                        onChange={(v) => setCell(row.id, coluna.key, v || undefined)}
                        options={coluna.options}
                        placeholder="—"
                        searchPlaceholder="Buscar..."
                        emptyMessage="Sem opções"
                        disabled={readOnly}
                      />
                    ) : (
                      <Input
                        className="h-8 border-0 bg-transparent px-1 text-[13px] shadow-none focus-visible:ring-1"
                        value={(row[coluna.key] as string | undefined) ?? ""}
                        placeholder={coluna.placeholder}
                        readOnly={readOnly}
                        onChange={(e) => setCell(row.id, coluna.key, e.target.value)}
                      />
                    )}
                  </td>
                ))}
                {!readOnly && !fixedRows && (
                  <td className="border-t px-1 py-1 align-top">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground"
                      aria-label="Remover linha"
                      onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={colunas.length + 1} className="border-t px-3 py-4 text-center text-[13px] text-muted-foreground">
                  Nenhuma linha ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!readOnly && !fixedRows && onAdd && (
        <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={onAdd}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          {addLabel}
        </Button>
      )}
    </div>
  );
}
```

`.../primitivos/editor-arvore.tsx` — lista aninhada com indentar/desindentar. Cada nó renderiza um slot de campos extras (a porta E/OU na Árvore de Falhas, o tipo Condição/Ação no Apollo):

```tsx
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addSibling, indentNode, outdentNode, removeNode, updateNode } from "./tree-ops";

type BaseNode = { id: string; text?: string; children: BaseNode[] };

/**
 * Árvore como LISTA ANINHADA (indenta/desindenta), não como desenho.
 * O registro auditável é a hierarquia — e um editor gráfico custaria dez vezes mais
 * sem acrescentar nada ao que o auditor lê.
 */
export function EditorArvore<T extends BaseNode>({
  nodes,
  onChange,
  novoNo,
  extras,
  placeholder = "Descreva o evento",
  addLabel = "Adicionar item",
  readOnly = false,
  depth = 0,
}: {
  nodes: T[];
  onChange: (next: T[]) => void;
  novoNo: () => T;
  /** Campos próprios do método (porta E/OU, tipo Condição/Ação, evidência…). */
  extras?: (node: T, update: (next: T) => void) => React.ReactNode;
  placeholder?: string;
  addLabel?: string;
  readOnly?: boolean;
  depth?: number;
}) {
  const patch = (id: string, next: T) => onChange(updateNode(nodes, id, () => next));

  return (
    <div className="space-y-1.5">
      {nodes.map((node) => (
        <div key={node.id} className="space-y-1.5">
          <div className="flex items-start gap-1.5" style={{ paddingLeft: depth * 20 }}>
            <Input
              className="h-8 flex-1 text-[13px]"
              value={node.text ?? ""}
              placeholder={placeholder}
              readOnly={readOnly}
              onChange={(e) => patch(node.id, { ...node, text: e.target.value })}
            />
            {extras?.(node, (next) => patch(node.id, next))}
            {!readOnly && (
              <div className="flex shrink-0 items-center">
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"
                  aria-label="Desindentar" title="Desindentar"
                  onClick={() => onChange(outdentNode(nodes, node.id))}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"
                  aria-label="Indentar" title="Indentar"
                  onClick={() => onChange(indentNode(nodes, node.id))}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"
                  aria-label="Adicionar item abaixo" title="Adicionar item abaixo"
                  onClick={() => onChange(addSibling(nodes, node.id, novoNo()))}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"
                  aria-label="Remover item (e o que estiver abaixo dele)" title="Remover"
                  onClick={() => onChange(removeNode(nodes, node.id))}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
          {node.children.length > 0 && (
            <EditorArvore
              nodes={node.children as T[]}
              onChange={(children) => patch(node.id, { ...node, children })}
              novoNo={novoNo}
              extras={extras}
              placeholder={placeholder}
              readOnly={readOnly}
              depth={depth + 1}
            />
          )}
        </div>
      ))}
      {!readOnly && depth === 0 && (
        <Button type="button" variant="ghost" size="sm" className="text-xs"
          onClick={() => onChange([...nodes, novoNo()])}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          {addLabel}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Typecheck e commit**

Run: `pnpm typecheck` (erros remanescentes só nos arquivos que ainda usam 5W2H)
Run: `pnpm exec vitest run artifacts/web/tests/analises-primitivos.unit.test.tsx --project web-unit` → PASS

```bash
git add artifacts/web/src/pages/app/planos-acao/_components/analises artifacts/web/tests/analises-primitivos.unit.test.tsx
git commit -m "feat(web): tipos e primitivos de UI das tratativas (cadeia, grupos, tabela, árvore, seções)"
```

---

### Task 12: Os 8 adaptadores + registry

**Files:**
- Create: `.../analises/metodos/{cinco-porques,ishikawa,a3,fmea,arvore-falhas,kepner-tregoe,rca-apollo,barreiras}.tsx`
- Create: `.../analises/registry.tsx`
- Test: `artifacts/web/tests/analises-registry.unit.test.tsx`

**Interfaces:**
- Consumes: primitivos e tipos (Task 11)
- Produces: `ANALYSIS_REGISTRY: Record<AnalysisMethodKey, { Component, dataVazio(), resumo(data) }>`, `emptyAnalysisData(key)`, `resumoAnalise(analysis)`

Todo adaptador tem a mesma assinatura: `{ data, onChange, readOnly }`.

- [ ] **Step 1: Escrever os testes que falham**

`artifacts/web/tests/analises-registry.unit.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  ANALYSIS_REGISTRY,
  emptyAnalysisData,
  resumoAnalise,
} from "@/pages/app/planos-acao/_components/analises/registry";
import { ANALYSIS_METHOD_KEYS, fmeaRpn } from "@/pages/app/planos-acao/_components/analises/types";

describe("registry das tratativas", () => {
  it("cobre as 8 chaves", () => {
    for (const key of ANALYSIS_METHOD_KEYS) {
      expect(ANALYSIS_REGISTRY[key], `chave ${key}`).toBeDefined();
    }
  });

  it("o KT vazio já nasce com as 4 dimensões", () => {
    const data = emptyAnalysisData("kepner_tregoe") as { rows: unknown[] };
    expect(data.rows).toHaveLength(4);
  });

  it("resume o FMEA com a contagem e o maior RPN", () => {
    const texto = resumoAnalise({
      key: "fmea",
      data: {
        rows: [
          { id: "1", failureMode: "A", severity: 8, occurrence: 4, detection: 3 },
          { id: "2", failureMode: "B", severity: 2, occurrence: 2, detection: 2 },
        ],
      },
    });
    expect(texto).toContain("2 modos de falha");
    expect(texto).toContain("96");
  });

  it("tratativa vazia resume como vazia", () => {
    expect(resumoAnalise({ key: "a3", data: {} })).toBe("Não preenchida");
  });
});

describe("RPN", () => {
  it("é S × O × D", () => {
    expect(fmeaRpn({ severity: 8, occurrence: 4, detection: 3 })).toBe(96);
  });

  it("é null enquanto faltar qualquer um dos três", () => {
    expect(fmeaRpn({ severity: 8, occurrence: 4 })).toBeNull();
    expect(fmeaRpn({})).toBeNull();
  });
});

describe("FMEA", () => {
  it("mostra o RPN calculado — o usuário nunca o digita", () => {
    const { Component } = ANALYSIS_REGISTRY.fmea;
    render(
      <Component
        data={{ rows: [{ id: "1", failureMode: "X", severity: 8, occurrence: 4, detection: 3 }] }}
        onChange={() => {}}
        readOnly
      />,
    );
    expect(screen.getByText("96")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run artifacts/web/tests/analises-registry.unit.test.tsx --project web-unit`
Expected: FAIL — registry inexistente.

- [ ] **Step 3: `metodos/cinco-porques.tsx`**

```tsx
import { CadeiaPorques } from "../primitivos/cadeia-porques";
import type { FiveWhysData } from "../types";

export function CincoPorques({
  data,
  onChange,
  readOnly,
}: {
  data: FiveWhysData;
  onChange: (next: FiveWhysData) => void;
  readOnly?: boolean;
}) {
  return (
    <CadeiaPorques
      whys={data.whys ?? []}
      onChange={(whys) => onChange({ whys })}
      readOnly={readOnly}
    />
  );
}
```

- [ ] **Step 4: `metodos/ishikawa.tsx`**

```tsx
import { CadeiaPorques } from "../primitivos/cadeia-porques";
import { ListaAgrupada } from "../primitivos/lista-agrupada";
import {
  ISHIKAWA_CATEGORIES,
  ISHIKAWA_CATEGORY_LABELS,
  newId,
  type IshikawaData,
} from "../types";

/** Levanta causas nos 6M, escolhe a mais provável, e essa causa puxa os 5 porquês. */
export function Ishikawa({
  data,
  onChange,
  readOnly,
}: {
  data: IshikawaData;
  onChange: (next: IshikawaData) => void;
  readOnly?: boolean;
}) {
  const causas = data.causes ?? [];
  const selecionada = causas.find((c) => c.id === data.selectedCauseId);

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Causas por categoria (6M) — marque a mais provável
        </p>
        <ListaAgrupada
          categorias={ISHIKAWA_CATEGORIES}
          rotulos={ISHIKAWA_CATEGORY_LABELS}
          itens={causas}
          onChange={(next) => onChange({ ...data, causes: next })}
          selectedId={data.selectedCauseId}
          onSelect={(id) => onChange({ ...data, selectedCauseId: id })}
          readOnly={readOnly}
          novoItem={(category) => ({ id: newId(), category, text: "" })}
        />
      </div>

      <div>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          5 Porquês {selecionada?.text ? `— sobre "${selecionada.text}"` : ""}
        </p>
        {!selecionada && (
          <p className="mb-2 text-[12px] text-muted-foreground">
            Marque acima a causa mais provável para aprofundá-la nos porquês.
          </p>
        )}
        <CadeiaPorques
          whys={data.whys ?? []}
          onChange={(whys) => onChange({ ...data, whys })}
          readOnly={readOnly}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: `metodos/a3.tsx`**

```tsx
import { SecoesTexto } from "../primitivos/secoes-texto";
import type { A3Data } from "../types";

/**
 * A3 REDUZIDO. As seções "Plano" e "Acompanhamento" do A3 clássico já SÃO as Ações e a
 * Eficácia deste mesmo plano — repeti-las aqui faria o usuário digitar duas vezes a mesma
 * coisa, e as duas cópias divergiriam.
 */
const SECOES = [
  { key: "background", label: "Contexto", placeholder: "Por que este problema importa agora?" },
  { key: "currentState", label: "Situação atual", placeholder: "O que se observa hoje, com dados." },
  { key: "goal", label: "Meta", placeholder: "Aonde se quer chegar, e até quando." },
  { key: "analysis", label: "Análise", placeholder: "Causas identificadas e como se chegou a elas." },
  { key: "countermeasures", label: "Contramedidas", placeholder: "O que atacará as causas." },
] as const;

export function A3({
  data,
  onChange,
  readOnly,
}: {
  data: A3Data;
  onChange: (next: A3Data) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-3">
      <SecoesTexto secoes={SECOES} value={data} onChange={(next) => onChange(next)} readOnly={readOnly} />
      <p className="text-[12px] text-muted-foreground">
        O <strong>plano</strong> e o <strong>acompanhamento</strong> do A3 são as <strong>Ações</strong> e
        a <strong>Eficácia</strong> deste plano — preencha-os nas seções próprias, logo abaixo.
      </p>
    </div>
  );
}
```

- [ ] **Step 6: `metodos/fmea.tsx`**

```tsx
import { Badge } from "@/components/ui/badge";
import { TabelaEstruturada, type Coluna } from "../primitivos/tabela-estruturada";
import {
  FMEA_DETECTION_SCALE,
  FMEA_OCCURRENCE_SCALE,
  FMEA_RPN_ALERT,
  FMEA_SEVERITY_SCALE,
  fmeaRpn,
  newId,
  type FmeaData,
  type FmeaRow,
} from "../types";

const escalaOptions = (scale: Record<number, string>) =>
  Object.entries(scale).map(([value, label]) => ({ value, label }));

export function Fmea({
  data,
  onChange,
  readOnly,
}: {
  data: FmeaData;
  onChange: (next: FmeaData) => void;
  readOnly?: boolean;
}) {
  const rows = data.rows ?? [];

  const colunas: ReadonlyArray<Coluna<FmeaRow>> = [
    { kind: "text", key: "failureMode", header: "Modo de falha", placeholder: "O que pode falhar", width: "18%" },
    { kind: "text", key: "effect", header: "Efeito", placeholder: "Consequência", width: "16%" },
    { kind: "select", key: "severity", header: "S", options: escalaOptions(FMEA_SEVERITY_SCALE), width: "9%" },
    { kind: "text", key: "cause", header: "Causa", placeholder: "Por que falha", width: "16%" },
    { kind: "select", key: "occurrence", header: "O", options: escalaOptions(FMEA_OCCURRENCE_SCALE), width: "9%" },
    { kind: "text", key: "currentControl", header: "Controle atual", placeholder: "O que já detecta", width: "14%" },
    { kind: "select", key: "detection", header: "D", options: escalaOptions(FMEA_DETECTION_SCALE), width: "9%" },
    {
      kind: "computed",
      header: "RPN",
      width: "9%",
      // Calculado, nunca digitado: o RPN é S×O×D por definição, e deixá-lo aberto
      // permitiria uma nota inconsistente com as três escalas.
      render: (row) => {
        const rpn = fmeaRpn(row);
        if (rpn == null) return <span className="text-muted-foreground">—</span>;
        return rpn >= FMEA_RPN_ALERT
          ? <Badge variant="destructive" className="text-[11px]">{rpn}</Badge>
          : <span className="text-[13px] font-medium">{rpn}</span>;
      },
    },
    { kind: "text", key: "recommendedAction", header: "Ação recomendada", placeholder: "O que fazer", width: "18%" },
  ];

  // Os selects guardam string; o modelo guarda número.
  const rowsParaTabela = rows.map((r) => ({
    ...r,
    severity: r.severity != null ? (String(r.severity) as unknown as number) : undefined,
    occurrence: r.occurrence != null ? (String(r.occurrence) as unknown as number) : undefined,
    detection: r.detection != null ? (String(r.detection) as unknown as number) : undefined,
  }));

  const paraModelo = (list: FmeaRow[]): FmeaRow[] =>
    list.map((r) => ({
      ...r,
      severity: r.severity != null ? Number(r.severity) : undefined,
      occurrence: r.occurrence != null ? Number(r.occurrence) : undefined,
      detection: r.detection != null ? Number(r.detection) : undefined,
    }));

  return (
    <TabelaEstruturada<FmeaRow>
      colunas={colunas}
      rows={rowsParaTabela as FmeaRow[]}
      onChange={(next) => onChange({ rows: paraModelo(next) })}
      onAdd={() => onChange({ rows: [...rows, { id: newId() }] })}
      addLabel="Adicionar modo de falha"
      readOnly={readOnly}
      rowClassName={(row) => {
        const rpn = fmeaRpn({
          severity: row.severity != null ? Number(row.severity) : undefined,
          occurrence: row.occurrence != null ? Number(row.occurrence) : undefined,
          detection: row.detection != null ? Number(row.detection) : undefined,
        });
        return rpn != null && rpn >= FMEA_RPN_ALERT ? "bg-destructive/5" : undefined;
      }}
    />
  );
}
```

- [ ] **Step 7: `metodos/barreiras.tsx`**

```tsx
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TabelaEstruturada, type Coluna } from "../primitivos/tabela-estruturada";
import {
  BARRIER_STATUS_LABELS,
  BARRIER_STATUSES,
  BARRIER_TYPE_LABELS,
  BARRIER_TYPES,
  newId,
  type BarrierAnalysisData,
} from "../types";

type Barreira = BarrierAnalysisData["barriers"][number];

export function Barreiras({
  data,
  onChange,
  readOnly,
}: {
  data: BarrierAnalysisData;
  onChange: (next: BarrierAnalysisData) => void;
  readOnly?: boolean;
}) {
  const barreiras = data.barriers ?? [];

  const colunas: ReadonlyArray<Coluna<Barreira>> = [
    { kind: "text", key: "name", header: "Barreira", placeholder: "O que deveria ter impedido", width: "26%" },
    {
      kind: "select",
      key: "type",
      header: "Tipo",
      width: "18%",
      options: BARRIER_TYPES.map((t) => ({ value: t, label: BARRIER_TYPE_LABELS[t] })),
    },
    {
      kind: "select",
      key: "status",
      header: "Status",
      width: "16%",
      options: BARRIER_STATUSES.map((s) => ({ value: s, label: BARRIER_STATUS_LABELS[s] })),
    },
    { kind: "text", key: "failureReason", header: "Por que falhou", placeholder: "Motivo", width: "40%" },
  ];

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Perigo / fonte</Label>
          <Input
            value={data.hazard ?? ""}
            readOnly={readOnly}
            placeholder="O que gerou a ameaça"
            onChange={(e) => onChange({ ...data, hazard: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Alvo exposto</Label>
          <Input
            value={data.target ?? ""}
            readOnly={readOnly}
            placeholder="Quem/o que foi atingido"
            onChange={(e) => onChange({ ...data, target: e.target.value })}
          />
        </div>
      </div>
      <TabelaEstruturada<Barreira>
        colunas={colunas}
        rows={barreiras}
        onChange={(next) => onChange({ ...data, barriers: next })}
        onAdd={() => onChange({ ...data, barriers: [...barreiras, { id: newId() }] })}
        addLabel="Adicionar barreira"
        readOnly={readOnly}
      />
    </div>
  );
}
```

- [ ] **Step 8: `metodos/kepner-tregoe.tsx`**

```tsx
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { TabelaEstruturada, type Coluna } from "../primitivos/tabela-estruturada";
import {
  KT_DIMENSION_LABELS,
  KT_DIMENSIONS,
  newId,
  type KepnerTregoeData,
  type KTDimension,
} from "../types";

/** A tabela precisa de `id`; a dimensão é a identidade estável da linha. */
type LinhaKT = {
  id: string;
  dimensao: string;
  dimension: KTDimension;
  is?: string;
  isNot?: string;
  distinction?: string;
  change?: string;
};

export function KepnerTregoe({
  data,
  onChange,
  readOnly,
}: {
  data: KepnerTregoeData;
  onChange: (next: KepnerTregoeData) => void;
  readOnly?: boolean;
}) {
  // As 4 dimensões são LINHAS FIXAS: reconstruídas sempre, nunca adicionadas nem removidas.
  const rows: LinhaKT[] = KT_DIMENSIONS.map((dimension) => {
    const r = (data.rows ?? []).find((row) => row.dimension === dimension);
    return {
      id: dimension,
      dimensao: KT_DIMENSION_LABELS[dimension],
      dimension,
      is: r?.is,
      isNot: r?.isNot,
      distinction: r?.distinction,
      change: r?.change,
    };
  });

  const colunas: ReadonlyArray<Coluna<LinhaKT>> = [
    { kind: "computed", header: "Dimensão", width: "20%", render: (row) => <span className="text-[12px] font-medium">{row.dimensao}</span> },
    { kind: "text", key: "is", header: "É", placeholder: "O que É", width: "20%" },
    { kind: "text", key: "isNot", header: "NÃO É", placeholder: "O que poderia ser, mas não é", width: "20%" },
    { kind: "text", key: "distinction", header: "Distinção", placeholder: "O que distingue", width: "20%" },
    { kind: "text", key: "change", header: "Mudança", placeholder: "O que mudou", width: "20%" },
  ];

  const causas = data.possibleCauses ?? [];

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Especificação do problema (É / NÃO É)
        </p>
        <TabelaEstruturada<LinhaKT>
          colunas={colunas}
          rows={rows}
          fixedRows
          readOnly={readOnly}
          onChange={(next) =>
            onChange({
              ...data,
              rows: next.map((r) => ({
                dimension: r.dimension,
                is: r.is,
                isNot: r.isNot,
                distinction: r.distinction,
                change: r.change,
              })),
            })
          }
        />
      </div>

      <div>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Causas possíveis — marque a mais provável e registre como foi testada
        </p>
        <div className="space-y-1.5">
          {causas.map((causa) => (
            <div key={causa.id} className="flex items-center gap-2">
              <input
                type="radio"
                name="kt-causa-provavel"
                className="shrink-0 cursor-pointer"
                checked={data.mostProbableCauseId === causa.id}
                disabled={readOnly}
                onChange={() => onChange({ ...data, mostProbableCauseId: causa.id })}
                aria-label="Marcar como causa mais provável"
              />
              <Input
                className="h-8 flex-1 text-[13px]"
                value={causa.text ?? ""}
                placeholder="Causa possível"
                readOnly={readOnly}
                onChange={(e) =>
                  onChange({
                    ...data,
                    possibleCauses: causas.map((c) => (c.id === causa.id ? { ...c, text: e.target.value } : c)),
                  })
                }
              />
              <Input
                className="h-8 flex-1 text-[13px]"
                value={causa.verification ?? ""}
                placeholder="Como foi verificada"
                readOnly={readOnly}
                onChange={(e) =>
                  onChange({
                    ...data,
                    possibleCauses: causas.map((c) => (c.id === causa.id ? { ...c, verification: e.target.value } : c)),
                  })
                }
              />
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">Confirmada</span>
                <Switch
                  checked={causa.verified ?? false}
                  disabled={readOnly}
                  onCheckedChange={(verified) =>
                    onChange({
                      ...data,
                      possibleCauses: causas.map((c) => (c.id === causa.id ? { ...c, verified } : c)),
                    })
                  }
                  aria-label="Causa confirmada pelo teste"
                />
              </div>
              {!readOnly && (
                <Button
                  type="button" variant="ghost" size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground"
                  aria-label="Remover causa possível"
                  onClick={() => {
                    if (data.mostProbableCauseId === causa.id) {
                      onChange({
                        ...data,
                        mostProbableCauseId: undefined,
                        possibleCauses: causas.filter((c) => c.id !== causa.id),
                      });
                      return;
                    }
                    onChange({ ...data, possibleCauses: causas.filter((c) => c.id !== causa.id) });
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
          {!readOnly && (
            <Button
              type="button" variant="ghost" size="sm" className="text-xs"
              onClick={() => onChange({ ...data, possibleCauses: [...causas, { id: newId() }] })}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Adicionar causa possível
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: `metodos/arvore-falhas.tsx`**

```tsx
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { EditorArvore } from "../primitivos/editor-arvore";
import {
  FAULT_TREE_GATE_LABELS,
  newId,
  type FaultTreeData,
  type FaultTreeGate,
  type FaultTreeNode,
} from "../types";

const GATE_OPTIONS = (["OR", "AND"] as FaultTreeGate[]).map((g) => ({
  value: g,
  label: FAULT_TREE_GATE_LABELS[g],
}));

export function ArvoreFalhas({
  data,
  onChange,
  readOnly,
}: {
  data: FaultTreeData;
  onChange: (next: FaultTreeData) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Evento topo</Label>
        <Input
          value={data.topEvent ?? ""}
          readOnly={readOnly}
          placeholder="A falha que se quer explicar"
          onChange={(e) => onChange({ ...data, topEvent: e.target.value })}
        />
      </div>
      <div>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Eventos — indente para desdobrar a causa acima
        </p>
        <EditorArvore<FaultTreeNode>
          nodes={data.nodes ?? []}
          onChange={(nodes) => onChange({ ...data, nodes })}
          novoNo={() => ({ id: newId(), gate: "OR", children: [] })}
          placeholder="Evento / falha"
          addLabel="Adicionar evento"
          readOnly={readOnly}
          extras={(node, update) =>
            // A porta só diz alguma coisa quando há filhos: "E" = todos precisam ocorrer,
            // "OU" = qualquer um basta. Num nó folha ela seria ruído.
            node.children.length > 0 ? (
              <div className="w-24 shrink-0">
                <SearchableSelect
                  value={node.gate}
                  onChange={(v) => update({ ...node, gate: (v || "OR") as FaultTreeGate })}
                  options={GATE_OPTIONS}
                  placeholder="Porta"
                  searchPlaceholder="Buscar..."
                  emptyMessage="—"
                  disabled={readOnly}
                />
              </div>
            ) : null
          }
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 10: `metodos/rca-apollo.tsx`**

```tsx
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { EditorArvore } from "../primitivos/editor-arvore";
import {
  RCA_APOLLO_TYPE_LABELS,
  newId,
  type RcaApolloCauseType,
  type RcaApolloData,
  type RcaApolloNode,
} from "../types";

const TIPO_OPTIONS = (["condition", "action"] as RcaApolloCauseType[]).map((t) => ({
  value: t,
  label: RCA_APOLLO_TYPE_LABELS[t],
}));

export function RcaApollo({
  data,
  onChange,
  readOnly,
}: {
  data: RcaApolloData;
  onChange: (next: RcaApolloData) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Efeito primário</Label>
        <Input
          value={data.primaryEffect ?? ""}
          readOnly={readOnly}
          placeholder="O problema, no ponto em que ele dói"
          onChange={(e) => onChange({ ...data, primaryEffect: e.target.value })}
        />
      </div>
      <div>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Causas — todo efeito tem uma Condição e uma Ação; indente para desdobrar
        </p>
        <EditorArvore<RcaApolloNode>
          nodes={data.causes ?? []}
          onChange={(causes) => onChange({ ...data, causes })}
          novoNo={() => ({ id: newId(), type: "condition", children: [] })}
          placeholder="Causa"
          addLabel="Adicionar causa"
          readOnly={readOnly}
          extras={(node, update) => (
            <>
              <div className="w-32 shrink-0">
                <SearchableSelect
                  value={node.type}
                  onChange={(v) => update({ ...node, type: (v || "condition") as RcaApolloCauseType })}
                  options={TIPO_OPTIONS}
                  placeholder="Tipo"
                  searchPlaceholder="Buscar..."
                  emptyMessage="—"
                  disabled={readOnly}
                />
              </div>
              <Input
                className="h-8 w-40 shrink-0 text-[13px]"
                value={node.evidence ?? ""}
                placeholder="Evidência"
                readOnly={readOnly}
                onChange={(e) => update({ ...node, evidence: e.target.value })}
              />
            </>
          )}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 11: `registry.tsx`**

```tsx
import { CincoPorques } from "./metodos/cinco-porques";
import { Ishikawa } from "./metodos/ishikawa";
import { A3 } from "./metodos/a3";
import { Fmea } from "./metodos/fmea";
import { ArvoreFalhas } from "./metodos/arvore-falhas";
import { KepnerTregoe } from "./metodos/kepner-tregoe";
import { RcaApollo } from "./metodos/rca-apollo";
import { Barreiras } from "./metodos/barreiras";
import {
  ISHIKAWA_CATEGORY_LABELS,
  KT_DIMENSIONS,
  fmeaRpn,
  type ActionPlanAnalysis,
  type AnalysisData,
  type AnalysisMethodKey,
} from "./types";

type Adaptador<D> = {
  Component: (props: { data: D; onChange: (next: D) => void; readOnly?: boolean }) => JSX.Element;
  dataVazio: () => D;
  /** Uma linha para o card colapsado e para o diff de versões. */
  resumo: (data: D) => string;
};

function contar(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/**
 * A ponte entre a `key` (que o plano guarda) e o editor. Adicionar um método novo é
 * escrever um adaptador e registrá-lo aqui — nenhuma tela precisa saber que ele existe.
 */
export const ANALYSIS_REGISTRY: { [K in AnalysisMethodKey]: Adaptador<never> } = {
  five_whys: {
    Component: CincoPorques,
    dataVazio: () => ({ whys: [] }),
    resumo: (d) => (d.whys?.length ? contar(d.whys.length, "porquê", "porquês") : ""),
  },
  ishikawa: {
    Component: Ishikawa,
    dataVazio: () => ({ causes: [], whys: [] }),
    resumo: (d) => {
      const partes: string[] = [];
      if (d.causes?.length) {
        const categorias = new Set(d.causes.map((c) => c.category));
        partes.push(
          `${contar(d.causes.length, "causa", "causas")} em ${contar(categorias.size, "categoria", "categorias")}`,
        );
      }
      const selecionada = d.causes?.find((c) => c.id === d.selectedCauseId);
      if (selecionada?.text) {
        partes.push(`mais provável: ${ISHIKAWA_CATEGORY_LABELS[selecionada.category]} — ${selecionada.text}`);
      }
      if (d.whys?.length) partes.push(contar(d.whys.length, "porquê", "porquês"));
      return partes.join(" · ");
    },
  },
  a3: {
    Component: A3,
    dataVazio: () => ({}),
    resumo: (d) => {
      const preenchidas = Object.values(d).filter((v) => typeof v === "string" && v.trim()).length;
      return preenchidas ? `${contar(preenchidas, "seção preenchida", "seções preenchidas")} de 5` : "";
    },
  },
  fmea: {
    Component: Fmea,
    dataVazio: () => ({ rows: [] }),
    resumo: (d) => {
      if (!d.rows?.length) return "";
      const rpns = d.rows.map((r) => fmeaRpn(r)).filter((v): v is number => v != null);
      const base = contar(d.rows.length, "modo de falha", "modos de falha");
      return rpns.length ? `${base} · maior RPN ${Math.max(...rpns)}` : base;
    },
  },
  fault_tree: {
    Component: ArvoreFalhas,
    dataVazio: () => ({ nodes: [] }),
    resumo: (d) => {
      const contarNos = (nodes: typeof d.nodes): number =>
        nodes.reduce((acc, n) => acc + 1 + contarNos(n.children), 0);
      const total = contarNos(d.nodes ?? []);
      const partes: string[] = [];
      if (d.topEvent?.trim()) partes.push(d.topEvent.trim());
      if (total) partes.push(contar(total, "evento", "eventos"));
      return partes.join(" · ");
    },
  },
  kepner_tregoe: {
    Component: KepnerTregoe,
    // Nasce com as 4 linhas: a matriz É / NÃO É não é editável em estrutura.
    dataVazio: () => ({ rows: KT_DIMENSIONS.map((dimension) => ({ dimension })), possibleCauses: [] }),
    resumo: (d) => {
      const preenchidas = (d.rows ?? []).filter(
        (r) => r.is?.trim() || r.isNot?.trim() || r.distinction?.trim() || r.change?.trim(),
      ).length;
      const partes: string[] = [];
      if (preenchidas) partes.push(`${preenchidas} de 4 dimensões`);
      if (d.possibleCauses?.length) partes.push(contar(d.possibleCauses.length, "causa possível", "causas possíveis"));
      const provavel = d.possibleCauses?.find((c) => c.id === d.mostProbableCauseId);
      if (provavel?.text) partes.push(`mais provável: ${provavel.text}`);
      return partes.join(" · ");
    },
  },
  rca_apollo: {
    Component: RcaApollo,
    dataVazio: () => ({ causes: [] }),
    resumo: (d) => {
      const contarNos = (nodes: typeof d.causes): number =>
        nodes.reduce((acc, n) => acc + 1 + contarNos(n.children), 0);
      const total = contarNos(d.causes ?? []);
      const partes: string[] = [];
      if (d.primaryEffect?.trim()) partes.push(d.primaryEffect.trim());
      if (total) partes.push(contar(total, "causa", "causas"));
      return partes.join(" · ");
    },
  },
  barrier_analysis: {
    Component: Barreiras,
    dataVazio: () => ({ barriers: [] }),
    resumo: (d) => {
      if (!d.barriers?.length) return "";
      const falhas = d.barriers.filter((b) => b.status && b.status !== "funcionou").length;
      const base = contar(d.barriers.length, "barreira", "barreiras");
      return falhas ? `${base} · ${falhas} falhou(ram)` : base;
    },
  },
} as never;

export function emptyAnalysisData(key: AnalysisMethodKey): AnalysisData {
  return ANALYSIS_REGISTRY[key].dataVazio();
}

/** Texto do card colapsado. "Não preenchida" quando o usuário só adicionou a tratativa. */
export function resumoAnalise(analysis: ActionPlanAnalysis): string {
  const texto = ANALYSIS_REGISTRY[analysis.key].resumo(analysis.data as never);
  return texto || "Não preenchida";
}
```

- [ ] **Step 12: Rodar e ver passar**

Run: `pnpm exec vitest run artifacts/web/tests/analises-registry.unit.test.tsx --project web-unit`
Expected: PASS

Run: `pnpm typecheck`

- [ ] **Step 13: Commit**

```bash
git add artifacts/web/src/pages/app/planos-acao/_components/analises artifacts/web/tests/analises-registry.unit.test.tsx
git commit -m "feat(web): editores estruturados das 8 tratativas + registry"
```

---

### Task 13: Hooks do cliente + estágio da timeline

**Files:**
- Modify: `artifacts/web/src/lib/action-plans-client.ts`
- Test: `artifacts/web/tests/action-plan-stage.unit.test.ts`

**Interfaces:**
- Produces: `useAllAnalysisMethods(orgId)`, `useActiveAnalysisMethods(orgId)`, `buildAnalysisMethodLabelMap(methods)`, `useActionPlanActions(orgId, planId)`, `useCreateActionPlanActionWithInvalidation(orgId, planId)`, `useUpdateActionPlanActionWithInvalidation(orgId, planId)`, `useDeleteActionPlanActionWithInvalidation(orgId, planId)`, `ACTION_STATUS_LABELS`

- [ ] **Step 1: Teste do estágio**

`artifacts/web/tests/action-plan-stage.unit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { actionPlanStageLevel } from "@/lib/action-plans-client";

const base = { rootCause: null, analyses: null, actionsTotal: 0, actionsDone: 0, status: "open" } as never;

describe("estágio na timeline", () => {
  it("uma tratativa com conteúdo promove a Planejamento", () => {
    const level = actionPlanStageLevel({
      ...base,
      analyses: [{ key: "five_whys", data: { whys: ["porque sim"] } }],
    } as never);
    expect(level).toBeGreaterThanOrEqual(1);
  });

  it("uma tratativa VAZIA não promove (só foi adicionada, não preenchida)", () => {
    const level = actionPlanStageLevel({ ...base, analyses: [{ key: "a3", data: {} }] } as never);
    expect(level).toBe(0);
  });

  it("existir ao menos uma ação promove a Planejamento", () => {
    expect(actionPlanStageLevel({ ...base, actionsTotal: 1 } as never)).toBeGreaterThanOrEqual(1);
  });

  it("ação concluída promove a Execução", () => {
    expect(actionPlanStageLevel({ ...base, actionsTotal: 2, actionsDone: 1 } as never)).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run artifacts/web/tests/action-plan-stage.unit.test.ts --project web-unit`

- [ ] **Step 3: Hooks do catálogo** (espelho de `norms-client.ts`)

Em `artifacts/web/src/lib/action-plans-client.ts`:

```ts
import {
  useListAnalysisMethods,
  getListAnalysisMethodsQueryKey,
  useListActionPlanActions,
  getListActionPlanActionsQueryKey,
  useCreateActionPlanAction,
  useUpdateActionPlanAction,
  useDeleteActionPlanAction,
  type ActionPlanAnalysisMethod,
} from "@workspace/api-client-react";

/** Catálogo inteiro (ativas + inativas). Displays = todas: um plano que já usa uma tratativa
 *  desativada precisa continuar mostrando o rótulo dela, não um "—". */
export function useAllAnalysisMethods(orgId: number) {
  return useListAnalysisMethods(orgId, {
    query: { enabled: !!orgId, queryKey: getListAnalysisMethodsQueryKey(orgId) },
  });
}

/** Só as ativas — para os seletores (criação do plano, "+ Adicionar tratativa"). Filtra no
 *  cliente sobre a mesma query: nenhuma requisição a mais. */
export function useActiveAnalysisMethods(orgId: number) {
  const q = useAllAnalysisMethods(orgId);
  const data = (q.data ?? []).filter((m) => m.active);
  return { ...q, data };
}

export function buildAnalysisMethodLabelMap(
  methods: ActionPlanAnalysisMethod[],
): Map<string, string> {
  return new Map(methods.map((m) => [m.key, m.label]));
}

export const ACTION_STATUS_LABELS: Record<string, string> = {
  open: "Pendente",
  in_progress: "Em andamento",
  completed: "Concluída",
  cancelled: "Cancelada",
};
```

Os três hooks de mutação de ação seguem o padrão de `useCreateActionPlanWithInvalidation` já existente neste arquivo: envolvem o hook gerado e, no `onSuccess`, invalidam **tanto** `getListActionPlanActionsQueryKey(orgId, planId)` **quanto** a query do plano (para `actionsTotal`/`actionsDone` e o estágio da timeline se atualizarem).

- [ ] **Step 4: Estágio da timeline**

Localizar a função de estágio (hoje em `lib/action-plans-client.ts:263-279`) e substituir o gatilho de "Planejamento" (que hoje olha `rootCause` e `plan5w2h`) por:

```ts
  // Planejamento: há análise de causa (raiz ou qualquer tratativa com conteúdo) OU já existe
  // pelo menos uma ação registrada.
  const temTratativa = (plan.analyses ?? []).some((a) => resumoAnalise(a) !== "Não preenchida");
  const planejou = Boolean(plan.rootCause?.trim()) || temTratativa || (plan.actionsTotal ?? 0) > 0;
```

e o gatilho de "Execução" passa a incluir:

```ts
  // Execução: alguma ação saiu do papel.
  const executou = (plan.actionsDone ?? 0) > 0 || plan.status === "in_progress";
```

Exportar `actionPlanStageLevel` se ela ainda não for exportada (o teste a importa).

- [ ] **Step 5: Rodar, typecheck, commit**

```bash
pnpm exec vitest run artifacts/web/tests/action-plan-stage.unit.test.ts --project web-unit
pnpm typecheck
git add artifacts/web/src/lib/action-plans-client.ts artifacts/web/tests/action-plan-stage.unit.test.ts
git commit -m "feat(web): hooks do catálogo de tratativas e das ações + estágio da timeline"
```

---

### Task 14: Ficha — seção Tratativas + Causa raiz

**Files:**
- Create: `.../planos-acao/_components/tratativas.tsx`
- Modify: `artifacts/web/src/pages/app/planos-acao/[id].tsx`
- Delete: `.../planos-acao/_components/causa-raiz.tsx`

- [ ] **Step 1: `tratativas.tsx`**

```tsx
import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ANALYSIS_REGISTRY, emptyAnalysisData, resumoAnalise } from "./analises/registry";
import type { ActionPlanAnalysis, AnalysisMethodKey } from "./analises/types";

export function Tratativas({
  analyses,
  onChange,
  /** Ativas do catálogo — o que se pode ADICIONAR. */
  metodosAtivos,
  /** Rótulo por chave, vindo do catálogo INTEIRO (incl. inativas) — displays = todas. */
  labelPorChave,
  readOnly = false,
}: {
  analyses: ActionPlanAnalysis[];
  onChange: (next: ActionPlanAnalysis[]) => void;
  metodosAtivos: Array<{ key: AnalysisMethodKey; label: string }>;
  labelPorChave: Map<string, string>;
  readOnly?: boolean;
}) {
  const [abertas, setAbertas] = useState<Set<string>>(() => new Set(analyses.map((a) => a.key)));
  const [aRemover, setARemover] = useState<AnalysisMethodKey | null>(null);

  const jaNoPlano = new Set(analyses.map((a) => a.key));
  const disponiveis = metodosAtivos.filter((m) => !jaNoPlano.has(m.key));

  const adicionar = (key: AnalysisMethodKey) => {
    onChange([...analyses, { key, data: emptyAnalysisData(key) } as ActionPlanAnalysis]);
    setAbertas((prev) => new Set(prev).add(key));
  };

  const remover = (key: AnalysisMethodKey) => {
    onChange(analyses.filter((a) => a.key !== key));
    setARemover(null);
  };

  const pedirRemocao = (analysis: ActionPlanAnalysis) => {
    // Só confirma se há trabalho para perder — remover uma tratativa em branco não merece fricção.
    if (resumoAnalise(analysis) === "Não preenchida") { remover(analysis.key); return; }
    setARemover(analysis.key);
  };

  return (
    <div className="space-y-2">
      {analyses.length === 0 && (
        <p className="text-[13px] text-muted-foreground">
          Nenhuma tratativa neste plano. Adicione o método de análise que a equipe vai usar.
        </p>
      )}

      {analyses.map((analysis) => {
        const { Component } = ANALYSIS_REGISTRY[analysis.key];
        const aberta = abertas.has(analysis.key);
        const rotulo = labelPorChave.get(analysis.key) ?? analysis.key;
        const resumo = resumoAnalise(analysis);
        const noCatalogoAtivo = metodosAtivos.some((m) => m.key === analysis.key);

        return (
          <div key={analysis.key} className="rounded-xl border bg-card/60">
            <div className="flex items-center gap-2 px-3 py-2">
              <button
                type="button"
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                onClick={() =>
                  setAbertas((prev) => {
                    const next = new Set(prev);
                    if (next.has(analysis.key)) next.delete(analysis.key);
                    else next.add(analysis.key);
                    return next;
                  })
                }
                aria-expanded={aberta}
              >
                {aberta ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <span className="shrink-0 text-[13px] font-medium">{rotulo}</span>
                {/* Uma tratativa desativada no catálogo SEGUE editável aqui: o plano pode
                    tê-la adotado antes de a empresa desligá-la. */}
                {!noCatalogoAtivo && (
                  <Badge variant="neutral" className="shrink-0 text-[10px]">Desativada no catálogo</Badge>
                )}
                {!aberta && (
                  <span className="truncate text-[12px] text-muted-foreground">— {resumo}</span>
                )}
              </button>
              {!readOnly && (
                <Button type="button" variant="ghost" size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground"
                  aria-label={`Remover tratativa ${rotulo}`}
                  onClick={() => pedirRemocao(analysis)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            {aberta && (
              <div className="border-t px-3 py-3">
                <Component
                  data={analysis.data as never}
                  readOnly={readOnly}
                  onChange={(data: never) =>
                    onChange(
                      analyses.map((a) =>
                        a.key === analysis.key ? ({ key: a.key, data } as ActionPlanAnalysis) : a,
                      ),
                    )
                  }
                />
              </div>
            )}
          </div>
        );
      })}

      {!readOnly && disponiveis.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="text-xs">
              <Plus className="mr-1 h-3.5 w-3.5" />
              Adicionar tratativa
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {disponiveis.map((m) => (
              <DropdownMenuItem key={m.key} onSelect={() => adicionar(m.key)}>
                {m.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {aRemover && (
        <ConfirmDialog
          open
          title="Remover tratativa?"
          description={`A análise registrada em "${labelPorChave.get(aRemover) ?? aRemover}" será apagada deste plano. Você pode restaurá-la depois pelo histórico de versões.`}
          confirmLabel="Remover"
          onConfirm={() => remover(aRemover)}
          onCancel={() => setARemover(null)}
        />
      )}
    </div>
  );
}
```

> `ConfirmDialog`: usar o componente de confirmação já existente no projeto. Localize-o com `grep -rn "ConfirmDialog\|AlertDialog" artifacts/web/src/components/ui | head` e adapte as props ao que ele expõe.

- [ ] **Step 2: Ligar na ficha**

Em `[id].tsx`:
1. No estado do form (`plan5w2h`, `rootCause`, `rootCauseWhys`): remover `plan5w2h` e `rootCauseWhys`; acrescentar `analyses: ActionPlanAnalysis[]`.
2. Na hidratação (linhas 193-195): trocar por `analyses: plan.analyses ?? []` e manter `rootCause`.
3. Em `buildPayload` (linhas 214, 228-230): remover `plan5w2h` e `rootCauseWhys`; acrescentar `analyses: f.analyses.length ? f.analyses : null`.
4. Na seção `etapa-planejamento` (linhas 624-678): remover `<Plano5W2H>` e `<CausaRaiz>`, e colocar:

```tsx
<Tratativas
  analyses={form.analyses}
  onChange={(analyses) => patch("analyses", analyses)}
  metodosAtivos={metodosAtivos}
  labelPorChave={labelPorChave}
  readOnly={!canEdit}
/>

<div className="mt-4">
  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
    Causa raiz identificada
  </label>
  <AutoGrowTextarea
    value={form.rootCause}
    onChange={(e) => patch("rootCause", e.target.value)}
    placeholder="Conclusão da análise — a causa fundamental a ser tratada."
    readOnly={!canEdit}
  />
</div>
```

com, no topo do componente:

```tsx
const { data: todasTratativas = [] } = useAllAnalysisMethods(orgId);
const metodosAtivos = todasTratativas.filter((m) => m.active);
const labelPorChave = buildAnalysisMethodLabelMap(todasTratativas);
```

5. Apagar `_components/causa-raiz.tsx`.

- [ ] **Step 3: Typecheck e commit**

```bash
pnpm typecheck
git add -A artifacts/web/src/pages/app/planos-acao
git commit -m "feat(web): seção Tratativas na ficha do plano de ação"
```

---

### Task 15: Ficha — seção Ações

**Files:**
- Create: `.../planos-acao/_components/acoes-do-plano.tsx`
- Modify: `[id].tsx`
- Delete: `.../planos-acao/_components/plano-5w2h.tsx`
- Test: `artifacts/web/tests/acoes-do-plano.unit.test.tsx`

- [ ] **Step 1: Teste**

`artifacts/web/tests/acoes-do-plano.unit.test.tsx` — cobrir: (a) linha vencida e não concluída mostra o badge "Atrasada"; (b) linha concluída não mostra; (c) o cabeçalho mostra "1 de 2 concluídas". Usar `@testing-library/react` e um mock dos hooks de mutação.

- [ ] **Step 2: `acoes-do-plano.tsx`**

Tabela com colunas **O quê** (Input), **Quem** (`SearchableSelect` sobre `useListOrgUsers`), **Quando** (`<Input type="date">`), **Status** (`SearchableSelect` com `ACTION_STATUS_LABELS`), e um chevron que expande a linha revelando **Por quê / Onde / Como / Quanto / Observações**.

Regras:
- `+ Incluir ação` chama o `POST` imediatamente (a linha nasce vazia — a ficha inteira salva parcial).
- Cada campo faz `PATCH` **debounced em 1s**, por linha, **independente do autosave do plano** — os dois não compartilham payload.
- **Atrasada** = `dueDate < hoje` e status ∈ {Pendente, Em andamento} → badge destrutivo.
- Cabeçalho: `Ações · {done} de {total} concluídas`.
- Remover pede confirmação se a linha tiver algum campo preenchido.
- `id={`acao-${action.id}`}` em cada linha — é a âncora do link vindo de "Suas Pendências".
- Plano encerrado → tudo `readOnly`.

- [ ] **Step 3: Ligar na ficha, apagar `plano-5w2h.tsx`, e adicionar a guarda de conclusão**

Ao concluir o plano (`status = completed`) com ações em aberto: **avisar e pedir confirmação**, não bloquear ("Este plano tem N ação(ões) não concluída(s). Concluir mesmo assim?").

- [ ] **Step 4: Typecheck, testes, commit**

```bash
pnpm typecheck && pnpm exec vitest run artifacts/web/tests/acoes-do-plano.unit.test.tsx --project web-unit
git add -A artifacts/web/src/pages/app/planos-acao artifacts/web/tests/acoes-do-plano.unit.test.tsx
git commit -m "feat(web): seção Ações na ficha (substitui o 5W2H único)"
```

---

### Task 16: Diálogo de criação — campo Tratativas

**Files:**
- Modify: `.../planos-acao/_components/nova-acao-dialog.tsx`

- [ ] **Step 1:** Acrescentar ao `FormState`: `analysisKeys: AnalysisMethodKey[]`.
- [ ] **Step 2:** Inicializar com os padrões do catálogo:

```tsx
const { data: ativas = [] } = useActiveAnalysisMethods(orgId);
// Pré-marca as tratativas que o admin definiu como padrão da empresa. Reexecuta quando o
// catálogo chega (ele carrega depois do primeiro render do diálogo).
useEffect(() => {
  if (!open) return;
  setForm((f) => ({ ...f, analysisKeys: ativas.filter((m) => m.isDefault).map((m) => m.key) }));
}, [open, ativas]);
```

- [ ] **Step 3:** Campo de multi-seleção (checkboxes sobre as ativas — são 8 no máximo, não precisa de busca), abaixo do GUT, rotulado **Tratativas**, com o texto de apoio *"Os métodos de análise que este plano vai usar. Dá para mudar depois na ficha."*
- [ ] **Step 4:** No `submit`, enviar:

```tsx
analyses: form.analysisKeys.map((key) => ({ key, data: emptyAnalysisData(key) })),
```

- [ ] **Step 5:** Atualizar os textos do diálogo (título "Novo plano de ação", botão "Criar plano de ação", subtítulo "Detalhe as tratativas, as ações e a eficácia na ficha.") e o toast ("Plano de ação criado").
- [ ] **Step 6:** `pnpm typecheck` e commit.

---

### Task 17: Configurações → Sistema → aba "Tratativas"

**Files:**
- Create: `artifacts/web/src/components/settings/OrganizationAnalysisMethodsSettingsSection.tsx`
- Modify: `artifacts/web/src/pages/app/configuracoes/sistema.tsx`

- [ ] **Step 1:** Copiar a estrutura de `OrganizationNormsSettingsSection.tsx`, **sem** o formulário de criação (o catálogo é semeado — não há POST) e **sem** exclusão. Por linha: rótulo editável (lápis), switch **Ativo**, switch **Padrão**, e setas de reordenar.
- [ ] **Step 2:** O switch **Padrão** fica desabilitado quando a tratativa está inativa. Desativar uma tratativa marcada como padrão desmarca o padrão (o servidor já faz — a UI só precisa refletir a resposta).
- [ ] **Step 3:** Texto de apoio da seção:

> Métodos de análise de causa que os planos de ação da sua organização podem usar. Os marcados como **padrão** já vêm pré-selecionados ao criar um plano. Desative em vez de excluir: **planos que já usam uma tratativa continuam exibindo-a**.

- [ ] **Step 4:** Registrar a aba em `sistema.tsx`:

```tsx
type SystemTab = "users" | "norms" | "tratativas" | "appearance";
// ...
{isOrgAdmin && <TabsTrigger value="tratativas">Tratativas</TabsTrigger>}
// ...
{isOrgAdmin && (
  <TabsContent value="tratativas">
    <OrganizationAnalysisMethodsSettingsSection />
  </TabsContent>
)}
```

- [ ] **Step 5:** `pnpm typecheck` e commit.

---

### Task 18: Diff de versões + aterrissagem do draft de IA

**Files:**
- Modify: `.../planos-acao/_components/planning-versions.ts`
- Modify: `.../planos-acao/_components/merge-draft.ts`
- Modify: `[id].tsx` (o `handleSuggest`)
- Test: `artifacts/web/tests/planning-versions-analyses.unit.test.ts`

- [ ] **Step 1: Teste do diff**

Cobrir: tratativa **adicionada** (`"Ishikawa + 5 Porquês adicionada"`), **removida**, e **editada** (usa `resumoAnalise` do antes e do depois). E que remover `plan5w2h`/`rootCauseWhys` do diff não quebra as versões antigas já gravadas no banco — **entradas antigas do activity log ainda têm `plan5w2h` no `to`**, então o renderizador precisa tolerar o campo legado sem explodir (renderiza-o como "Plano 5W2H (formato anterior)").

- [ ] **Step 2:** Estender `diffPlanningFields` com um renderizador de `analyses` (comparando por `key`, usando `resumoAnalise`) e um caso de compatibilidade para o `plan5w2h` legado.

- [ ] **Step 3: Draft de IA**

O `ai-draft` do servidor **não muda** (segue devolvendo 5W2H + porquês). No `handleSuggest` de `[id].tsx`:
- os **porquês** vão para a tratativa `five_whys` — criando-a se ela não estiver no plano;
- o **5W2H** vira a **primeira ação** (um `POST`) — **só se o plano ainda não tem nenhuma ação**;
- o merge segue **não-destrutivo**: nada que já esteja preenchido é sobrescrito.

- [ ] **Step 4:** Testes, typecheck, commit.

---

### Task 19: Renomeação "ação" → "plano de ação" na UI

**Files:** `criar-acao-button.tsx`, `acoes-vinculadas.tsx`, `lista-screen.tsx`, `painel-executivo.tsx`, `painel-operacional.tsx`, `auditoria-screen.tsx`, `eficacia-screen.tsx`, `planos-acao.tsx`, e o `ctaLabel` do provider de pendências do plano.

**Somente texto.** Nada de renomear rota, tabela, tipo ou `operationId`.

- [ ] **Step 1:** Achar as ocorrências:

```bash
grep -rn "Criar ação\|Nova ação\|Ação criada\|Erro ao criar ação\|título da ação" artifacts/web/src artifacts/api-server/src
```

- [ ] **Step 2:** Trocar por "plano de ação" **onde o termo se refere ao container**. Onde ele se refere a um item interno (o novo), continua "ação". Cuidado com `SOURCE_MODULE_LABELS` e com o hub "Gestão de Ações" — **este NÃO muda** (é o termo da cliente).
- [ ] **Step 3:** Rodar `pnpm test:unit` inteiro — testes que fazem asserção em texto de botão vão quebrar; ajustá-los.
- [ ] **Step 4:** `pnpm typecheck` e commit.

---

### Task 20: Migração de dados

**Files:**
- Create: `scripts/src/migrate/tratativas-e-acoes-backfill.ts`
- Test: `tests/api-server/tratativas-backfill.integration.test.ts`

- [ ] **Step 1: Testes do backfill**

Cobrir, num banco de teste:
- `root_cause_whys` não vazio → vira `analyses: [{ key: "five_whys", data: { whys } }]`; `root_cause` **não é tocado**.
- `plan_5w2h` não vazio → cria **uma** ação: `what` ← `plan5w2h.what` (ou o `title` do plano se vazio); `why`/`whereAt`/`how`/`howMuch` verbatim.
- `plan5w2h.who` que casa (case-insensitive) com o nome de um usuário da org → vira `responsibleUserId`.
- `plan5w2h.who` **sem** match (ex.: `"Setor de Qualidade"`) → cai no `responsibleUserId` **do plano** **e** o texto original vai para `notes`.
- `plan5w2h.when` não parseável (ex.: `"Julho/26"`) → cai no `dueDate` **do plano** **e** vai para `notes`.
- Plano já `completed` → a ação nasce `completed`.
- **Idempotência:** rodar duas vezes não duplica ação nem sobrescreve `analyses` já preenchido.

- [ ] **Step 2: O script**

Três fases, nesta ordem, cada uma idempotente e com relatório no fim (planos migrados, `who` não resolvidos, `when` não parseados):

```ts
// 1. Semente: ensureAnalysisMethods(orgId) para TODAS as organizações.
// 2. Tratativas: plano com root_cause_whys não vazio E analyses vazio
//    → analyses = [{ key: "five_whys", data: { whys } }]
// 3. Ações: plano com plan_5w2h não vazio E sem nenhuma linha em action_plan_actions
//    → cria 1 ação, preservando em `notes` tudo que não pôde ser resolvido.
//      NADA de dado do usuário é descartado em silêncio.
```

- [ ] **Step 3: DDL de produção**

`docs/superpowers/plans/ddl-2026-07-14-tratativas-e-acoes.sql` — DDL **cirúrgico** para o Neon (⚠️ **não** rodar `pnpm --filter @workspace/db push`: a branch pode estar atrasada em relação ao schema de produção e o push tentaria dropar colunas de outras branches):

```sql
CREATE TYPE action_plan_analysis_method_key AS ENUM (
  'five_whys','ishikawa','a3','fmea','fault_tree','kepner_tregoe','rca_apollo','barrier_analysis'
);

CREATE TABLE action_plan_analysis_methods (
  id serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key action_plan_analysis_method_key NOT NULL,
  label text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX action_plan_analysis_method_org_key_unique
  ON action_plan_analysis_methods (organization_id, key);

ALTER TABLE action_plans ADD COLUMN analyses jsonb;

CREATE TABLE action_plan_actions (
  id serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  action_plan_id integer NOT NULL REFERENCES action_plans(id) ON DELETE CASCADE,
  what text,
  why text,
  where_at text,
  how text,
  how_much text,
  responsible_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  due_date timestamptz,
  status action_plan_status NOT NULL DEFAULT 'open',
  completed_at timestamptz,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX action_plan_actions_plan_idx ON action_plan_actions (action_plan_id, sort_order);
CREATE INDEX action_plan_actions_org_responsible_idx
  ON action_plan_actions (organization_id, responsible_user_id, status);

-- ALTER TYPE ... ADD VALUE não roda dentro de transação; execute uma por vez.
ALTER TYPE action_plan_activity_action ADD VALUE IF NOT EXISTS 'action_added';
ALTER TYPE action_plan_activity_action ADD VALUE IF NOT EXISTS 'action_updated';
ALTER TYPE action_plan_activity_action ADD VALUE IF NOT EXISTS 'action_removed';
```

**`plan_5w2h` e `root_cause_whys` NÃO são derrubadas** — ficam como rede de rollback, para um follow-up.

- [ ] **Step 4:** Rodar os testes contra o banco de teste (`TEST_ENV=integration`), typecheck, commit.

> **Não aplicar em produção nesta task.** A aplicação do DDL + backfill no Neon é um passo manual, feito com o usuário, depois do merge do PR.

---

### Task 21: E2E

**Files:**
- Create: `e2e/tratativas-e-acoes.spec.ts`

- [ ] **Step 1:** Um fluxo único, numa org `E2E` isolada:
  1. Criar plano de ação — conferir que **5 Porquês** vem pré-marcado (o único `isDefault` da semente).
  2. Na ficha, preencher os porquês; adicionar **Ishikawa**, lançar causas em duas das 6M, marcar a mais provável.
  3. Adicionar **FMEA**, preencher uma linha com S=8, O=4, D=3 e conferir que a tela mostra **96** (RPN calculado, não digitado).
  4. Preencher **Causa raiz identificada**.
  5. `+ Incluir ação` duas vezes; preencher "O quê", responsável e prazo em ambas; concluir uma.
  6. Recarregar a página e conferir que tudo persistiu e que o cabeçalho diz **"1 de 2 concluídas"**.
- [ ] **Step 2:** `pnpm test:e2e` (precisa de `DATABASE_URL` e `JWT_SECRET`). Commit.

---

### Task 22: Fechamento e entrega

- [ ] **Step 1: Verificação completa** (evidência antes de qualquer afirmação de "pronto")

```bash
pnpm typecheck
pnpm test:unit
TEST_ENV=integration pnpm exec vitest run --project integration
pnpm build
```

Todos precisam passar. Se algum falhar, **corrigir antes de seguir** — não abrir PR com verde imaginário.

- [ ] **Step 2: Revisão de código** — invocar `superpowers:requesting-code-review` sobre o diff completo do branch.

- [ ] **Step 3: Diário de bordo**

```bash
python3 scripts/diario-add.py --modulo "Planos de Ação" --titulo "Tratativas configuráveis e múltiplas ações por plano" --file <entrada.md>
```

Conteúdo em PT-BR: o que foi feito, por quê, impacto, status, validações rodadas. **Fiel** — registrar também o que ficou pendente (aplicação do DDL/backfill em produção, `DROP COLUMN` das colunas legadas).

- [ ] **Step 4: PR (draft)**

```bash
git push -u origin worktree-feat-tratativas-plano-acao
gh pr create --draft --title "feat(planos-acao): tratativas configuráveis + múltiplas ações por plano" --body "..."
```

O corpo do PR deve destacar: as 8 tratativas com editor estruturado; o catálogo por empresa; a substituição do 5W2H único pela tabela de ações rastreáveis; **a migração de produção ainda não aplicada** (DDL + backfill, passo manual pós-merge); e a perda deliberada do "restaurar 5W2H" (trocada por trilha de auditoria por ação).

**Nunca** fazer merge sem autorização explícita do usuário, por PR.

---

## Self-Review (feita)

**Cobertura do spec:** §4.1 → T1/T6 · §4.2-4.3 → T1/T3 · §4.4 → T2 · §4.5 → T2/T9 · §5.1 → T6 · §5.2 → T9 · §5.3 → T8 · §5.4 → T5 · §6.1-6.2 → T11/T12 · §6.3 → T14/T15 · §6.4 → T16 · §6.5 → T19 · §6.6 → T17 · §6.7 → T13 · §6.8 (IA) → T18 · §6.9 (estágio) → T13 · §7 (versionamento) → T4/T18 · §8 (migração) → T20 · §9 (pendências/notificação) → T9/T10 · §10 (testes) → distribuídos + T21.

**Consistência de tipos:** `whereAt` (nunca `where`) em schema, OpenAPI, serializer, rotas e backfill. `key` (nunca `methodId`) como referência da tratativa em todo o caminho. `emptyAnalysisData` existe nos dois lados (servidor em T3, front em T12) e ambos os testes exigem que a saída passe na validação — se divergirem, o teste quebra.

**Ordem de dependência:** T4 e T5 deixam o typecheck quebrado de propósito (contrato mudou antes dos consumidores); T8 fecha o servidor e T14/T15 fecham o front. Isso está anotado nas tasks para o implementador não tentar "consertar" fora de hora.





