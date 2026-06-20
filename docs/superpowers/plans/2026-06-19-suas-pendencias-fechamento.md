# Suas Pendências — Fechamento da tela — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o escopo de "Suas Pendências" ciente do papel (gestor enxerga a própria filial; operador sem seletor) e trocar os pontinhos do calendário por chips legíveis (cor + título).

**Architecture:** Três mudanças cirúrgicas e independentes sobre a feature pronta (PR #102): (1) backend autoriza `scope=unit` para o gestor travado na própria filial; (2) o painel React mostra o seletor de escopo conforme o papel; (3) a célula do calendário passa de pontinhos para chips. Nenhuma mudança no motor de providers nem no formato de dados.

**Tech Stack:** Express 5 + Drizzle ORM (backend); React 19 + TailwindCSS 4 + date-fns + Wouter (frontend). Testes: Vitest — projeto `integration` (backend, DB de teste) e `web-unit` (JSDOM).

Spec: `docs/superpowers/specs/2026-06-19-suas-pendencias-fechamento-design.md`.

## Global Constraints

- **Operador/analista:** sem seletor de escopo na tela; só veem `scope=mine`.
- **Gestor (`manager`):** `scope=unit` travado em `users.unitId` do próprio gestor; o backend **ignora** qualquer `unitId` recebido de um gestor; gestor pedindo `scope=org` → **403**; gestor sem filial vinculada → `scope=unit` → **403**.
- **Admin (`org_admin`/`platform_admin`):** mantém os três escopos (`mine`/`unit`/`org`); `unit` exige `unitId` (qualquer filial) com picker; **default permanece "Minhas"**.
- **Calendário:** chips coloridos por urgência — `overdue`→vermelho, `due_soon`→âmbar, `upcoming`→neutro (slate); **até 2 chips** por dia + linha `+N mais` no estouro; chips **só nos dias do mês corrente**; clicar no dia abre a lista do dia (inalterado); `aria-label` do dia continua `Dia N: X pendência(s)`; plota **só itens com `dueDate`**.
- **Não tocar:** lista priorizada P1/P2/P3, cards de resumo, bloco de identidade, seção "Concluídos hoje", motor/agregador/providers, `pendencias-format.ts`.
- Toda mudança passa `pnpm typecheck`.
- Testes sensíveis a tempo congelam o relógio com `vi.setSystemTime` (padrão já usado nos testes existentes).

---

## File Structure

| Arquivo | Responsabilidade | Mudança |
|---|---|---|
| `artifacts/api-server/src/routes/pendencias.ts` | endpoint do painel | autorização de escopo por papel + gestor travado na filial |
| `artifacts/api-server/tests/routes/pendencias.integration.test.ts` | testes do endpoint | casos do gestor |
| `artifacts/web/src/pages/app/pendencias.tsx` | página do painel | seletor de escopo ciente do papel |
| `artifacts/web/tests/pages/pendencias.unit.test.tsx` | testes da página | seletor por papel |
| `artifacts/web/src/components/pendencias/PendenciasCalendar.tsx` | grid do calendário | chips no lugar dos pontinhos |
| `artifacts/web/tests/components/pendencias-calendar.unit.test.tsx` | testes do calendário | chips + estouro |

---

## Task 1: Backend — autorização de escopo por papel + gestor travado na filial

**Files:**
- Modify: `artifacts/api-server/src/routes/pendencias.ts:16-101` (corpo do handler)
- Test: `artifacts/api-server/tests/routes/pendencias.integration.test.ts`

**Interfaces:**
- Consumes: `aggregatePendencias({ orgId, responsibleUserIds, now, dueSoonDays })` (inalterado); `usersTable` com colunas `id, name, role, lastLoginAt, unitId, organizationId`; `unitsTable` com `id, name`.
- Produces: mesma resposta JSON `{ user, scope, counts, items, completedToday }` (inalterada); novo comportamento de autorização para `role === "manager"`.

- [ ] **Step 1: Escrever os testes que falham (casos do gestor)**

Adicionar estes três testes dentro do `describe("GET /organizations/:orgId/pendencias", ...)` em `artifacts/api-server/tests/routes/pendencias.integration.test.ts` (depois do teste de 403 do operador):

```ts
  it("lets a manager see their own filial's pendências (scope=unit)", async () => {
    const ctx = await createTestContext({ seed: "pend-mgr-unit", role: "manager" });
    contexts.push(ctx);
    const unit = await createUnit(ctx, `Filial ${ctx.prefix}`);
    await db.update(usersTable).set({ unitId: unit.id }).where(eq(usersTable.id, ctx.userId));
    const member = await createTestUser(ctx, { role: "operator", suffix: "op" });
    await db.update(usersTable).set({ unitId: unit.id }).where(eq(usersTable.id, member.id));
    await seedOverduePlan(ctx.organizationId, member.id, `Plano do membro ${ctx.prefix}`);
    await seedOverduePlan(ctx.organizationId, ctx.userId, `Plano do gestor ${ctx.prefix}`);

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/pendencias?scope=unit`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);
    expect(res.body.scope).toBe("unit");
    const titles = res.body.items.map((i: { title: string }) => i.title);
    expect(titles).toContain(`Plano do membro ${ctx.prefix}`);
    expect(titles).toContain(`Plano do gestor ${ctx.prefix}`);
  });

  it("ignores a manager's unitId param and stays locked to their own filial", async () => {
    const ctx = await createTestContext({ seed: "pend-mgr-lock", role: "manager" });
    contexts.push(ctx);
    const ownUnit = await createUnit(ctx, `Própria ${ctx.prefix}`);
    const otherUnit = await createUnit(ctx, `Outra ${ctx.prefix}`);
    await db.update(usersTable).set({ unitId: ownUnit.id }).where(eq(usersTable.id, ctx.userId));
    await seedOverduePlan(ctx.organizationId, ctx.userId, `Plano do gestor ${ctx.prefix}`);
    const otherMember = await createTestUser(ctx, { role: "operator", suffix: "other" });
    await db.update(usersTable).set({ unitId: otherUnit.id }).where(eq(usersTable.id, otherMember.id));
    await seedOverduePlan(ctx.organizationId, otherMember.id, `Plano de outra filial ${ctx.prefix}`);

    // Manager explicitly asks for the OTHER unit — must be ignored.
    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/pendencias?scope=unit&unitId=${otherUnit.id}`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);
    const titles = res.body.items.map((i: { title: string }) => i.title);
    expect(titles).toContain(`Plano do gestor ${ctx.prefix}`);
    expect(titles).not.toContain(`Plano de outra filial ${ctx.prefix}`);
  });

  it("forbids a manager from scope=org (403)", async () => {
    const ctx = await createTestContext({ seed: "pend-mgr-org", role: "manager" });
    contexts.push(ctx);

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/pendencias?scope=org`)
      .set(authHeader(ctx));

    expect(res.status).toBe(403);
  });
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `pnpm exec vitest run --project integration artifacts/api-server/tests/routes/pendencias.integration.test.ts`
Expected: FAIL — "lets a manager see..." e "ignores a manager's unitId..." retornam 403 (hoje o gestor é mine-only); "forbids a manager from scope=org" já passa (regressão).

