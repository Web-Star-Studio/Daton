# Meta/tolerância calculada do indicador corporativo (KPI)

**Data:** 2026-06-16
**Módulo:** KPI (indicadores corporativos / rollup)
**Origem:** pedido da cliente (Ana Corrêa / SGI Transportes Gabardo)

## Contexto e problema

Um indicador **corporativo** (rollup) agrega vários indicadores-filhos (filiais)
por uma estratégia escolhida na criação: **Média**, **Soma**, **Mínimo** ou
**Máximo**. Hoje:

- O **valor** mensal do corporativo é **calculado on-read** a partir dos valores
  dos filhos (`computeRollupValue` em `artifacts/api-server/src/services/kpi/rollup.ts`).
- A **meta/tolerância** (`kpi_year_configs.goal`, um número por indicador por ano)
  **não** é calculada: é **digitada à mão** na criação do corporativo
  (`POST /organizations/:orgId/kpi/corporate-indicators`) e gravada como snapshot.

Pedido da Ana (textual): *"Na meta/tolerância precisa seguir a mesma linha. Se eu
colocar 'quero a média', na tolerância também — vai pegar todas as tolerâncias e
me trazer o valor."* Exemplo: 3 indicadores "Taxa de Acidente" (Piracicaba, Porto
Alegre, Anápolis), cada um com tolerância **1**/mês. Ao criar o corporativo:
**Soma → 3**, **Média → 1**.

"Meta" e "tolerância" são o **mesmo campo** (`goal`); são termos intercambiáveis
na UI ("Tolerância / meta").

## Comportamento desejado

A meta do corporativo passa a ser a **agregação das metas das filiais pela MESMA
estratégia usada para o valor**, calculada **ao vivo (compose-on-read)** — igual
ao valor. Decisões aprovadas:

- **Ao vivo, não snapshot:** se uma filial mudar a meta depois, o corporativo
  acompanha automaticamente.
- **100% automática:** o usuário **não digita** mais a meta do corporativo; vê só
  uma prévia/valor calculado. Sem override manual.
- **Mesma estratégia para as quatro:** Soma→soma das metas; Média→média;
  Mínimo→menor meta; Máximo→maior meta.

### Regra de cálculo (`computeRollupGoal`)

Para um corporativo, ano `Y` e estratégia `S`:

1. Carrega os filhos (`kpi_indicator_rollups` onde `parent_indicator_id = corporativo`).
2. Carrega a meta de cada filho no ano `Y` (`kpi_year_configs.goal` do filho).
3. Considera só os filhos **com meta definida** no ano (`goal != null`).
   - `sum_values` → soma das metas.
   - `average` → média das metas (sobre os que têm meta).
   - `min` → menor meta.
   - `max` → maior meta.
4. Se **nenhum** filho tem meta no ano → meta do corporativo = `null` (UI mostra "—").

Observações:
- A agregação é entre **filiais** (não entre meses). A meta é por ano, como hoje.
- Unidade/periodicidade já são herdadas dos filhos na criação; a meta segue a
  mesma unidade.
- `sum_inputs` não é criado por este fluxo (só seed da org Demo). Para robustez,
  `computeRollupGoal` tratará `sum_inputs` como soma das metas (fallback), mas
  não é caminho exercitado pela UI.

## Mudanças — Backend

Arquivo principal: `artifacts/api-server/src/services/kpi/rollup.ts` e
`artifacts/api-server/src/routes/kpi/index.ts`.

1. **Nova função `computeRollupGoal(orgId, parentIndicatorId, year)`** em
   `rollup.ts`, espelhando `computeRollupValue` mas sobre as metas anuais dos
   filhos. Retorna:
   ```ts
   interface RollupGoalResult {
     computed: number | null;
     strategy: KpiRollupStrategy;
     childrenWithGoal: number;
     childrenTotal: number;
   }
   ```

