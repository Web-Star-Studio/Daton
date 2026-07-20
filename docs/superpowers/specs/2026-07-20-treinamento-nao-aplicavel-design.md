# Treinamento "Não aplicável" — Design

**Data:** 2026-07-20
**Módulo:** Aprendizagem
**Origem:** pedido do time de RH da cliente — no diálogo "Registrar conclusão" (ficha do colaborador), poder marcar um treinamento como **Não aplicável** e, ao selecionar, preencher um **motivo obrigatório**.

## Problema

Hoje o status de um treinamento do colaborador só admite `pendente | concluido | vencido`. Quando um treinamento simplesmente **não se aplica** àquela pessoa (mudou de função, atividade não executada, dispensa técnica), o RH não tem como registrar isso: o item fica eternamente como pendente, sendo cobrado em todas as telas e puxando os indicadores de conformidade para baixo.

## Decisões (confirmadas com o usuário)

1. **"Não aplicável" sai da conta.** Não conta como pendente, nem vencido, nem realizado, **e sai do denominador** de conformidade/cobertura. O colaborador deixa de ser cobrado e o indicador não é inflado nem penalizado. É o tratamento ISO de "não aplicável" e espelha o estado neutro "não avaliável" que já existe nas competências.
2. **Marcação individual.** Só pelo diálogo "Registrar conclusão", um treinamento por vez. Sem marcação em massa nesta entrega.
3. **Motivo obrigatório** quando o status for "Não aplicável".

## Modelo de dados

- **Status:** novo valor `nao_aplicavel` na coluna `employee_trainings.status`. A coluna é `text` **sem constraint** (verificado na produção) ⇒ **o valor novo não exige DDL**.
- **Motivo:** coluna nova `employee_trainings.not_applicable_reason` — `text`, **nullable**. **Única DDL desta entrega** (aditiva, sem risco a dado existente).
- **Obrigatoriedade do motivo é de aplicação, não de banco:** a coluna fica nullable (registros históricos não têm motivo); a API rejeita `status = nao_aplicavel` sem motivo não-vazio, e limpa o motivo quando o status deixa de ser NA.

## Regra central

> Um treinamento com `status = 'nao_aplicavel'` é **invisível para toda contagem de obrigação**: não é pendência, não vence, não é realizado, e não entra em numerador nem denominador de conformidade. Continua visível na ficha do colaborador, com o motivo, como registro auditável.

## Inventário de pontos afetados

O código usa dois padrões ao ler status, e só um deles é seguro:

- **Positivo (`= 'concluido'`) — seguro.** O NA não casa e já fica fora do numerador. Ocorre em `competency-resolver.ts`, `employee-learning-aggregates.ts`, `learning-summary.ts`, `lms-metrics.ts`. **Nada a fazer.**
- **Negação (`<> 'concluido'`) — perigoso.** Trata "tudo que não está concluído" como pendência, então **incluiria o NA**. Precisa virar "não concluído **e não** NA":
  - `artifacts/api-server/src/services/kpi/lms-metrics.ts`
  - `artifacts/api-server/src/services/aprendizagem/learning-summary.ts`
  - `artifacts/api-server/src/routes/training-catalog.ts` (2 ocorrências)

Além das negações:

| Ponto | Arquivo | Por que muda |
|---|---|---|
| `deriveTrainingStatus` | `routes/employees.ts:308` | Devolve `vencido` sempre que a validade passou, **ignorando o status guardado** — um NA com validade antiga apareceria como vencido. NA deve sair antes dessa checagem. |
| Motor de requisitos | `services/aprendizagem/requirements-engine.ts` (~88–99) | Deduplica olhando só `status === 'pendente'`. Um treino NA não entra nos conjuntos e **seria recriado como pendente** na próxima admissão/mudança de cargo. NA deve contar como "já tratado". |
| Filtro e stats da lista | `routes/employees.ts` (~1868–1889 e o `statsRow`) | O ramo `vencido` casa por validade vencida (pegaria NA); as contagens `pendente`/`vencido` precisam excluir NA. |
| Buckets da Gestão | `routes/employees.ts` | `programado` (pendente ∩ turma), `realizadoMes` e `onlyPendenteSemTurma` derivam de pendente/concluído — precisam excluir NA. |
| Contadores da ficha | `colaboradores/_lib/ficha-derivations.ts` | `computeTrainingCounters` já não classifica NA em feitos/pendentes/vencidos, mas o **total** o incluiria. NA sai do total e ganha contagem própria. |
| Rótulos e badges | `gestao/_lib/format.ts`, `colaboradores/[id].tsx`, `colaboradores/treinamentos.tsx`, `colaboradores/treinamento-detalhe.tsx`, `minha-area/index.tsx` | NA precisa de rótulo ("Não aplicável") e estilo neutro em todos os lugares que exibem status de treino. |
| Escrita | `routes/employees.ts:3312` (POST) e `:3434` (PATCH) | Validar motivo obrigatório quando NA; limpar motivo quando sai de NA. |
| Contrato | `lib/api-spec/openapi.yaml` (enum em 5 pontos + 1 lista) | Adicionar `nao_aplicavel` e o campo `notApplicableReason`. |

## Interface

No diálogo **"Registrar conclusão"** (`colaboradores/[id].tsx`):

- O select de Status ganha a 4ª opção **"Não aplicável"**.
- Ao selecionar, aparece abaixo um campo de texto **"Motivo da não aplicabilidade *"** (obrigatório). Salvar fica bloqueado enquanto vazio, com mensagem de erro no campo.
- Ao sair de NA para outro status, o campo some e o motivo é descartado.
- Campos de conclusão/validade não fazem sentido para NA: ficam **desabilitados** quando NA está selecionado (sem apagar valores já gravados).
- Na listagem de treinamentos da ficha, um item NA exibe o badge "Não aplicável" (neutro) e o motivo como texto de apoio.

## Fora de escopo (YAGNI)

- Marcação em massa (por cargo/filial).
- Mexer no status `em_andamento`, que já existe na produção fora do enum declarado — dívida pré-existente, tratada em separado para não misturar entregas.
- Fluxo de aprovação do NA (quem pode marcar, revisão por gestor). Qualquer usuário com permissão de escrita no módulo pode marcar, como já ocorre com os outros status.
- Relatório específico de NAs.

## Testes

- **Unitários (web-unit):** `computeTrainingCounters` com item NA (fora do total e dos 3 contadores); validação do diálogo (Salvar bloqueado sem motivo; motivo some ao trocar de status).
- **Integração (`TEST_ENV=integration`):**
  - POST/PATCH rejeita `nao_aplicavel` sem motivo (400) e aceita com motivo.
  - PATCH saindo de NA limpa o motivo.
  - Um treino NA **não** aparece em `stats.pendente`/`stats.vencido`, nem nos filtros `status=pendente`/`status=vencido`, nem em `onlyPendenteSemTurma`.
  - NA com `expirationDate` no passado **não** vira `vencido` (`deriveTrainingStatus`).
  - O motor de requisitos **não recria** um pendente quando já existe NA para o mesmo requisito/item.
  - As 4 negações: um treino NA não é contado como pendência no resumo LMS, nos indicadores e no catálogo.
- `pnpm typecheck` limpo ao fim de cada tarefa.

## Entrega

- **DDL de produção:** 1 coluna nullable — `ALTER TABLE employee_trainings ADD COLUMN not_applicable_reason text;`. Aditiva, sem backfill, sem impacto em dado existente. **Requer autorização explícita** antes de aplicar.
- Sem migração de dados: nenhum registro existente vira NA.