> Pré-requisito: DB de teste no ar. Se necessário: `pnpm test:integration:up` (e, no worktree, `pnpm test:integration:db:push`).

- [ ] **Step 3: Implementar a autorização por papel no handler**

Substituir todo o corpo do handler em `artifacts/api-server/src/routes/pendencias.ts` (linhas 16–101) por:

```ts
router.get("/organizations/:orgId/pendencias", requireAuth, async (req, res): Promise<void> => {
  const orgId = Number(req.params.orgId);
  const { userId, organizationId, role } = req.auth!;
  if (orgId !== organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { scope, unitId, dueSoonDays } = parsed.data;

  // Caller identity (incl. their own filial). Needed BEFORE scope resolution
  // because a manager's scope=unit is locked to their own unitId; also feeds
  // the panel header block.
  const [me] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      role: usersTable.role,
      lastLoginAt: usersTable.lastLoginAt,
      unitId: usersTable.unitId,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  const isAdmin = role === "org_admin" || role === "platform_admin";
  const isManager = role === "manager";

  // scope=org is admin-only.
  if (scope === "org" && !isAdmin) {
    res.status(403).json({ error: "Sem permissão para este escopo" });
    return;
  }

  // Resolve the effective filial for scope=unit: admins pick any filial,
  // managers are locked to their own, everyone else is forbidden.
  let effectiveUnitId: number | undefined;
  if (scope === "unit") {
    if (isAdmin) {
      if (!unitId) {
        res.status(400).json({ error: "unitId é obrigatório para scope=unit" });
        return;
      }
      effectiveUnitId = unitId;
    } else if (isManager) {
      if (!me?.unitId) {
        res.status(403).json({ error: "Gerente sem filial vinculada" });
        return;
      }
      effectiveUnitId = me.unitId; // locked to the manager's own filial; param ignored
    } else {
      res.status(403).json({ error: "Sem permissão para este escopo" });
      return;
    }
  }

  // Resolve the responsible users for the requested scope.
  let responsibleUserIds: number[];
  if (scope === "mine") {
    responsibleUserIds = [userId];
  } else if (scope === "unit") {
    const rows = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.organizationId, orgId), eq(usersTable.unitId, effectiveUnitId!)));
    responsibleUserIds = rows.map((r) => r.id);
  } else {
    const rows = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.organizationId, orgId));
    responsibleUserIds = rows.map((r) => r.id);
  }

  const now = new Date();
  const { items, counts, completedToday } = await aggregatePendencias({
    orgId,
    responsibleUserIds,
    now,
    dueSoonDays,
  });

  let filial: { id: number; name: string } | null = null;
  if (me?.unitId) {
    const [unit] = await db
      .select({ id: unitsTable.id, name: unitsTable.name })
      .from(unitsTable)
      .where(eq(unitsTable.id, me.unitId));
    filial = unit ?? null;
  }

  res.json({
    user: {
      id: me?.id ?? userId,
      name: me?.name ?? "",
      role: me?.role ?? role,
      lastLoginAt: me?.lastLoginAt ? me.lastLoginAt.toISOString() : null,
      filial,
    },
    scope,
    counts,
    items,
    completedToday,
  });
});
```

