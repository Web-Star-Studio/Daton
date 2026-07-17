# Redesenho "Cargos e competências" + consolidação do CRUD — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar `/aprendizagem/cargos` o lar único dos cargos — CRUD + layout do mockup (tabela Cargo/Área/Competências/ISO + busca + filtro + painel com abas + Novo cargo), com 2 campos novos (`area`, `principalNormId`), removendo "Cargos" do menu de Organização e redirecionando a rota antiga.

**Architecture:** 2 colunas aditivas em `positions`; backend expõe `competencyCount` na listagem e aceita os novos campos; OpenAPI → codegen; frontend redesenhado consumindo o novo contrato + hooks existentes (`useListPositions`/`useCreate/Update/DeletePosition`, `useActiveNorms`/`useAllNorms`).

**Tech Stack:** Drizzle (Postgres), Express 5, OpenAPI 3.1 + Orval, React 19 + Vite, wouter, React Query, React Hook Form.

## Global Constraints

- `pnpm typecheck` deve passar em toda mudança.
- Testes de integração: `TEST_ENV=integration pnpm exec vitest run --project integration <arquivo>` (sem o env bate na PROD).
- Nunca editar arquivos gerados (`lib/api-zod/src/generated`, `lib/api-client-react/src/generated`) — rodar `pnpm --filter @workspace/api-spec codegen`.
- `codegen` precisa de `python3` no PATH.
- Colunas novas são **nullable/aditivas**; DDL de prod só sob autorização explícita (nunca `db push` puro).
- Commits: só quando o usuário pedir (não commitar por conta própria durante a execução salvo instrução).
- Prettier: 2 espaços, aspas duplas, trailing commas.

---

## Task 1: Colunas `area` e `principalNormId` no schema `positions`

**Files:**
- Modify: `lib/db/src/schema/departments.ts` (positionsTable, ~linha 15-27)

**Interfaces:**
- Produces: `positionsTable.area` (text nullable), `positionsTable.principalNormId` (integer nullable, FK → `regulatoryNormsTable.id`).

- [ ] **Step 1: Adicionar as colunas**

Em `lib/db/src/schema/departments.ts`, garantir o import da tabela de normas no topo (junto dos outros imports de schema):

```ts
import { regulatoryNormsTable } from "./regulatory-norms";
```

Dentro de `positionsTable`, após `maxSalary: integer("max_salary"),` adicionar:

```ts
  area: text("area"),
  principalNormId: integer("principal_norm_id").references(
    () => regulatoryNormsTable.id,
    { onDelete: "set null" },
  ),
```

- [ ] **Step 2: Aplicar no banco de integração (docker :55432)**

Run:
```bash
TEST_ENV=integration pnpm --filter @workspace/db push
```
Expected: push aplica as 2 colunas sem prompt destrutivo (aditivo). Se pedir confirmação de algo NÃO relacionado a positions, abortar e investigar (drift de outra branch).

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @workspace/db typecheck`
Expected: PASS.

---

## Task 2: OpenAPI — `Position`, `CreatePositionBody`, `UpdatePositionBody` + codegen

**Files:**
- Modify: `lib/api-spec/openapi.yaml` (Position ~13968, CreatePositionBody ~14009, UpdatePositionBody ~14033)

**Interfaces:**
- Produces: tipos gerados `Position.area?: string | null`, `Position.principalNormId?: number | null`, `Position.competencyCount?: number`, e `area?`/`principalNormId?` em Create/Update bodies.

- [ ] **Step 1: Position — adicionar 3 propriedades**

No schema `Position`, dentro de `properties`, após `maxSalary:` adicionar:

```yaml
        area:
          type: string
          nullable: true
        principalNormId:
          type: integer
          nullable: true
        competencyCount:
          type: integer
```

- [ ] **Step 2: CreatePositionBody e UpdatePositionBody — adicionar area/principalNormId**

Em **ambos** os schemas (`CreatePositionBody` e `UpdatePositionBody`), dentro de `properties`, após `maxSalary:` adicionar:

```yaml
        area:
          type: string
        principalNormId:
          type: integer
          nullable: true
