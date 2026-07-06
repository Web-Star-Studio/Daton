# Gestão de Aprendizagem — SP0: Casca do módulo + reorganização de Colaboradores

**Data:** 2026-06-30
**Branch:** `worktree-feat-gestao-aprendizagem`
**Status:** Spec aprovado para virar plano de implementação
**Escopo deste documento:** apenas o **SP0** da iniciativa (reorganização pura). Os demais sub-projetos (SP1–SP6) têm cada um seu próprio ciclo spec → plano → implementação.

---

## 1. Contexto da iniciativa

A cliente (Transportes Gabardo) desenhou, com auxílio do Claude, um protótipo de um **LMS / Sistema de Gestão de Aprendizagem** (`lms_gabardo (6).html`) para **substituir o módulo de Treinamentos da v1** e **absorver o cadastro de Colaboradores**, que hoje vive dentro de "Organização".

O protótipo é um subsistema completo com **11 telas** em 4 grupos de navegação, compartilhando ~10 entidades de dados. É grande demais para um único spec/plano, então foi **decomposto em sub-projetos sequenciais**.

### 1.1. Descoberta — o que JÁ existe (fundação em produção)

Mapeamento do código atual revelou que boa parte da fundação já está construída (~3.500 linhas de rotas, 9 tabelas, OpenAPI completo):

- `employees` + itens de perfil/anexos + vínculo multi-unidade (`employee_units`)
- `employee_competencies`, `employee_trainings`, `training_effectiveness_reviews`, `employee_awareness_records`
- `position_competency_requirements` + **revisões versionadas da matriz** e endpoint de **competency-gaps**
- Frontend: lista de Colaboradores + ficha (5 abas), `treinamentos.tsx` (visão geral + matriz + lacunas), detalhe de treino
- Hoje em `/organizacao/colaboradores`, protegido pela permissão de módulo **`employees`**

### 1.2. O que NÃO existe (camada de orquestração nova — alvo dos SP1–SP6)

1. **Catálogo** de treinamentos (definições reutilizáveis; hoje treino só existe como registro por-colaborador)
2. **Obrigatoriedades** — motor de regras (cargo × treinamento, prazo fixo/programa/RH, escopo geral/filial, recorrência, crítico) que **vincula automaticamente** treinamentos na admissão/mudança de cargo, com aproveitamento dos ainda válidos — *o coração do protótipo*
3. **Turmas** — classes/coortes com presença, notas, evidências
4. **Programa Anual (PAT)**
5. **Dashboard + Indicadores LMS** (leituras agregadas)
6. **Minha área** (visão colaborador/gestor) e a triagem operacional "Gestão de treinamentos"

### 1.3. Decomposição em sub-projetos (ordem de construção)

| Fase | Sub-projeto | Trabalho novo |
|------|-------------|---------------|
| **SP0** | **Casca do módulo + reorg** ← *este spec* | Grupo "Aprendizagem" no menu; mover Colaboradores; permissão; (vínculos adiados) |
| SP1 | Catálogo + banco de competências | `training_catalog` + catálogo de competências; UI cards/ficha/duplicar |
| SP2 | Obrigatoriedades (motor) | `training_requirements` + auto-vínculo na admissão/mudança de cargo; stepper novo colaborador; cronograma |
| SP3 | Turmas | `training_classes` + participantes (presença/nota/resultado/evidências); concluir turma grava `employee_trainings`; triagem operacional |
| SP4 | Programa Anual (PAT) | `annual_training_program` → "criar turma" |
| SP5 | Eficácia (workflow) + Minha área | Kirkpatrick L3/L4 em kanban; "não eficaz → plano de ação" (*depende do hub Gestão de Ações, ainda não construído*); visão pessoal |
| SP6 | Dashboard + Indicadores LMS | views agregadas read-only |

**Postura geral:** **estender as tabelas existentes (bridge), não reconstruir** — coerente com migrações anteriores deste repositório.

### 1.4. Decisões de enquadramento já tomadas (com o usuário)

- **Permissão:** o grupo "Aprendizagem" é, neste momento, **apenas agrupamento de navegação**. Colaboradores segue protegido pela permissão **`employees`** existente. **Zero migração de grants**; ninguém perde acesso. Permissões mais finas entram conforme cada SP futuro.
- **Vínculos (contractType):** a expansão para as 6 categorias do mockup (CLT/Integrado/Agregado/Prestador Fixo/Prestador Eventual/Visitante) é **adiada** para um sub-projeto próprio — é migração de dado em produção (~1860 colaboradores ativos) e precisa de de-para de negócio definido. **SP0 não toca em `contractType`.**
- **SP0 é reorganização pura:** mexe só em **menu e rotas (frontend)**. **Nenhuma** alteração de banco, lógica de backend, ou permissão de fundo.

