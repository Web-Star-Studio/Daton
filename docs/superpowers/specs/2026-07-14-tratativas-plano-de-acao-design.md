# Plano de Ação — tratativas configuráveis + múltiplas ações

**Data:** 2026-07-14
**Status:** Design aprovado, pronto para plano de implementação
**Origem:** pedidos da cliente (Transportes Gabardo)

---

## 1. Problema

Duas lacunas apontadas pela cliente, ambas na seção **Planejamento** da ficha do plano:

**(A) "Apenas causa raiz é muito pouco."** O plano oferece hoje **um único método de análise de
causa** — os 5 Porquês. A cliente pediu sete métodos adicionais:
Ishikawa + 5 Porquês, A3, FMEA, Árvore de Falhas, Kepner-Tregoe, RCA Apollo, Análise de Barreiras.

**(B) "Dentro de um plano de ação pode ter várias ações."** Hoje o plano tem **um** bloco 5W2H
único — ou seja, o plano *é* uma ação só. A cliente quer um `+ Incluir ação` para registrar
quantas ações forem necessárias para tratar aquela não conformidade.

As duas mexem no mesmo lugar (a seção Planejamento, o bloco versionado `planning`, o autosave da
ficha), por isso são um único design e um único PR.

Requisitos transversais da conversa:

- Cada empresa **liga/desliga** quais tratativas existem para ela; a seleção na criação do plano
  vem **pré-marcada** com as marcadas como padrão.
- Cada método deve ter a **sua forma real** (Ishikawa em 6M, FMEA com RPN calculado,
  Kepner-Tregoe em matriz É/NÃO É, árvores com portas E/OU) — não caixas de texto genéricas.
- **Evitar texto livre onde existir vocabulário fechado.** Categoria, escala, tipo, status, porta,
  responsável e prazo são `enum` / select / datepicker. Texto livre só onde o conteúdo *é* a
  análise.

## 2. Estado atual

- `lib/db/src/schema/action-plans.ts:163` — `action_plans` guarda a análise em **duas colunas**
  (`rootCause` text, `rootCauseWhys` jsonb `string[]`) e o plano em **uma** (`plan5w2h` jsonb,
  objeto único). Responsável: `responsibleUserId` (FK `users`). Prazo: `dueDate`.
- Status do plano: `actionPlanStatusEnum` = `open | in_progress | completed | cancelled`
  (`action-plans.ts:110`).
- Satélites: `action_plan_evidences`, `action_plan_comments`, `action_plan_activity_log` —
  **todos carregam `organizationId`** e `actionPlanId` com `onDelete: cascade`.
- `artifacts/web/src/pages/app/planos-acao/[id].tsx:624` — seção Planejamento renderiza
  `<Plano5W2H>` + `<CausaRaiz>` (`_components/causa-raiz.tsx`, `MAX_WHYS = 5`).
- `_components/nova-acao-dialog.tsx` — o diálogo de criação **não tem** campo de análise nem de
  ação; o subtítulo manda detalhar na ficha.
- `services/action-plans/planning.ts` — o "bloco de planejamento" (`plan5w2h` + `rootCause` +
  `rootCauseWhys`) é **um campo lógico único**, normalizado na escrita e versionado no activity
  log sob `changes.fields.planning` (`{ from, to }`) — é o que dá o "Versões (n)" e o restaurar.
- Contratos **spec-first**: `lib/api-spec/openapi.yaml` → Orval → `lib/api-zod` +
  `lib/api-client-react`. `lib/action-plans-client.ts` é wrapper fino sobre os hooks gerados.
- `services/action-plans/derivation.ts:69` — plano vindo de NC **herda o `rootCause` da NC**.
- `lib/action-plans-client.ts:266` — `rootCause` preenchido **promove o plano ao estágio
  "Planejamento"**.
- `services/pendencias/providers/action-plans.ts` — pendência por **plano** cujo
  `responsibleUserId` é o usuário e status ∈ {open, in_progress}.

Molde para o catálogo por empresa: **Catálogo de Normas** (`regulatory_norms` — label/active/
sortOrder org-scoped, seed na criação da org, CRUD admin-only, soft-delete, regra
"pickers = ativas / displays = todas"; `OrganizationNormsSettingsSection.tsx` + aba em
`pages/app/configuracoes/sistema.tsx`).

## 3. Decisões de desenho

