# Gestão de Aprendizagem — SP2: Obrigatoriedades (motor de auto-vínculo)

**Data:** 2026-06-30
**Branch:** `feat/gestao-aprendizagem`
**Status:** Spec aprovado para virar plano de implementação
**Escopo:** apenas o **SP2**. Iniciativa e decomposição SP0–SP6: ver `2026-06-30-aprendizagem-sp0-modulo-reorg-design.md`.
**Pré-requisitos:** SP0 (módulo) + SP1 (catálogo de treinamentos `training_catalog` + snapshot de treino) — concluídos na mesma branch.

---

## 1. Contexto

O SP1 criou o **catálogo de treinamentos** (definições reutilizáveis) e a mecânica de **snapshot** ao lançar um treino para um colaborador (`employee_trainings.catalog_item_id`). O SP2 introduz o **coração do LMS**: as **obrigatoriedades** — regras que dizem "para o cargo X, o treinamento Y do catálogo é obrigatório" — e o **motor de auto-vínculo** que, na admissão e na mudança de cargo, gera automaticamente os treinamentos pendentes do colaborador, **aproveitando** os que ele já tem concluídos e válidos.

Fatos do código (confirmados):
- Criar colaborador insere a linha numa **transação** (`tx`) em `routes/employees.ts` (~1342–1349); ponto de gancho logo após o insert, dentro da `tx`.
- Editar colaborador (PATCH) aceita `position`, mas **não detecta** mudança de cargo (gancho antes do `.update`, ~2269).
- `employee.position` é **texto**, casado por **nome** com `positions.name` (mapeamento já usado no endpoint de competency-gaps, ~1656–1703). O cargo nas regras será por **positionId** (consistente com `position_competency_requirements`).
- `employee_trainings` **não tem** coluna de prazo do pendente (`dueDate`).
- O **scheduler** (node-cron, `lib/governance-scheduler.ts`) já existe — relevante apenas para o item adiado de recorrência.
- O cadastro de colaborador no frontend é um **stepper de 3 passos** (Pessoal / Profissional / Histórico); o cargo é escolhido no passo Profissional.

## 2. Objetivo e não-objetivos

**Objetivo:** modelar as obrigatoriedades (regra cargo × item do catálogo) e um motor que gera os treinamentos pendentes do colaborador na admissão e na mudança de cargo, com aproveitamento dos válidos; com tela de gestão das regras e preview no cadastro.

**Não-objetivos (fora do SP2 — adiados, registrados):**
- **Regeneração automática por recorrência** (recriar pendente quando um obrigatório vence): o campo `recurrence` é gravado, mas a **job periódica** no scheduler é follow-up.
- **Histórico persistente de recálculo** (tabela "mudança de cargo" do mockup): no SP2 deriva-se de `requirementId`+`createdAt` e mostra-se o resumo na hora; tabela de log dedicada é follow-up.
- SP3+ (Turmas, PAT, Eficácia, Dashboard), e a expansão de `contractType`.

## 3. Modelo de dados

### 3.1. `training_requirements` (nova, org-level)

Em `lib/db/src/schema/learning-catalog.ts` (mesmo arquivo dos catálogos, por coesão de domínio) ou arquivo próprio — decidir no plano.

| Coluna | Tipo | Nulo | Notas |
|---|---|---|---|
| id | serial PK | não | |
| organizationId | integer FK organizations (cascade) | não | |
| positionId | integer FK positions (cascade) | não | o cargo |
| catalogItemId | integer FK training_catalog (cascade) | não | o treinamento |
| deadlineType | text | não | 'fixo' \| 'programa' \| 'rh' |
| deadlineDays | integer | sim | dias após admissão (para 'fixo') |
| scope | text | não | 'geral' \| 'filial' (default 'geral') |
| filialUnitIds | jsonb int[] | não | default '[]'; unidades quando scope='filial' |
| recurrence | text | não | default 'nao_repete' ('anual'/'bienal'/'conforme_validade') |
| isCritical | boolean | não | default false |
| norm | text | sim | opcional; se vazio, usa a do item do catálogo |
| notes | text | sim | justificativa/observação |
| createdAt / updatedAt | timestamptz | não | defaultNow + $onUpdate |