---

## 2. SP0 — Objetivo e não-objetivos

**Objetivo:** criar a área "Aprendizagem" no menu lateral e mover para dentro dela as telas de Colaboradores e de treinamento que **já existem**, sem alterar dado, backend ou permissão de fundo. Resultado visível e de baixo risco que **desbloqueia** todos os SPs seguintes.

**Não-objetivos (explicitamente fora do SP0):**
- Catálogo, obrigatoriedades, turmas, PAT, eficácia (workflow), dashboard, indicadores, Minha área → SP1–SP6
- Expansão de `contractType` (vínculos) → sub-projeto próprio
- Mover o CRUD de **Cargos** (`/organizacao/cargos`) — é dado de estrutura organizacional; a tela rica "Cargos e competências" do mockup vem em SP posterior
- Re-skin/reorganização visual das telas movidas — elas vão como estão; refino visual acontece nos SPs que as reconstroem

---

## 3. Identidade do módulo

- Novo grupo no sidebar **"Aprendizagem"**, irmão de Organização / Qualidade / Governança.
- Base de URL **`/aprendizagem`**.
- Observação: o protótipo usa "Gestão de Aprendizagem"; adotamos **"Aprendizagem"** para seguir o padrão de rótulo curto do menu atual. (Ajustável sem custo.)

---

## 4. Movimentação de rotas

As telas de colaborador/treinamento existentes passam de `/organizacao/...` para `/aprendizagem/...`. As URLs antigas continuam funcionando via **redirect** (não quebra link salvo, notificação, "abrir lançamentos", breadcrumbs externos etc.).

| Hoje (`/organizacao/...`) | Vira (`/aprendizagem/...`) | URL antiga |
|---|---|---|
| `/organizacao/colaboradores` | `/aprendizagem/colaboradores` | redirect |
| `/organizacao/colaboradores/:id` | `/aprendizagem/colaboradores/:id` | redirect |
| `/organizacao/colaboradores/treinamentos` | `/aprendizagem/colaboradores/treinamentos` | redirect |
| `/organizacao/colaboradores/treinamentos/:title` | `/aprendizagem/colaboradores/treinamentos/:title` | redirect |

> O sub-path `colaboradores/treinamentos` é mantido por ora (menor diff). Reorganização das sub-rotas (ex.: `treinamentos` como item de topo do módulo) é avaliada nos SPs que reconstroem essas telas.

---

## 5. Estrutura de arquivos (consolidação)

**Estado atual (indireção dupla):**
- Implementação canônica: `pages/app/qualidade/colaboradores/` — `index.tsx` (47KB), `[id].tsx` (133KB), `treinamentos.tsx` (53KB), `treinamento-detalhe.tsx` (39KB)
- `pages/app/organizacao/colaboradores/` — apenas **shims** de re-export (`export { default } from "@/pages/app/qualidade/colaboradores..."`)
- `App.tsx` importa os shims de `organizacao`.

**Alvo do SP0:** consolidar a implementação canônica em **`pages/app/aprendizagem/colaboradores/`**, eliminando a indireção dupla.

- Mover os 4 arquivos canônicos de `qualidade/colaboradores/` → `aprendizagem/colaboradores/`.
- Como esses arquivos usam imports absolutos `@/...`, o risco de quebra de import interno é baixo — **mas** é obrigatório varrer:
  - imports relativos dentro dos próprios arquivos;
  - **qualquer outro arquivo** que importe de `@/pages/app/qualidade/colaboradores...` ou `@/pages/app/organizacao/colaboradores...`;
  - componentes/sub-rotas auxiliares na mesma pasta.
- Remover os shims de `organizacao/colaboradores/` (a rota antiga passa a ser um redirect declarado em `App.tsx`, não um arquivo de página).

> Decisão registrada: **mover** (não só re-pontar) para estabelecer o diretório do módulo que vai crescer muito nos próximos SPs. Se a varredura de imports revelar acoplamento alto demais para mover com segurança no SP0, o fallback é manter a impl em `qualidade/` e criar shims em `aprendizagem/` — decidir no plano, com base na varredura.

---

## 6. Pontos de toque no código

Frontend apenas. Localizar por símbolo/estrutura (números de linha podem variar):

1. **`artifacts/web/src/App.tsx`**
   - Imports das páginas de colaboradores/treinamentos → repontar para `@/pages/app/aprendizagem/...`
   - Definições de `<Route path="/organizacao/colaboradores...">` → novas rotas `/aprendizagem/colaboradores...`
   - Adicionar rotas de **redirect** das 4 URLs antigas para as novas (usar o padrão de redirect já existente no projeto; ver como outras rotas legadas redirecionam, ex.: `/app/qualidade/regulatorios`).

