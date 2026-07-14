# Carga de treinamentos da Gabardo casando por CPF

**Data:** 2026-07-13
**Org alvo:** 2 (Transportes Gabardo) — produção
**Origem:** `TREINAMENTOS GERAL _QUALITYWEB_QUALISYS (2).xlsx` (export QualityWeb/Qualisys com coluna CPF, enviado pela cliente em 13/07/2026)

## Problema

A carga de treinamentos aplicada em 06/07/2026 (lote `gabardo-lms-20260706`) usou uma planilha **sem coluna de CPF**. O único vínculo possível entre a linha da planilha e o colaborador cadastrado era o **nome**. Quem casou por nome, casou; quem não casou virou um "ex-colaborador" inativo criado na hora (1.419 pessoas, por instrução ZERO_WASTE da cliente: não desperdiçar nenhum registro).

A cliente enviou agora a versão com CPF. O objetivo é usar o CPF como chave determinística de vínculo.

## O que os dados dizem (levantamento de 13/07/2026)

### As duas planilhas são complementares, não versões da mesma coisa

|                | Planilha antiga (já em produção) | Planilha nova (com CPF) |
| -------------- | -------------------------------- | ----------------------- |
| Linhas         | 32.767                           | 75.335                  |
| Pessoas        | 1.808                            | 1.317                   |
| Período        | 2009–2017                        | 2009–2026 (densa de 2015 em diante) |

- Apenas **10.109 linhas (30,9%)** da planilha antiga existem dentro da nova.
- As outras **22.658 linhas (69,1%)** não estão na nova. Destas, **21.593** são de **1.498 pessoas que sequer aparecem na planilha nova** — ex-funcionários. A planilha nova é um export **só do quadro atual**.
- **As 1.315 pessoas com CPF válido da planilha nova casam 100% por CPF com colaboradores ATIVOS** no sistema. Zero pessoas novas, zero CPF a preencher, zero homônimo ambíguo.

**Consequência:** apagar a carga antiga e recarregar pela nova destruiria 22.658 linhas de histórico real, sem reposição possível. Descartado.

### O casamento por nome da carga antiga acertou na maioria

Das 12.341 linhas que a carga antiga colou em colaboradores ativos, **10.002 estão confirmadas** pela planilha nova (mesma pessoa por CPF, mesmo treino, mesma data). As 2.339 não confirmadas são **todas de 2009–2016**, período que o export novo mal cobre — são história legítima, não atribuição errada.

### Risco residual do casamento por nome: 21 fantasmas

O matcher antigo não normalizava partículas ("de", "da"). Comparando os 1.419 "ex" criados contra os 1.861 ativos por conjunto de tokens do nome:

- **9 com nome idêntico** (só muda partícula/acento) — são a mesma pessoa. Exemplo do padrão (nomes fictícios): ex#6810 "ROBERTO ALVES **DE** SOUZA" = ativo#488 "ROBERTO ALVES SOUZA"; ex#7331 "MARCOS ANTONIO LIMA" = ativo#509 "MARCOS ANTONIO **DE** LIMA".
- **12 parecidos porém duvidosos** — provavelmente pessoas diferentes. Ex.: "JOAO DA SILVA" vs "PEDRO JOAO DA SILVA".
- Total de **500 treinamentos** presos nesses 21 (1,5% da carga).

### Qualidade da planilha nova

- **Datas:** a coluna `Data` está 100% preenchida e é a data de realização. `Data Inicial`/`Data Final` só existem em 47% das linhas — **não usar**.
- **Carga horária:** 100% no formato `HH:MM`, máximo 120h. 11.272 linhas têm minutos quebrados; **4.874 duram menos de 30 min**.
- **Títulos:** 2.606 distintos, dos quais **1.875 são novos** para o catálogo (que hoje tem 840). **73 são lixo** — texto de descrição no lugar do nome do treinamento (>120 caracteres).
- **CPF inválido:** 6 linhas, todas de PAULO HENRIQUE ALVES — que **existe** no sistema (id 983, ativo) e é um dos 3 ativos sem CPF cadastrado.
- **CPF duplicado no cadastro:** `123.456.789-09` está em dois ativos distintos (CARLOS EDUARDO id 156 e RENATO id 163). A planilha da cliente **repete o mesmo erro**. Os nomes são distintos e únicos, então dá para desempatar por nome.

### O gap a preencher

**65.275 linhas novas** (10.054 já existem em produção e seriam puladas pelo dedup), cobrindo 2016–2026 para os 1.315 colaboradores ativos — justamente o período recente, hoje vazio no Daton.