| # | Decisão | Motivo |
|---|---|---|
| **D1** | Editor **estruturado nativo** por método (não seções de texto, não diagrama gráfico) | O valor do sistema é guiar a prática ISO e produzir registro auditável; diagrama é caro e não acrescenta ao registro |
| **D2** | Catálogo de tratativas **semeado e PATCH-only** (sem POST/DELETE) | A estrutura de cada método vive no código; deixar a empresa criar um método sem editor produziria um método quebrado |
| **D3** | O plano referencia a tratativa por **`key` (enum fechado)**, não por id | Diferente de Normas (rótulo é texto livre do usuário → precisa de id). Aqui a chave é estável: renomear propaga sozinho, desativar não quebra plano antigo, e evita a classe de bug "número × string" |
| **D4** | `rootCause` ("Causa raiz identificada") permanece **campo do plano**, não de cada método | A conclusão é uma só, qualquer que seja o método. Preserva a herança da NC e a regra de estágio |
| **D5** | `rootCauseWhys` e `plan5w2h` são **migrados e aposentados** | Viram, respectivamente, a tratativa `five_whys` e a primeira linha de `action_plan_actions`. Colunas ficam no banco sem uso (rede de rollback), derrubadas em follow-up |
| **D6** | Semente das tratativas: **as 8 ativas, só `five_whys` como padrão** | Comportamento de hoje não muda para ninguém; a empresa adota os demais quando quiser |
| **D7** | **A3 reduzido** (Contexto, Situação atual, Meta, Análise, Contramedidas) | "Plano" e "Acompanhamento" do A3 clássico **são** as Ações e a Eficácia do próprio plano; duplicar faria digitar a mesma coisa duas vezes |
| **D8** | 5 **primitivos** de UI + 8 adaptadores finos | Composição tipada; método novo custa um adaptador, não uma tela |
| **D9** | Padrão de tratativa é **um só para a empresa** (não por origem do plano) | Configurar 11 origens × 8 métodos é uma matriz que a cliente não vai manter |
| **D10** | Ações vão para **tabela própria** (`action_plan_actions`), não para um jsonb | Cada ação tem responsável (FK), prazo e status — e precisa ser **consultável** por "Suas Pendências" e por atraso. Array jsonb não indexa |
| **D11** | Ação = linha 5W2H **rastreável**: "Quem" é um usuário do sistema (select), "Quando" é uma data, e há status por ação | O princípio "sem texto livre onde há vocabulário fechado". Sem isso, ninguém é cobrado e nada vence |
| **D12** | UI: o container passa a se chamar **"Plano de ação"**; os itens de dentro são as **"Ações"** | Hoje o plano se chama "ação" na UI — com ações dentro, "ação" significaria duas coisas |
| **D13** | Ação vira **pendência própria**; a pendência do plano continua para o responsável do plano | São coisas diferentes: conduzir o plano vs executar uma ação. Quem acumula os dois papéis vê os dois itens |
| **D14** | O bloco versionado `planning` passa a ser `{ rootCause, analyses }`. **Ações têm trilha de auditoria própria** no activity log, não restauração por snapshot | Restaurar um blob de ações apagaria status e conclusões reais. Trilha por ação (criada/alterada/concluída/removida) é mais auditável — ver §7 |
| **D15** | IA ("Sugerir plano") continua sugerindo só 5W2H + 5 porquês | Fora de escopo ensinar a IA FMEA/KT/árvore. O draft passa a virar a **primeira ação** + a tratativa `five_whys` |

## 4. Modelo de dados

### 4.1 Catálogo de tratativas — `action_plan_analysis_methods` (tabela nova)

```ts
// lib/db/src/schema/action-plan-analysis-methods.ts

export const actionPlanAnalysisMethodKeyEnum = pgEnum(
  "action_plan_analysis_method_key",
  ["five_whys", "ishikawa", "a3", "fmea", "fault_tree", "kepner_tregoe", "rca_apollo", "barrier_analysis"],
);

export const actionPlanAnalysisMethodsTable = pgTable(
  "action_plan_analysis_methods",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id").notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    key: actionPlanAnalysisMethodKeyEnum("key").notNull(),
    label: text("label").notNull(),                       // renomeável pela empresa
    active: boolean("active").notNull().default(true),
    isDefault: boolean("is_default").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: ..., updatedAt: ...($onUpdate),
  },
  (table) => [
    uniqueIndex("action_plan_analysis_method_org_key_unique").on(table.organizationId, table.key),
  ],
);
```

Sem POST e sem DELETE (D2): as 8 linhas existem sempre, por organização.

**Semente — `ensureAnalysisMethods(orgId)`**
(`services/action-plans/analysis-methods/defaults.ts`), idempotente
(`onConflictDoNothing` em `(organizationId, key)`). Roda:
- no **registro da organização** (`routes/auth.ts`, junto de `ensureDefaultNorms`);
- **preguiçosamente no `GET`** do catálogo (org que ainda não passou pelo backfill nunca vê lista vazia);
- num **script de backfill** para as orgs de produção. Método novo lançado no futuro entra nas
  orgs existentes só rodando o backfill de novo.

