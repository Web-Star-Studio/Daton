# Design — Perfil "Gerente" + visibilidade por dono no módulo de Indicadores

- **Data:** 2026-06-17
- **Autor:** João Pedro (com Claude)
- **Cliente:** Transportes Gabardo (org 2) — solicitação via Ana Corrêa / Aline Pivotto (SGI)
- **Status:** Aprovado em brainstorming; aguardando revisão do spec antes do plano de implementação.

## 1. Contexto e problema

Hoje, no módulo de Indicadores (KPI), **qualquer usuário não-admin enxerga e edita todos os
indicadores da organização**. A proteção existente é grosseira:

- `requireWriteAccess()` apenas bloqueia o role `analyst` (leitura total); `operator` pode
  escrever em tudo.
- O `GET /kpi/indicators` retorna **todos** os indicadores da org, sem filtrar por dono.
- A UI renderiza os botões de editar/excluir incondicionalmente.

Relato do cliente (WhatsApp):

> "[a usuária Débora] não é Administradora, e quando acessa o módulo indicadores, consegue ver
> toda a gestão. Ela só pode ver os indicadores que estão direcionados a ela. Cada um vê o seu, e
> nós com Perfil de ADM, conseguimos ver todos."
>
> "este indicador ela consegue acessar, modificar, apagar, fazer tudo como se ela fosse a usuária,
> e não é ela. Ela apenas pode visualizar. E não Editar."
>
> "E precisamos criar um perfil para 'Gerentes', [...] vinculado [a] uma filial, [que] vai ter
> acesso ao painel, somente de sua FILIAL. No momento de cadastrar um gerente, vamos colocar neste
> perfil de gestão. Que é diferente do perfil de Administrador."
>
> Pergunta nossa: *"um usuário consegue criar um indicador? ou ele deve só poder operar o que ele
> estiver como responsável?"* — Resposta: **"Deve só operar. Nós criamos."**
>
> "Claro que o usuário pode ver documentação da ISO por exemplo, não somente o que está linkado a
> ele." (⇒ a restrição "vê só o seu" é **específica de indicadores**, não vale pra outros módulos.)

### Objetivos

1. **Visibilidade por dono:** usuário comum vê apenas os indicadores em que é o responsável.
2. **Edição correta:** usuário comum não edita indicador que não é dele; e mesmo nos seus, só
   **opera** (lança valores), não cria/exclui/redefine.
3. **Perfil Gerente (novo):** vinculado a uma filial; gerencia tudo da sua filial + camada
   corporativa; não enxerga outras filiais.

### Escopo

- **Dentro:** módulo de Indicadores (KPI) — backend (visibilidade + escrita) e frontend
  (lista/dashboard, botões, cadastro de usuário).
- **Fora (v1):** demais módulos (documentos, fornecedores, etc.) — o Gerente se comporta como
  operador module-gated; widget de KPI na home (não existe hoje). A restrição de visibilidade
  **não** se aplica a outros módulos (ex.: documentação ISO continua visível a todos).

## 2. Decisões de brainstorming

| # | Decisão |
|---|---------|
| Operador (usuário comum) | Vê **só** os indicadores onde é `responsibleUserId`. Pode **operar** = lançar/editar **valores mensais + justificativas** dos seus. **Não** cria, **não** exclui, **não** edita a definição. |
| Analista | Mesma visibilidade do operador (só os direcionados a ele), porém **read-only** (não opera). |
| Gerente (novo) | Vinculado a **1 filial**. Vê e gerencia (CRUD) todos os indicadores da sua filial. Vê e **pode criar/editar** indicadores **corporativos** (rollup que cruza filiais). **Não** vê indicadores de outras filiais. **Não exclui** corporativo (só admin — exclusão afeta várias filiais). |
| Admin (`org_admin` / `platform_admin`) | Vê e edita tudo (filial + corporativo). |
| Vínculo dado | **FK de verdade** (forma correta), não match por texto: `users.unitId` e `kpi_indicators.unitId`. |
| Abrangência | Só o módulo Indicadores agora. |

## 3. Modelo de dados (Drizzle)

Aplicar via **push cirúrgico / DDL** (a branch local está atrás de `main` e um `db push` puro
tentaria dropar colunas de outras branches — ver memória `drizzle-push-prod-drift-theme`).

### 3.1 `users.unitId`

```ts
// lib/db/src/schema/users.ts
unitId: integer("unit_id").references(() => unitsTable.id, { onDelete: "set null" }),
```

