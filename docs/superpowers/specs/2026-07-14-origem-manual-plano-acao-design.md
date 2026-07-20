# Origem escolhível ao criar uma ação dentro do módulo de Gestão de Ações

**Data:** 2026-07-14
**Status:** aprovado (aguardando plano de implementação)

## Problema

O hub "Gestão de Ações" já permite criar uma ação sem partir de outro módulo (botão "Nova ação"), mas essa ação nasce sempre com a origem técnica `manual`, exibida como o badge genérico **"Manual"**. Não há como o usuário dizer *o que* motivou a ação.

Nem toda ação tem origem em uma entidade do sistema (um indicador, um fator SWOT, uma não conformidade). Quando ela nasce dentro do próprio módulo, o usuário precisa declarar o motivo, escolhendo em uma lista.

## Solução

Ao criar uma ação dentro do módulo, o usuário escolhe a **Origem** num listbox com três opções fixas:

| Valor no banco     | Rótulo exibido                        |
| ------------------ | ------------------------------------- |
| `improvement`      | Melhoria de Processo (**padrão**)     |
| `corrective`       | Corretiva                             |
| `norm_requirement` | Não atendimento a requisito da norma  |

A origem `manual` deixa de ser gravada em ações novas, mas **continua existindo** como valor legado (5 planos mock na conta demo, org 3 — a Gabardo/org 2 não tem nenhum; verificado na produção em 2026-07-14). Ela permanece nos rótulos e no filtro, e some apenas do diálogo de criação.

### Decisões tomadas

1. **Lista fixa no sistema**, não catálogo gerenciável por empresa. Se a cliente pedir, vira catálogo depois (há precedente: normas, perspectivas SWOT).
2. **Origens no enum `action_plan_source_module`**, e não num campo dentro do `sourceRef`. O enum já dirige o filtro de origem, o badge da listagem, o badge da ficha, o resumo `bySourceModule` e o painel executivo — todos passam a funcionar sem código novo. A alternativa (guardar no `sourceRef`) manteria as três agrupadas como "Manual" no filtro e no painel, exigindo reescrever a query de filtro para varrer JSON.
3. **Os 5 planos demo com origem `manual` ficam como estão.** Sem migração de dados.
4. **A origem sugere o Tipo**, que continua editável — evita que o usuário responda duas vezes quase a mesma pergunta (o campo "Tipo" já tem Corretiva/Preventiva/Melhoria).

## Comportamento

### Diálogo "Nova ação" (aberto pelo hub, sem origem)

- Novo campo **"Origem \*"** no topo, obrigatório, pré-selecionado em **Melhoria de Processo**.
- Escolher a origem **sugere o Tipo** (o usuário pode trocar em seguida):
  - Melhoria de Processo → Tipo `improvement` (código `AM-`)
  - Corretiva → Tipo `corrective` (código `AC-`)
  - Não atendimento a requisito da norma → Tipo `corrective` (código `AC-`)
- A descrição digitada continua sendo gravada no `sourceRef` como contexto livre (`manualContext`), como já acontece hoje com `manual`.

### Diálogo aberto a partir de outro módulo

**Nada muda.** A origem continua imposta pelo chamador (`ActionSource`), o campo "Origem" não aparece e o quadro cinza de contexto ("Origem: KPI · Indicador X · Mai/2026") segue como está. Os 9 pontos de criação existentes (indicadores, SWOT, não conformidade, auditoria, riscos, LAIA, treinamento, RAC, segurança viária) ficam intactos.

### Depois de criada

A ação exibe a origem escolhida no badge da listagem, no filtro "Origem", na ficha e nas barras do painel executivo (cada origem com sua cor).

## Mudanças por camada

### Banco (`lib/db/src/schema/action-plans.ts`)

Três valores novos em `actionPlanSourceModuleEnum` e no type `ActionPlanSourceModule`. O enum é append-only por design (documentado no próprio arquivo).

Atenção ao ler o código: `corrective` e `improvement` existem em **dois enums diferentes** — em `actionPlanTypeEnum` (o campo "Tipo": `corrective | preventive | improvement`) e, agora, em `actionPlanSourceModuleEnum` (o campo "Origem"). São campos distintos, com tipos TypeScript distintos; a origem apenas *sugere* o tipo no diálogo.

Na produção, aplicar via DDL cirúrgica — `ALTER TYPE action_plan_source_module ADD VALUE ...` — e **não** `pnpm db push` puro, que arrastaria drift de outras branches.

### Contrato (`lib/api-spec/openapi.yaml`)

Adicionar os três valores ao enum `ActionPlanSourceModule` e regerar `api-zod` + `api-client-react` (`pnpm --filter @workspace/api-spec codegen`; requer python3).

### API (`artifacts/api-server`)

- `routes/action-plans.ts` — `SOURCE_MODULE_OWNER`: as três origens pertencem ao módulo `actionPlans`. O `Record` é exaustivo: o build quebra se algum valor faltar.
- `services/action-plans/validate-source.ts` — as três são origens livres, sem entidade a validar (mesmo caminho de `manual`, `incident` e `rac`).
- `services/action-plans/source-context.ts` — rótulo de contexto por origem: `"Melhoria de Processo · <contexto>"`, `"Corretiva · <contexto>"`, `"Não atendimento a requisito da norma · <contexto>"`; sem contexto, só o nome da origem.

Sem mudança na rota POST: ela já aceita qualquer valor do enum e já não exige módulo `actionPlans` para criar (proposital, para que os outros módulos criem ações a partir das suas telas).

### Web (`artifacts/web`)

- `lib/action-plans-client.ts` — três entradas novas em `SOURCE_MODULE_LABELS`. Isso propaga sozinho para o filtro de origem, o badge da listagem e o badge da ficha. `originLink` devolve `null` para as três (não há tela de destino).
- `_components/nova-acao-dialog.tsx` — campo "Origem" quando não há `source`; estado da origem no formulário; sugestão de Tipo ao trocar a origem; envio do `sourceModule` escolhido.
- `_components/painel-executivo.tsx` — cor própria para cada origem nova em `SOURCE_COLORS`.

## Testes (TDD — escrever antes)

- **Backend:** criar plano com cada uma das três origens novas sem `sourceRef` vinculado a entidade → 201; `validateSourceRef` não rejeita; `resolveSourceContexts` devolve o rótulo certo (com e sem contexto livre); listar com `?sourceModule=improvement` devolve só os planos dessa origem.
- **Web:** o diálogo aberto pelo hub mostra o campo Origem com "Melhoria de Processo" pré-selecionado e envia `sourceModule: "improvement"`; trocar a origem para "Corretiva" muda o Tipo sugerido para "Corretiva"; o usuário consegue sobrescrever o Tipo depois de escolher a origem; o diálogo aberto com `source` (ex.: KPI) **não** mostra o campo Origem e continua enviando a origem do chamador.

## Fora de escopo (YAGNI)

- Tornar a lista de origens gerenciável por empresa.
- Migrar os 5 planos demo com origem `manual`.
- Alterar o diálogo quando aberto a partir de outro módulo.
- Seletor de origem que permita escolher origens vinculadas a entidades (KPI, SWOT, NC…) — essas exigem uma entidade real e continuam vindo do módulo de origem.