## Decisões

1. **Preservar todo o histórico.** Nada é apagado. Os ~1.398 ex-colaboradores restantes e seus ~19.500 treinamentos permanecem (instrução ZERO_WASTE da cliente).
2. **Vínculo por CPF.** `Local` e `Unidade` da planilha são **descartados**: a filial de um treinamento é a do **cadastro do colaborador**, por instrução da cliente. É também o que o board de eficácia já usa (`employees.unit_id`), então o dado fica consistente com a tela.
3. **`workload_hours` vira decimal.** Hoje é `integer`, e o arredondamento transformaria 4.874 treinos curtos em "0 h" — visível no indicador de horas de treinamento.
4. **Registros históricos ficam fora do board de eficácia** (ver Restrições).

## Restrições

### R1 — Histórico não pode entrar no board de eficácia

O escopo do board (`boardNeedsEvaluationScope`, `artifacts/api-server/src/routes/employees.ts`) inclui um treinamento se, e somente se, ele tiver ao menos um de: `evaluation_method` não-vazio, `target_competency_name` não-vazio, `effectiveness_assigned_role`, `effectiveness_due_date`, ou uma review registrada.

**O carregador NÃO pode preencher nenhum desses campos.** A carga de 06/07 já respeita isso (insere apenas `employee_id, title, catalog_item_id, status, completion_date, workload_hours`). Manter a mesma disciplina mantém os 65.275 registros como histórico puro, sem inundar o board nem gerar pendências (não existe provider de treinamento em "Suas Pendências").

### R1b — O repositório é público: nenhum dado pessoal versionado

Nada de CPF real, nome real de colaborador ou export de produção em arquivo commitado — nem em documentação, nem em fixture de teste. **Todos os nomes e CPFs citados nesta spec são fictícios**; o mapeamento real vive fora do repositório. `staging/`, `report/` e `pares.json` da ferramenta de carga são gitignored.

Isto não é hipotético: na carga anterior, o `.gitignore` cobria `report/` mas esquecia `staging/`, e `staging/trainings.json` — com **1.774 nomes reais de colaboradores**, cargo, filial e data de admissão — foi commitado e empurrado para o remoto público.

### R2 — Nada de escrita na produção fora do procedimento

Dry-run obrigatório contra a produção, revisão dos números com a cliente, apply em janela, manifesto durável para rollback. Mesmo procedimento do lote `gabardo-lms-20260706`.

## Entregas

### 1. Carga horária decimal (PR de código — precisa ir antes da carga)

- `employee_trainings.workload_hours` e `training_catalog.workload_hours`: `integer` → `numeric(6,2)` com `{ mode: "number" }` (drizzle 0.45.1 suporta; devolve `number` em JS, então os pontos de leitura não mudam).
- OpenAPI: `workloadHours` de `type: integer` para `type: number` (4 ocorrências) + `pnpm --filter @workspace/api-spec codegen`.
- UI: inputs de carga horária aceitam decimal; exibição com as regras de `formatKpiNumber`.
- KPI `hours_per_employee` (`services/kpi/lms-metrics.ts`) já faz `Number(...)` sobre o `sum()`, então continua correto com `numeric` — cobrir com teste de valor fracionado.
- **Backfill opcional:** a carga de 06/07 aplicou `Math.round()` nas horas (`0,5h → 1h`). O valor real está em `scripts/carga-funcoes-treinamentos/staging/trainings.json`; um update casando por colaborador+título+data devolve a fidelidade.
- DDL cirúrgica na produção (Neon), não `drizzle push` — o push aponta para a prod e tem drift conhecido.

### 2. Carregador por CPF

Reusa a ferramenta em `scripts/carga-funcoes-treinamentos/` (branch `chore/carga-gabardo`), com parser e matcher novos.

**Parser** (`parse-qualityweb.py`): xlsx → staging JSON.

- CPF → 11 dígitos (só numérico).
- `Data` (`DD/MM/AAAA`) → ISO. **Ignorar `Data Inicial`/`Data Final`.**
- `Carga Horária` (`HH:MM`) → decimal (`02:50` → `2.83`).
- Ignorar `Local` e `Unidade`.

**Matcher** (por CPF, nesta ordem):