| key | label | active | isDefault | sortOrder |
|---|---|---|---|---|
| `five_whys` | 5 Porquês | ✓ | **✓** | 0 |
| `ishikawa` | Ishikawa + 5 Porquês | ✓ | — | 1 |
| `a3` | A3 | ✓ | — | 2 |
| `fmea` | FMEA | ✓ | — | 3 |
| `fault_tree` | Árvore de Falhas | ✓ | — | 4 |
| `kepner_tregoe` | Kepner-Tregoe | ✓ | — | 5 |
| `rca_apollo` | RCA Apollo | ✓ | — | 6 |
| `barrier_analysis` | Análise de Barreiras | ✓ | — | 7 |

### 4.2 Tratativas no plano — coluna `analyses`

```ts
// action_plans
analyses: jsonb("analyses").$type<ActionPlanAnalysis[]>(),

export type ActionPlanAnalysis =
  | { key: "five_whys";        data: FiveWhysData }
  | { key: "ishikawa";         data: IshikawaData }
  | { key: "a3";               data: A3Data }
  | { key: "fmea";             data: FmeaData }
  | { key: "fault_tree";       data: FaultTreeData }
  | { key: "kepner_tregoe";    data: KepnerTregoeData }
  | { key: "rca_apollo";       data: RcaApolloData }
  | { key: "barrier_analysis"; data: BarrierAnalysisData };
```

- **Ordem** = ordem do array (ordem em que o usuário adicionou).
- **No máximo uma tratativa por `key`** por plano (invariante validada no servidor).
- `rootCause` permanece como está: a **causa raiz identificada** do plano (D4).
- `rootCauseWhys` deixa de ser lida/escrita após o backfill (D5).

### 4.3 Formato de cada tratativa

Todos os campos são opcionais no armazenamento (salva-se em progresso; nada é obrigatório para
salvar). Ids de linha/nó são strings geradas no cliente — necessários para seleção e reordenação
estáveis.

```ts
// 1. 5 Porquês — cadeia ordenada, máx. 5 (idêntico ao comportamento atual)
type FiveWhysData = { whys: string[] };

// 2. Ishikawa + 5 Porquês — causas agrupadas nas 6M; escolhe-se a mais provável e ela puxa os porquês
type IshikawaCategory = "metodo" | "maquina" | "mao_de_obra" | "material" | "medicao" | "meio_ambiente";
type IshikawaData = {
  causes: Array<{ id: string; category: IshikawaCategory; text: string }>;
  selectedCauseId?: string;   // a causa mais provável, alvo dos 5 porquês
  whys: string[];             // máx. 5
};

// 3. A3 — reduzido (D7). Plano e Acompanhamento são as Ações e a Eficácia do próprio plano.
type A3Data = {
  background?: string;        // Contexto
  currentState?: string;      // Situação atual
  goal?: string;              // Meta
  analysis?: string;          // Análise
  countermeasures?: string;   // Contramedidas
};

// 4. FMEA — S, O e D são selects 1..10 com a escala descrita.
//    RPN é CALCULADO (S×O×D): nunca digitado, nunca persistido.
type FmeaScale = 1|2|3|4|5|6|7|8|9|10;
type FmeaData = {
  rows: Array<{
    id: string;
    failureMode?: string; effect?: string; severity?: FmeaScale;
    cause?: string; occurrence?: FmeaScale;
    currentControl?: string; detection?: FmeaScale;
    recommendedAction?: string;
  }>;
};

// 5. Árvore de Falhas — hierarquia; a porta só faz sentido em nó com filhos.
type FaultTreeNode = { id: string; text?: string; gate: "AND" | "OR"; children: FaultTreeNode[] };
type FaultTreeData = { topEvent?: string; nodes: FaultTreeNode[] };

// 6. Kepner-Tregoe — as 4 dimensões são LINHAS FIXAS (não editáveis, não removíveis).
type KTDimension = "o_que" | "onde" | "quando" | "extensao";
type KepnerTregoeData = {
  rows: Array<{ dimension: KTDimension; is?: string; isNot?: string; distinction?: string; change?: string }>;
  possibleCauses: Array<{ id: string; text?: string; verification?: string; verified?: boolean }>;
  mostProbableCauseId?: string;
};

// 7. RCA Apollo — todo efeito tem causas de Condição e de Ação, recursivamente.
type RcaApolloNode = {
  id: string; text?: string; type: "condition" | "action"; evidence?: string; children: RcaApolloNode[];
};
type RcaApolloData = { primaryEffect?: string; causes: RcaApolloNode[] };

// 8. Análise de Barreiras — tipo e status são selects.
type BarrierType = "fisica" | "administrativa" | "humana" | "procedimental";
type BarrierStatus = "ausente" | "falhou" | "ineficaz" | "funcionou";
type BarrierAnalysisData = {
  hazard?: string;   // Perigo / fonte
  target?: string;   // Alvo exposto
  barriers: Array<{ id: string; name?: string; type?: BarrierType; status?: BarrierStatus; failureReason?: string }>;
};
```

Vocabulários fechados que precisam de rótulo na UI (constantes no front, não no banco):

