# Plano de Ação: ponto focal + co-responsáveis

**Data:** 2026-07-14
**Módulo:** Gestão de Ações (`actionPlans`)
**Origem:** regra de negócio revalidada pela cliente.

---

## 1. A regra

Um plano de ação hoje aceita **um** responsável. Passa a aceitar:

- **um ponto focal** — quem responde pelo plano. É quem o plano ganha ao nascer.
- **N co-responsáveis** — os "outros responsáveis", vinculados ao plano.

O plano **nasce com o ponto focal**; os co-responsáveis são adicionados **dentro da ficha**, depois.

**Integração futura:** quando existirem as *ações-item* (várias ações dentro do plano, cada uma com
responsável e prazo próprios — feature em construção em outra frente), o vínculo dos
co-responsáveis migra de `co-responsável ↔ plano` para `co-responsável ↔ ação`. Esta entrega é o
degrau anterior, e foi desenhada para não atrapalhar aquele passo.

## 2. Por que isto é aditivo (e o que isso poupa)

`action_plans.responsible_user_id` **já é** o ponto focal. Não muda tipo, não muda nulabilidade, não
muda significado operacional. Consequências, todas boas:

- **Sem migração de dados.** Todo plano existente já tem seu ponto focal na coluna certa.
- **Sem quebra de contrato.** `responsibleUserId` continua no payload, com o mesmo sentido. Os
  co-responsáveis entram **ao lado**, num campo novo.
- **Sem coluna a dropar**, sem espelho, sem janela de rollback.

A única estrutura nova é a tabela de junção dos co-responsáveis.

## 3. Modelo de dados

```ts
// lib/db/src/schema/action-plans.ts  — JÁ IMPLEMENTADO (commit 7ebb60b)

// action_plans.responsibleUserId  →  o PONTO FOCAL (coluna existente, inalterada)

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

Segue o padrão de `unit_managers` (`schema/units.ts:37-56`). O índice em `user_id` é obrigatório: as
consultas quentes (pendências, escalonamento, filtro "Atribuídas a mim") entram por ele — e
`responsible_user_id`, aliás, **nunca teve índice**; o filtro da listagem passa a ter um.

**Invariante:** o ponto focal **não** aparece na junção. O conjunto de responsáveis do plano é
`[ponto focal, ...co-responsáveis]`. O servidor rejeita (400) tentar pôr o ponto focal na lista de
co-responsáveis — ninguém é responsável duas vezes.

## 4. Contrato da API (aditivo)

**Leitura** — `ActionPlan` e `ActionPlanListItem` ganham:

```yaml
coResponsibles: Array<{ userId: integer, name: string }>   # sempre presente; [] quando não há
```

`responsibleUserId` e `responsibleUserName` **permanecem** (são o ponto focal).

**Escrita** — `CreateActionPlanBody` e `UpdateActionPlanBody` ganham:

```yaml
coResponsibleUserIds: integer[]    # conjunto COMPLETO; substitui o atual
```

Semântica de **substituição total**: o payload traz a lista inteira, o servidor sincroniza numa
transação. O autosave da ficha manda só o diff (`payload-diff.ts`), e como ele já compara arrays
estruturalmente, `coResponsibleUserIds` só viaja quando o conjunto muda de fato.

**Query param `?responsibleUserId=N`** — mesmo nome, **semântica ampliada** no servidor: passa de
"o ponto focal é N" para "**N é responsável**: ponto focal **ou** co-responsável". É o que o filtro
"Atribuídas a mim" e o seletor de responsável da listagem já querem dizer. Zero churn de contrato.

## 5. Os cinco mecanismos

Ser responsável não é rótulo — é chave em cinco lugares. **Co-responsável tem o mesmo tratamento
operacional do ponto focal** em todos os cinco. O que distingue o ponto focal é a responsabilidade
formal, não o acesso nem a cobrança.

| # | Mecanismo | Hoje | Passa a ser |
|---|---|---|---|
| 1 | **Autorização** (`routes/action-plans.ts:126-153`) | responsável ou avaliador abrem a ficha mesmo sem o módulo | + co-responsável |
| 2 | **Suas Pendências** (`providers/action-plans.ts:41-42`) | o plano aparece para o responsável | + para cada co-responsável (**uma pendência por plano**, ver §6) |
| 3 | **Escalonamento** (`escalation.ts:37,92-150`) | e-mail + alerta de ação vencida ao responsável | + a cada co-responsável |
| 4 | **Listagem** (`lista-screen.tsx:54-56,159,182`) | filtro e coluna pelo responsável | filtro por pertinência; coluna mostra ponto focal + "+N" |
| 5 | **Eficácia** (`routes/action-plans.ts:380-388,591-599`) | avaliador ≠ responsável | avaliador ∉ {ponto focal} ∪ {co-responsáveis} |

Sobre **(3)**: a dedupe do escalonamento já é por **(plano + usuário + tipo + dia)**
(`escalation.ts:112-126`), não por plano — então cobrar N pessoas **não exige redesenhar a dedupe**,
basta iterar. Cada um ganha seu próprio controle de duplicata. (Aceito: um co-responsável adicionado
*depois* da passada do dia só recebe o alerta no dia seguinte. O cron roda diariamente.)

Sobre **(5)**: a regra ISO é de independência da verificação — quem executa não verifica. Estender
ao conjunto tem um efeito colateral **intencional**: um plano em que a pessoa X já é avaliadora
passa a **rejeitar (400)** a tentativa de torná-la co-responsável, com mensagem explicando o
conflito. É uma porta de erro que hoje não existe.

## 6. Suas Pendências: uma pendência por plano

Um plano com ponto focal + 2 co-responsáveis gera **uma** pendência, não três. Nos escopos
`unit`/`org` isso evita o mesmo plano aparecer 3× e inflar o contador do card "Planos de ação" — o
gestor quer saber quantas **ações** estão abertas, não quantos pares ação×pessoa.

O tipo `Pendencia` (`services/pendencias/types.ts:21`) é **compartilhado por 4 provedores** (kpi,
action_plan, nonconformity, regulatory_document) e exige `responsibleUserId: number`. Ele ganha
**um campo opcional**:

```ts
  responsibleUserId: number;        // mantido: quem, no escopo pedido, explica esta linha estar aqui
  responsibleUserIds?: number[];    // novo, opcional: todos os responsáveis (só o provider de planos preenche)
  responsibleName?: string;