1. CPF válido casando com **exatamente um** colaborador → casa.
2. CPF casando com **mais de um** (caso CARLOS EDUARDO/RENATO) → desempata pelo **nome** da linha. Não desempatou → bucket `revisar`.
3. CPF ausente/inválido (as 6 linhas do PAULO HENRIQUE) → casa por **nome exato**, se único.
4. Nenhum match → bucket `revisar`. **Não cria colaborador** — a planilha é do quadro atual, todos já existem. (Se o dry-run de produção mostrar algo neste bucket, é sinal de divergência a revisar com a cliente, não de dado a criar.)

**Dedup:** `(employee_id, título normalizado, data)` contra o que já está em `employee_trainings`. Rodar duas vezes não duplica.

**Fase A — catálogo:** insere os 1.875 títulos novos. Objetivo, instrutor padrão e carga horária vêm da primeira ocorrência do título.

**Fase B — treinamentos:** insere as 65.275 linhas com:

| Coluna da planilha | Campo em `employee_trainings` |
| ------------------ | ----------------------------- |
| `Treinamento`      | `title` (+ `catalog_item_id`) |
| `Data`             | `completion_date`             |
| `Carga Horária`    | `workload_hours` (decimal)    |
| `Objetivo`         | `objective`                   |
| `Instrutor`        | `institution`                 |
| —                  | `status` = `concluido`        |
| `Local`, `Unidade` | **descartados** (decisão 2) |

Campos de eficácia ficam **nulos** (Restrição R1).

**Manifesto + rollback** por lote, no mesmo formato do `gabardo-lms-20260706`, guardado fora do `/tmp`.

### 3. Merge cirúrgico dos fantasmas

Script separado, com manifesto e rollback próprios.

- Aplica **apenas os 9 de nome idêntico**: move `employee_trainings` (com dedup) e `employee_competencies` do fantasma para o colaborador ativo, depois remove o fantasma.
- Os **12 duvidosos** vão para o relatório da cliente. **Não mexer sem o ok da Ana.**
- Verificar as FKs que apontam para `employees` antes de remover (`users.employee_id` é `ON DELETE SET NULL`; `employee_trainings` é `ON DELETE CASCADE` — mover antes de apagar).

### 4. Relatório para a cliente

Um arquivo (xlsx/CSV) com o que a Ana precisa corrigir na origem:

- O CPF `123.456.789-09` duplicado entre CARLOS EDUARDO (156) e RENATO (163) — um dos dois está errado.
- PAULO HENRIQUE ALVES (983) sem CPF no cadastro e sem CPF na planilha.
- Os 73 títulos que são descrição no lugar do nome do treinamento.
- Os 12 fantasmas duvidosos, para confirmar se são a mesma pessoa.

## Testes

- **Unit (parser):** CPF com máscara/sem máscara/inválido; `DD/MM/AAAA` → ISO; `HH:MM` → decimal (`00:20` → `0.33`, `120:00` → `120`).
- **Unit (matcher):** CPF único; CPF ambíguo com desempate por nome; CPF ambíguo sem desempate → `revisar`; sem CPF com nome único; sem match → `revisar`, sem criar colaborador.
- **Unit (dedup):** linha já existente é pulada; a mesma linha duas vezes na planilha entra uma vez.
- **Integração (docker):** apply idempotente (rodar duas vezes = mesmo estado); rollback restaura o estado anterior; nenhum registro inserido entra no escopo do board de eficácia (R1).
- **Regressão do decimal:** `hours_per_employee` com horas fracionadas; render da carga horária na UI.

## Fora de escopo

- **Perfil Gerente / trava de visibilidade por filial.** O board de eficácia hoje oferece a filial como filtro manual e não restringe o avaliador à sua própria filial. Essa era a dor da V1 e continua pendente — está especificada, mas não implementada. Esta carga deixa o **dado** correto (a filial vem do cadastro do colaborador); a **trava** é outro trabalho.
- Deduplicação geral do cadastro de colaboradores (existe uma duplicata de colaborador (ids 155/8095) vinda da migração V2 de colaboradores).
- Limpeza dos 73 títulos-lixo no catálogo — entram como estão (fidelidade à origem) e a cliente decide depois.

## Procedimento de produção

1. Merge do PR do decimal → deploy (Render + Cloudflare).
2. DDL cirúrgica das duas colunas na Neon.
3. Dry-run do carregador contra a produção → revisar buckets (`casados`, `revisar`, `dedup`) com a cliente.
4. Apply em janela, com manifesto durável.
5. `validate.mjs` → conferir invariantes (nenhum ativo perdido, contagens batem, nada no board de eficácia).
6. Merge dos fantasmas, após o ok da Ana sobre os 12 duvidosos.