2. **`artifacts/web/src/components/layout/AppLayout.tsx`**
   - **Novo grupo de navegação "Aprendizagem"** (seguir a estrutura dos grupos existentes — Organização/Qualidade/Governança), contendo o link **Colaboradores** (e, se desejado, os atalhos de treinamentos).
   - Remover o link **Colaboradores** de `organizacaoLinks`.
   - **Mapa rota→módulo:** garantir que `/aprendizagem/colaboradores*` mapeie para o módulo **`employees`** (mesma permissão de hoje). Manter `/organizacao/colaboradores*` mapeado também, enquanto o redirect existir.
   - **Breadcrumbs:** ajustar o tratamento de breadcrumb de colaboradores (hoje "Organização / Colaboradores / …") para "Aprendizagem / Colaboradores / …".
   - **Redirect de negação de auth:** se a negação de acesso a `employees` hoje redireciona para `/organizacao`, avaliar redirecionar para `/aprendizagem` quando a origem for o novo módulo (não regredir comportamento).

3. **Referências internas a rotas antigas (varredura obrigatória):** qualquer link/`navigate`/`href`/breadcrumb que aponte para `/organizacao/colaboradores...` em todo o `artifacts/web/src` (ex.: notificações, hub de ações, KPI "abrir lançamentos", páginas de unidade/departamento). Repontar para `/aprendizagem/...` (os redirects cobrem o que escapar, mas links internos devem apontar para o destino novo).

> **Backend:** nenhuma mudança. As rotas de API (`/organizations/:orgId/employees/...`) permanecem idênticas — só a navegação do frontend muda.

---

## 7. Plano de validação

Sem testes de dado (nada muda no backend). Verificação:

- **`pnpm typecheck`** limpo no monorepo.
- **`pnpm build`** do `@workspace/web` sem erros.
- **Navegação manual (smoke test)** rodando o app numa **porta de teste (ex.: :3002) + DB docker**, **nunca** na :3001 (que aponta para a PROD Neon):
  - "Aprendizagem" aparece no menu; "Colaboradores" não aparece mais em "Organização".
  - Lista de Colaboradores, ficha do colaborador, visão de treinamentos e detalhe de treino abrem em `/aprendizagem/...`.
  - As 4 URLs antigas `/organizacao/colaboradores...` redirecionam para as novas.
  - Breadcrumbs corretos ("Aprendizagem / …").
  - Permissão `employees` continua gateando (usuário sem o módulo não vê o item nem acessa a rota).
- **Busca por rota morta:** nenhum link interno aponta para `/organizacao/colaboradores` sem redirect.

---

## 8. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Link interno esquecido apontando para rota antiga | Varredura textual completa em `artifacts/web/src`; redirects como rede de segurança |
| Mover `[id].tsx` (133KB) quebrar imports | Imports são `@/` absolutos; varredura de imports + `pnpm typecheck` antes de concluir; fallback de shims se acoplamento alto |
| Regredir o redirect de negação de auth | Conferir e preservar o comportamento de acesso negado |
| Branch isolada diverge da `main` durante o ciclo | Worktree a partir de `origin/main`; rebase/merge no fechamento |

---

## 9. Critérios de aceitação (Definition of Done do SP0)

- [ ] Grupo "Aprendizagem" no sidebar, com "Colaboradores" dentro dele; removido de "Organização".
- [ ] Rotas `/aprendizagem/colaboradores`, `/.../:id`, `/.../treinamentos`, `/.../treinamentos/:title` servindo as telas existentes.
- [ ] As 4 URLs antigas redirecionando para as novas.
- [ ] Implementação canônica consolidada em `pages/app/aprendizagem/colaboradores/` (ou fallback de shims, se decidido no plano), sem indireção dupla.
- [ ] Permissão `employees` inalterada e funcionando como gate.
- [ ] Breadcrumbs e links internos apontando para o novo módulo.
- [ ] `pnpm typecheck` e `pnpm build` limpos.
- [ ] Smoke test de navegação aprovado em porta de teste (não-prod).
- [ ] Nenhuma alteração em backend, banco, ou `contractType`.

---

## 10. Follow-ups (fora do SP0, registrados)

- **SP1** Catálogo + banco de competências (próximo na fila).
- Expansão de `contractType` (vínculos) — sub-projeto de migração com de-para de negócio.
- Tela "Cargos e competências" do mockup (move/funde Cargos para o módulo) — SP posterior.
- Permissões finas por sub-área do módulo Aprendizagem — conforme os SPs chegam.
- Integração eficácia → plano de ação depende do hub **Gestão de Ações** (ainda não construído).
