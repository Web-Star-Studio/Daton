# Diagnóstico do Fator de Desempenho: periodicidade + histórico com autor e data

- **Data:** 2026-07-14
- **Módulo:** Segurança Viária (`road-safety`) — ISO 39001 §6.3, FPLAN 005
- **Branch:** `feat/road-safety-kpi-link` (empilha sobre o vínculo FD↔Indicador, PR #110)
- **Status:** desenho aprovado pelo usuário

## Problema

O "Diagnóstico atual" do Fator de Desempenho (`road_safety_factors.current_diagnosis`) é hoje
um textarea livre no Bloco A do cadastro. Ele é o estado do fator que embasa a análise GUT —
ou seja, é a evidência que sustenta a priorização — mas:

1. **Não tem cadência.** Nada diz de quanto em quanto tempo esse diagnóstico deve ser refeito,
   e nada cobra a revisão. A "Periodicidade" que existe no Bloco B é outra coisa: ela rege o
   lançamento do indicador, não a revisão do diagnóstico.
2. **Não tem autoria nem data.** Quem escreveu, e quando, se perde. Cada edição sobrescreve a
   anterior sem deixar rastro — o oposto do que uma auditoria ISO precisa ver.

## Decisões de desenho (aprovadas com o usuário)

1. **Periodicidade do diagnóstico é um campo novo**, independente da periodicidade de
   monitoramento do Bloco B. Um indicador pode ser mensal enquanto o diagnóstico do fator é
   revisto anualmente.
2. **O diagnóstico vira histórico append-only**, em tabela própria, seguindo o mesmo padrão
   que os lançamentos do FD (`road_safety_factor_measurements`) já usam. Correção = registro
   novo; nenhum registro existente é editado ou apagado.
3. **O autor é o usuário logado**, carimbado pelo servidor e não editável (é isso que dá valor
   de trilha de auditoria). A **data de referência** é escolhida pelo usuário, com hoje como
   padrão, para permitir registrar um diagnóstico feito dias antes.
4. **A periodicidade gera cobrança**: calcula o próximo diagnóstico, sinaliza vencimento no
   painel do módulo e cria pendência para o responsável do fator no painel "Suas Pendências".
5. **O registro de novos diagnósticos acontece na ficha do fator** (o botão "Ver" do painel,
   que hoje abre o cadastro em modo edição), não no formulário livre.

## Escopo

**Entra:** tabela de diagnósticos, coluna de periodicidade do diagnóstico, endpoints de
listagem e criação, derivação de `currentDiagnosis`/vencimento na API, UI de cadastro
(criação e edição), coluna no painel, provider de pendências, backfill do texto legado.

**Não entra:** editar/apagar diagnóstico (append-only por decisão); anexar arquivo de evidência
ao diagnóstico; notificação por e-mail do vencimento (o painel de pendências já é o canal);
mexer na periodicidade do Bloco B ou no `review_deadline` do Bloco E, que continuam como estão.

## Modelo de dados (`lib/db/src/schema/road-safety.ts`)

### Tabela nova: `road_safety_factor_diagnoses`

Append-only. Espelha `road_safety_factor_measurements`, inclusive nos nomes.

| coluna | tipo | notas |
| --- | --- | --- |
| `id` | serial PK | |
| `organization_id` | integer NOT NULL → `organizations.id` | multi-tenant, como todas |
| `factor_id` | integer NOT NULL → `road_safety_factors.id` ON DELETE CASCADE | |
| `content` | text NOT NULL | o texto do diagnóstico |
| `reference_date` | date NOT NULL | a que data o diagnóstico se refere (default hoje na UI) |
| `diagnosed_by_user_id` | integer → `users.id` ON DELETE SET NULL | **nulo = registro migrado** (autor original não registrado) |
| `created_at` / `updated_at` | timestamptz NOT NULL DEFAULT now() | padrão do repo |

Índice: `road_safety_diagnoses_factor_idx` em `(factor_id, reference_date)`.

`diagnosed_by_user_id` é nulável por duas razões distintas, ambas legítimas: o backfill do texto
legado (autor desconhecido) e o `ON DELETE SET NULL` quando um usuário é removido.

### Coluna nova em `road_safety_factors`

- `diagnosis_periodicity` varchar(20) **NULL** — reusa `ROAD_SAFETY_PERIODICITIES`
  (`monthly` | `quarterly` | `semiannual` | `annual`).

**Nulo = "sem revisão programada"**: o fator não calcula vencimento nem gera pendência. É o
default deliberado — os fatores que a Gabardo já tem em produção não podem nascer todos vencidos
por causa de uma coluna nova.

### `current_diagnosis`: legado, preservado, não mais escrito

A coluna **não é removida** (nenhum dado se perde). Depois do backfill:

- a API passa a **derivar** `currentDiagnosis` do último registro do histórico (compose-on-read,
  o mesmo padrão que o KPI corporativo já usa no repo);
- `POST`/`PATCH` do fator **param de aceitar** `currentDiagnosis`. A única porta de escrita passa
  a ser o endpoint de diagnóstico. Isso elimina a dupla fonte de verdade: sem isso, o texto do
  fator e o último registro do histórico divergiriam em silêncio.

### DDL de deploy (PROD Neon) — aplicar antes do deploy do backend

```sql
ALTER TABLE road_safety_factors
  ADD COLUMN IF NOT EXISTS diagnosis_periodicity varchar(20);

CREATE TABLE IF NOT EXISTS road_safety_factor_diagnoses (
  id serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  factor_id integer NOT NULL REFERENCES road_safety_factors(id) ON DELETE CASCADE,
  content text NOT NULL,
  reference_date date NOT NULL,
  diagnosed_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS road_safety_diagnoses_factor_idx
  ON road_safety_factor_diagnoses (factor_id, reference_date);
```

### Backfill do texto legado (idempotente)

Script em `scripts/src/migrate/` — para cada fator com `current_diagnosis` não vazio **e sem
nenhum diagnóstico no histórico**, cria um registro:

- `content` = `current_diagnosis`;
- `reference_date` = `factor.updated_at::date` — aproximação honesta e a melhor disponível: é
  quando o texto foi gravado pela última vez;
- `diagnosed_by_user_id` = `NULL` — sinaliza "migrado", e a UI diz isso explicitamente em vez de
  atribuir a autoria a alguém que não escreveu aquilo.

A condição "sem histórico" é o que torna o script idempotente (rodar duas vezes não duplica).

## Regra de vencimento (uma função pura, um lugar só)

`artifacts/api-server/src/services/road-safety/diagnosis.ts` (novo):

```
nextDiagnosisDate(factor, lastDiagnosis):
  se factor.diagnosisPeriodicity == null  → null   (sem revisão programada)
  base = lastDiagnosis?.referenceDate ?? factor.createdAt
  return base + { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 } meses

diagnosisStatus(nextDate, now, dueSoonDays = 7):
  null       se nextDate == null            → "none"
  "overdue"  se nextDate  < hoje
  "due_soon" se nextDate <= hoje + dueSoonDays
  "ok"       caso contrário
```

Fator com periodicidade e **nenhum** diagnóstico conta a partir da criação do fator — ou seja,
um fator criado hoje com revisão anual vence daqui a um ano, não imediatamente. `dueSoonDays`
é parâmetro (default 7) para reusar a janela que o painel de pendências já injeta e para manter
a função testável sem mockar relógio.

## Backend (`artifacts/api-server/src/routes/road-safety/index.ts`)

- **`GET /api/organizations/:orgId/road-safety/factors/:id/diagnoses`** — histórico do fator,
  mais recente primeiro (`reference_date DESC, id DESC`), com o nome do autor resolvido por join
  em `users`. Valida que o fator é da organização.
- **`POST /api/organizations/:orgId/road-safety/factors/:id/diagnoses`** — corpo
  `{ content, referenceDate }`. O autor **não vem do corpo**: é `req.user.id`. Zod `.safeParse()`,
  400 em falha; `content` não pode ser vazio; `referenceDate` no formato `YYYY-MM-DD`.
- **Sem PUT e sem DELETE** — append-only, igual a measurements.
- **`GET .../factors`** (listagem) e o payload do fator ganham, por fator:
  `diagnosisPeriodicity`, `currentDiagnosis` (derivado do último registro),
  `lastDiagnosis: { id, content, referenceDate, diagnosedByUserId, diagnosedByName } | null`,
  `nextDiagnosisDate`, `diagnosisStatus`. Resolver o último diagnóstico de todos os fatores em
  **uma query** (não N+1): um `DISTINCT ON (factor_id) ... ORDER BY factor_id, reference_date DESC`.
- **`POST`/`PATCH .../factors`** — aceitam `diagnosisPeriodicity`; `currentDiagnosis` sai do
  contrato de escrita. No **POST**, se vier um `initialDiagnosis` preenchido, o servidor cria o
  fator e o primeiro registro de diagnóstico na mesma transação (autor = usuário logado, data =
  hoje). Um fator pode nascer sem diagnóstico: o campo é opcional.
- Permissão e escopo de organização: os endpoints novos entram sob o mesmo gate do router
  existente do módulo — nenhuma regra de acesso nova é introduzida.

## Contrato OpenAPI + codegen (`lib/api-spec/openapi.yaml`)

Schemas novos: `RoadSafetyFactorDiagnosis`, `CreateRoadSafetyFactorDiagnosisBody`. No
`RoadSafetyFactor` (leitura) entram `diagnosisPeriodicity`, `lastDiagnosis`, `nextDiagnosisDate`
e `diagnosisStatus`, e `currentDiagnosis` passa a ser somente-leitura (derivado). No
`CreateRoadSafetyFactorBody` entram `diagnosisPeriodicity` e `initialDiagnosis`; no
`UpdateRoadSafetyFactorBody`, só `diagnosisPeriodicity` — `currentDiagnosis` **sai** dos dois.
Rodar `pnpm --filter @workspace/api-spec codegen` e **não editar os gerados na mão**.

## Frontend (`artifacts/web/src/pages/app/road-safety/`)

### `_components/cadastro.tsx`

**Criação:** no Bloco A, o textarea passa a se chamar **"Diagnóstico inicial"** (opcional) e ganha
ao lado um Select **"Periodicidade do diagnóstico"** com as quatro opções + **"Sem revisão
programada"** (valor vazio, default).

**Edição (é o que o botão "Ver" do painel abre hoje):** o textarea **vira somente-leitura** — um
card com o último diagnóstico, autor, data de referência e badge de vencimento. Abaixo:

- o Select de periodicidade, editável;
- o botão **"Registrar novo diagnóstico"**, que abre um diálogo (textarea + data de referência,
  default hoje) e faz o POST;
- **"Histórico (N)"**, expansível, listando os registros anteriores (data · autor · texto).

Registro migrado (autor nulo) aparece como *"Registro anterior ao histórico — autor não
registrado"*, e não como um autor em branco.

Fator sem nenhum diagnóstico mostra um empty state com o mesmo botão, não um card vazio.

### `_components/painel.tsx`

Coluna nova **"Diagnóstico"**: badge de status (**Em dia** / **Vence em N dias** / **Vencido** /
**—** quando não há revisão programada) e, abaixo, a data + autor do último diagnóstico. Reusa o
padrão de badge que o módulo já tem em `badges.tsx`.

### `road-safety-client.ts`

Tipos e chaves de query do histórico; invalidação da listagem de fatores ao registrar um
diagnóstico (o status de vencimento no painel muda no mesmo instante).

## Suas Pendências (`artifacts/api-server/src/services/pendencias/`)

Provider novo `providers/road-safety-diagnosis.ts`, registrado em `registry.ts` — o ponto de
extensão que o próprio arquivo documenta.

- `source: "road_safety_diagnosis"` (entra em `PendenciaSource` e `SOURCE_LABELS` como
  "Diagnóstico de fator");
- lista fatores da org **com** `diagnosis_periodicity` e `responsible_user_id` dentro dos
  `responsibleUserIds` do contexto, cujo `nextDiagnosisDate` seja `overdue` ou `due_soon`;
- `title`: "Diagnóstico do {code} — {nome do fator}"; `dueDate`: `nextDiagnosisDate`;
  `link`: rota do módulo de Segurança Viária, CTA "Revisar diagnóstico".

Fator sem periodicidade ou sem responsável **não** vira pendência (não há a quem cobrar).

## Casos de borda

| caso | comportamento |
| --- | --- |
| Fator sem periodicidade | Sem vencimento, sem badge ("—"), sem pendência |
| Fator com periodicidade e sem diagnóstico | Vencimento conta da criação do fator; badge normal |
| Fator com periodicidade e sem responsável | Badge no painel, mas nenhuma pendência (ninguém a cobrar) |
| Diagnóstico com data de referência futura | Permitido; o próximo vencimento simplesmente empurra |
| Dois diagnósticos na mesma data | Permitido; desempate por `id DESC` (o último inserido vale) |
| Autor removido do sistema | `ON DELETE SET NULL` → UI mostra "autor removido", o texto permanece |
| Registro migrado (autor nulo) | UI diz "anterior ao histórico"; nunca inventa autoria |
| Fator apagado | `ON DELETE CASCADE` leva o histórico junto |

## Testes (TDD — teste antes da implementação)

**Unidade** (`artifacts/web/tests/` e/ou node-unit, função pura):
1. `nextDiagnosisDate` nas quatro periodicidades (mensal/trimestral/semestral/anual).
2. `nextDiagnosisDate` = null quando não há periodicidade.
3. Fator sem diagnóstico conta a partir da criação do fator.
4. `diagnosisStatus`: vencido, vence em breve (janela de 7 dias), em dia.

**Integração** (`TEST_ENV=integration`, nunca contra o `.env` de produção):
5. POST cria o registro carimbando `diagnosed_by_user_id` = usuário logado, ignorando qualquer
   autor enviado no corpo.
6. GET devolve o histórico ordenado do mais recente para o mais antigo, com o nome do autor.
7. `currentDiagnosis` do fator passa a ser o texto do último registro (derivado, não a coluna).
8. `PATCH` do fator não escreve mais em `current_diagnosis` (campo fora do contrato).
9. Fator de outra organização → 404 (isolamento multi-tenant).
10. Provider de pendências: acusa fator vencido, ignora fator sem periodicidade e fator sem
    responsável.

**Limpeza:** `e2e/support/cleanup.ts` e o helper de testes de integração precisam apagar
`road_safety_factor_diagnoses` **antes** de `road_safety_factors` e da organização.

## Validação

- `pnpm typecheck` limpo;
- `pnpm exec vitest run --project node-unit` e `--project web-unit` verdes;
- `TEST_ENV=integration pnpm test:integration` verde;
- Verificação manual em ambiente local (porta ≠ 3001 — a 3001 aponta para o Neon de produção).

## Registro

Entrada no diário de bordo ao concluir (`scripts/diario-add.py`, módulo Segurança Viária),
descrevendo o que entrou, o DDL/backfill pendente de produção e o estado do PR #110.
