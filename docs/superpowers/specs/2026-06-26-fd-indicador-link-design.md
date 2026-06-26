# Vincular Indicador (KPI) a Fator de Desempenho (Segurança Viária / ISO 39001)

**Data:** 2026-06-26
**Módulos afetados:** Road Safety (Fatores de Desempenho) · KPI (Indicadores)
**Origem:** Pedido da cliente (Ana, Transportes Gabardo). No módulo "Fatores de Desempenho" ela
não consegue vincular um indicador já existente do módulo Indicadores (ex.: "IDADE MÉDIA DOS
VEÍCULOS"). A tela só oferece lançamento manual, o que obriga a digitar duas vezes os mesmos
números. Não deveria ser assim.

## Problema

Hoje "Fatores de Desempenho" (tabelas `road_safety_factors` / `road_safety_factor_measurements`)
e "Indicadores" (tabelas `kpi_indicators` / `kpi_year_configs` / `kpi_monthly_values`) são
**dois sistemas totalmente independentes**, sem nenhuma chave estrangeira entre eles. A coluna
"Indicador atual" do painel lê das **medições próprias do fator** (append-only), que estão
vazias → exibe "—". A opção `monitoringForm = "indicator"` no cadastro do fator é apenas um
rótulo, sem link real para um KPI.

## Decisões de desenho (aprovadas com o usuário)

1. **Vínculo = fonte de verdade.** Ao vincular um indicador a um fator, o **valor atual** e a
   **unidade** do fator passam a vir do indicador. O lançamento manual daquele fator fica
   desabilitado (acaba a digitação dupla).
2. **Meta vem do indicador.** A meta exibida no fator vinculado é a meta do ano configurada no
   módulo Indicadores (`kpi_year_configs.goal` do ano corrente, composta para corporativo).
3. **Lista de indicadores = todos.** O seletor mostra todos os indicadores da organização,
   buscáveis por nome, com a filial/unidade ao lado para diferenciar (ex.: "Corporativo" vs.
   filial). Sem filtro/priorização por categoria ou norma ISO 39001 — a categorização é frouxa
   e opcional, e filtrar esconderia indicadores válidos (o indicador da Ana provavelmente é de
   categoria "Frota", não "Seg. Viária").

## Escopo

Vínculo **opcional, por fator**. Fatores sem vínculo continuam exatamente como hoje (lançamento
manual próprio). Apenas a leitura de valor/meta/unidade e o bloqueio de lançamento manual mudam
para fatores vinculados.

Fora de escopo: histórico/gráfico do indicador dentro da tela de Fatores (a aba "Lançar" apenas
remete ao módulo Indicadores); alterar o modelo de medições do KPI; tornar o vínculo obrigatório.

## Modelo de dados

Nova coluna em `road_safety_factors`:

```ts
kpiIndicatorId: integer("kpi_indicator_id").references(() => kpiIndicatorsTable.id, {
  onDelete: "set null",
}),
```

- Nullable. `null` = fator com monitoramento manual (comportamento atual).
- `onDelete: "set null"`: se o indicador for excluído, o fator desvincula automaticamente e
  volta ao modo manual (sem quebrar o fator).
- Os campos próprios `goal`, `measureUnit`, `periodicity` do fator **permanecem** na tabela
  (compat e para restaurar o modo manual ao desvincular), mas são tratados como somente-leitura
  na UI e ignorados para exibição enquanto houver vínculo.

### DDL de deploy (PROD Neon)

O módulo já está em produção (a cliente o usa). A coluna precisa ser aplicada por **DDL
cirúrgico**, nunca por `pnpm db push` puro de branch atrasada (tentaria dropar `users.theme`):

```sql
ALTER TABLE road_safety_factors
  ADD COLUMN kpi_indicator_id integer
  REFERENCES kpi_indicators(id) ON DELETE SET NULL;
```

Executado apenas com "go" explícito do usuário.

## Backend (`artifacts/api-server/src/routes/road-safety/` + `services/`)

### Resolver valor/meta do indicador vinculado

Helper de serviço (novo, em `services/road-safety/` ou reaproveitando o serviço de KPI):

```
resolveLinkedIndicator(orgId, indicatorId, year) -> {
  name, unit, measureUnit, direction,
  latestValue, latestMonth,   // último mês preenchido do ano (compute-on-read p/ rollup)
  goal,                       // meta do ano (composta p/ corporativo)
} | null
```

Reusa o caminho de KPI que já monta os valores mensais com `computeRollupValue`
(compose-on-read), garantindo que corporativo e overrides fiquem corretos. "Valor atual" = o
maior `month` com `value != null` no ano corrente; se nenhum, `latestValue = null` → painel
mostra "—".

### `GET .../road-safety/factors`

Para cada fator com `kpiIndicatorId != null`, anexa ao item serializado os campos do indicador
vinculado (resolvidos em lote para os indicadores referenciados, evitando N+1):

- `kpiIndicatorId`
- `linkedIndicatorName`
- `linkedIndicatorUnit`     (rótulo de filial/unidade, ex.: "Corporativo")
- `linkedMeasureUnit`
- `linkedDirection`         ("up" | "down")
- `linkedLatestValue`       (number | null)
- `linkedLatestMonth`       (number | null)
- `linkedGoal`              (number | null)

Fatores sem vínculo: campos `linked*` ausentes/nulos; mantêm a agregação de medições próprias
como hoje.

### `POST` / `PATCH .../road-safety/factors[/:id]`

- Aceitam `kpiIndicatorId` (opcional, nullable).
- Validam que o indicador pertence à mesma organização (400/404 se não).
- Quando `kpiIndicatorId` é setado, gravam `monitoringForm = "indicator"`.
- `kpiIndicatorId = null` desvincula (volta ao manual).

### `POST .../factors/:id/measurements`

Se o fator estiver vinculado (`kpiIndicatorId != null`), retorna **409** (ou 400) com mensagem:
"Este fator é monitorado por um indicador. Lance os valores no módulo Indicadores." Evita
lançamentos manuais que seriam ignorados na exibição.

## Contrato OpenAPI + codegen (`lib/api-spec/openapi.yaml`)

- Adicionar `kpiIndicatorId` a `RoadSafetyFactor`, `CreateRoadSafetyFactorBody`,
  `UpdateRoadSafetyFactorBody`.
- Adicionar ao `RoadSafetyFactor` (resposta) os campos `linkedIndicatorName`,
  `linkedIndicatorUnit`, `linkedMeasureUnit`, `linkedDirection`, `linkedLatestValue`,
  `linkedLatestMonth`, `linkedGoal` (todos opcionais/nullable).
- Regenerar: `pnpm --filter @workspace/api-spec codegen` (requer `python3`; sem ruby).
- **Não** editar arquivos gerados à mão.

## Frontend (`artifacts/web/src/pages/app/road-safety/`)

### `road-safety-client.ts`

- Reexporta os novos tipos gerados.
- Helpers de "valor/meta efetivos" que preferem o vínculo:
  - `factorCurrentValue(factor)` → `linkedLatestValue` se vinculado, senão último valor próprio.
  - `factorGoal(factor)` → `linkedGoal` se vinculado, senão `factor.goal`.
  - `factorMeasureUnit(factor)` → `linkedMeasureUnit` se vinculado, senão `factor.measureUnit`.
  - `isLinkedToIndicator(factor)` → `factor.kpiIndicatorId != null`.

### `_components/cadastro.tsx`

- Bloco B (Monitoramento): mantém o select "Forma de monitoramento". Quando = "Indicador",
  exibe um **SearchableSelect** "Indicador vinculado" (Popover + cmdk — padrão do projeto, o
  usuário não gosta do Select nativo) populado por `useKpiIndicators(orgId)`. Cada item mostra
  **nome + filial/unidade**; busca por nome.
- Ao escolher um indicador: desabilita os campos **Meta** e **Unidade de medida** (e
  periodicidade) com texto de apoio "Vem do indicador «{nome}»".
- Salvar envia `kpiIndicatorId`. Limpar o seletor desvincula.

### `_components/painel.tsx`

- Coluna "Indicador atual": vinculado → `formatKpiValue(factorCurrentValue, factorMeasureUnit)`
  com ícone de link + nome do indicador (tooltip); não vinculado → comportamento atual.
- Coluna "Meta": vinculado → `factorGoal` (do indicador); não vinculado → `factor.goal`.

### `_components/lancamentos.tsx` (aba "Lançar Indicador")

- Se o fator selecionado estiver vinculado: substitui o formulário manual por um painel
  informativo — "Este fator é monitorado pelo indicador «{nome}» ({filial}). Os lançamentos são
  feitos no módulo Indicadores." + botão "Abrir nos Indicadores" (navega para a rota do KPI).
- Fatores não vinculados: formulário manual como hoje.
- O botão "Lançar" do painel, para fator vinculado, leva ao mesmo aviso/rota.

## Casos de borda

- **Corporativo (rollup):** valor e meta calculados on-read; reusar lógica do KPI.
- **Indicador sem valores no ano:** `latestValue = null` → "—".
- **Indicador excluído:** FK `set null` → fator desvincula e volta ao manual.
- **Periodicidade divergente** entre fator e indicador: exibimos apenas o último valor do
  indicador; sem reconciliação/validação nesta fase.
- **Fator com medições manuais antigas** que depois é vinculado: as medições antigas
  permanecem na tabela (histórico), mas a exibição passa a usar o indicador.

## Testes (TDD)

Backend (`node-unit` / `integration`):
- Criar fator com `kpiIndicatorId` de outra org → rejeitado.
- Criar/atualizar vínculo e desvínculo; `monitoringForm` vira "indicator" ao vincular.
- `GET factors` traz `linkedLatestValue` e `linkedGoal` corretos (seed: indicador + year config
  + valor mensal); inclusive caso corporativo (compute-on-read).
- `POST measurement` em fator vinculado → 409.

Frontend (`web-unit`):
- Helpers `factorCurrentValue` / `factorGoal` / `factorMeasureUnit` preferem o indicador quando
  vinculado e caem no próprio quando não.

## Validação

- `pnpm typecheck` e `pnpm build` verdes.
- `pnpm test:unit` (web-unit + node-unit) verdes.
- Verificação manual no fluxo real (ambiente local em porta != 3001, que aponta p/ PROD).

## Registro

Ao concluir, registrar no diário de bordo via `scripts/diario-add.py` (módulo: Segurança Viária
/ Indicadores).