> FKs `positionId`/`catalogItemId` podem ser `.references()` diretas (sem ciclo: learning-catalog importa positions/organizations; positions não importa learning-catalog). Confirmar no plano para evitar ciclo; se houver, aplicar FK por DDL como em `catalog_item_id`.

### 3.2. Colunas novas em `employee_trainings` (aditivas)

- `dueDate` (date, nullable) — prazo do pendente gerado por obrigatoriedade.
- `requirementId` (integer, nullable) — rastreia qual regra gerou o registro. Plain integer no schema; FK real via DDL (`ON DELETE SET NULL`) para evitar ciclo, padrão de `catalog_item_id`.

## 4. O motor — `applyTrainingRequirements`

Serviço novo em `artifacts/api-server/src/services/aprendizagem/requirements-engine.ts`:

```
applyTrainingRequirements({ orgId, employeeId, db|tx }) -> { generated: [...], reused: [...] }
```

1. Carrega o colaborador (`position` texto, `unitId`, `admissionDate`). Sem `position` → retorna vazio.
2. Resolve `positionId` por `positions.name` = `employee.position` (org-scoped). Sem match → retorna vazio.
3. Carrega regras (`training_requirements`) do `positionId`, filtrando escopo: `scope='geral'` **ou** (`scope='filial'` **e** `filialUnitIds` contém `employee.unitId`).
4. Para cada regra:
   - **Aproveitamento:** se o colaborador já tem um `employee_training` do mesmo `catalogItemId` **concluído e válido** (`status='concluido'` e (`expirationDate` nula **ou** ≥ hoje)) → conta em `reused`, pula.
   - **Dedup:** se já há um `employee_training` **pendente** com o mesmo `requirementId` (ou mesmo `catalogItemId` ainda pendente) → pula.
   - **Gera:** cria um `employee_training` pendente — **snapshot** dos campos do item do catálogo (reusa a lógica do SP1: title/objective/instrutor/competência/carga/validade→renewalMonths), `status='pendente'`, `catalogItemId`, `requirementId`, e `dueDate`:
     - `deadlineType='fixo'` → `admissionDate + deadlineDays`;
     - `deadlineType='programa'` ou `'rh'` → `null`.
     Conta em `generated`.
5. Retorna o resumo.

**Idempotência:** chamar o motor repetidamente não duplica (dedup por requirement/catalogItem pendente + aproveitamento). Seguro para re-execução na mudança de cargo.

## 5. Integração (ganchos)

- **Criar colaborador** (`POST /organizations/:orgId/employees`, dentro da `tx`, após o insert ~1349): chamar `applyTrainingRequirements({ orgId, employeeId: createdEmployee.id, tx })`. O resumo `{generated, reused}` vai no corpo da resposta (campo `autoLinkedTrainings`) para o toast.
- **Mudança de cargo** (`PATCH /organizations/:orgId/employees/:empId`, antes do `.update` ~2269): buscar o colaborador atual; se `body.position` veio e difere do atual, após aplicar o update chamar `applyTrainingRequirements({ orgId, employeeId, db })`. Nunca apaga registros existentes; só adiciona/aproveita. Incluir o resumo na resposta.

## 6. API / contrato

Fonte da verdade `openapi.yaml`. Tag nova **`training-requirements`**. Codegen via **python3** (ruby ausente — ver SP1 §7.1). Nunca editar gerado.

CRUD (org-scoped; `requireAuth`; mutações `requireWriteAccess`; montado sob módulo `employees`, como os catálogos do SP1):
- `GET /organizations/:orgId/training-requirements` — lista; filtros `positionId, deadlineType, scope`.
- `POST /organizations/:orgId/training-requirements` — cria.
- `PATCH /organizations/:orgId/training-requirements/:id` — edita.
- `DELETE /organizations/:orgId/training-requirements/:id` — exclui.
- `GET /organizations/:orgId/training-requirements/preview?position=<nome>&unitId=<id>` — resolve cargo+filial → regras que se aplicariam (sem gerar); retorna a lista de regras com o item do catálogo. Alimenta o preview do cadastro.

Resposta de criar/editar colaborador ganha `autoLinkedTrainings: { generated: [...], reused: [...] }` (campos resumidos) no schema correspondente.

## 7. Frontend