- Nullable. **Obrigatório quando `role = "manager"`** (validado na camada de aplicação, não no
  banco). Null para admin/operator/analyst.
- `onDelete: "set null"` — apagar uma filial não apaga o usuário; o gerente fica "órfão" de filial
  (tratamento: ver §7 Open questions).

### 3.2 `kpi_indicators.unitId`

```ts
// lib/db/src/schema/kpi.ts
unitId: integer("unit_id").references(() => unitsTable.id, { onDelete: "set null" }),
```

- Nullable. **Null = indicador corporativo** (os `rollupStrategy != null` / parents). Preenchido =
  pertence a 1 filial.
- A coluna texto `unit` (varchar 200) é **mantida** no v1 por compatibilidade (display/legado);
  `unitId` passa a ser a fonte de verdade pro escopo. Limpeza da coluna `unit` fica pra um follow-up.

### 3.3 Backfill (uma vez)

Script idempotente que, por organização, preenche `kpi_indicators.unitId` casando o texto `unit`
com `units.name` (case/trim-insensitive). Indicadores corporativos (sem `unit`) ficam null. Os
não-casados (typo, unidade renomeada/apagada) ficam null e são **reportados em log** pra revisão
manual. Rodar contra PROD (org 2) com cuidado, em outra porta/sessão (memória
`local-testing-port-3001-is-prod`).

## 4. Roles

Novo valor de role **`manager`** (UI: "Gerente").

- Enum de cadastro (`org-users.ts`): `z.enum(["org_admin", "manager", "operator", "analyst"])`.
- `manager` **não** é admin: continua passando por `requireModuleAccess` (precisa receber o módulo
  `kpi` no cadastro, como o operador).
- `requireWriteAccess()` (bloqueia só `analyst`) permanece — `manager`/`operator` passam por ele e
  o gate fino por-indicador é aplicado depois (ver §6).

## 5. Visibilidade (GET, server-side)

`GET /organizations/:orgId/kpi/indicators` passa a filtrar conforme o solicitante:

| Role | Cláusula WHERE adicional |
|---|---|
| `org_admin` / `platform_admin` | nenhuma (todos) |
| `manager` (filial U) | `kpi_indicators.unitId = U OR kpi_indicators.unitId IS NULL` (sua filial + corporativos) |
| `operator` / `analyst` | `kpi_indicators.responsibleUserId = <userId>` |

> A visibilidade é **garantida no backend** (não dá pra confiar só na UI). Os demais GETs do módulo
> (years, values, justifications de um indicador específico) devem rejeitar (404/403) quando o
> indicador-alvo está fora do escopo do solicitante — ver §6.3.

## 6. Escrita / permissões por indicador

### 6.1 Matriz de capacidade

Função única `canActOnIndicator(auth, indicator, action)` (backend) e seu espelho no frontend.

| Ação | admin | manager (filial U) | operator | analyst |
|---|---|---|---|---|
| Ver | todos | filial U + corp | só os seus (responsável) | só os seus |
| Criar indicador (filial) | ✅ | ✅ (na sua filial) | ❌ | ❌ |
| Criar indicador corporativo | ✅ | ✅ | ❌ | ❌ |
| Editar definição (PATCH) | ✅ | filial U + corp | ❌ | ❌ |
| Lançar/editar valores mensais | ✅ | filial U + corp | **✅ (só os seus)** | ❌ |
| Justificativas (POST) | ✅ | filial U + corp | **✅ (só os seus)** | ❌ |
| Definir meta/year-config | ✅ | filial U + corp | ❌ | ❌ |
| Excluir indicador (filial) | ✅ | ✅ (na sua filial) | ❌ | ❌ |
| Excluir indicador corporativo | ✅ | ❌ | ❌ | ❌ |

> "Operar" (cliente: *"deve só operar"*) = **valores mensais + justificativas** dos indicadores em
> que o operador é responsável. Nada além disso.

### 6.2 Resolução da filial do solicitante

`req.auth` **não** carrega `unitId` (hoje: userId, organizationId, role, authVersion,
onboardingStatus). Para `manager`, o backend resolve a filial por **lookup no banco** dentro da
camada KPI (helper `getRequesterKpiScope(req)` → `{ role, userId, unitId }`), garantindo dado
sempre fresco (sem token de 7 dias defasado). Evita-se alterar o middleware de auth global.

### 6.3 Endpoints afetados (artifacts/api-server/src/routes/kpi/index.ts)

- `GET /kpi/indicators` → aplicar filtro de visibilidade (§5).
- `POST /kpi/indicators` → `canActOnIndicator(..., "create")`: só admin/manager; manager só cria na
  sua filial ou corporativo. Rejeitar `unitId` de outra filial (403).