Mudanças em relação ao original: a query do `me` subiu para antes da resolução de escopo; a autorização virou matriz por papel; a resolução de `scope=unit` usa `effectiveUnitId`; a checagem `if (scope === "unit" && !unitId)` antiga (que valia para todos) virou específica do admin.

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `pnpm exec vitest run --project integration artifacts/api-server/tests/routes/pendencias.integration.test.ts`
Expected: PASS — todos os testes do `describe`, incluindo os 3 novos e os 3 pré-existentes (mine, admin unit, operador 403).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/routes/pendencias.ts artifacts/api-server/tests/routes/pendencias.integration.test.ts
git commit -m "feat(pendencias): gestor enxerga a própria filial (scope por papel)"
```

---

## Task 2: Frontend — seletor de escopo ciente do papel

**Files:**
- Modify: `artifacts/web/src/pages/app/pendencias.tsx:144-200`
- Test: `artifacts/web/tests/pages/pendencias.unit.test.tsx`

**Interfaces:**
- Consumes: `useAuth()` → `{ organization, user, role, unitId }` (o `role: UserRole | null` inclui `"manager"`; `unitId: number | null` é a filial do próprio usuário); `usePermissions()` → `{ isAdmin }`; `usePendencias(orgId, { scope, unitId })`; `useListUnits`.
- Produces: nenhuma exportação nova; comportamento: render do seletor conforme papel e estado inicial por papel.

- [ ] **Step 1: Reescrever o arquivo de teste da página (mocks por papel + novos casos)**

Substituir **todo** o conteúdo de `artifacts/web/tests/pages/pendencias.unit.test.tsx` por:

```tsx
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SuasPendenciasPage from "@/pages/app/pendencias";
import type { PendenciasResponse } from "@/lib/pendencias-format";