```

- [ ] **Step 3: Rodar o codegen**

Run: `pnpm --filter @workspace/api-spec codegen`
Expected: regenera `lib/api-zod` e `lib/api-client-react` sem erro. `git status` mostra mudanças só em arquivos `generated`.

- [ ] **Step 4: Typecheck geral**

Run: `pnpm typecheck`
Expected: PASS (o backend ainda não usa os campos novos; só o contrato mudou).

---

## Task 3: Backend `positions.ts` — competencyCount, novos campos, validação da norma

**Files:**
- Modify: `artifacts/api-server/src/routes/positions.ts`
- Test: `tests/integration/positions.integration.test.ts` (criar)

**Interfaces:**
- Consumes: `CreatePositionBody`/`UpdatePositionBody` com `area`/`principalNormId` (Task 2); `positionsTable.area`/`principalNormId` (Task 1).
- Produces: GET list devolve `competencyCount` + `area` + `principalNormId`; POST/PATCH persistem os novos campos; norma de outra org → 400.

- [ ] **Step 1: Escrever o teste de integração (falha primeiro)**

Criar `tests/integration/positions.integration.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestContext, authHeader } from "../support/backend";

describe("positions — área, norma principal e contagem de competências", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;

  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.cleanup();
  });

  it("cria cargo com area e principalNormId e devolve na listagem com competencyCount", async () => {
    const norm = await ctx.createNorm({ label: "ISO 9001:2015 §7.2" });

    const created = await ctx.api
      .post(`/api/organizations/${ctx.orgId}/positions`)
      .set(authHeader(ctx.token))
      .send({ name: "Motorista", area: "Operações", principalNormId: norm.id });
    expect(created.status).toBe(201);
    expect(created.body.area).toBe("Operações");
    expect(created.body.principalNormId).toBe(norm.id);

    const list = await ctx.api
      .get(`/api/organizations/${ctx.orgId}/positions`)
      .set(authHeader(ctx.token));
    expect(list.status).toBe(200);
    const row = list.body.find((p: any) => p.id === created.body.id);
    expect(row.area).toBe("Operações");
    expect(row.competencyCount).toBe(0);
  });

  it("rejeita norma de outra organização (400)", async () => {
    const other = await createTestContext();
    const foreignNorm = await other.createNorm({ label: "ISO 14001" });
    const res = await ctx.api
      .post(`/api/organizations/${ctx.orgId}/positions`)
      .set(authHeader(ctx.token))
      .send({ name: "Ajudante", principalNormId: foreignNorm.id });
    expect(res.status).toBe(400);
    await other.cleanup();
  });
});
```

> Se `createTestContext` não expõe `createNorm`, adicionar um factory em `tests/support/backend.ts` que insere em `regulatoryNormsTable` com o prefixo de teste e o `organizationId` do contexto, retornando `{ id, label }`. Seguir o padrão dos outros factories do arquivo.

- [ ] **Step 2: Rodar o teste (deve falhar)**

Run: `TEST_ENV=integration pnpm exec vitest run --project integration tests/integration/positions.integration.test.ts`
Expected: FAIL (area/principalNormId não persistem; competencyCount undefined).

- [ ] **Step 3: Atualizar `serializePosition` + import**

No topo de `positions.ts`, ampliar os imports do drizzle e do db:

```ts
import { and, eq, inArray, count } from "drizzle-orm";
import { db, positionsTable, positionCompetencyRequirementsTable, regulatoryNormsTable } from "@workspace/db";
```

> Confirmar que `positionCompetencyRequirementsTable` e `regulatoryNormsTable` são reexportados de `@workspace/db` (`lib/db/src/schema/index.ts`). Se algum não estiver, adicionar o reexport.

Em `serializePosition`, após `maxSalary: r.maxSalary,` adicionar:

```ts
    area: r.area,
    principalNormId: r.principalNormId,
```

- [ ] **Step 4: GET list com competencyCount (LEFT JOIN + groupBy)**

Substituir o corpo do handler GET (linhas ~52-56) por:

```ts
  const rows = await db
    .select({
      position: positionsTable,
      competencyCount: count(positionCompetencyRequirementsTable.id),
    })
    .from(positionsTable)
    .leftJoin(
      positionCompetencyRequirementsTable,
      eq(positionCompetencyRequirementsTable.positionId, positionsTable.id),
    )
    .where(eq(positionsTable.organizationId, params.data.orgId))
    .groupBy(positionsTable.id)
    .orderBy(positionsTable.name);

  res.json(
    rows.map((r) => ({ ...serializePosition(r.position), competencyCount: r.competencyCount })),
  );