- `PATCH /kpi/indicators/:id` → carregar indicador, checar `canActOnIndicator(..., "edit")`.
- `DELETE /kpi/indicators/:id` → idem `"delete"` (manager bloqueado em corporativo).
- `PUT .../years/:year` (year-config/meta) → `"editDefinition"` (admin/manager).
- `PUT .../years/:year/values` → `"operate"` (admin/manager na filial/corp; operator só se
  responsável).
- `POST .../months/:month/justifications` → `"operate"`.
- GETs de detalhe (`years/:year`, justifications) → 404/403 se o indicador estiver fora do escopo
  de visibilidade do solicitante.

A lógica vive numa função pura testável (ex.: `services/kpi/access.ts`), não inline nas rotas.

## 7. Auth payload / Frontend

- `/auth/me` passa a retornar `unitId` (além de role/modules). Atualizar OpenAPI + codegen do
  schema de auth.
- `AuthContext` expõe `unitId`; `usePermissions()` (ou helper KPI dedicado) ganha
  `canActOnIndicator(indicator, action)` espelhando o backend, para esconder botões de
  criar/editar/excluir/lançar.
- **KPI module (`indicadores.tsx` / `kpi-module.tsx`):**
  - Lista já vem filtrada do servidor; UI só renderiza.
  - Botão "Novo indicador" / "Novo corporativo": visível só pra admin/manager.
  - Por linha/indicador: editar/excluir/lançar conforme `canActOnIndicator`.
  - Filtro de unidade: faz sentido só pro admin (gerente tem 1 filial; operador/analista veem só os
    seus).
- **Cadastro de usuário (`OrganizationUsersSettingsSection.tsx`):**
  - Adicionar opção **"Gerente"** no select de role.
  - Quando role = Gerente: exibir **dropdown de filial obrigatório** (via `useListUnits`), e os
    checkboxes de módulo (como operador — precisa marcar `kpi`).
  - Persistir `role` + `unitId`.

## 8. API / contrato (OpenAPI + Orval)

- `lib/api-spec/openapi.yaml`:
  - `User` / auth-me: adicionar `unitId` (nullable).
  - `KpiIndicator`: adicionar `unitId` (nullable) + (opcional) `unitName` read-only via join.
  - Body de criar/editar indicador: aceitar `unitId`.
  - Org-users create/update: `role` ganha `manager`; body ganha `unitId` (nullable, obrigatório se
    `manager`).
- Rodar `pnpm --filter @workspace/api-spec codegen` (precisa de `python3`; ver memória
  `drizzle-push-prod-drift-theme`). Nunca editar arquivos gerados à mão.

## 9. Backend org-users (artifacts/api-server/src/routes/org-users.ts)

- `createOrgUserBodySchema` / update: `role` inclui `manager`; novo campo `unitId` (nullable).
- Validação (`.refine`): se `role === "manager"` ⇒ `unitId` presente **e** pertencente à org
  (`units.organizationId === orgId`). Para os outros roles ⇒ forçar `unitId = null`.
- Persistir `unitId` no insert/update do usuário.

## 10. Plano de testes

- **Unit (backend):** `canActOnIndicator` — tabela-verdade completa da §6.1 (admin/manager/
  operator/analyst × ações × filial-própria/outra/corporativo).
- **Unit (frontend):** espelho de `canActOnIndicator` (mesma tabela-verdade).
- **Integração:** GET indicators retorna escopo correto por role; PATCH/DELETE/values retornam 403
  fora de escopo; cadastro de gerente exige `unitId` válido.
- **Regressão:** admin continua com acesso total; operador existente sem responsáveis vê lista
  vazia (validar com o cliente que isso é o esperado).

## 11. Open questions / defaults a confirmar

1. **Gerente sem filial / filial apagada:** se `users.unitId` virar null (filial excluída), o
   gerente passa a ver só corporativos. Default: tratar como "sem filial → só corporativo + aviso
   na UI". OK?
2. **Operador sem indicadores:** vê lista vazia (esperado pelo cliente: "cada um vê o seu").
3. **Migração da coluna `unit` (texto):** mantida no v1; remover em follow-up depois de validar o
   backfill. OK?
4. **Indicadores legados sem `unit` que não são corporativos:** após backfill ficam `unitId=null`
   ⇒ apareceriam como "corporativo" pra gerentes. Mitigação: relatório de não-casados pra Ana
   reclassificar manualmente antes do go-live.
