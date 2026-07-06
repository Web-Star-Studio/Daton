# Gestão de Aprendizagem — SP5: Avaliação de eficácia (workflow) + Minha área

**Data:** 2026-06-30
**Branch:** `feat/gestao-aprendizagem`
**Status:** Spec aprovado para virar plano de implementação
**Escopo:** apenas o **SP5**. Iniciativa e decomposição SP0–SP6: ver `2026-06-30-aprendizagem-sp0-modulo-reorg-design.md`.
**Pré-requisitos:** SP0–SP4 concluídos na mesma branch.

---

## 1. Contexto

Este SP entrega a **avaliação de eficácia dos treinamentos** (ISO 10015 §4.5, Kirkpatrick L3/L4) como um workflow/kanban, e a **Minha área** (visão pessoal). É, em grande parte, **reaproveitamento** — três peças já existem no código:

- **`training_effectiveness_reviews`** (schema `employees.ts`): review de eficácia por treino (`trainingId`, `evaluatorUserId`, `evaluationDate`, `score`, `isEffective`, `resultLevel`, `comments`, `attachments`). Já há rotas GET/POST de review por treino, e a listagem org (`GET /employees/trainings`) já devolve `effectivenessStatus` (`pending`/`in_review`/`effective`/`ineffective` — `in_review` adicionado no SP6/B) + `latestEffectivenessReview` + contagem `effectivenessPending`.
- **Planos de ação (Gestão de Ações)** já mergeados na main com origem **`training`** (`sourceRef.trainingId`) e resolvedor de origem que mostra o título do treino. Componentes reutilizáveis prontos: **`CriarAcaoButton`** (`source={{ sourceModule: "training", sourceRef: { trainingId } }}`) e **`AcoesVinculadas`** (`sourceModule="training" refId={trainingId}`) — **já usados em `treinamento-detalhe.tsx`**.
- **`users.employee_id`** (vínculo usuário↔colaborador) já existe no banco.

## 2. Objetivo e não-objetivos

**Objetivo:** tela de **Avaliação de eficácia** (kanban + modal de avaliação + "criar plano de ação" reutilizado) e tela **Minha área** (colaborador + gestor leve), reaproveitando os endpoints e componentes existentes; com o mínimo de backend (expor `employeeId` no usuário logado).

**Não-objetivos (adiados, registrados):**
- **Papel do avaliador** (gestor/colaborador/instrutor) e **prazo de eficácia** como colunas dedicadas — no SP5 deriva-se "pendente" de *concluído sem review eficaz*; papel/prazo explícitos ficam como follow-up.
- **Critérios Kirkpatrick estruturados** (tabela/jsonb de critérios) — usa-se os campos existentes (`score`/`isEffective`/`resultLevel`/`comments`), com o modal compondo o veredito.
- **Gestor rico** na Minha área — no SP5 o gestor tem uma visão **leve** (pendências da filial); versão rica é follow-up.
- SP6 (Dashboard/Indicadores) e expansão de `contractType`.

## 3. Backend (mínimo)

Única adição: **expor `employeeId` do colaborador vinculado ao usuário logado** para a Minha área.
- Incluir `employeeId` (integer, nullable) na resposta de `GET /api/auth/me` (schema `AuthUser`/equivalente no `openapi.yaml`) e no contexto de auth do frontend. Origem: `users.employee_id`.
- Nenhuma tabela nova. Codegen via **python3**.

Todo o resto reaproveita endpoints existentes:
- Kanban de eficácia: `GET /organizations/:orgId/employees/trainings` com filtros `status=concluido` + `effectivenessStatus` (`pending`/`in_review`/`effective`/`ineffective` — `in_review` no SP6/B).
- Registrar avaliação: `POST /organizations/:orgId/employees/:empId/trainings/:trainId/effectiveness-reviews` (existente).
- Planos de ação: endpoints/componentes existentes (origem `training`).
- Minha área: endpoints por-colaborador existentes (`GET /employees/:id`, `.../trainings`, `.../competencies`), usando o `employeeId` do usuário.

## 4. Tela **Avaliação de eficácia** (`/aprendizagem/eficacia`)