- **FMEA** — Severidade 1–10, Ocorrência 1–10, Detecção 1–10, cada nível com sua descrição no
  select (ex.: Detecção `10 = detecção quase impossível` … `1 = detecção quase certa`).
  Alerta visual quando **RPN ≥ 100**.
- **Ishikawa 6M** — Método, Máquina, Mão de obra, Material, Medição, Meio ambiente.
- **KT** — O quê (identidade), Onde (localização), Quando (tempo), Extensão (magnitude).

### 4.4 Ações do plano — `action_plan_actions` (tabela nova)

```ts
// lib/db/src/schema/action-plans.ts (junto dos demais satélites)

export const actionPlanActionsTable = pgTable(
  "action_plan_actions",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
    actionPlanId: integer("action_plan_id").notNull()
      .references(() => actionPlansTable.id, { onDelete: "cascade" }),
    // ─── 5W2H da ação ────────────────────────────────────────────────────────
    // Todos anuláveis: a ficha salva parcial o tempo todo (mesmo contrato do resto do plano).
    what: text("what"),                              // O quê
    why: text("why"),                                // Por quê
    whereAt: text("where_at"),                       // Onde — `where` é palavra reservada em SQL
    how: text("how"),                                // Como
    howMuch: text("how_much"),                       // Quanto (custo, texto livre)
    responsibleUserId: integer("responsible_user_id")   // Quem   → usuário do sistema (D11)
      .references(() => usersTable.id, { onDelete: "set null" }),
    dueDate: timestamp("due_date", { withTimezone: true }),   // Quando → data (D11)
    // ─── Execução ────────────────────────────────────────────────────────────
    status: actionPlanStatusEnum("status").notNull().default("open"),   // reusa o enum do plano
    completedAt: timestamp("completed_at", { withTimezone: true }),
    notes: text("notes"),                            // Observações (também guarda o legado — §8)
    sortOrder: integer("sort_order").notNull().default(0),
    createdByUserId: integer("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: ..., updatedAt: ...($onUpdate),
  },
  (table) => [
    index("action_plan_actions_plan_idx").on(table.actionPlanId, table.sortOrder),
    // índice que serve "Suas Pendências" e o cálculo de atraso:
    index("action_plan_actions_org_responsible_idx")
      .on(table.organizationId, table.responsibleUserId, table.status),
  ],
);
```

- Status reusa `actionPlanStatusEnum` (`open | in_progress | completed | cancelled`) — o mesmo
  vocabulário e os mesmos rótulos já existentes no front (Pendente / Em andamento / Concluída /
  Cancelada). Nenhum enum novo.
- **`what` é anulável.** `+ Incluir ação` faz o `POST` na hora e a linha nasce vazia — a ficha
  inteira já funciona assim (salva parcial, o usuário volta depois). A linha sem `what` aparece
  marcada como incompleta na UI, e **concluir** uma ação exige `what` preenchido.
- `completedAt` é gravado pelo servidor quando o status vira `completed` (e limpo se reabrir) —
  alimenta o `listCompletedToday` das pendências.
- **Ação atrasada** = `dueDate < hoje` e `status ∈ {open, in_progress}`. Derivado, não persistido.
- `plan5w2h` deixa de ser lida/escrita após o backfill (D5).
- Os campos de plano `responsibleUserId` e `dueDate` **continuam**: são o dono/coordenador do
  plano e o prazo global. Não se confundem com os da ação.

### 4.5 Activity log

`actionPlanActivityActionEnum` ganha três valores (`ALTER TYPE … ADD VALUE` em produção):
`action_added`, `action_updated`, `action_removed`.

`ActionPlanActivityChanges` ganha uma variante para ação, com o `what` snapshotado (o log precisa
sobreviver à remoção da linha, como já faz com `userName`):

```ts
| { kind: "action"; actionId: number; what: string;
    fields?: Record<string, { from: unknown; to: unknown }> }
```

Mudança de status de uma ação é registrada como `action_updated` com
`fields.status = { from, to }` — a UI a rotula como "Ação concluída" quando `to === "completed"`.

## 5. API

### 5.1 Catálogo de tratativas (rotas novas)

`routes/action-plan-analysis-methods.ts`, registrado em `routes/index.ts` atrás de
`requireAuth, requireCompletedOnboarding`.

| Rota | Auth | Comportamento |
|---|---|---|
| `GET /organizations/:orgId/action-plan-analysis-methods` | `requireAuth` | Semeia preguiçosamente e retorna **ativas e inativas**, ordenadas por `sortOrder`. O front filtra ativas nos pickers |
| `PATCH /organizations/:orgId/action-plan-analysis-methods/:methodId` | `requireRole("org_admin")` | Patch de `label` / `active` / `isDefault` / `sortOrder`. Desativar uma tratativa marcada como padrão **desmarca o padrão junto** |