const response: PendenciasResponse = {
  user: {
    id: 1,
    name: "João Silva",
    role: "operator",
    lastLoginAt: "2026-06-19T08:12:00",
    filial: { id: 7, name: "POA" },
  },
  scope: "mine",
  counts: {
    total: 2,
    overdue: 1,
    dueSoon: 1,
    noDue: 0,
    upcoming: 0,
    completedToday: 0,
    bySource: { kpi: 1, action_plan: 1, nonconformity: 0, regulatory_document: 0 },
  },
  items: [],
  completedToday: [],
};

vi.mock("@workspace/api-client-react", () => ({
  useListUnits: () => ({ data: [] }),
  getListUnitsQueryKey: () => ["units"],
}));
vi.mock("@/lib/pendencias-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pendencias-format")>(
    "@/lib/pendencias-format",
  );
  return { ...actual, usePendencias: vi.fn() };
});
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
  usePermissions: vi.fn(),
}));
vi.mock("@/contexts/LayoutContext", () => ({
  usePageTitle: vi.fn(),
  usePageSubtitle: vi.fn(),
}));

import { usePendencias } from "@/lib/pendencias-client";
import { useAuth, usePermissions } from "@/contexts/AuthContext";

const mockPendencias = usePendencias as unknown as ReturnType<typeof vi.fn>;
const mockAuth = useAuth as unknown as ReturnType<typeof vi.fn>;
const mockPermissions = usePermissions as unknown as ReturnType<typeof vi.fn>;

describe("SuasPendenciasPage — operator (identity, cards, no selector)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-19T12:00:00"));
    mockAuth.mockReturnValue({
      organization: { id: 9 },
      user: { id: 1, name: "João Silva", role: "operator" },
      role: "operator",
      unitId: 7,
    });
    mockPermissions.mockReturnValue({ isAdmin: false, role: "operator" });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the user block and summary counts", () => {
    mockPendencias.mockReturnValue({ data: response, isLoading: false, isError: false });
    render(<SuasPendenciasPage />);
    expect(screen.getByText("João Silva")).toBeInTheDocument();
    expect(screen.getByText("POA")).toBeInTheDocument();
    expect(screen.getByText("Operador")).toBeInTheDocument();
    expect(screen.getByText(/hoje às 08:12/)).toBeInTheDocument();
    expect(screen.getByText("Total em aberto")).toBeInTheDocument();
  });

  it("shows no scope selector for an operator", () => {
    mockPendencias.mockReturnValue({ data: response, isLoading: false, isError: false });
    render(<SuasPendenciasPage />);
    expect(screen.queryByText("Por filial")).not.toBeInTheDocument();
    expect(screen.queryByText("Organização")).not.toBeInTheDocument();
    expect(screen.queryByText("Minha filial")).not.toBeInTheDocument();
  });

  it("renders loading state", () => {
    mockPendencias.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<SuasPendenciasPage />);
    expect(screen.getByText("Carregando…")).toBeInTheDocument();
  });

  it("renders error state", () => {
    mockPendencias.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<SuasPendenciasPage />);
    expect(screen.getByText(/Não foi possível carregar/)).toBeInTheDocument();
  });

  it("renders priority sections, a card with deep-link CTA, and the empty state", () => {
    const withItems: PendenciasResponse = {
      ...response,
      items: [
        {
          id: "action_plan:5",
          source: "action_plan",
          sourceLabel: "Plano de ação",
          title: "Revisar procedimento de carga",
          statusLabel: "Aberto",
          dueDate: "2026-06-10",
          urgency: "overdue",
          responsibleUserId: 1,
          link: { route: "/planos-acao/5", ctaLabel: "Ver plano" },
        },
      ],
    };
    mockPendencias.mockReturnValue({ data: withItems, isLoading: false, isError: false });
    const { rerender } = render(<SuasPendenciasPage />);
    expect(screen.getByText("Fazer agora")).toBeInTheDocument();
    expect(screen.getByText("Revisar procedimento de carga")).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /Ver plano/ });
    expect(cta).toHaveAttribute("href", "/planos-acao/5");

    mockPendencias.mockReturnValue({
      data: { ...response, items: [], counts: { ...response.counts, total: 0, overdue: 0, dueSoon: 0 } },
      isLoading: false,
      isError: false,
    });
    rerender(<SuasPendenciasPage />);
    expect(screen.getByText(/Você está em dia/)).toBeInTheDocument();
  });

  it("renders the Concluídos hoje section when present", () => {
    const withDone = {
      ...response,
      items: [],
      completedToday: [
        {
          id: "action_plan:9",
          source: "action_plan" as const,
          sourceLabel: "Plano de ação",
          title: "Plano encerrado",
          statusLabel: "Encerrado hoje",
          dueDate: "2026-06-19",
          urgency: "no_due" as const,
          responsibleUserId: 1,
          link: { route: "/planos-acao/9", ctaLabel: "Ver plano" },
        },
      ],
      counts: { ...response.counts, total: 0, overdue: 0, dueSoon: 0, completedToday: 1 },
    };
    mockPendencias.mockReturnValue({ data: withDone, isLoading: false, isError: false });
    render(<SuasPendenciasPage />);
    expect(screen.getByText("Concluídos hoje")).toBeInTheDocument();
    expect(screen.getByText("Plano encerrado")).toBeInTheDocument();
  });
});