```

- [ ] **Step 5: Validação de norma pertencente à org (helper)**

Adicionar acima dos handlers:

```ts
async function assertNormBelongsToOrg(
  normId: number | null | undefined,
  orgId: number,
): Promise<boolean> {
  if (normId == null) return true;
  const [norm] = await db
    .select({ id: regulatoryNormsTable.id })
    .from(regulatoryNormsTable)
    .where(and(eq(regulatoryNormsTable.id, normId), eq(regulatoryNormsTable.organizationId, orgId)));
  return !!norm;
}
```

- [ ] **Step 6: POST create — persistir area/principalNormId (com validação)**

No handler POST, após validar o body (linha ~65), antes do insert:

```ts
  if (!(await assertNormBelongsToOrg(body.data.principalNormId, params.data.orgId))) {
    res.status(400).json({ error: "Norma inválida para esta organização" });
    return;
  }
```

E no `.values({...})`, após `maxSalary: body.data.maxSalary,` adicionar:

```ts
    area: body.data.area,
    principalNormId: body.data.principalNormId,
```

- [ ] **Step 7: PATCH update — validar norma antes do `set`**

No handler PATCH, após validar o body (linha ~89), antes do update:

```ts
  if (!(await assertNormBelongsToOrg(body.data.principalNormId, params.data.orgId))) {
    res.status(400).json({ error: "Norma inválida para esta organização" });
    return;
  }
```

(O `.set(body.data)` já aplica `area`/`principalNormId` quando presentes no body.)

- [ ] **Step 8: Rodar o teste (deve passar)**

Run: `TEST_ENV=integration pnpm exec vitest run --project integration tests/integration/positions.integration.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 9: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

---

## Task 4: Utilitários puros do frontend + testes

**Files:**
- Create: `artifacts/web/src/pages/app/aprendizagem/cargos/cargos-utils.ts`
- Test: `artifacts/web/tests/pages/aprendizagem/cargos-utils.unit.test.ts`

**Interfaces:**
- Produces:
  - `deriveAreas(positions: {area?: string | null}[]): string[]` — áreas distintas não vazias, ordenadas.
  - `filterPositions<T extends {name: string; area?: string | null}>(positions: T[], search: string, area: string): T[]` — filtra por nome (case/acento-insensível) e área (`""` = todas).
  - `buildPositionSubline(input: {area?: string | null; competencyCount?: number; normLabel?: string | null}): string` — ex.: `"Operações · 8 competências · ISO 39001"`, omitindo partes ausentes.

- [ ] **Step 1: Escrever os testes (falham primeiro)**

Criar `artifacts/web/tests/pages/aprendizagem/cargos-utils.unit.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  deriveAreas,
  filterPositions,
  buildPositionSubline,
} from "@/pages/app/aprendizagem/cargos/cargos-utils";

describe("deriveAreas", () => {
  it("devolve áreas distintas não vazias, ordenadas", () => {
    expect(
      deriveAreas([{ area: "Operações" }, { area: "Logística" }, { area: "Operações" }, { area: null }, { area: "" }]),
    ).toEqual(["Logística", "Operações"]);
  });
});

describe("filterPositions", () => {
  const pos = [
    { name: "Motorista", area: "Operações" },
    { name: "Analista SGI", area: "Qualidade" },
    { name: "Mecânico", area: "Manutenção" },
  ];
  it("busca por nome ignorando caixa e acento", () => {
    expect(filterPositions(pos, "mecanico", "").map((p) => p.name)).toEqual(["Mecânico"]);
  });
  it("filtra por área; vazio = todas", () => {
    expect(filterPositions(pos, "", "Qualidade").map((p) => p.name)).toEqual(["Analista SGI"]);
    expect(filterPositions(pos, "", "").length).toBe(3);
  });
  it("combina busca + área", () => {
    expect(filterPositions(pos, "a", "Operações").map((p) => p.name)).toEqual(["Motorista"]);
  });
});

describe("buildPositionSubline", () => {
  it("monta as três partes", () => {
    expect(buildPositionSubline({ area: "Operações", competencyCount: 8, normLabel: "ISO 39001" }))
      .toBe("Operações · 8 competências · ISO 39001");
  });
  it("pluraliza e omite partes ausentes", () => {
    expect(buildPositionSubline({ competencyCount: 1 })).toBe("1 competência");
    expect(buildPositionSubline({ area: "Logística", competencyCount: 0 })).toBe("Logística · 0 competências");
    expect(buildPositionSubline({})).toBe("");
  });
});
```