Sem POST. Sem DELETE (D2).

### 5.2 Ações do plano (rotas novas)

| Rota | Auth | Comportamento |
|---|---|---|
| `GET /organizations/:orgId/action-plans/:planId/actions` | `requireAuth` + acesso ao plano | Lista por `sortOrder` |
| `POST …/:planId/actions` | `requireWriteAccess` | Cria (todos os campos opcionais — a linha pode nascer vazia). Notifica o responsável, se houver |
| `PATCH …/:planId/actions/:actionId` | `requireWriteAccess` | Patch parcial (o autosave da linha manda só o diff). Trocar o responsável notifica o novo |
| `DELETE …/:planId/actions/:actionId` | `requireWriteAccess` | Remove (hard delete; o activity log guarda o `what`) |

Todas respeitam o **lock de encerramento** do plano (409 se encerrado; só admin SGI reabre) —
mesma guarda já existente no `PATCH` do plano.

**Guarda de conclusão do plano (soft):** concluir o plano (`status = completed`) com ações em
aberto **avisa e pede confirmação**, mas não bloqueia. Verificar eficácia com ação pendente é um
desvio de processo, não um erro de sistema — quem manda é o SGI.

**Concluir uma ação** exige `what` preenchido (400 caso contrário) — uma ação sem enunciado não
pode ser dada como feita. O servidor grava `completedAt` ao concluir e o limpa ao reabrir.

### 5.3 Plano

- `CreateActionPlanBody` / `UpdateActionPlanBody` ganham `analyses?: ActionPlanAnalysis[]`.
- `rootCauseWhys` e `plan5w2h` **saem** de `CreateActionPlanBody` / `UpdateActionPlanBody` /
  `ActionPlan` (são consumidos só pelo nosso próprio front).
- `ActionPlan` e `ActionPlanListItem` ganham `actionsTotal` e `actionsDone` (agregados) — para o
  progresso na ficha, na listagem e nos painéis.
- O `PATCH` (autosave) continua enviando **só o diff** contra o baseline (`payload-diff.ts`);
  `analyses` entra como campo do diff, tratado como valor inteiro (array completo), por ser parte
  do bloco de planejamento. **Ações não passam pelo PATCH do plano** — têm rotas próprias.

**Validações de `analyses`** (`services/action-plans/analyses.ts`):
1. `key` pertence ao enum;
2. **não há `key` duplicada** no array;
3. `data` casa com a forma do `key` (união discriminada);
4. escalas FMEA em 1..10; KT com exatamente as 4 dimensões fixas, na ordem;
5. `whys` no máximo 5 (5 Porquês e Ishikawa);
6. `selectedCauseId` / `mostProbableCauseId` órfãos são **zerados, não rejeitados** (o usuário pode
   ter apagado a causa que estava selecionada);
7. `key` **inativa no catálogo é aceita** — o plano pode ter sido criado antes da desativação e
   precisa continuar salvável. Desativar só remove das opções de adição.

### 5.4 OpenAPI e geração

`lib/api-spec/openapi.yaml` é a fonte única. `ActionPlanAnalysis` é uma união discriminada por
`key` (`oneOf` + `discriminator`), com um schema de `data` por método.

**Risco conhecido:** a geração Orval/zod de união discriminada pode sair inutilizável.
**Plano B (decidido antecipadamente):** manter no OpenAPI a forma completa para a tipagem do
cliente e validar `data` no servidor com uma união discriminada zod escrita à mão em
`services/action-plans/analyses.ts`. Mesma forma, sem depender do gerador. A escolha se faz
rodando `pnpm --filter @workspace/api-spec codegen` e olhando a saída.

## 6. Frontend

### 6.1 Primitivos novos — `planos-acao/_components/analises/primitivos/`

| Primitivo | Responsabilidade | Consumidores |
|---|---|---|
| `CadeiaPorques` | Lista ordenada, máx. N, adicionar/remover | 5 Porquês, Ishikawa |
| `ListaAgrupada` | Itens dentro de categorias de um conjunto fechado | Ishikawa (6M) |
| `TabelaEstruturada` | Linhas com colunas tipadas (texto / select / número) + coluna calculada | FMEA, Kepner-Tregoe, Barreiras |
| `EditorArvore` | Lista aninhada com indentar/desindentar; slot de campos extras por nó | Árvore de Falhas, RCA Apollo |
| `SecoesTexto` | Blocos de texto com títulos fixos | A3 |

Selects usam o `SearchableSelect` do projeto (não `<Select>` nativo).

### 6.2 Adaptadores — `planos-acao/_components/analises/metodos/`

Oito componentes finos (`cinco-porques.tsx`, `ishikawa.tsx`, `a3.tsx`, `fmea.tsx`,
`arvore-falhas.tsx`, `kepner-tregoe.tsx`, `rca-apollo.tsx`, `barreiras.tsx`), cada um compondo
primitivos e conhecendo o seu `data`. Um **registry** (`analises/registry.ts`) mapeia
`key → { componente, dataVazio(), resumo(data) }`. `resumo(data)` alimenta o card colapsado e o
diff de versões.