2. **Endpoint do ano** `GET /organizations/:orgId/kpi/years/:year`
   (`serializeYearConfig`, ~linhas 91–103, e o ponto onde `computeRollupValue` é
   chamado, ~809–824): para indicador **corporativo** (`rollupStrategy` setado +
   tem filhos), **substituir** o `goal` serializado pelo computado e adicionar
   flags na resposta do `yearConfig`:
   - `goal`: passa a ser o valor computado (ou `null`).
   - `isGoalComputed: true`.
   - `goalChildrenWithData` / `goalChildrenTotal` (para tooltip "calculado de X/Y
     filiais", opcional na UI).

   Indicadores folha: comportamento inalterado (`isGoalComputed` ausente/false).

   > A computação deve ser eficiente: reusar as year-configs/filhos já carregados
   > no handler do ano quando possível, evitando N+1. (`computeRollupValue` já é
   > chamado por mês; o goal é por ano — calcular **uma vez por corporativo**.)

3. **Bloquear edição manual da meta de corporativo** no
   `PUT /organizations/:orgId/kpi/indicators/:indicatorId/years/:year` (~929):
   se o indicador-alvo for corporativo (`rollupStrategy` setado), **ignorar** o
   `goal` recebido (não gravar) — a meta é sempre derivada. Demais campos do
   year-config (ex.: `objectiveId`) continuam editáveis.

4. **Criação corporativa** `POST .../corporate-indicators` (~1171–1305):
   - `goal` deixa de ser **obrigatório** (remover a validação de linha ~1209).
   - Gravar `kpi_year_configs.goal = null` para o corporativo (a meta passa a ser
     sempre calculada). Manter a criação do year-config (para o corporativo
     aparecer no ano e carregar `objectiveId` etc.).

## Mudanças — Frontend

1. **Diálogo de criação** `artifacts/web/src/pages/app/kpi/_components/corporate-create-dialog.tsx`:
   - Remover o input "Tolerância / meta *" (linhas ~407–428), o estado `goal`,
     `goalNum`, `goalValid` e a obrigatoriedade em `canSubmit`.
   - Adicionar **prévia somente-leitura** "Meta calculada: X" — agregando as
     metas das filiais selecionadas pela estratégia atual, no cliente. Para isso,
     o diálogo precisa das **metas do ano dos filhos**; passar via prop
     (ex.: `childGoals: Map<number, number | null>` ou um lookup a partir das
     year-rows que a página `indicadores.tsx` já tem).
   - Remover `goal` do payload enviado (`handleCreate`).
   - Ajustar o texto do rodapé ("* Responsável obrigatório").

2. **Diálogos de edição de tolerância** quando o indicador é corporativo
   (`isCorporateUnit(unit)`):
   - `indicadores.tsx` (form, input "Tolerância (ano)", ~1264–1270): esconder/
     desabilitar o campo e mostrar nota "Meta calculada automaticamente das
     filiais".
   - `lancamentos.tsx` (config dialog, "Tolerância *", ~820–828): idem.

3. **Exibição (sem mudança funcional):** tabela de indicadores, lançamentos,
   `indicator-card.tsx`, `evolution-panel.tsx`, semáforo (`getTrafficLight`) e
   `computeMonthlyStats` já leem `yearConfig.goal` — passam a receber a meta
   calculada automaticamente.
   - *Opcional (polish):* badge "↻ calculado" ao lado da tolerância do
     corporativo, usando `isGoalComputed`, espelhando o "↻ calculado de X filiais"
     já usado no valor.

4. **Tipos gerados / contrato:** adicionar `isGoalComputed` (e
   `goalChildrenWithData`/`Total`) ao schema OpenAPI do `KpiYearConfig` em
   `lib/api-spec/openapi.yaml` e rodar o codegen
   (`pnpm --filter @workspace/api-spec codegen`). Nunca editar gerados à mão.

## Casos de borda e migração

- **Corporativos já existentes** passam a exibir a meta calculada
  automaticamente — é on-read; a meta gravada antiga é simplesmente ignorada.
  **Sem script de migração.** Aplica-se também ao `#164` da org Demo.
- **Filho sem meta no ano:** excluído da agregação (média só sobre os que têm).
- **Nenhum filho com meta:** corporativo mostra "—".
- **Filhos com metas divergentes:** comportamento natural (soma/média/min/máx).

## Testes

- **Unit `computeRollupGoal`** (node-unit): cada estratégia (soma/média/mín/máx),
  filhos sem meta (exclusão), nenhum com meta (→ null), 1 filho com meta.
- Garantir que os testes existentes de `computeRollupValue` seguem passando.
- (Se houver) teste de integração do endpoint do ano confirmando `goal` computado
  + `isGoalComputed` para corporativo e inalterado para folha.
- `pnpm typecheck` e `pnpm test:unit` verdes.

## Fora de escopo

- Override manual da meta do corporativo (decidido: 100% automática).
- Mudar como o **valor** é calculado.
- Metas por mês (a meta continua anual).
- Corporativo de corporativo (já proibido na criação).