- [ ] **Step 2: Rodar (deve falhar)**

Run: `pnpm exec vitest run artifacts/web/tests/pages/aprendizagem/cargos-utils.unit.test.ts --project web-unit`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar os utilitários**

Criar `artifacts/web/src/pages/app/aprendizagem/cargos/cargos-utils.ts`:

```ts
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // remove diacríticos (mesmo padrão de document-pdf.ts slugify)
}

export function deriveAreas(positions: { area?: string | null }[]): string[] {
  const set = new Set<string>();
  for (const p of positions) {
    const a = p.area?.trim();
    if (a) set.add(a);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function filterPositions<T extends { name: string; area?: string | null }>(
  positions: T[],
  search: string,
  area: string,
): T[] {
  const q = norm(search.trim());
  return positions.filter((p) => {
    const matchesSearch = !q || norm(p.name).includes(q);
    const matchesArea = !area || (p.area ?? "") === area;
    return matchesSearch && matchesArea;
  });
}

export function buildPositionSubline(input: {
  area?: string | null;
  competencyCount?: number;
  normLabel?: string | null;
}): string {
  const parts: string[] = [];
  if (input.area?.trim()) parts.push(input.area.trim());
  if (input.competencyCount != null) {
    parts.push(`${input.competencyCount} ${input.competencyCount === 1 ? "competência" : "competências"}`);
  }
  if (input.normLabel?.trim()) parts.push(input.normLabel.trim());
  return parts.join(" · ");
}
```

- [ ] **Step 4: Rodar (deve passar)**

Run: `pnpm exec vitest run artifacts/web/tests/pages/aprendizagem/cargos-utils.unit.test.ts --project web-unit`
Expected: PASS.

---

## Task 5: `PositionFormDialog` (modal Novo/Editar cargo)

**Files:**
- Create: `artifacts/web/src/pages/app/aprendizagem/cargos/position-form-dialog.tsx`

**Interfaces:**
- Consumes: `useCreatePosition`, `useUpdatePosition` (de `@workspace/api-client-react`); `useActiveNorms`, `useAllNorms`, `buildNormLabelMap` (de `@/lib/norms-client`); tipo `Position` (de `@workspace/api-client-react`).
- Produces: componente
  ```ts
  function PositionFormDialog(props: {
    orgId: number;
    open: boolean;
    position: Position | null; // null = criar
    onClose: () => void;
    onSaved: () => void; // invalidar a lista de cargos
  }): JSX.Element
  ```

- [ ] **Step 1: Implementar o diálogo**

Criar o arquivo. Usar `Dialog` (`@/components/ui/dialog`), `Input`, `Label`, `Select`, `Textarea`, `Button`, `DialogFooter`. Form via `useState` (objeto único), sem multi-step (o mockup é um form plano). Campos e binding:

| Label (mockup) | Estado | Coluna |
|---|---|---|
| Nome do cargo * | `name` | name |
| Área * | `area` | area (Select: Operações, Logística, Qualidade, Manutenção, Administrativo, TI) |
| Nível | `level` | level (Select: Operacional, Tático, Estratégico) |
| Norma ISO principal | `principalNormId` | principalNormId (Select de `useActiveNorms(orgId)` → `{id,label}`; opção vazia "—") |
| Escolaridade mínima | `education` | education (Select: Ensino Fundamental, Ensino Médio Completo, Técnico, Superior Completo, Pós-graduação) |
| Experiência mínima | `experience` | experience (Input texto) |
| Descrição da função | `description` | description (Textarea) |
| Habilidades requeridas | `requirements` | requirements (Textarea) |

