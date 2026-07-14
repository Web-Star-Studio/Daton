# Plano de Ação: múltiplos responsáveis

**Data:** 2026-07-14
**Módulo:** Gestão de Ações (`actionPlans`)
**Origem:** regra de negócio revalidada pela cliente — um plano de ação pode ter mais de um responsável.

---

## 1. Problema

Hoje `action_plans.responsible_user_id` é um único FK para `users.id` (nullable, `ON DELETE SET NULL`).
Esse campo não é apenas um rótulo de exibição: ele é chave em **cinco mecanismos**.

| # | Mecanismo | Onde |
|---|---|---|
| 1 | **Autorização** — o responsável abre o plano mesmo sem nenhum módulo | `routes/action-plans.ts:126-153` (`requirePlanAccess`) |
| 2 | **Suas Pendências** — o provider filtra por responsável | `services/pendencias/providers/action-plans.ts:41-42` |
| 3 | **Escalonamento** — e-mail + notificação de ação vencida | `services/action-plans/escalation.ts:37,48,92-150` |
| 4 | **Listagem** — filtro "Atribuídas a mim", coluna Responsável, busca textual | `lista-screen.tsx:54-56,159,182` |
| 5 | **Eficácia** — o avaliador deve ser diferente do responsável | `routes/action-plans.ts:380-388,591-599` |

A mudança para N responsáveis atravessa os cinco. Não é uma mudança de tela.

## 2. Decisão de modelo

**Conjunto plano: N responsáveis, todos iguais.** Não existe "principal" nem "co-responsável".
Consequência direta e desejada: **todos** recebem cobrança, **todos** veem o plano em Suas Pendências,
**todos** ganham acesso ao plano.

Descartado: modelo "principal + apoio". Reintroduziria hierarquia (e escrita dupla no schema) numa
regra que a cliente definiu como plana.

### 2.1 Schema — tabela de junção

Segue o precedente do repo (`unit_managers`, `lib/db/src/schema/units.ts:37-56`).

```ts
// lib/db/src/schema/action-plans.ts
export const actionPlanResponsiblesTable = pgTable(
  "action_plan_responsibles",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
    actionPlanId: integer("action_plan_id").notNull()
      .references(() => actionPlansTable.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("action_plan_responsibles_plan_user_uq").on(table.actionPlanId, table.userId),
    index("action_plan_responsibles_user_idx").on(table.userId),
    index("action_plan_responsibles_org_idx").on(table.organizationId),
  ],
);
```

`ON DELETE CASCADE` no `user_id`: usuário removido deixa de ser responsável, sem linha órfã.
O índice em `user_id` é obrigatório — as consultas mais quentes (pendências, escalonamento,
filtro "Atribuídas a mim") entram por ele. A tabela `action_plans` hoje **não tem** índice em
`responsible_user_id`; a junção corrige isso de passagem.

**Alternativa descartada:** coluna `integer[]`. Perde FK (ID órfão após deletar usuário), exige
índice GIN e joins manuais para resolver nomes.

### 2.2 A coluna antiga fica dormente

`action_plans.responsible_user_id` **permanece no schema Drizzle e no banco**, sem leitor nem escritor,
durante a janela de migração. Duas razões:

1. **Âncora de rollback** — se o deploy voltar atrás, o dado antigo ainda está lá.
2. **Anti-drift do `drizzle-kit`** — remover do schema faria um `push` querer dropar a coluna na PROD.

Drop da coluna é um **follow-up** separado, depois de validado em produção. Enquanto dormente,
a coluna recebe um comentário `@deprecated` no schema para não induzir ninguém a lê-la.

## 3. Contrato da API

### 3.1 Leitura

`ActionPlan` e `ActionPlanListItem` trocam os dois campos escalares por um array:

```diff
- responsibleUserId: integer | null
- responsibleUserName: string | null
+ responsibles: Array<{ userId: integer, name: string }>
```