Kanban/triagem sobre os dados existentes + item novo no menu Aprendizagem.
- **Indicadores** (cards): pendentes, % eficazes, não eficazes, avaliadas.
- **Colunas do kanban** (derivadas de `effectivenessStatus` dos treinos concluídos):
  - **Pendentes:** treino `concluido` com `effectivenessStatus = pending` (sem review nem atribuição de avaliação, com critério de eficácia presente — `evaluationMethod`/`targetCompetencyName`) — a avaliar.
  - **Em avaliação:** `effectivenessStatus = in_review` — avaliação **atribuída** (papel/prazo em `effectivenessAssignedRole`/`effectivenessDueDate`) mas ainda **sem review registrada**. _(Estado `in_review` introduzido no SP6/B; substitui a noção anterior de "review parcial".)_
  - **Concluídas:** `effectivenessStatus ∈ {effective, ineffective}` (review registrada com veredito).
- **Modal de avaliação:** ao abrir um card, formulário com critérios **Kirkpatrick L3/L4** (comportamento, resultado, transferência) — o modal compõe `score`, `isEffective` (veredito) e `resultLevel`, e envia via o POST de review existente. Após salvar, o card muda de coluna.
- **Não eficaz →** `CriarAcaoButton` (reuso, `sourceModule="training"`, `sourceRef.trainingId`) + `AcoesVinculadas` (mostra ações já ligadas ao treino). Sem backend novo.

## 5. Tela **Minha área** (`/aprendizagem/minha-area`)

Visão pessoal, resolvendo o colaborador do usuário logado via `employeeId` (do `/auth/me`) + item novo no menu.
- **Colaborador:** cabeçalho com dados do colaborador; **meus treinamentos** (status/validade), **minhas competências** (nível/gap), e **avaliações de eficácia pendentes** para responder.
- **Gestor (toggle, leve):** pendências agregadas da **filial** do colaborador (reusa `GET /employees/trainings` filtrado por unidade + `effectivenessStatus=pending`).
- Estado vazio elegante quando o usuário não tem colaborador vinculado (`employeeId` nulo).

## 6. Bridge / sem migração

- Nenhuma tabela nova; nenhuma alteração destrutiva. A única mudança de schema-contrato é aditiva (`employeeId` no `/auth/me`).
- `pnpm --filter @workspace/db push` não é necessário (sem schema novo). Codegen apenas para o `employeeId` no contrato.

## 7. Validação / testes

- **Backend (integração):** `GET /auth/me` passa a incluir `employeeId` (nulo quando sem vínculo; preenchido quando `users.employee_id` setado).
- **Frontend (web-unit):** render do kanban de eficácia (colunas derivadas de `effectivenessStatus`, mock dos hooks); modal de avaliação chama o POST de review; Minha área resolve `employeeId` e lista treinos/competências (mock); estado vazio sem vínculo.
- **Contrato/build:** `pnpm typecheck` + `pnpm --filter @workspace/web build` limpos após codegen.
- **Regressão:** SP1–SP4 e os fluxos de colaboradores/treinos seguem verdes.

## 8. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Expor `employeeId` no /auth/me quebrar consumidores do user | Campo aditivo opcional; typecheck cobre os consumidores |
| Kanban divergir do modelo simples de review | Derivar colunas de `effectivenessStatus` (já calculado no backend); modal reusa o POST existente |
| "Em avaliação" sem estado explícito | Se não houver estado parcial claro, colapsar em 2 colunas (Pendentes/Concluídas) — decisão no plano, sem novo schema |
| Usuário sem colaborador vinculado | Estado vazio na Minha área |

## 9. Critérios de aceitação (DoD do SP5)

- [ ] `GET /auth/me` expõe `employeeId` (contrato + auth context); codegen via python3.
- [ ] Tela **Avaliação de eficácia** (`/aprendizagem/eficacia`): kanban por `effectivenessStatus`, indicadores, modal de avaliação (reusa o POST de review), e "criar plano de ação"/"ações vinculadas" reutilizados (origem `training`). Item no menu.
- [ ] Tela **Minha área** (`/aprendizagem/minha-area`): visão colaborador (treinos/competências/eficácia pendente) + gestor leve (pendências da filial), resolvendo `employeeId`; estado vazio sem vínculo. Item no menu.
- [ ] `pnpm typecheck` + `pnpm --filter @workspace/web build` limpos; testes verdes.
- [ ] Sem tabelas novas; papel/prazo/critérios estruturados e gestor rico adiados.

## 10. Follow-ups (registrados, fora do SP5)

- Papel do avaliador (gestor/colaborador/instrutor) e prazo de eficácia como campos dedicados; critérios Kirkpatrick estruturados.
- Gestor rico na Minha área (equipe por hierarquia real, não só filial).
- SP6 — Dashboard + Indicadores LMS (consome eficácia + cumprimento do PAT).
