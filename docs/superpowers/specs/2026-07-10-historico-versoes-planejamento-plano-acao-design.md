# Histórico de versões do Planejamento (5W2H + causa-raiz) no plano de ação

**Data:** 2026-07-10
**Branch:** a criar (`feat/planejamento-historico-versoes`)
**Origem:** conversa de 2026-07-09/10, após os PRs #143 (sugestão por IA) e #144 (autosave)

## Objetivo

Ninguém pode perder o trabalho do Planejamento sem deixar rastro e sem poder voltar.

Hoje, se alguém sobrescreve o 5W2H de um plano de ação, **não fica registro de que
existia algo antes, nem de quem apagou**. O valor some. Este documento especifica um
histórico de versões do bloco de Planejamento, com autoria, e um botão de restaurar.

Escopo: o bloco que a IA gera — **5W2H + causa-raiz + 5 porquês**. Nada além disso.

## Contexto: o que já existe e o que falta

O `action_plan_activity_log` já grava **quem, quando, valor anterior e valor novo**
de cada campo alterado, e a aba "Comentários e histórico" já o exibe. `buildDiff`
(`services/action-plans/activity-diff.ts`) monta `{ from, to }` para cada campo de
uma lista.

A lista (`DIFF_FIELDS`, em `routes/action-plans.ts`) tem **11 dos 22 campos** que o
formulário salva. Ficam de fora, entre outros, `plan5w2h` e `rootCauseWhys`. Isto é,
o plano de ação em si — o bloco mais caro de escrever, e o que a IA produz — **não é
rastreado**. Na investigação do incidente de 2026-07-09 foi possível provar quem
escreveu a `rootCause` (rastreada) e **impossível atribuir o 5W2H a alguém**.

`rootCause` já está na lista. `plan5w2h` e `rootCauseWhys` não.

## Decisões travadas com o usuário

1. **Edição simultânea é rara.** O problema a resolver é *poder voltar*, não impedir
   colisão. Nada de bloqueio otimista neste trabalho. (O PR #144 já eliminou a
   reversão silenciosa de campos que a aba sequer tocou; o que resta é
   last-write-wins no mesmo campo, aceito por ora.)
2. **Quem pode editar pode restaurar.** Restaurar é mais uma edição, e fica registrada.
3. **Restaura o bloco todo**, não campo a campo — evita um plano meio de uma versão e
   meio de outra, indefensável numa auditoria.
4. **O botão da IA muda de lugar.** Hoje ele vive no cabeçalho do card "Plano de ação
   (5W2H)" mas preenche também o card "Causa raiz", que fica abaixo. O escopo real
   está escondido no `title` do botão. 5W2H e causa-raiz passam a ser **uma etapa só,
   Planejamento** — que é o que o stepper da ficha já diz (passo 2, âncora
   `etapa-planejamento`).

## O problema técnico central

O log guarda **diffs por campo**, e o único `snapshot` existente é o da criação, que
carrega apenas `code`, `title`, `sourceModule` e `status`.

Logo, **não é possível reconstruir "o estado do bloco às 12:34" por replay**: uma
entrada que só alterou a causa-raiz não diz nada sobre o 5W2H daquele instante, e não
há retrato inicial de onde partir.

**Solução:** tratar o Planejamento como **um campo lógico único** no log.

```jsonc
// changes de uma entrada `updated`
{
  "kind": "diff",
  "fields": {
    "planning": {
      "from": { "plan5w2h": {...}, "rootCause": "...", "rootCauseWhys": [...] },
      "to":   { "plan5w2h": {...}, "rootCause": "...", "rootCauseWhys": [...] }
    },
    "priority": { "from": "medium", "to": "high" }   // campos comuns seguem iguais
  }
}
```

Assim o `to` de qualquer entrada **já é uma versão completa** do bloco, e o `from` é a
versão completa anterior. Restaurar = aplicar o `to` escolhido. Sem replay, sem
snapshot inicial, **sem migração de banco e sem mudar a forma do log** — o tipo
`fields` já é `Record<string, { from: unknown; to: unknown }>`. (A API ganha um
endpoint novo, o de restaurar; o *log* é que não muda de formato.)

O diff por sub-campo ("O quê mudou de X para Y") é calculado **na exibição**, a partir
do `from`/`to` do bloco.

Custo: cada entrada que altera o Planejamento guarda o bloco duas vezes (~2,6 KB no
caso real medido). Aceitável.

## Abordagens consideradas