### 6.3 Ficha — seção Planejamento

```
Planejamento                              [Versões (n)] [Sugerir plano (IA)]

  Tratativas                              [+ Adicionar tratativa ▾]
    ┌ ▾ Ishikawa + 5 Porquês                                    [remover] ┐
    │   (editor do método)                                               │
    └────────────────────────────────────────────────────────────────────┘
    ┌ ▸ FMEA — 3 modos de falha, maior RPN 96                   [remover] ┐
    └────────────────────────────────────────────────────────────────────┘

  Causa raiz identificada
    [ textarea ]                          (o campo rootCause de hoje)

  Ações · 1 de 2 concluídas               [+ Incluir ação]
    ┌────────────────────┬─────────────┬────────────┬──────────────┐
    │ O quê              │ Quem        │ Quando     │ Status       │
    ├────────────────────┼─────────────┼────────────┼──────────────┤
    │ Treinar motoristas │ [▾ J.Silva] │ [20/07/26] │ [▾ Em and.]  │
    │ Bloquear no sistema│ [▾ M.Souza] │ [31/07/26] │ [▾ Pendente] │
    └────────────────────┴─────────────┴────────────┴──────────────┘
      └─ expandir a linha revela Por quê / Onde / Como / Quanto / Observações
```

O componente `<Plano5W2H>` **deixa de existir** — a tabela de Ações o substitui, com uma linha 5W2H
por ação em vez de um bloco 5W2H único.

- `[+ Adicionar tratativa]` lista as tratativas **ativas** que ainda não estão no plano. Remover
  uma tratativa **com conteúdo** pede confirmação. Tratativa **desativada** no catálogo continua
  exibida e editável nos planos que já a usam (displays = todas).
- `[+ Incluir ação]` cria uma linha nova (`POST`). "Quem" é o `SearchableSelect` de usuários da
  org; "Quando" é datepicker; "Status" é select. Linha atrasada ganha badge de atraso.
- Autosave: as tratativas seguem no autosave do plano (debounce 1s, diff, flush no unmount /
  `beforeunload`). **Cada linha de ação tem seu próprio `PATCH` debounced** — o plano e as ações
  não competem pelo mesmo payload.
- Plano encerrado: tudo somente-leitura, como já é hoje.

### 6.4 Diálogo de criação

`_components/nova-acao-dialog.tsx` → renomeado para **"Novo plano de ação"** (D12). Ganha o campo
**Tratativas** (multi-seleção sobre as ativas, pré-marcadas as `isDefault`), abaixo de GUT; o
`POST` envia `analyses` com as tratativas escolhidas **vazias** (`dataVazio()` do registry).
**Ações não são criadas no diálogo** — o `+ Incluir ação` vive na ficha, onde há espaço para o
5W2H de cada uma.

### 6.5 Renomeação "ação" → "plano de ação" (D12)

Somente **texto de UI**, nada estrutural. Onde o termo se refere ao container:
`criar-acao-button.tsx` ("Criar ação" → "Criar plano de ação"), `nova-acao-dialog.tsx`,
`acoes-vinculadas.tsx` (usado por KPI, SWOT, NC, treinamento, RAC…), telas de lista, painel
executivo, painel operacional, auditoria, eficácia, e o `ctaLabel` das pendências. O hub segue
"Gestão de Ações" (termo da cliente). Os itens de dentro são as **"Ações"**.

### 6.6 Configurações → Sistema → aba "Tratativas"

`components/settings/OrganizationAnalysisMethodsSettingsSection.tsx`, nova aba `"tratativas"` em
`pages/app/configuracoes/sistema.tsx` (`SystemTab`), só para `isOrgAdmin` — igual à aba "Normas".
Por linha: rótulo (editável), switch **Ativo**, switch **Padrão**, reordenar. Aviso ao desativar:
"planos que já usam esta tratativa continuam exibindo-a".

### 6.7 Cliente

`lib/action-plans-client.ts` ganha `useAllAnalysisMethods(orgId)`, `useActiveAnalysisMethods(orgId)`
(filtro client-side sobre a mesma query, sem request extra) e
`buildAnalysisMethodLabelMap(methods)` — espelhando `norms-client.ts`. Mais os hooks de ação
(`useActionPlanActions`, `useCreateActionPlanAction`, `useUpdateActionPlanAction`,
`useDeleteActionPlanAction`), com invalidação do plano (para atualizar `actionsDone/Total`).

### 6.8 "Sugerir plano (IA)" — como o draft aterrissa agora