Regras:
- Ao abrir com `position` != null, popular o estado a partir dele (incl. `principalNormId` como string no Select); com `position` null, estado vazio (`principalNormId: ""`).
- Submeter: montar o payload convertendo `principalNormId` (`"" → null`, senão `Number(...)`) e `area/level/education/experience/description/requirements` (`"" → undefined`). `name` obrigatório (botão Salvar desabilitado se vazio).
- `position` null → `useCreatePosition().mutateAsync({ orgId, data })`; senão `useUpdatePosition().mutateAsync({ orgId, posId: position.id, data })`.
- No sucesso: `onSaved()` + `onClose()`. No erro: `toast` destrutivo ("Não foi possível salvar o cargo").
- Para exibir a norma selecionada mesmo se inativa na edição, seguir o padrão de `selectPickerCatalogItems`: incluir a opção `principalNormId` atual (via `useAllNorms` + `buildNormLabelMap`) além das ativas.

Título: `position ? "Editar cargo" : "Novo cargo"`. Footer: Cancelar (`onClose`) + Salvar (submit, `disabled` enquanto pendente ou nome vazio).

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @workspace/web typecheck`
Expected: PASS.

---

## Task 6: Redesenho da página `aprendizagem/cargos/index.tsx`

**Files:**
- Modify (reescrever): `artifacts/web/src/pages/app/aprendizagem/cargos/index.tsx`

**Interfaces:**
- Consumes: `useListPositions`, `useDeletePosition`, tipo `Position` (`@workspace/api-client-react`); `useListPositionCompetencyRequirements` (já usado hoje); `useActiveNorms`/`useAllNorms`/`buildNormLabelMap` (`@/lib/norms-client`); `deriveAreas`/`filterPositions`/`buildPositionSubline` (Task 4); `PositionFormDialog` (Task 5); ícones `Plus`, `Pencil`, `Trash2` (lucide).

- [ ] **Step 1: Estado + dados**

Manter o cabeçalho de acesso (`canAccess`) e `useListPositions`. Acrescentar:
- `const normLabelMap = buildNormLabelMap(useAllNorms(orgId).data ?? []);` (id → label) para resolver `principalNormId` na tabela/painel.
- `const [search, setSearch] = useState("")`, `const [areaFilter, setAreaFilter] = useState("")`.
- `const areas = deriveAreas(positionList);`
- `const filtered = filterPositions(positionList, search, areaFilter);`
- `const [dialogOpen, setDialogOpen] = useState(false)` + `const [editing, setEditing] = useState<Position | null>(null)`.
- `const [deleting, setDeleting] = useState<Position | null>(null)` + `useDeletePosition()`.
- Manter `effectiveSelectedId`/`selectedPosition`/`sortedReqs` como hoje, mas selecionar dentro de `filtered` (cair no primeiro de `filtered`).

- [ ] **Step 2: Cabeçalho + toolbar + tabela (esquerda)**

Reescrever o JSX seguindo o mockup (`lms_gabardo (13).html` seção 4):
- Cabeçalho: `<h1>` "Cargos e competências" + subtítulo + botão "Novo cargo" (`Plus`) à direita → `setEditing(null); setDialogOpen(true)` (só se `canWriteModule("positions")`).
- Toolbar: `Input` de busca (`search`) + `Select` de área (`areaFilter`, opções `["", ...areas]`, vazio = "Todas as áreas").
- Tabela "Cargos cadastrados": colunas **Cargo | Área | Competências | ISO**. Cada linha:
  - clique na linha → `setSelectedId(p.id)` (seleção p/ o painel).
  - célula ISO: `normLabelMap[p.principalNormId]` (ou "—").
  - célula Competências: `${p.competencyCount ?? 0} competências`.
  - ações (só com `canWriteModule("positions")`): botões `Pencil` (→ `setEditing(p); setDialogOpen(true)`) e `Trash2` (→ `setDeleting(p)`), cada um com `e.stopPropagation()`.
  - badge "N cargos" no cabeçalho da tabela (usar `filtered.length`).

- [ ] **Step 3: Painel de detalhe (direita) com abas**

Cabeçalho do painel: nome + `buildPositionSubline({area, competencyCount, normLabel: normLabelMap[principalNormId]})` + badge da norma. Abas (estado local `tab: "desc" | "comp" | "hab"`):
- **Descrição:** dois boxes (Escolaridade mínima = `education`, Experiência mínima = `experience`) + `description` com `whiteSpace: "pre-line"`.
- **Competências:** a matriz atual (reaproveitar o render de `sortedReqs` que já existe hoje) — read-only.
- **Habilidades:** `selectedPosition.requirements` com `whiteSpace: "pre-line"` (texto). Se vazio, "Nenhuma habilidade requerida cadastrada.".

- [ ] **Step 4: Modal + diálogo de exclusão**

- Renderizar `<PositionFormDialog orgId open={dialogOpen} position={editing} onClose={() => setDialogOpen(false)} onSaved={() => queryClient.invalidateQueries({ queryKey: getListPositionsQueryKey(orgId) })} />`.
- Diálogo de exclusão na interface (padrão): `Dialog` com "Excluir o cargo [nome]? Esta ação não pode ser desfeita." + Cancelar/Excluir → `useDeletePosition().mutateAsync({ orgId, posId: deleting.id })` + invalidar a lista + `setDeleting(null)`; erro → toast.
- Manter o `<CompetencyBankPanel>` embaixo, como hoje.

- [ ] **Step 5: Typecheck + smoke dos utilitários**

Run: `pnpm --filter @workspace/web typecheck && pnpm exec vitest run artifacts/web/tests/pages/aprendizagem/cargos-utils.unit.test.ts --project web-unit`
Expected: PASS.

---

## Task 7: Remover "Cargos" do menu de Organização + redirecionar a rota

**Files:**
- Modify: `artifacts/web/src/components/layout/AppLayout.tsx` (~468-470, breadcrumb ~341)
- Modify: `artifacts/web/src/pages/app/organizacao/cargos.tsx`

**Interfaces:** nenhuma (mudança de navegação).

- [ ] **Step 1: Remover o item do menu**

Em `AppLayout.tsx`, apagar de `organizacaoLinks` o bloco:

```ts
    ...(hasModuleAccess("positions")
      ? [{ href: "/organizacao/cargos", label: "Cargos" }]
      : []),