**A. Estender o log, bloco como campo único.** ⟵ escolhida
Zero DDL, zero tabela nova, e restaurar é aplicar o `to` de uma entrada. A lista de
versões lê o que já existe em `GET /action-plans/:planId/activity`; só o endpoint de
restaurar é novo.
*Contra:* o log cresce (~2,6 KB por alteração do bloco), e o histórico começa a
existir só a partir do deploy.

**B. Tabela nova de snapshots (`action_plan_versions`).**
Retrato completo do plano a cada save, com número de revisão.
*Contra:* migração, endpoint novo, e duplica um mecanismo de auditoria que já existe.
Só se pagaria se quiséssemos versionar o plano **inteiro**, o que o usuário
explicitamente não pediu. Rejeitada por YAGNI.

**C. Rastrear `plan5w2h` e `rootCauseWhys` como campos independentes.**
O mais óbvio — e errado. Recria o problema do replay: uma entrada que só mexeu nos
porquês não permite reconstruir o 5W2H daquele momento. Restaurar "a versão de 12:34"
ficaria impossível. Rejeitada.

## Arquitetura

### Backend

**`services/action-plans/planning.ts`** (novo, puro, testável)
- `PlanningBlock = { plan5w2h, rootCause, rootCauseWhys }`
- `extractPlanning(row)` → `PlanningBlock`
- `planningChanged(before, after)` → boolean (comparação estrutural)
- `diffPlanningFields(from, to)` → lista de `{ campo, antes, agora }` para exibição
  (usada também nos testes; o frontend tem sua própria função de exibição)

**`routes/action-plans.ts`**
- `DIFF_FIELDS` perde `rootCause`, que passa a viver dentro de `planning`. Os outros
  10 campos seguem rastreados como hoje. A partir do deploy, uma alteração da
  causa-raiz aparece no histórico dentro da versão do Planejamento, não mais como um
  campo solto.
- No `PATCH`, depois do `buildDiff` dos campos comuns, se `planningChanged` então
  acrescenta `fields.planning = { from, to }` ao mesmo `changes`. **Uma entrada por
  PATCH**, como hoje.
- Novo: `POST /organizations/:orgId/action-plans/:planId/planning/restore`
  - corpo: `{ activityId: number }`
  - guardas: `requireAuth` + `requirePlanAccess()` + `requireWriteAccess()`; 409 se o
    plano estiver encerrado (mesma regra do autosave, `isActionPlanEncerrado`)
  - lê a entrada, valida que pertence ao plano e à org, extrai `fields.planning.to`
  - 404 se a entrada não existe ou não carrega `planning`
  - aplica os três campos ao plano
  - grava nova entrada `updated` com `fields.planning = { from: atual, to: restaurado }`
    e `restoredFrom: { activityId, at }`
  - responde o plano serializado

O tipo `ActionPlanActivityChanges` ganha `restoredFrom?: { activityId: number; at: string }`
no ramo `diff`. É `jsonb`: mudança **só de tipo**, sem DDL.

**Restaurar uma versão idêntica à atual** não é erro: o servidor responde 200 com o
plano inalterado e **não grava entrada** (o mesmo critério do `planningChanged`). O
histórico não ganha ruído.

**Contrato da API.** `lib/api-spec/openapi.yaml` é a fonte da verdade, e a ficha usa os
hooks gerados pelo Orval. Então o endpoint de restaurar entra no `openapi.yaml` e o
codegen é regerado (`pnpm --filter @workspace/api-spec codegen`). O ambiente não tem
`ruby`; o passo de YAML→JSON roda com `python3` (ver `.claude/skills/verify/SKILL.md`).

### Frontend

**Reorganização da ficha** (`planos-acao/[id].tsx`)
Os dois `Section` viram um só, `id="etapa-planejamento"`, título **"Planejamento"**,
contendo `Plano5W2H` e `CausaRaiz`. No cabeçalho, duas ações:

```
Planejamento                          [✨ Sugerir plano (IA)]  [🕘 Versões (3)]
  ── Plano de ação (5W2H)
  ── Causa raiz (5 porquês)
```

O `title` do botão de IA deixa de precisar explicar o escopo — ele agora está dentro
da etapa que de fato preenche.

**`_components/planning-versions.ts`** (novo, puro)
- `buildPlanningVersions(activity)` → versões, da mais recente para a mais antiga
- **Agrupamento na exibição, não na gravação.** O autosave grava uma entrada por save;
  digitar o 5W2H em três pausas gera três entradas. O log permanece intacto (auditoria
  ISO), e a tela junta entradas **consecutivas, do mesmo autor, em janela de 10 minutos**
  numa versão só.