O `ai-draft.ts` continua devolvendo a mesma coisa (5W2H + 3–5 porquês) — o contrato da IA não
muda (D15). O que muda é onde o draft cai, e o merge continua **não-destrutivo**
(`merge-draft.ts` só preenche o que está vazio):

- os **porquês** vão para a tratativa `five_whys` — criando-a no plano se ela não estiver lá;
- o **5W2H** vira a **primeira ação** (um `POST`) — **somente se o plano ainda não tem nenhuma
  ação**. Se já tem, a IA não toca nelas.

### 6.9 Estágio na timeline

`lib/action-plans-client.ts:266` — hoje `rootCause` ou 5W2H preenchido promove a **"Planejamento"**.
Passa a promover também: **qualquer tratativa com conteúdo** ou **existir ao menos uma ação**.
**"Execução"** passa a ser promovida quando **alguma ação está em andamento ou concluída**.

## 7. Versionamento — o que muda (D14)

Hoje o bloco `planning` = `{ plan5w2h, rootCause, rootCauseWhys }` é versionado inteiro e
**restaurável**. Depois:

- **`planning` = `{ rootCause, analyses }`** — continua versionado e restaurável. `normalizePlanning`
  colapsa vazios dentro de `analyses` (linha/nó/porquê sem nenhum campo preenchido é descartado);
  uma tratativa cujo `data` ficou inteiramente vazio **permanece** (o usuário a adicionou de
  propósito — é decisão dele, não ruído). `planningChanged` compara `analyses` por valor.
  `diffPlanningFields` ganha resumo legível por tratativa (ex.: `FMEA: 3 modos de falha, maior RPN 96`;
  `Ishikawa: 5 causas em 4 categorias, 4 porquês`), além de adicionada/removida.
- **Ações saem do snapshot.** Restaurar uma versão do planejamento **não mexe nas ações** — em
  troca, cada ação tem trilha própria no activity log (`action_added` / `action_updated` /
  `action_removed`, com o `what` snapshotado).

**Isto é uma perda deliberada:** deixa de existir "restaurar o 5W2H de ontem". O motivo é que
restaurar um snapshot de ações apagaria status, conclusões e datas reais registradas depois —
um restore destrutivo silencioso. Trilha por ação é mais auditável e é o que um auditor pede.

## 8. Migração de dados (produção)

1. **DDL cirúrgico no Neon** (não `drizzle-kit push` puro — a branch pode estar atrasada em relação
   ao schema de produção):
   - `CREATE TYPE action_plan_analysis_method_key`;
   - `CREATE TABLE action_plan_analysis_methods`;
   - `ALTER TABLE action_plans ADD COLUMN analyses jsonb`;
   - `CREATE TABLE action_plan_actions` (+ os 2 índices);
   - `ALTER TYPE action_plan_activity_action ADD VALUE 'action_added' | 'action_updated' | 'action_removed'`.
2. **Semente:** `scripts/src/migrate/analysis-methods-backfill.ts` → `ensureAnalysisMethods` para
   todas as organizações.
3. **Backfill das tratativas:** para todo plano com `root_cause_whys` não vazio, gravar
   `analyses = [{ key: "five_whys", data: { whys: <root_cause_whys> } }]`. Idempotente (não
   sobrescreve `analyses` já preenchido). `root_cause` não é tocado.
4. **Backfill das ações:** para todo plano com `plan_5w2h` não vazio, criar **uma** linha em
   `action_plan_actions`:
   - `what` ← `plan5w2h.what` (se vazio, o `title` do plano — melhor que uma ação sem enunciado);
   - `why` / `whereAt` / `how` / `howMuch` ← campos correspondentes, verbatim;
   - `responsibleUserId` ← tenta casar `plan5w2h.who` (texto) com o **nome de um usuário da org**
     (case-insensitive); sem match, cai no `responsibleUserId` **do plano**;
   - `dueDate` ← tenta parsear `plan5w2h.when`; sem parse, cai no `dueDate` **do plano**;
   - `status` ← `completed` se o plano já está `completed`/`cancelled`, senão `open`;
   - **`notes`** ← preserva verbatim os textos que não puderam ser resolvidos, ex.:
     `Quem (registro anterior): "Setor de Qualidade" · Quando (registro anterior): "Julho/26"`.
     **Nada de dado do usuário é descartado em silêncio.**
   - Idempotente: não cria se o plano já tem ação.
   - O script emite um **relatório** (quantos planos migrados, quantos `who`/`when` não resolvidos).
5. `root_cause_whys` e `plan_5w2h` permanecem no banco, **sem leitura nem escrita**, como rede de
   rollback. Derrubadas em follow-up separado.

## 9. Pendências e notificações

- **Novo provider** `services/pendencias/providers/action-plan-actions.ts`, source
  `action_plan_action` (novo `SOURCE_LABEL`: "Ação de plano"):
  - `listPending`: ações da org com `responsibleUserId ∈ ctx.responsibleUserIds` e
    `status ∈ {open, in_progress}`; `dueDate` da ação; link
    `/planos-acao/:planId#acao-:actionId`; subtítulo = código do plano.
  - `listCompletedToday`: ações com `completedAt` dentro do dia.
