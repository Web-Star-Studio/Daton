# Gestão de Aprendizagem — SP4: Programa Anual de Treinamento (PAT)

**Data:** 2026-06-30
**Branch:** `feat/gestao-aprendizagem`
**Status:** Spec aprovado para virar plano de implementação
**Escopo:** apenas o **SP4**. Iniciativa e decomposição SP0–SP6: ver `2026-06-30-aprendizagem-sp0-modulo-reorg-design.md`.
**Pré-requisitos:** SP0–SP3 (módulo, catálogo, obrigatoriedades, turmas) — concluídos na mesma branch.

---

## 1. Contexto

O PAT (Programa Anual de Treinamento, ISO 10015 §4.4) é o **plano anual** de treinamentos: o que se pretende realizar, por filial, ao longo do ano. Hoje não existe — as turmas (SP3) são criadas avulsas. O SP4 introduz o plano e a ligação "item do plano → turma que o cumpre", reaproveitando 100% as turmas do SP3.

## 2. Objetivo e não-objetivos

**Objetivo:** modelar os itens do programa anual (treinamento planejado por ano/filial/mês), com CRUD, indicadores do programa, e a ação "criar turma" a partir de um item (que vincula a turma ao item).

**Não-objetivos (adiados, registrados):**
- **`status='realizada'` automático** quando a turma vinculada é concluída: no SP4 o status é manual; "criar turma" marca `em_andamento`. A derivação automática fica como follow-up.
- SP5 (Eficácia/Minha área), SP6 (Dashboard/Indicadores) e expansão de `contractType`.

## 3. Modelo de dados

### `annual_training_program` (nova, org-level)

Em `lib/db/src/schema/learning-catalog.ts` (coesão de domínio) ou arquivo próprio — decidir no plano.

| Coluna | Tipo | Nulo | Notas |
|---|---|---|---|
| id | serial PK | não | |
| organizationId | integer FK organizations (cascade) | não | |
| year | integer | não | ano do programa |
| catalogItemId | integer FK training_catalog (cascade) | não | treinamento planejado |
| unitId | integer FK units (set null) | sim | filial |
| plannedMonth | integer | sim | 1–12 (mês previsto) |
| modality | text | sim | Presencial/EAD/Híbrido/Externo |
| plannedQuantity | integer | sim | qtd prevista de participantes |
| responsible | text | sim | responsável |
| status | text | não | default 'planejada' (planejada/em_andamento/realizada/cancelada) |
| notes | text | sim | |
| classId | integer | sim | turma que cumpre o item; plain int, FK via DDL (set null) |
| createdAt / updatedAt | timestamptz | não | |

## 4. Fluxo

### 4.1. CRUD dos itens
Adicionar/editar/excluir item: ano, treinamento (catálogo), filial, mês previsto, modalidade, qtd prevista, responsável, status, observação.

### 4.2. "Criar turma" a partir de um item (orquestrado no frontend)
Reaproveita o endpoint de turmas do SP3: ao clicar "Criar turma" num item, o frontend (1) cria a turma pré-preenchida (`catalogItemId`, `unitId`, `modality`, `startDate` do mês previsto) via `createTrainingClass`; (2) faz `PATCH` do item do PAT com `classId` (id da turma) e `status='em_andamento'`. Quando o item já tem `classId`, o botão vira **"Ver turma"** (navega à tela de Turmas). Sem novo acoplamento de backend além do campo `classId` no item.

### 4.3. Indicadores do programa
Calculados da lista filtrada (ano/filial): total planejado, realizadas, em andamento, planejadas/pendentes, e % realizado.

## 5. API / contrato

Fonte da verdade `openapi.yaml`. Tag nova **`annual-program`**. Codegen via **python3** (ver SP1 §7.1). Router montado sob módulo `employees`.

- `GET /organizations/:orgId/annual-program` — lista; filtros `year, unitId, status`.
- `POST /organizations/:orgId/annual-program` — cria item.
- `PATCH /organizations/:orgId/annual-program/:id` — edita item (inclui `classId`/`status`).
- `DELETE /organizations/:orgId/annual-program/:id` — exclui.

Mutações com `requireWriteAccess`; org-scoped. O vínculo `classId` é gravado via o PATCH normal (não há endpoint especial).

## 6. Frontend

Tela **Programa anual** (`/aprendizagem/programa`) + item no menu Aprendizagem (maquinaria SP0–SP3).
- **Indicadores** (cards): total planejado / realizadas / em andamento / planejadas.
- **Filtros:** ano + filial.
- **Tabela de itens:** treinamento (catálogo), filial, mês previsto, modalidade, qtd prevista, responsável, status. **"Adicionar item"** (modal) e ação por linha **"Criar turma"** (sem `classId`) / **"Ver turma"** (com `classId`).
- "Criar turma": cria a turma (reuso do SP3) + PATCH do item (`classId`, `em_andamento`); toast de confirmação.

## 7. Bridge / sem migração

- Tabela nova; nada retroativo. `drizzle push` (DB de teste) adiciona 1 tabela; FK de `classId` por DDL (set null). Nunca push em PROD pela branch.

## 8. Validação / testes

- **Backend (integração):** CRUD do item do PAT + filtros (year/unitId/status); PATCH grava `classId`/`status`.
- **Frontend (web-unit):** render da tabela + indicadores; modal de adicionar item; "criar turma" dispara create + patch (mock dos hooks).
- **Contrato/build:** `pnpm typecheck` + `pnpm --filter @workspace/web build` limpos após codegen.
- **Regressão:** SP1–SP3 seguem verdes.

## 9. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Ciclo de import na FK classId | Plain integer + FK por DDL (set null), padrão do repo |
| "Criar turma" parcial (turma criada, PATCH falha) | Tratar erro no frontend (toast); o item fica sem `classId` e o botão permanece "Criar turma" (idempotente do ponto de vista do usuário) |
| `drizzle push`/PROD | DDL aditiva no DB de teste; nunca push puro |

## 10. Critérios de aceitação (DoD do SP4)

- [ ] Tabela `annual_training_program` (FK `classId` via DDL) criada.
- [ ] CRUD do item do PAT no contrato (zod+hooks via python3).
- [ ] Tela **Programa anual** (indicadores + filtros + tabela + adicionar item + criar/ver turma) + item no menu.
- [ ] "Criar turma" reaproveita o endpoint de turmas do SP3 e vincula `classId`/`status`.
- [ ] `pnpm typecheck` + `pnpm --filter @workspace/web build` limpos; testes de integração e regressão verdes.
- [ ] Status manual (auto-realizada adiado).

## 11. Follow-ups (registrados, fora do SP4)

- `status='realizada'` automático ao concluir a turma vinculada.
- SP5 — Eficácia (workflow) + Minha área.
- SP6 — Dashboard + Indicadores LMS (consome o PAT para % de cumprimento).
