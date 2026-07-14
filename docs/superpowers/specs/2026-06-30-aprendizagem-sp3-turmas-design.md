# Gestão de Aprendizagem — SP3: Turmas (gestão de turmas/coortes)

**Data:** 2026-06-30
**Branch:** `feat/gestao-aprendizagem`
**Status:** Spec aprovado para virar plano de implementação
**Escopo:** apenas o **SP3**. Iniciativa e decomposição SP0–SP6: ver `2026-06-30-aprendizagem-sp0-modulo-reorg-design.md`.
**Pré-requisitos:** SP0 (módulo), SP1 (catálogo + snapshot), SP2 (obrigatoriedades + pendentes) — concluídos na mesma branch.

---

## 1. Contexto

Hoje os treinamentos são **individuais** (`employee_trainings`, um registro por colaborador). Não existe o conceito de **turma**: agrupar vários colaboradores numa entrega de treinamento, registrar presença/notas/evidências e, ao concluir, gerar os registros de treino de todos de uma vez.

O SP3 introduz a **turma** (instância agendada de um item do catálogo) e o fluxo operacional: inscrever participantes → presença/notas → concluir → gravar o `employee_training` de cada participante (aproveitando o pendente da obrigatoriedade quando existe).

Fatos do código (confirmados):
- `deriveTrainingStatus(status, expirationDate)` deriva `vencido` quando `expirationDate < hoje`; senão devolve o `status`. Valores: `pendente`/`concluido`/`vencido` (não há `programado`).
- Concluir um treino = gravar `status='concluido'`, `completionDate`, `expirationDate`. O snapshot do catálogo (SP1) calcula `expirationDate` de `completionDate + renewalMonths`.
- Evidências: `EmployeeRecordAttachment` (`{ fileName, fileSize, contentType, objectPath }`) em jsonb; upload por **URL pré-assinada** (`objectStorage.createObjectEntityUpload()` → `{ uploadURL, objectPath }`); helpers `sanitizeEmployeeRecordAttachments` + `validateEmployeeRecordAttachments`.
- A view org de treinos já filtra por status — não duplica a turma.
- Codegen via **python3** (ruby ausente, ver SP1 §7.1). Routers montados sob módulo `employees` (`requireModuleAccessForPaths`).

## 2. Objetivo e não-objetivos

**Objetivo:** modelar turmas e participantes; permitir criar turma (stepper), inscrever colaboradores, registrar presença/notas/evidências, e **concluir** a turma gravando o `employee_training` de cada participante presente e aprovado.

**Não-objetivos (adiados, registrados):**
- **Status `programado`** e a **tela "Gestão de treinamentos"** (triagem operacional vencido/a-vencer/pendente/programado/realizado, screen 3): visual e ligado àquela triagem; a view org de treinos cobre o essencial. Fica para fase própria.
- **Reinscrição automática por vencimento** (gerar turma quando obrigatório vence) — ligado à recorrência adiada no SP2.
- SP4+ (PAT, Eficácia, Dashboard) e expansão de `contractType`.

## 3. Modelo de dados

Em `lib/db/src/schema/learning-catalog.ts` (coesão de domínio) ou arquivo próprio — decidir no plano.

### 3.1. `training_classes` (nova, org-level)

| Coluna | Tipo | Nulo | Notas |
|---|---|---|---|
| id | serial PK | não | |
| organizationId | integer FK organizations (cascade) | não | |
| catalogItemId | integer FK training_catalog (cascade) | não | treinamento da turma |
| code | text | sim | ex.: "T02" (livre/gerado) |
| startDate | date | não | início |
| endDate | date | sim | término |
| unitId | integer FK units (set null) | sim | filial |
| location | text | sim | sala/local |
| instructor | text | sim | instrutor responsável |
| modality | text | sim | Presencial/EAD/Híbrido/Externo |
| workloadHours | integer | sim | |
| capacity | integer | sim | vagas |
| minScore | integer | sim | nota mínima de aprovação |
| status | text | não | default 'agendada' (agendada/em_andamento/realizada/cancelada) |
| notes | text | sim | |
| attachments | jsonb `EmployeeRecordAttachment[]` | não | default `[]` — evidências |
| createdAt / updatedAt | timestamptz | não | |

### 3.2. `training_class_participants` (nova)

| Coluna | Tipo | Nulo | Notas |
|---|---|---|---|
| id | serial PK | não | |
| classId | integer FK training_classes (cascade) | não | |
| employeeId | integer FK employees (cascade) | não | |
| attendance | text | sim | 'presente' \| 'faltou' |
| score | integer | sim | nota |
| result | text | sim | 'aprovado' \| 'reprovado' |
| employeeTrainingId | integer | sim | registro de treino vinculado (plain int; FK via DDL set null) |
| createdAt | timestamptz | não | |

Índice **único** `(classId, employeeId)`.

## 4. Fluxo e serviço de conclusão

### 4.1. Inscrição
Ao adicionar um colaborador à turma: cria a linha em `training_class_participants`. Se o colaborador tem um `employee_training` **pendente** do mesmo `catalogItemId`, vincula `employeeTrainingId` a ele (para aproveitar na conclusão e não duplicar). Respeita `capacity` (não bloqueia, mas pode avisar).

### 4.2. Presença / notas
PATCH do participante: `attendance`, `score`. `result` derivado: **aprovado** se `attendance='presente'` e (`minScore` nulo **ou** `score ≥ minScore`); senão **reprovado** (permite override manual do `result`).