- Uma versão agrupada tem: **autor e hora do primeiro save** do grupo, **conteúdo
  (`to`) do último**, e — para o diff exibido — o **`from` do primeiro**. Assim a versão
  mostra o salto do que havia antes de a pessoa começar a mexer para o que ficou quando
  ela parou.
- Cada versão carrega o `activityId` do save **mais recente** do grupo — é ele que o
  restore recebe, porque é o que guarda o `to` final.

**`_components/planning-versions-dialog.tsx`** (novo)
Lista as versões: autor, quando, e o resumo do que mudou naquela versão (sub-campos
alterados). Expandir mostra antes/agora por sub-campo. Botão **Restaurar esta versão**,
visível só quando `canEdit`, com `window.confirm`.

Após restaurar: invalida as queries do plano e do activity. A ficha reidrata (o
formulário está limpo) e a linha de base do autosave (`baselineRef`, do PR #144) é
reconstruída pela hidratação — nada a fazer à mão.

**Compatibilidade com o histórico legado.** Entradas antigas trazem `fields.rootCause`
solto. O renderizador de histórico continua entendendo essa forma; ela simplesmente
não gera uma "versão" na lista.

## Fluxo de dados

```
usuário edita 5W2H
  → autosave (diff do PR #144) → PATCH { plan5w2h }
  → servidor: buildDiff(campos comuns) + planningChanged? → fields.planning{from,to}
  → 1 entrada no activity log

usuário abre "Versões (3)"
  → GET /activity (já existe, já guardado por requirePlanAccess)
  → buildPlanningVersions agrupa e monta a lista

usuário clica "Restaurar esta versão"
  → POST /planning/restore { activityId }
  → servidor aplica o `to` daquela entrada e loga a restauração
  → invalidate → ficha reidrata com o conteúdo restaurado
```

## Erros e bordas

| Situação | Comportamento |
|---|---|
| Plano encerrado (`isActionPlanEncerrado`) | 409; o botão nem aparece (`canEdit` é falso) |
| Analista (somente leitura) | vê o histórico; o botão "Restaurar" não aparece, e o servidor devolve 403 se chamado direto |
| `activityId` de outro plano ou de outra org | 404 |
| Entrada sem `fields.planning` (legada) | 404, com mensagem clara |
| Restaurar para um bloco vazio | permitido — a primeira versão tem `from` vazio, e voltar ao vazio é uma escolha legítima |
| Restaurar por engano | gera nova entrada; dá para restaurar de novo a versão anterior |
| Restaurar versão idêntica à atual | 200, plano inalterado, **nenhuma entrada gravada** |
| Plano sem nenhuma alteração de Planejamento | botão "Versões" some (contador zero) |

**Não há histórico retroativo.** Planos existentes começam a acumular versões a partir
do deploy. Isso será dito na entrada do diário e vale a pena avisar a cliente.

## Testes

**Backend (node-unit, sem banco)**
- `extractPlanning` / `planningChanged`: igualdade estrutural, ordem de chave do
  `plan5w2h` irrelevante, arrays de porquês sensíveis à ordem
- `diffPlanningFields`: sub-campos adicionados, removidos, alterados

**Backend (integration)**
- `PATCH` que altera o 5W2H grava `fields.planning` com `from` e `to` completos
- `PATCH` que não toca no bloco **não** grava `planning`
- `restore` aplica exatamente o `to` da entrada escolhida e grava `restoredFrom`
- `restore` em plano encerrado → 409; entrada de outro plano → 404; analista → 403
- restaurar a **mesma** versão duas vezes: a segunda é no-op (200, sem entrada nova)
- restaurar a versão A, depois a B, depois a A de novo: o conteúdo acompanha, e o
  histórico ganha uma entrada por restauração

**Frontend (web-unit)**
- `buildPlanningVersions`: agrupa saves consecutivos do mesmo autor dentro da janela;
  não agrupa autores diferentes; não agrupa fora da janela; ignora entradas legadas
- versão carrega o `activityId` do save mais recente do grupo

**Runtime (verify)**
Duas abas não são necessárias. Editar o 5W2H, ver a versão surgir, sobrescrever,
restaurar, e conferir no banco que o conteúdo voltou e que a restauração ficou logada.

## Fora de escopo

- Bloqueio otimista / aviso de edição concorrente
- Versionamento dos demais campos do plano (título, prazo, eficácia, evidências)
- Restaurar campo a campo
- Histórico retroativo dos planos já existentes
- Corrigir os outros três call sites de IA com o mesmo defeito de orçamento de tokens
  (`document-normative-requirements.ts`, `legislation-suggester.ts`, `auto-tag.ts`)
