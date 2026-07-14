# Catálogo gerenciável de Métodos de verificação (eficácia do plano de ação)

**Data:** 2026-07-14
**Status:** desenho aprovado, pronto para plano de implementação

## Problema

Na ficha do plano de ação, o bloco **Avaliação de eficácia** tem um campo **Método de verificação**
cuja lista é fixa em código: `Verificação por indicador`, `Auditoria interna`,
`Inspeção física (campo)`, `Verificação por treinamento`, `Verificação por amostragem`,
`Redução de risco`.

Acrescentar um método hoje exige tocar três fontes de verdade e fazer deploy:

| Fonte | Onde |
|---|---|
| Enum do Postgres | `lib/db/src/schema/action-plans.ts:139` (`action_plan_effectiveness_method`) |
| Enum da API | `lib/api-spec/openapi.yaml` (`ActionPlanEffectivenessMethod`) → regenera zod + hooks |
| Rótulo PT-BR | `artifacts/web/src/lib/action-plans-client.ts:161` (`EFFECTIVENESS_METHOD_LABELS`) |

A cliente precisa cadastrar os próprios métodos, sem depender de release.

**Fato que torna a migração barata:** o valor do método **não alimenta nenhuma regra de negócio**.
Ele é gravado (`routes/action-plans.ts:414,570`), serializado (`services/action-plans/serializers.ts:90`)
e exibido no `<select>` (`_components/eficacia-panel.tsx:68`). Não há derivação, relatório, e-mail,
export ou dashboard que leia o código do método. Nenhum teste ou seed o referencia.

## Solução

Replicar o catálogo de normas (`regulatory_norms`, PR #149 — que por sua vez espelha
`swot_perspectives`): uma tabela org-scoped de rótulos, gerida em **Configurações → Sistema**,
consumida por id.

### 1. Dados

Nova tabela em `lib/db/src/schema/effectiveness-methods.ts`, exportada no barrel
`schema/index.ts`:

```ts
export const effectivenessMethodsTable = pgTable(
  "effectiveness_methods",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id").notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("effectiveness_method_org_lower_label_unique")
      .on(table.organizationId, sql`lower(${table.label})`),
  ],
);
```

`action_plans` ganha uma coluna e **mantém a antiga**:

```ts
/** @deprecated legado — lido só p/ exibição de planos ainda não migrados. Não dropar. */
effectivenessMethod: actionPlanEffectivenessMethodEnum("effectiveness_method"),
effectivenessMethodId: integer("effectiveness_method_id")
  .references(() => effectivenessMethodsTable.id, { onDelete: "set null" }),
```

O enum `action_plan_effectiveness_method` e a coluna continuam no banco (rede de segurança e
rollback), como foi feito com `training_requirements.norm` → `norm_ids`.

Escrita: só `effectiveness_method_id`. A coluna legada nunca mais recebe valor novo.

**Sementes** (verbatim, na ordem atual da tela — `sortOrder` 0..5):

1. `Verificação por indicador`
2. `Auditoria interna`
3. `Inspeção física (campo)`
4. `Verificação por treinamento`
5. `Verificação por amostragem`
6. `Redução de risco`

Mapa legado → semente (usado só pelo backfill e pelo fallback de leitura):
`indicator`, `internal_audit`, `field_inspection`, `training`, `sampling`, `risk_reduction`.

### 2. API

**OpenAPI** (`lib/api-spec/openapi.yaml`) — fonte da verdade; zod e hooks React Query são gerados
por Orval (`pnpm --filter @workspace/api-spec codegen`), nunca editados à mão:

- tag `effectivenessMethods`
- `GET /organizations/{orgId}/effectiveness-methods` → `listEffectivenessMethods`: devolve
  **ativos e inativos**, ordenado por `sortOrder ASC, label ASC`
- `POST` na mesma coleção → `createEffectivenessMethod`: `201` quando cria; `200` quando o rótulo
  já existe (idempotente, case-insensitive) ou quando reativa um inativo de mesmo rótulo
- `PATCH /organizations/{orgId}/effectiveness-methods/{methodId}` → `updateEffectivenessMethod`:
  `label` e/ou `active` e/ou `sortOrder`, todos opcionais
- **sem DELETE** — remover é `active: false`
- `ActionPlan`, `CreateActionPlanBody`, `UpdateActionPlanBody` ganham
  `effectivenessMethodId: integer | null`; `effectivenessMethod` permanece, marcado `deprecated`
  (continua saindo no GET, não é mais aceito na escrita)

**Rotas** (`artifacts/api-server/src/routes/effectiveness-methods.ts`, copiando
`routes/regulatory-norms.ts`):

- leitura: `requireAuth` — qualquer usuário autenticado da organização
- escrita: `requireRole("org_admin")` (deixa `platform_admin` passar)
- tenancy: `params.orgId !== req.auth.organizationId` → `403`
- rótulo vazio após `trim()` → `400 "Informe o nome do método"`
- colisão de rótulo no PATCH → `409 "Já existe um método com esse nome"`, em duas camadas
  (pré-check + `catch` do código PG `23505`, porque SELECT+UPDATE não é atômico)
