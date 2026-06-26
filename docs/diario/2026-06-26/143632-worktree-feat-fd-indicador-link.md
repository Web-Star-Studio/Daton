---
hora: "14:36"
autor: João Pedro
branch: worktree-feat-fd-indicador-link
modulo: Segurança Viária / Indicadores
titulo: Vínculo de indicador no Fator de Desempenho
---

**O que foi feito**

Implementado o vínculo entre **Fatores de Desempenho** (Segurança Viária · ISO 39001 §6.3) e o módulo **Indicadores** (KPI). Antes os dois módulos eram independentes e não havia como ligar um indicador já existente a um fator — a cliente precisaria relançar manualmente valores que já mantém nos Indicadores. Agora, ao escolher "Indicador" como forma de monitoramento, é possível selecionar (busca por nome, com a filial ao lado) um indicador da organização; a partir daí o fator passa a **consumir** do indicador o valor atual, a unidade e a meta do ano, e o lançamento manual daquele fator é desabilitado.

**Por quê**

Pedido direto da cliente (Ana): no módulo Fatores de Desempenho ela não conseguia vincular um indicador existente (ex.: "Idade média dos veículos"), e a tela só oferecia processo manual — gerando retrabalho e risco de divergência entre os dois módulos.

**Como foi feito (impacto/área)**

- **Banco**: nova coluna `kpi_indicator_id` em `road_safety_factors` (FK → `kpi_indicators`, `ON DELETE SET NULL` — se o indicador for excluído, o fator volta ao modo manual sem quebrar).
- **Contrato/API**: `kpiIndicatorId` adicionado ao OpenAPI e regenerado (Orval). Backend valida que o indicador é da mesma organização, força `monitoringForm = "indicator"` ao vincular e **bloqueia (409)** lançamento manual em fator vinculado.
- **Frontend**: a resolução de valor/meta é feita reaproveitando os dados do módulo Indicadores (compose-on-read já trata corporativo/rollup). Painel mostra "Indicador atual" e "Meta" vindos do indicador (com ícone de vínculo); cadastro ganhou o seletor e bloqueia Meta/Unidade quando vinculado; a aba "Lançar" de um fator vinculado remete ao módulo Indicadores ("Abrir nos Indicadores").
- **Testes**: 4 testes de integração no backend (vínculo válido, rejeição cross-org, link/unlink, bloqueio 409) e 6 testes de unidade no frontend (resolução do valor/meta efetivos). Corrigida lacuna pré-existente na limpeza de testes de integração (tabelas de Segurança Viária não eram removidas antes da organização).

**Status e validações**

- Implementado e commitado na branch `worktree-feat-fd-indicador-link` (commit e7650b5). `pnpm typecheck` (todos os pacotes) e `pnpm build` verdes; testes novos passando (4 de integração + 6 de unidade).
- **DDL aplicada no PROD Neon** (2026-06-26): `ALTER TABLE road_safety_factors ADD COLUMN kpi_indicator_id integer REFERENCES kpi_indicators(id) ON DELETE SET NULL;` (cirúrgico, sem `db push`; constraint nomeada conforme convenção do drizzle).
- Pendente: abrir PR / merge para a `main` e deploy do código (a coluna já está no banco de produção).
- Observação: há uma falha de teste pré-existente e não relacionada (`operational-planning.unit.test.tsx`), que falha igualmente na base limpa.