describe("SuasPendenciasPage — manager scope toggle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-19T12:00:00"));
    mockAuth.mockReturnValue({
      organization: { id: 9 },
      user: { id: 2, name: "Maria Gestora", role: "manager" },
      role: "manager",
      unitId: 7,
    });
    mockPermissions.mockReturnValue({ isAdmin: false, role: "manager" });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("defaults a manager to their filial and offers the two-button toggle", () => {
    mockPendencias.mockReturnValue({ data: { ...response, scope: "unit" }, isLoading: false, isError: false });
    render(<SuasPendenciasPage />);
    expect(screen.getByText("Minha filial")).toBeInTheDocument();
    expect(screen.getByText("Só as minhas")).toBeInTheDocument();
    expect(screen.queryByText("Organização")).not.toBeInTheDocument();
    // Default scope is the manager's own unit.
    expect(mockPendencias).toHaveBeenLastCalledWith(9, expect.objectContaining({ scope: "unit", unitId: 7 }));
  });

  it("switches to 'Só as minhas' when toggled", () => {
    mockPendencias.mockReturnValue({ data: { ...response, scope: "unit" }, isLoading: false, isError: false });
    render(<SuasPendenciasPage />);
    act(() => {
      screen.getByText("Só as minhas").click();
    });
    expect(mockPendencias).toHaveBeenLastCalledWith(9, expect.objectContaining({ scope: "mine" }));
  });
});