Array sempre presente (vazio quando não há responsável), ordenado por nome para exibição estável.

### 3.2 Escrita

`CreateActionPlanBody` e `UpdateActionPlanBody`:

```diff
- responsibleUserId: integer | null
+ responsibleUserIds: integer[]
```

Semântica de **substituição total do conjunto**: o payload traz a lista inteira, o servidor
sincroniza (deleta os que saíram, insere os que entraram) numa transação. Não há operação
"adicionar/remover um".

> **Nota sobre o autosave.** A ficha faz PATCH com diff (ver memória `action-plan-autosave-diff`).
> `responsibleUserIds` é um campo como outro qualquer no diff: se mudou, vai inteiro. O
> last-write-wins por campo entre abas continua valendo — mesmo comportamento de hoje, sem regressão.

### 3.3 Query param — sem mudança de nome

`GET /action-plans?responsibleUserId=N` **mantém o nome**. A semântica passa de
"o responsável é N" para "**N é um dos** responsáveis", implementado como `EXISTS` sobre a junção.
Isso preserva o filtro "Atribuídas a mim" e o `<Select>` de responsável na listagem sem churn de contrato.

### 3.4 Fora do contrato novo

`ExternalActionItem` (bridge read-only de `corrective_actions` da governança) continua com
`responsibleUserName: string` e sem id. Não faz parte desta mudança.

## 4. Os cinco mecanismos

### 4.1 Autorização (`requirePlanAccess`)

```diff
- plan.responsibleUserId === userId ||
+ (await isPlanResponsible(plan.id, userId)) ||
  plan.effectivenessEvaluatorUserId === userId ||
  ...
```

Um helper `isPlanResponsible(planId, userId)` faz um `SELECT 1 ... LIMIT 1` na junção. É uma consulta
a mais por request nas rotas `/:planId`, coberta pelo índice `(action_plan_id, user_id)` do unique.

### 4.2 Escalonamento

A dedupe hoje já é por **(plano + usuário + tipo + dia)** (`escalation.ts:112-126`) — não por plano.
Portanto notificar N responsáveis **não exige redesenho da dedupe**: basta iterar. Cada responsável
recebe sua notificação e seu e-mail, cada um com seu próprio controle de duplicata.

O `WHERE isNotNull(responsibleUserId)` (`escalation.ts:37`) vira um `INNER JOIN` com a junção, e o loop
passa a percorrer os pares (plano × responsável).

**Aceito conscientemente:** um responsável adicionado **depois** da passada do dia só recebe o alerta
no dia seguinte. Sem workaround — o cron roda diariamente.

### 4.3 Suas Pendências — **uma pendência por plano**

Um plano com 3 responsáveis gera **uma** pendência, não três. Nos escopos `unit`/`org` isso evita
que o mesmo plano apareça 3× na lista e infle o contador do card "Planos de ação" (o gestor quer saber
quantas **ações** estão abertas, não quantos pares ação×pessoa).

O tipo compartilhado `Pendencia` (usado por 4 providers) ganha **um campo opcional**:

```diff
  responsibleUserId: number;          // mantido: "por que isto está nesta lista"
+ responsibleUserIds?: number[];      // novo, opcional: todos os responsáveis (só o provider de planos preenche)
  responsibleName?: string;
```

- **Provider de planos** (`providers/action-plans.ts`): dedupe por plano;
  `responsibleUserId` = menor id **entre os que casam com o escopo** (determinístico, explica a presença
  na lista); `responsibleUserIds` = **todos** os responsáveis do plano.
- **`aggregate.ts`** (`:73-87`): a coleta de ids passa a ler `responsibleUserIds ?? [responsibleUserId]`.
  Quando há mais de um nome, `responsibleName` vira `"Maria Silva +2"`.
- **Os outros 3 providers** (kpi, nonconformity, regulatory_document) **não mudam** — não preenchem
  o campo novo e caem no fallback singular.

