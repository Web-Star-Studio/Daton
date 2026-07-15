# Filtros da listagem de Gestão de Ações + drill-down dos painéis

**Data:** 2026-07-14
**Status:** aprovado (aguardando plano de implementação)

## Problema

A aba **Lista** do hub de Gestão de Ações filtra hoje por busca (texto), status, origem, responsável e "Atribuídas a mim". Faltam filtros por campos que o usuário claramente quer cruzar — e que já aparecem como coluna ou como número em card, mas sem caminho para a lista:

- **Eficácia** é coluna na tabela, mas não é filtrável. A aba Eficácia mostra um tile "Aguardando" (ações concluídas esperando verificação) que **não leva a lugar nenhum** — o usuário vê "5 aguardando" e não descobre quais são.
- **Prazo**: os cards "Vencidas" e "Vencendo (7d)" mostram números, mas não há como listar essas ações.
- **Prioridade**: o backend já aceita `?priority=`, mas não há controle na tela.
- **Tipo** (Corretiva/Preventiva/Melhoria): não filtra em lugar nenhum.

Além disso, a barra da Lista não tem **"Limpar filtros"** nem **contador de resultados**, que KPI, Regulatórios e Governança já têm.

## Solução

Duas partes.

### Parte 1 — Novos filtros na barra da aba Lista

Quatro controles novos, no padrão `<Select>` que a barra já usa (mesmo estilo de KPI/Regulatórios):

| Filtro | Opções | Onde filtra |
| --- | --- | --- |
| **Tipo** | Todos / Corretiva / Preventiva / Melhoria | servidor (`actionType`) |
| **Prioridade** | Todas / Alta / Média / Baixa | servidor (`priority`, já aceito) |
| **Eficácia** | Todas / Eficaz / Não eficaz / Aguardando verificação | servidor (`effectiveness`) |
| **Prazo** | Qualquer prazo / Vencidas / Vencendo em 7 dias | servidor (`dueWindow`) |

Mais dois elementos que faltam na barra:

- **Contador de resultados** (ex.: "12 ações") ao lado dos filtros.
- **"Limpar filtros"** (`Button variant="ghost"` com ícone `X`), visível só quando há filtro ativo, e repetido no **estado vazio** da lista (para o usuário não ficar preso numa lista vazia).

**Definições exatas** (para bater com os cards, ver decisão de arquitetura):

- **Eficácia = Aguardando verificação**: `status = 'completed'` **e** ainda sem veredito — `effectiveness_result IS NULL` **ou** `= 'pending'`. É o mesmo critério do tile "Aguardando" da aba Eficácia (`eficacia-screen.tsx`) e do `escalation.ts` (`or(isNull, eq('pending'))`).
- **Eficácia = Eficaz / Não eficaz**: `effectiveness_result = 'effective'` / `'ineffective'`.
- **Prazo = Vencidas**: ação aberta (`status NOT IN ('completed','cancelled')`) **e** `due_date < início de hoje`.
- **Prazo = Vencendo em 7 dias**: ação aberta **e** `início de hoje ≤ due_date < início de hoje + 7 dias`.

As fronteiras de data (`startOfToday`, `+7 dias`) são as **mesmas** que `computeActionPlanSummary` já calcula (`summary.ts:52-54`) — ver arquitetura.

### Parte 2 — Números viram atalhos (drill-down)

Cards e tiles clicáveis que levam à aba Lista com o filtro já aplicado:

- Cards do topo da Lista: **Vencidas** → `dueWindow=overdue`; **Vencendo (7d)** → `dueWindow=due_soon`.
- Tiles da aba Eficácia: **Eficazes** → `effectiveness=effective`; **Não eficazes** → `effectiveness=ineffective`; **Aguardando** → `effectiveness=pending`.

Clicar num tile da aba Eficácia **troca para a aba Lista** e liga o filtro. Sem mudança de rota/URL (não é link compartilhável; fica como incremento futuro se pedirem).

## Decisões de arquitetura

### Filtros no servidor, não em memória

Os filtros novos são aplicados no **backend** (novos query params → condições SQL), não em memória sobre a lista já carregada — mesmo sendo esta última "de graça" (a listagem já devolve todos os planos da org).

**Motivo:** os números dos cards (`overdue`, `dueSoon`, taxa de eficácia) vêm de `computeActionPlanSummary`, calculado no servidor. Se a lista filtrasse em memória com uma conta de data ligeiramente diferente, o card mostraria 12 e a lista 11 — e o usuário perde a confiança nos dois. Filtrando no servidor com o **mesmo critério** do summary, os números batem por construção.