- montada em `routes/index.ts` **sem** `requireModuleAccessForPaths`: um org_admin pode não ter o
  módulo `actionPlans`, e ele precisa gerir o catálogo em Configurações

**Serviços:**

- `services/effectiveness-methods/defaults.ts`: `DEFAULT_EFFECTIVENESS_METHOD_LABELS`,
  `LEGACY_METHOD_TO_LABEL` (código do enum → rótulo semente) e
  `ensureDefaultEffectivenessMethods(orgId)` (`onConflictDoNothing`, idempotente)
- `services/effectiveness-methods/validate.ts`:
  `assertEffectivenessMethodBelongsToOrg(orgId, id)` → usado no POST e no PATCH de plano de ação;
  id inexistente ou de outra organização → `400 "Método de verificação inválido para esta organização"`
- `ensureDefaultEffectivenessMethods` chamado no registro de organização (`routes/auth.ts`, junto do
  `ensureDefaultNorms` já existente)

### 3. Front

**Client** (`artifacts/web/src/lib/effectiveness-methods-client.ts`, espelhando `norms-client.ts` —
wrapper fino sobre os hooks gerados):

```ts
useAllEffectivenessMethods(orgId)          // catálogo completo (ficha + tela de gestão)
pickerMethodOptions(methods, selectedId)   // puro: ativos + o inativo já referenciado
```

O catálogo de normas expõe ainda `useActiveNorms` e `buildNormLabelMap`; aqui esses dois **não**
teriam consumidor (o único seletor precisa do catálogo completo, e nenhuma outra tela exibe o
método), então não são copiados.

**Painel de eficácia** (`pages/app/planos-acao/_components/eficacia-panel.tsx`):

- o `<select>` passa a listar `[...ativos, ...inativo que este plano já referencia]` — sem a união,
  desativar um método faria a seleção do plano sumir da tela
- o valor trafegado é o **id** (number), não mais o código do enum
- **fallback de leitura do legado**: plano com `effectivenessMethodId === null` mas com
  `effectivenessMethod` preenchido exibe o rótulo legado em modo leitura (o `Record` atual vira
  `LEGACY_EFFECTIVENESS_METHOD_LABELS`, usado só para isso). Cobre a janela entre o deploy do código
  e a execução do backfill; sai do código depois que a migração estiver consolidada

**Gestão** (`components/settings/EffectivenessMethodsSettingsSection.tsx` + aba em
`pages/app/configuracoes/sistema.tsx`): aba **"Métodos de verificação"**, visível só para
`org_admin`, com criar (input + Enter), renomear inline (Pencil → Input, Enter salva / Escape
cancela) e `Switch` de ativar/desativar, com badge "Inativo". Sem excluir e sem reordenar — igual à
aba Normas.

### 4. Migração

`scripts/src/migrate/effectiveness-methods-backfill.ts` (molde:
`scripts/src/migrate/norms-catalog-backfill.ts`) — dry-run por padrão, `--commit` aplica, uma
transação por organização, só INSERT/UPDATE, **nunca DELETE**:

1. semeia os 6 padrões em cada organização (`onConflictDoNothing`)
2. monta `lower(label) → id`
3. `UPDATE action_plans SET effectiveness_method_id = :id WHERE effectiveness_method = :codigo AND effectiveness_method_id IS NULL`

Idempotente: rodar duas vezes não muda nada na segunda. Entrada em `scripts/package.json`.

DDL de produção (Neon) aplicada **cirurgicamente** e só com autorização explícita do usuário —
nunca `drizzle-kit push` puro, que num branch atrasado tenta dropar colunas de outros branches.

### 5. Testes

- **unit** (`api-server/tests/effectiveness-methods/defaults.unit.test.ts`): trava os 6 rótulos, a
  ordem e o mapa código-legado → rótulo
- **unit web** (`web/tests/lib/effectiveness-methods-client.unit.test.ts`): `pickerMethodOptions`
  oferece só os ativos, mas mantém o inativo que o plano já referencia (sem ressuscitar os demais)
- **integration** (`api-server/tests/effectiveness-methods/effectiveness-methods.integration.test.ts`):
  create + list + idempotência case-insensitive (201 depois 200, mesmo id); reativação de inativo em
  vez de duplicar; gate de permissão (operator: POST → 403, GET → 200); PATCH rename/toggle +
  colisão → 409; `ensureDefaultEffectivenessMethods` semeia os 6 na ordem e é idempotente
- **integration** (`api-server/tests/routes/action-plans*.integration.test.ts`): round-trip de
  `effectivenessMethodId` no POST/PATCH/GET do plano; id de outra organização → 400

Rodar integração **sempre** com `TEST_ENV=integration` (sem isso o vitest carrega o `.env` e bate no
Neon de produção).

## Fora de escopo

- O campo **Método de verificação** da Conscientização (`employee_awareness_records.verification_method`,
  Aprendizagem → Colaboradores) é texto livre e continua como está. Pode reusar este catálogo depois.
- UI de reordenar o catálogo (a aba Normas também não tem).
- Dropar o enum `action_plan_effectiveness_method` — fica para uma limpeza posterior, depois que o
  backfill estiver consolidado em produção.