A tela (`pages/app/pendencias.tsx:87-89`) já renderiza `Responsável: {item.responsibleName}` só nos
escopos filial/org. Nenhuma mudança de UI é necessária ali além do texto que já vem pronto.

### 4.4 Listagem e filtros

- Coluna "Responsável" → **"Responsáveis"**, renderizando `"Maria Silva +2"` (mesma convenção das pendências).
- Busca textual (`lista-screen.tsx:73-77`) passa a varrer **todos** os nomes do array.
- Filtro "Atribuídas a mim" e `<Select>` de responsável: inalterados (o query param manteve o nome).

### 4.5 Eficácia — independência do avaliador

A regra de independência se estende ao conjunto: **o avaliador não pode ser nenhum dos responsáveis.**
Validada no create e no update (`routes/action-plans.ts:380-388,591-599`), considerando o conjunto
recebido no payload ou, se ausente, o já persistido.

- Backend: 400 quando `effectivenessEvaluatorUserId ∈ responsibleUserIds`.
- Frontend (`eficacia-panel.tsx:85-92`): as opções de avaliador excluem **todos** os responsáveis.

**Risco assumido:** um plano existente em que a pessoa X é avaliadora e alguém a adiciona como
co-responsável passa a ser rejeitado no save, com mensagem explicando o conflito. É a regra ISO de
independência da verificação — o comportamento é intencional, não um bug.

## 5. Histórico / auditoria (correção que cai no caminho)

Hoje o log grava IDs crus (`DIFF_FIELDS` inclui `responsibleUserId`, `routes/action-plans.ts:78`) e a
tela renderiza literalmente **`responsibleUserId: 3 → 7`** (`comentarios-historico.tsx:62-65`) — nome de
campo em inglês, ID numérico, ilegível.

Como o diff desse campo muda de qualquer forma, aproveitamos:

- O diff passa a gravar **nomes** (snapshot), não ids — há precedente: `action_plan_activity_log` já
  snapshota `userName`.
- A tela ganha um mapa de labels e renderiza **"Responsáveis: Maria Silva → Maria Silva, João Souza"**.

O mapa de labels cobre apenas `responsibles` nesta entrega. Traduzir os demais campos do diff é
melhoria separada — fora de escopo.

## 6. Frontend — pontos de troca

`SearchableMultiSelect` (`components/ui/searchable-multi-select.tsx`) já existe (veio da multi-seleção
de cargos) e é reusado nos três formulários.

| Arquivo | Mudança |
|---|---|
| `planos-acao/[id].tsx:599-608` | `SearchableSelect` → `SearchableMultiSelect` ("Responsáveis") |
| `_components/nova-acao-dialog.tsx:157-166` | idem |
| `components/kpi/cell-red-actions-dialog.tsx:459-462` | idem (criar ação a partir de célula vermelha) |
| `_components/responsible-options.ts` | `buildResponsibleOptions` recebe o array `responsibles` e semeia o picker com **todos** eles quando `orgUsers` volta vazio (operador sem permissão de listar usuários) |
| `_components/lista-screen.tsx` | coluna + busca textual (§4.4) |
| `_components/eficacia-panel.tsx` | exclui todos os responsáveis das opções de avaliador |
| `_components/painel-operacional.tsx:48` | alerta mostra `"Maria Silva +2"` |
| `_components/comentarios-historico.tsx` | label + formatação de array (§5) |

## 7. Migração em produção

**Nunca `pnpm db push`** (a branch atrasada tenta dropar colunas de outras branches — memória
`drizzle-push-prod-drift-theme`). DDL cirúrgico, idempotente:

```sql
CREATE TABLE IF NOT EXISTS action_plan_responsibles (
  id serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  action_plan_id integer NOT NULL REFERENCES action_plans(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS action_plan_responsibles_plan_user_uq
  ON action_plan_responsibles (action_plan_id, user_id);
CREATE INDEX IF NOT EXISTS action_plan_responsibles_user_idx ON action_plan_responsibles (user_id);
CREATE INDEX IF NOT EXISTS action_plan_responsibles_org_idx ON action_plan_responsibles (organization_id);

-- Backfill: 1 linha por plano que já tem responsável.
INSERT INTO action_plan_responsibles (organization_id, action_plan_id, user_id)
SELECT organization_id, id, responsible_user_id
FROM action_plans
WHERE responsible_user_id IS NOT NULL
ON CONFLICT (action_plan_id, user_id) DO NOTHING;
```

**Ordem de deploy (zero downtime):**
1. Aplicar a DDL + backfill (o código antigo continua rodando: ignora a tabela nova).
2. Deploy do código novo (API + web juntos; passa a ler/escrever só a junção).
3. Verificar a paridade: `COUNT` de planos com responsável antigo == `COUNT(DISTINCT action_plan_id)` na junção.
4. **Follow-up:** dropar `action_plans.responsible_user_id`.

Verificação obrigatória antes do passo 4:

```sql
SELECT
  (SELECT count(*) FROM action_plans WHERE responsible_user_id IS NOT NULL) AS antigos,
  (SELECT count(DISTINCT action_plan_id) FROM action_plan_responsibles) AS migrados;
```

## 8. Testes (TDD — teste antes da implementação)

**Integração (api-server)** — `TEST_ENV=integration` obrigatório (memória
`integration-tests-sem-testenv-batem-na-prod`; sem ele o vitest bate na PROD):

- `requirePlanAccess` libera **qualquer um** dos responsáveis sem módulo (estende
  `action-plans-module-access.integration.test.ts:203-220`).
- `POST` com 2 responsáveis grava 2 linhas na junção; `PATCH` substituindo o conjunto deleta e insere corretamente.
- `PATCH` com conjunto vazio remove todos (plano sem responsável continua válido).
- `GET ?responsibleUserId=X` retorna o plano quando X é **co-responsável** (não só o primeiro).
- Avaliador ∈ responsáveis → **400** (no create e no update).
- Usuário de outra org no array → **400** (`assertUserBelongsToOrg` para cada id).
- Provider de pendências: plano com 2 responsáveis aparece **uma vez** no escopo `unit`; aparece para
  **cada um** deles no escopo `mine`.
- Escalonamento: plano vencido com 3 responsáveis gera **3** notificações e **3** e-mails; rodar duas
  vezes no mesmo dia não duplica.

**Unit (node)**
- Diff do log grava nomes, não ids; conjunto inalterado não gera entrada.

**Unit (web)**
- `buildResponsibleOptions` com N responsáveis: semeia todos quando `orgUsers` está vazio, sem duplicar
  quando estão presentes (estende `action-plan-responsible-options.unit.test.ts`).

## 9. Fora de escopo

- **Múltiplos avaliadores de eficácia** — continua um só.
- **`plan5w2h.who`** — segue texto livre, desacoplado dos responsáveis. A IA continua instruída a
  escrever o cargo, não nomes (`ai-draft.ts:43`).
- **Herdar responsável da origem** (`derivation.ts` não deriva responsável hoje; continua não derivando).
- **Bridge de `corrective_actions`** (governança) — read-only, sem id de responsável.
- **Traduzir os demais campos do histórico** — só `responsibles` ganha label.
- **Drop da coluna `responsible_user_id`** — follow-up pós-validação em produção.

## 10. Premissas

- Responsável continua **opcional**: um plano pode ficar com zero responsáveis (é o comportamento atual,
  e o `nullable` de hoje já permite).
- Sem limite máximo de responsáveis.
- Não há consumidor externo da API — front e back sobem juntos, então a troca do contrato de leitura é
  segura sem período de compatibilidade dupla no payload.