```

- [ ] **Step 2: Redirecionar a rota antiga**

Reescrever `artifacts/web/src/pages/app/organizacao/cargos.tsx` para:

```tsx
import { Redirect } from "wouter";

export default function OrganizacaoPositionsPage() {
  return <Redirect to="/aprendizagem/cargos" />;
}
```

(Isso cobre `/organizacao/cargos` e `/app/organizacao/cargos`, que apontam para este componente em `App.tsx`.)

- [ ] **Step 3: Breadcrumb órfão**

Em `AppLayout.tsx` linha ~341, se houver `crumbs.push({ label: "Cargos", href: "/organizacao/cargos" })` ainda referenciado por algum `activeSection`, deixá-lo (inócuo pós-redirect) OU remover se estiver claramente órfão. Não introduzir link quebrado.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @workspace/web typecheck`
Expected: PASS.

---

## Task 8: DDL de produção (sob autorização) + verificação

**Files:** nenhum (operação de banco).

- [ ] **Step 1: Confirmar autorização explícita do usuário** antes de tocar na PROD (Neon).

- [ ] **Step 2: Aplicar a DDL aditiva**

```sql
ALTER TABLE positions ADD COLUMN IF NOT EXISTS area text;
ALTER TABLE positions ADD COLUMN IF NOT EXISTS principal_norm_id integer
  REFERENCES regulatory_norms(id) ON DELETE SET NULL;
```

- [ ] **Step 3: Verificar**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'positions' AND column_name IN ('area','principal_norm_id');
```
Expected: 2 linhas. Nenhuma linha existente alterada (colunas nullable).

---

## Self-Review (feito)

- **Cobertura do spec:** schema (T1), backend+contagem (T3), OpenAPI+codegen (T2), reuso de `requirements` p/ Habilidades (T5/T6), redesenho c/ tabela/filtros/abas (T6), CRUD+exclusão em diálogo (T5/T6), remoção do menu+redirect (T7), DDL prod (T8), testes backend (T3) e utilitários (T4). Fora de escopo mantido (sem editar matriz, sem bulk-delete, sem salário no form).
- **Placeholders:** nenhum — código concreto nos passos testáveis; render do mockup com bindings exatos + referência ao arquivo atual e ao mockup.
- **Consistência de tipos:** `deriveAreas`/`filterPositions`/`buildPositionSubline` (T4) usados igual em T6; `PositionFormDialog` (T5) com a assinatura consumida em T6; `competencyCount`/`area`/`principalNormId` fluem de T1→T2→T3→T6.