- O provider de **plano** continua como está (D13): quem conduz o plano vê o plano; quem executa
  uma ação vê a ação; quem faz os dois vê os dois.
- **E-mail:** atribuir uma ação a um usuário dispara a notificação de atribuição, reusando
  `services/action-plans/notify-assignment.ts`. Trocar o responsável notifica o novo.
- Escalonamento (`escalation.ts`) e o scheduler seguem **inalterados** (plano-level).

## 10. Testes

**Unitários (`node-unit`)**
- `normalizePlanning` com `analyses`: colapso de linha/nó/porquê vazio; tratativa vazia preservada;
  `planningChanged` detecta mudança dentro de `analyses`.
- Validação de `analyses`: `key` duplicada rejeitada; `data` de forma errada rejeitada; FMEA fora
  de 1..10 rejeitado; KT sem as 4 dimensões rejeitado; `selectedCauseId` órfão **zerado**;
  `key` inativa **aceita**.
- `ensureAnalysisMethods` idempotente (rodar duas vezes não duplica; insere `key` nova em org
  antiga).
- Registry: o `dataVazio()` de cada método passa na validação; `resumo(data)` de cada método.
- Backfill de ações: `who` resolvido por nome; `who` não resolvido cai no responsável do plano **e**
  vai para `notes`; `when` não parseável cai no `dueDate` do plano **e** vai para `notes`;
  `what` vazio usa o `title`; rodar duas vezes não duplica a ação.

**Unitários (`web-unit`)**
- RPN = S×O×D, alerta em RPN ≥ 100, RPN vazio quando falta S, O ou D.
- `EditorArvore`: indentar / desindentar / remover mantém a árvore consistente (sem nó órfão).
- `diffPlanningFields` produz resumo legível para tratativa adicionada, removida e editada.
- Progresso "X de N concluídas" e badge de ação atrasada.

**Integração (`TEST_ENV=integration` — nunca sem, senão bate na produção)**
- Catálogo: `GET` semeia preguiçosamente e devolve as 8; `PATCH` exige `org_admin` (403 para
  `operator`); desativar tratativa padrão desmarca o padrão.
- Plano: `POST` com `analyses` persiste; `PATCH` parcial não apaga tratativa não enviada; plano
  encerrado devolve 409 ao editar `analyses`.
- Ações: `POST`/`PATCH`/`DELETE`; `completedAt` gravado ao concluir e limpo ao reabrir; plano
  encerrado devolve 409; `actionsTotal`/`actionsDone` batem.
- Activity log: `planning.to.analyses` gravado; restaurar versão reaplica `analyses` **e não mexe
  nas ações**; `action_added`/`action_updated`/`action_removed` registrados.
- Pendências: ação aparece para o responsável da ação; plano continua aparecendo para o
  responsável do plano.

**E2E (Playwright)** — um fluxo: criar plano de ação com Ishikawa pré-marcado → preencher 6M +
porquês → adicionar FMEA e conferir o RPN → incluir duas ações com responsável e prazo → concluir
uma → recarregar e ver "1 de 2 concluídas" persistido.

## 11. Fora de escopo (explícito)

- **IA não preenche** FMEA / KT / árvores / A3 (D15).
- **Sem diagrama gráfico** (espinha de peixe desenhada, árvore em canvas) — árvores são listas
  aninhadas. Auditável e muito mais barato.
- **Sem "criar ação a partir de uma linha da tratativa"** (ex.: a "Ação recomendada" do FMEA virar
  uma ação com um clique). É o follow-up mais natural desta entrega.
- **Sem exportação PDF** do plano (não existe hoje para nenhum campo do plano).
- **Sem padrão de tratativa por origem** do plano (D9).
- **Sem método customizado** criado pela empresa (D2).
- **Sem escalonamento por ação** — escalonamento segue no nível do plano.
- **Sem `DROP COLUMN plan_5w2h` / `root_cause_whys`** nesta entrega (follow-up).

## 12. Entrega

**Um único PR** (`feat/tratativas-e-acoes-plano`), com as duas frentes. Não deixa meia-feature em
produção e evita mexer duas vezes no mesmo bloco de planejamento.

Ordem de dependência para o plano de implementação:

schema (catálogo + `analyses` + `action_plan_actions` + enum do log) → OpenAPI + codegen →
semente/defaults → rotas do catálogo → validação de `analyses` + bloco de planejamento →
rotas de ações + agregados + notificação → primitivos → adaptadores + registry → ficha
(tratativas) → ficha (ações) → diálogo de criação → aba de Configurações → renomeação de UI →
diff de versões → estágio da timeline → provider de pendências → scripts de migração → E2E.