### 4.3. Conclusão — serviço `completeTrainingClass`
`completeTrainingClass({ orgId, classId, database }) -> { completed: number }`:
1. Carrega a turma (org-scoped) e o item do catálogo.
2. `completionDate` = `endDate ?? startDate`; `expirationDate` = `completionDate + validityMonths` (do catálogo) ou null.
3. Para cada participante **presente e aprovado** (`attendance='presente'` e `result!=='reprovado'`):
   - se `employeeTrainingId` (pendente vinculado): **atualiza** esse registro → `status='concluido'`, `completionDate`, `expirationDate`, `attachments` da turma opcionalmente herdadas;
   - senão: **cria** um `employee_training` (snapshot do catálogo, reusa a mecânica do SP1) já `concluido` com as datas, e vincula `employeeTrainingId` ao participante.
4. Marca a turma `status='realizada'`.
5. Idempotente: concluir 2x não duplica (participante já concluído é pulado).

> Participantes ausentes/reprovados **não** geram conclusão (o pendente permanece pendente). Cancelar turma (`status='cancelada'`) não altera treinos.

## 5. API / contrato

Fonte da verdade `openapi.yaml`. Tag nova **`training-classes`**. Codegen via **python3**. Router montado sob módulo `employees`.

- `GET /organizations/:orgId/training-classes` — lista; filtros `status, unitId, catalogItemId`. Inclui contagem de inscritos.
- `POST /organizations/:orgId/training-classes` — cria turma.
- `GET /organizations/:orgId/training-classes/:id` — detalhe (turma + participantes).
- `PATCH /organizations/:orgId/training-classes/:id` — edita turma (inclui `attachments`/evidências).
- `DELETE /organizations/:orgId/training-classes/:id` — exclui.
- `POST /organizations/:orgId/training-classes/:id/participants` — inscreve colaborador(es) (`employeeIds`).
- `PATCH /organizations/:orgId/training-classes/:id/participants/:participantId` — presença/nota/resultado.
- `DELETE /organizations/:orgId/training-classes/:id/participants/:participantId` — remove inscrito.
- `POST /organizations/:orgId/training-classes/:id/complete` — conclui (chama o serviço) → `{ completed }`.

Mutações com `requireWriteAccess`; org-scoped. Evidências validadas com `sanitize/validateEmployeeRecordAttachments` existentes.

## 6. Frontend

Tela **Turmas** (`/aprendizagem/turmas`) + item no menu Aprendizagem (maquinaria SP0–SP2).
- **Lista** com filtros (status/filial) e contagem de inscritos.
- **Nova turma** (modal stepper, 3 passos): treinamento (catálogo) → dados da turma (datas/filial/local/instrutor/modalidade/carga/vagas/nota mínima/status) → participantes (busca + seleção de colaboradores).
- **Painel de detalhe** (ao selecionar uma turma): abas **Presença** (toggle presente/faltou), **Notas** (input de nota + resultado), **Evidências** (upload por URL pré-assinada → attachments). Botão **Concluir turma** (chama `/complete`) com toast do resumo.

## 7. Bridge / sem migração

- Tabelas novas; nada retroativo. `employee_trainings` ganha registros novos (ou atualiza pendentes vinculados) só ao concluir turmas.
- `drizzle push` (DB de teste) adiciona 2 tabelas; FK de `employeeTrainingId` por DDL (set null). Nunca push em PROD pela branch.

## 8. Validação / testes

- **Backend (integração):** CRUD turma + participantes; inscrição vincula pendente existente (`employeeTrainingId`); `result` derivado de score/minScore; **conclusão** grava concluído com `completionDate`/`expirationDate` corretos (atualiza o pendente vinculado, não duplica), e pula ausentes/reprovados; idempotência (concluir 2x). Evidências (attachments) validadas.
- **Frontend (web-unit):** render da lista + stepper; painel presença/notas; upload mock.
- **Contrato/build:** `pnpm typecheck` + `pnpm --filter @workspace/web build` limpos após codegen.
- **Regressão:** SP1/SP2 (catálogo, competências, obrigatoriedades, auto-vínculo, snapshot) seguem verdes.

## 9. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Conclusão duplicar treinos | Reaproveita pendente vinculado; idempotência (pula já concluído); teste |
| Ciclo de import na FK employeeTrainingId | Plain integer + FK por DDL (set null), padrão do repo |
| Upload de evidência malformado | `sanitize/validateEmployeeRecordAttachments` existentes |
| `drizzle push`/PROD | DDL aditiva no DB de teste; nunca push puro |
| Snapshot duplicado de campos do catálogo | Aceito por design (evidência autocontida); link mantém rastreio |

## 10. Critérios de aceitação (DoD do SP3)

- [ ] Tabelas `training_classes` + `training_class_participants` (FK `employeeTrainingId` via DDL) criadas.
- [ ] CRUD de turma + participantes (inscrever/presença/nota/remover) + evidências (attachments) no contrato (zod+hooks via python3).
- [ ] Serviço `completeTrainingClass` (grava/atualiza `employee_training` dos aprovados, idempotente) + endpoint `/complete`, com testes de integração.
- [ ] Tela **Turmas** (lista + stepper + painel presença/notas/evidências + concluir) + item no menu.
- [ ] `pnpm typecheck` + `pnpm --filter @workspace/web build` limpos; testes de integração e regressão verdes.
- [ ] Sem alteração destrutiva; sem `programado`/triagem (adiados).

## 11. Follow-ups (registrados, fora do SP3)

- Status `programado` + tela "Gestão de treinamentos" (triagem operacional).
- Reinscrição automática por vencimento (recorrência).
- SP4 — Programa Anual (PAT) que planeja e dispara turmas.
- Certificados por participante (geração) a partir da turma concluída.