Para garantir a identidade do critério de prazo, a rota calcula `startOfToday` e `dueSoonLimit` exatamente como `summary.ts:52-54` (relógio do servidor, meia-noite local, `+7 * MS_PER_DAY`) e usa esses valores nas condições SQL. A definição de "aberta" (`status NOT IN ('completed','cancelled')`) também é a mesma do summary (`summary.ts:88`).

### Estado dos filtros sobe para o hub

Hoje o estado dos filtros vive dentro de `ListaScreen`, e a aba ativa vive em `planos-acao.tsx` (`useState<ActionTabId>`). Para um tile da aba Eficácia trocar de aba **e** ligar um filtro numa ação só, o estado dos filtros precisa ser acessível de fora da `ListaScreen`.

O estado dos filtros (ou ao menos um "filtro inicial pendente") sobe para `planos-acao.tsx`, que passa a coordenar aba + filtro. `ListaScreen` recebe o filtro inicial por prop e continua dona da sua UI de filtragem. Os painéis (Executivo/Eficácia) recebem um callback tipo `onDrillDown(filtro)` que faz `setTab("lista")` + aplica o filtro.

Isso é uma pequena elevação de estado, contida — não é um store global nem gerência de URL.

## Mudanças por camada

### Contrato (`lib/api-spec/openapi.yaml`)

`ListActionPlansQueryParams` (`:9228-9268`) ganha três params novos (além do `priority` que já existe):

- `actionType`: enum `ActionPlanType` (`corrective|preventive|improvement`).
- `effectiveness`: enum novo com `effective | ineffective | pending`.
- `dueWindow`: enum novo com `overdue | due_soon`.

Regerar `api-zod` + `api-client-react` (`pnpm --filter @workspace/api-spec codegen`; requer python3).

### API (`artifacts/api-server/src/routes/action-plans.ts`)

Na montagem de `conditions` (`:174-191`):

- `actionType` → `eq(actionPlansTable.actionType, ...)`.
- `effectiveness=effective|ineffective` → `eq(effectivenessResult, ...)`; `effectiveness=pending` → `and(eq(status,'completed'), isNull(effectivenessResult))`.
- `dueWindow=overdue` → `and(notInArray(status, ['completed','cancelled']), lt(dueDate, startOfToday))`.
- `dueWindow=due_soon` → `and(notInArray(status, [...]), gte(dueDate, startOfToday), lt(dueDate, dueSoonLimit))`.

`startOfToday`/`dueSoonLimit` calculados no topo do handler com o mesmo código de `summary.ts`. Ordenação, paginação (inexistente) e autorização por `sourceModule` ficam como estão.

### Web (`artifacts/web`)

- `_components/lista-screen.tsx`: quatro `<Select>` novos na barra; contador; "Limpar filtros" (barra + empty state); aceitar filtro inicial vindo do hub; cards do topo viram botões/atalhos.
- `planos-acao.tsx`: coordenar aba + filtro inicial pendente; passar `onDrillDown` para os painéis.
- `_components/eficacia-screen.tsx`: os três tiles viram atalhos que chamam `onDrillDown` (troca para Lista + filtro de eficácia).
- `lib/action-plans-client.ts`: se necessário, labels dos novos filtros (Tipo/Prioridade já têm `ACTION_TYPE_LABELS`/`ACTION_PLAN_PRIORITY_LABELS`).

## Testes (TDD — escrever antes)

- **Backend (integração):** `?actionType=corrective` devolve só corretivas; `?priority=high` só alta; `?effectiveness=pending` devolve concluídas sem veredito e exclui as com veredito; `?effectiveness=effective` só as eficazes; `?dueWindow=overdue` devolve abertas com prazo passado e exclui concluídas/canceladas mesmo com prazo passado; `?dueWindow=due_soon` devolve abertas vencendo em ≤7 dias e exclui as já vencidas; combinação de dois filtros aplica AND.
- **Backend (identidade com o card):** um conjunto de planos onde `summary.overdue = N` produz exatamente N itens em `?dueWindow=overdue` (mesmo critério).
- **Web:** a barra mostra os quatro filtros; "Limpar filtros" só aparece com filtro ativo e zera todos; o contador reflete o número de linhas; clicar no card "Vencidas" aplica `dueWindow=overdue`; clicar no tile "Aguardando" da aba Eficácia troca para a aba Lista com `effectiveness=pending`.

## Fora de escopo (YAGNI)

- Paginação da listagem (o backend devolve tudo; volume atual não pede).
- Filtros por GUT, ODS, normas, datas de criação, unidade/filial (não há vínculo `unitId` em `action_plans`).
- Filtro de prazo com janelas longas (30/60/90) ou intervalo de datas — só Vencidas/Vencendo(7d), espelhando os cards.
- Persistir filtros na URL / links compartilháveis.
- Filtros nas abas Operacional e Auditoria.