```

Os outros três provedores **não mudam** — não preenchem o campo novo e caem no fallback singular. O
agregador (`aggregate.ts:73-87`) compõe o rótulo: `"Maria Silva +2"` quando há mais de um.

## 7. Onde as pessoas entram (UX)

**Na criação: só o ponto focal. Na ficha: os co-responsáveis.**

O diálogo de criação (`nova-acao-dialog.tsx`) já pede o mínimo e diz, em letras miúdas: *"Detalhe
5W2H, causa raiz e eficácia na ficha."* **Criação é captura; a ficha é onde se trabalha.** O plano
quase sempre nasce de dentro de outra tela (célula vermelha de indicador, não conformidade, ameaça
do SWOT) — a pessoa está no meio de outra tarefa, e cada campo ali é um pedágio cobrado no momento
de menor conhecimento e menor paciência.

Portanto o diálogo de criação **não ganha campo novo**: só troca o rótulo "Responsável" →
"Ponto focal". O mesmo vale para o diálogo de criar ação a partir da célula vermelha do KPI
(`cell-red-actions-dialog.tsx`).

## 8. Histórico (correção que cai no caminho)

Hoje o log grava IDs crus (`responsibleUserId` está em `DIFF_FIELDS`) e a tela renderiza
literalmente **`responsibleUserId: 3 → 7`** (`comentarios-historico.tsx:62-65`) — nome de campo em
inglês, id numérico, ilegível para um auditor.

Como vamos mexer no diff de qualquer jeito, aproveitamos: o diff dos responsáveis passa a gravar
**nomes** (há precedente — `action_plan_activity_log` já snapshota `userName`), e a tela ganha um
mapa de labels. Passa a sair **"Co-responsáveis: Maria Silva → Maria Silva, João Souza"**.

## 9. Migração em produção

**Nunca `pnpm db push`** (aponta para o Neon de produção e tenta dropar colunas de outras branches).
DDL cirúrgico, idempotente — e **sem backfill**, porque a coluna já contém o ponto focal:

```sql
CREATE TABLE IF NOT EXISTS action_plan_responsibles (
  id              serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations (id),
  action_plan_id  integer NOT NULL REFERENCES action_plans (id) ON DELETE CASCADE,
  user_id         integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS action_plan_responsibles_plan_user_uq
  ON action_plan_responsibles (action_plan_id, user_id);
CREATE INDEX IF NOT EXISTS action_plan_responsibles_user_idx ON action_plan_responsibles (user_id);
CREATE INDEX IF NOT EXISTS action_plan_responsibles_org_idx  ON action_plan_responsibles (organization_id);
```

Tabela nova e vazia; o código antigo a ignora. Deploy sem downtime, sem ordem crítica.

## 10. Premissas

- **Ponto focal continua opcional** (a coluna é nullable hoje e segue assim).
- **Sem limite** de co-responsáveis.
- **Co-responsável é cobrado como responsável**: recebe e-mail de vencimento, vê o plano em "Suas
  Pendências" e alcança a ficha sem o módulo. Vinculá-lo sem isso não significaria nada.
- **`plan5w2h.who`** segue texto livre, desacoplado (a IA é instruída a escrever o **cargo**, não
  nomes — `ai-draft.ts:43`).
- **Avaliador de eficácia continua sendo um só.**

## 11. Fora de escopo

- **Ações-item** (várias ações dentro do plano) — outra frente.
- **Herdar responsável da origem** (KPI/NC têm responsável próprio; `derivation.ts` não deriva hoje
  e segue não derivando).
- **Bridge de `corrective_actions`** (governança) — read-only, sem id de responsável.
- **Traduzir os demais campos do histórico** — só o dos responsáveis ganha label.