describe("SuasPendenciasPage — admin scope selector (regression)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-19T12:00:00"));
    mockAuth.mockReturnValue({
      organization: { id: 9 },
      user: { id: 1, name: "João Silva", role: "org_admin" },
      role: "org_admin",
      unitId: null,
    });
    mockPermissions.mockReturnValue({ isAdmin: true, role: "org_admin" });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("scope buttons render outside the data guard — visible when data is undefined", () => {
    mockPendencias.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    render(<SuasPendenciasPage />);

    expect(screen.getByText("Minhas")).toBeInTheDocument();
    expect(screen.getByText("Por filial")).toBeInTheDocument();
    expect(screen.getByText("Organização")).toBeInTheDocument();

    act(() => {
      screen.getByText("Por filial").click();
    });
    expect(screen.getByText(/Selecione uma filial para ver as pendências/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/pendencias.unit.test.tsx`
Expected: FAIL — o bloco "manager scope toggle" falha (hoje, gestor não-admin não vê seletor nenhum, então "Minha filial" não existe e `usePendencias` é chamado com `scope: "mine"`). Os demais blocos passam.

- [ ] **Step 3: Implementar o seletor por papel na página**

Em `artifacts/web/src/pages/app/pendencias.tsx`, no componente `SuasPendenciasPage`:

(a) Trocar a desestruturação do `useAuth` e o estado inicial (linhas 147–155) por:

```tsx
  const { organization, user: authUser, role, unitId: myUnitId } = useAuth();
  const { isAdmin } = usePermissions();
  const orgId = organization?.id;
  const isManager = role === "manager";
  const managerHasUnit = isManager && myUnitId != null;

  // Scope state — admins pick via the selector; managers default to their own
  // filial with a 2-way toggle; everyone else is always "mine".
  const [scope, setScope] = useState<PendenciasScope>(() => (managerHasUnit ? "unit" : "mine"));
  const [unitId, setUnitId] = useState<number | null>(() => (managerHasUnit ? myUnitId : null));
  const [view, setView] = useState<"list" | "calendar">("list");
  const [calMonth, setCalMonth] = useState<Date>(() => new Date());
```

(b) Substituir o bloco do seletor `{isAdmin && ( ... )}` (linhas 172–200) por estes dois blocos:

```tsx
      {isAdmin && (
        <div className="flex flex-wrap items-center gap-2">
          {(["mine", "unit", "org"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
                scope === s
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {s === "mine" ? "Minhas" : s === "unit" ? "Por filial" : "Organização"}
            </button>
          ))}
          {scope === "unit" && (
            <div className="w-56">
              <SearchableSelect
                value={unitId != null ? String(unitId) : ""}
                onChange={(v) => setUnitId(v ? Number(v) : null)}
                options={units.map((u) => ({ value: String(u.id), label: u.name }))}
                placeholder="Selecione a filial"
              />
            </div>
          )}
        </div>
      )}

      {managerHasUnit && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setScope("unit");
              setUnitId(myUnitId);
            }}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
              scope === "unit"
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            Minha filial
          </button>
          <button
            type="button"
            onClick={() => setScope("mine")}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
              scope === "mine"
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            Só as minhas
          </button>
        </div>
      )}
```

O hint `{scope === "unit" && unitId == null && (...)}` (linhas 207–209) permanece — só dispara para admin sem filial escolhida (o gestor sempre tem `unitId`).

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/pendencias.unit.test.tsx`
Expected: PASS — todos os blocos (operator, manager toggle, admin regression).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add artifacts/web/src/pages/app/pendencias.tsx artifacts/web/tests/pages/pendencias.unit.test.tsx
git commit -m "feat(pendencias): seletor de escopo por papel (gestor: filial; operador: nenhum)"
```

---

## Task 3: Frontend — calendário com chips legíveis

**Files:**
- Modify: `artifacts/web/src/components/pendencias/PendenciasCalendar.tsx`
- Test: `artifacts/web/tests/components/pendencias-calendar.unit.test.tsx`

**Interfaces:**
- Consumes: `itemsByDay(items)` e `type Pendencia` de `@/lib/pendencias-format` (inalterados); `Pendencia["urgency"]` ∈ `"overdue" | "due_soon" | "upcoming" | "no_due"`.
- Produces: mesmo componente `PendenciasCalendar({ items, month, onMonthChange })`; célula do dia agora renderiza chips (título visível) em vez de pontinhos.

- [ ] **Step 1: Escrever o teste dos chips (que falha)**

Adicionar este teste ao `describe("PendenciasCalendar", ...)` em `artifacts/web/tests/components/pendencias-calendar.unit.test.tsx` (a função `item(id, dueDate)` já existe e usa `id` como `title`):

```ts
  it("renders item chips with titles and a +N overflow, and opens the day detail on click", async () => {
    const items = [
      item("Alvará de funcionamento", "2026-06-14"),
      item("Matriz de treinamento", "2026-06-14"),
      item("Plano de contingência", "2026-06-14"),
    ];
    render(
      <PendenciasCalendar items={items} month={new Date(2026, 5, 1)} onMonthChange={vi.fn()} />,
    );
    // First two titles show as chips in the day cell.
    expect(screen.getByText("Alvará de funcionamento")).toBeInTheDocument();
    expect(screen.getByText("Matriz de treinamento")).toBeInTheDocument();
    // Third item overflows into the "+N mais" line.
    expect(screen.getByText("+1 mais")).toBeInTheDocument();
    // The third title is NOT shown as a chip until the day is opened.
    expect(screen.queryByText("Plano de contingência")).not.toBeInTheDocument();
    // Clicking the day opens the detail panel listing the overflow item.
    await userEvent.click(screen.getByLabelText(/Dia 14: 3 pendência/));
    expect(screen.getByText("Plano de contingência")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/components/pendencias-calendar.unit.test.tsx`
Expected: FAIL — hoje a célula só mostra pontinhos; `getByText("Alvará de funcionamento")` não encontra o título.

- [ ] **Step 3: Implementar os chips no componente**

Em `artifacts/web/src/components/pendencias/PendenciasCalendar.tsx`:

(a) Ajustar o import (linha 17) removendo `URGENCY_META`, que deixa de ser usado:

```tsx
import { itemsByDay, type Pendencia } from "@/lib/pendencias-format";
```

(b) Substituir o mapa `DOT_COLOR` (linhas 21–25) por `CHIP_STYLE` por urgência:

```tsx
const CHIP_STYLE: Record<Pendencia["urgency"], string> = {
  overdue: "bg-red-500/10 text-red-700 dark:text-red-300",
  due_soon: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  upcoming: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
  no_due: "bg-slate-500/10 text-slate-600 dark:text-slate-300", // never plotted (no dueDate); mapped for type completeness
};
```

(c) Substituir o bloco `days.map((d) => { ... })` (linhas 83–115) por:

```tsx
        {days.map((d) => {
          const k = keyOf(d);
          const dayItems = byDay.get(k) ?? [];
          const inMonth = isSameMonth(d, month);
          const isSelected = selected === k;
          const showChips = inMonth && dayItems.length > 0;
          return (
            <button
              key={k}
              type="button"
              aria-label={dayItems.length > 0 ? `Dia ${format(d, "d")}: ${dayItems.length} pendência(s)` : undefined}
              onClick={() => setSelected(dayItems.length > 0 ? k : null)}
              className={cn(
                "flex min-h-[92px] flex-col gap-1 rounded-lg border p-1.5 text-left text-[12px] transition-colors",
                inMonth ? "border-border/60" : "border-transparent text-muted-foreground/40",
                isSelected ? "ring-2 ring-foreground" : "hover:bg-muted/30",
                dayItems.length > 0 && "font-medium",
              )}
            >
              <span className="text-[11px]">{format(d, "d")}</span>
              {showChips && (
                <span className="flex flex-col gap-0.5">
                  {dayItems.slice(0, 2).map((it) => (
                    <span
                      key={it.id}
                      className={cn(
                        "truncate rounded px-1 py-0.5 text-[10px] font-normal leading-tight",
                        CHIP_STYLE[it.urgency],
                      )}
                    >
                      {it.title}
                    </span>
                  ))}
                  {dayItems.length > 2 && (
                    <span className="px-1 text-[10px] font-normal text-muted-foreground">
                      +{dayItems.length - 2} mais
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/components/pendencias-calendar.unit.test.tsx`
Expected: PASS — o teste novo dos chips e os dois pré-existentes (label do mês + navegação).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: sem erros (em particular, sem "URGENCY_META is declared but never used").

- [ ] **Step 6: Commit**

```bash
git add artifacts/web/src/components/pendencias/PendenciasCalendar.tsx artifacts/web/tests/components/pendencias-calendar.unit.test.tsx
git commit -m "feat(pendencias): calendário com chips legíveis no lugar dos pontinhos"
```

---

## Notas de execução

- **DB de teste (Task 1):** o projeto `integration` exige o Postgres de teste no ar. No worktree, garantir `.env`/`.env.integration` apontando para o DB local (127.0.0.1:55432) e `pnpm test:integration:db:push` se o schema estiver desatualizado. Nunca apontar para PROD/:3001.
- **web-unit (Tasks 2–3):** rodar **por arquivo** (a suíte inteira de web-unit pode estourar memória neste ambiente). `operational-planning.unit.test.tsx` falha no baseline (pré-existente, alheio a esta mudança).
- Sem regeneração de OpenAPI/codegen: a resposta do endpoint não muda de forma.
```