1. **Cronograma de obrigatoriedades** — tela `/aprendizagem/obrigatoriedades` + item no menu Aprendizagem (mesma maquinaria do SP0/SP1). Matriz de regras (cargo, treinamento, norma, prazo/origem, escopo, recorrência, crítico) com filtros; modal "Nova obrigatoriedade" (cargo via positions, treinamento via catálogo, tipo de prazo, escopo/filiais, recorrência, crítico, norma, justificativa); editar/excluir.
2. **Preview no cadastro** — no passo Profissional do stepper (após escolher cargo + filial), consumir o endpoint de preview e listar "Treinamentos obrigatórios que serão vinculados". Read-only.
3. **Toast pós-cadastro/mudança de cargo** — usar `autoLinkedTrainings` da resposta: "N treinamento(s) vinculado(s) · M aproveitado(s)".

## 8. Bridge / sem migração

- `training_requirements` é nova; `employee_trainings.dueDate`/`requirementId` são nullable. Registros e fluxos existentes seguem intactos.
- O motor só **adiciona** pendentes; nunca remove/edita histórico. Colaboradores existentes não são tocados retroativamente (sem backfill no SP2; um backfill opcional pode ser follow-up).
- `drizzle push` (no DB de teste) adiciona 1 tabela + 2 colunas; FKs de `requirementId` por DDL. Nunca push em PROD pela branch.

## 9. Validação / testes

- **Motor (integração):** admissão de colaborador com cargo que tem regras → gera pendentes com `dueDate` correto (fixo = admissão+dias; programa/rh = null) e `requirementId`/`catalogItemId` setados; aproveitamento (colaborador com treino concluído válido daquele item → não regenera, conta em `reused`); idempotência (rodar 2x não duplica); mudança de cargo gera os novos e aproveita os válidos; escopo filial (regra de filial só aplica ao `unitId` correspondente).
- **CRUD `training_requirements` (integração):** create/list/update/delete + filtros; preview resolve cargo(nome)+filial → regras corretas.
- **Frontend (web-unit):** render da matriz + modal; preview lista regras (mock dos hooks).
- **Contrato/build:** `pnpm typecheck` e `pnpm --filter @workspace/web build` limpos após codegen.
- **Regressão:** testes de colaboradores/treinos seguem verdes (o gancho no create/update não quebra os fluxos existentes).

## 10. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Gancho no create dentro da `tx` falhar e abortar o cadastro | Motor robusto (sem exceção em ausência de cargo/regra); cobrir por teste; se necessário, capturar erro do motor sem derrubar o insert |
| Duplicação de pendentes | Dedup por requirement/catalogItem pendente + aproveitamento; teste de idempotência |
| Ciclo de import nas FKs | `positionId`/`catalogItemId` diretos (sem ciclo); `requirementId` por DDL |
| `position` texto sem match em `positions` | Motor retorna vazio (sem erro); preview idem |
| `drizzle push`/PROD | DDL aditiva no DB de teste; nunca push puro de branch atrasada |

## 11. Critérios de aceitação (DoD do SP2)

- [ ] Tabela `training_requirements` + colunas `employee_trainings.dueDate`/`requirementId` (FK via DDL) criadas.
- [ ] Motor `applyTrainingRequirements` com aproveitamento, dedup, `dueDate` por tipo de prazo, escopo filial — com testes de integração.
- [ ] Gancho na criação (na `tx`) e na mudança de cargo (PATCH) gerando/aproveitando; resposta com `autoLinkedTrainings`.
- [ ] CRUD + preview de `training-requirements` no contrato (zod+hooks gerados via python3).
- [ ] Tela Cronograma de obrigatoriedades + item no menu + preview no stepper de cadastro + toast.
- [ ] `pnpm typecheck` + `pnpm --filter @workspace/web build` limpos; testes de integração e regressão verdes.
- [ ] Sem alteração destrutiva; sem backfill de colaboradores existentes.

## 12. Follow-ups (registrados, fora do SP2)

- Regeneração por recorrência (job no governance-scheduler) quando obrigatório vence.
- Histórico persistente de recálculo (tabela de log de mudança de cargo).
- Backfill opcional: aplicar o motor aos colaboradores existentes (gerar pendentes retroativos).
- SP3 — Turmas (consome obrigatoriedades pendentes para formar turmas).
