# Suas Pendências — Fase 3 (Painel frontend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the in-system "Suas Pendências" panel that consumes the F2 endpoint — user-identity block (NOME/FILIAL/ÚLTIMO ACESSO/PERFIL), summary cards, a priority-grouped actionable list with deep-links, an admin scope selector, and an empty state — and make it the post-login landing + a sidebar item.

**Architecture:** A hand-written client (`pendencias-client.ts`) fetches `GET /organizations/:orgId/pendencias` via `apiJson` (the endpoint is bespoke, not Orval-generated) and exposes a `usePendencias` React Query hook. Pure presentation logic (urgency→label/variant, priority grouping, relative-date formatting) lives in a React-free `pendencias-format.ts` so it is unit-testable. The page (`pages/app/pendencias.tsx`) composes Card/Badge primitives. Wiring changes the landing redirect and adds a non-module-gated sidebar item. (Calendar + "concluídos hoje" are F4.)

**Tech Stack:** React 19 + Wouter + TanStack React Query, TailwindCSS 4 + shadcn/ui primitives, lucide-react icons, Vitest (`web-unit`, jsdom) + Testing Library.

## Global Constraints

- **The panel's user block reads the ENDPOINT's `user` object** (`{ id, name, role, lastLoginAt, filial }`), NOT `useAuth().user` — only the endpoint resolves `filial` (name) and `lastLoginAt`.
- **Deep-links are root-relative** (no `/app` prefix): `/planos-acao/:id`, `/kpi/lancamentos`, `/governanca/nao-conformidades`, `/qualidade/regulatorios`. The F2 providers currently emit `/app/...` and must be fixed (Task 1).
- **Not module-gated:** every authenticated user has pendências — the sidebar item and route have NO `hasModuleAccess` gate.
- **Filial is `users.unitId`** (post-F1 convergence) for all roles. The cadastro filial selector (currently manager-only, from #98) is un-gated in Task 8.
- **Urgency→priority/section:** overdue→P1 "Fazer agora" (danger); due_soon→P2 "Em breve" (warning); no_due→P3 "Atenção" (info); upcoming→hidden from the list (calendar-only, F4).
- **Role labels (PERFIL), PT-BR:** `platform_admin`→"Admin Plataforma", `org_admin`→"Administrador", `manager`→"Gerente", `operator`→"Operador", `analyst`→"Analista".
- **Source labels (PT-BR):** `kpi`→"Indicador", `action_plan`→"Plano de ação", `nonconformity`→"Não conformidade", `regulatory_document`→"Documento regulatório".
- UI primitives: `Card`/`CardHeader`/`CardTitle`/`CardContent` from `@/components/ui/card`; `Badge` variants `danger`/`warning`/`info`/`success` from `@/components/ui/badge`; `SearchableSelect` (`value`/`onChange`/`options`/`placeholder`) from `@/components/ui/searchable-select`; icons from `lucide-react` (NOT Tabler); `cn()` from `@/lib/utils`; `usePageTitle`/`usePageSubtitle` from `@/contexts/LayoutContext`.
- Prettier: 2-space, double quotes, trailing commas. PT-BR copy. Don't push; commit per task only.
- `web-unit` vitest project matches `artifacts/web/tests/**/*.unit.test.{ts,tsx}` (jsdom). Run individual test files (the full web-unit suite is memory-heavy in CI/local).

## File Structure

- `artifacts/web/src/lib/pendencias-format.ts` — React-free: `Pendencia`/enums/response types, `SOURCE_LABELS`, `ROLE_LABELS`, `URGENCY_META`, `priorityOf`, `groupByPriority`, `formatRelativeDue`, `formatLastAccess`.
- `artifacts/web/src/lib/pendencias-client.ts` — `apiJson`, `pendenciasKeys`, `fetchPendencias`, `usePendencias` (re-exports types/helpers from `pendencias-format`).
- `artifacts/web/src/pages/app/pendencias.tsx` — the page + internal `UserIdentityBlock`, `SummaryCards`, `ScopeSelector`, `PrioritySection`, `PendenciaCard`, `EmptyState`.
- Modify `artifacts/web/src/App.tsx` — add `/pendencias` route + change landing redirect.
- Modify `artifacts/web/src/components/layout/AppLayout.tsx` — add sidebar item.
- Modify `artifacts/web/src/components/settings/OrganizationUsersSettingsSection.tsx` — un-gate filial selector.
- Modify the four F2 providers (`services/pendencias/providers/*.ts`) + their tests — fix deep-link routes.

---

### Task 1: Fix provider deep-link routes (drop `/app`)

**Files:**
- Modify: `artifacts/api-server/src/services/pendencias/providers/kpi.ts`, `action-plans.ts`, `nonconformities.ts`, `regulatory-documents.ts`
- Modify (tests): `artifacts/api-server/tests/services/pendencias/kpi-provider.integration.test.ts`, `action-plans-provider.integration.test.ts`, `regulatory-provider.integration.test.ts`

**Interfaces:**
- Produces: every `Pendencia.link.route` is now root-relative, matching the real Wouter routes.

- [ ] **Step 1: Update the expected routes in the provider tests (RED)**

In `kpi-provider.integration.test.ts`, change the assertion:
```ts
expect(items[0].link.route).toBe("/kpi/lancamentos");
```
In `action-plans-provider.integration.test.ts`:
```ts
expect(byId.get(`action_plan:${overdueId}`)?.link.route).toBe(`/planos-acao/${overdueId}`);
```
In `regulatory-provider.integration.test.ts`:
```ts
expect(byId.get(`regulatory_document:${aVencerId}`)?.link.route).toBe("/qualidade/regulatorios");
```

- [ ] **Step 2: Run the three tests to verify they fail**

Run: `pnpm exec vitest run --project integration artifacts/api-server/tests/services/pendencias/kpi-provider.integration.test.ts artifacts/api-server/tests/services/pendencias/action-plans-provider.integration.test.ts artifacts/api-server/tests/services/pendencias/regulatory-provider.integration.test.ts`
Expected: FAIL — providers still emit `/app/...`.

- [ ] **Step 3: Fix the provider routes**

In `providers/kpi.ts`, change the link:
```ts
link: { route: "/kpi/lancamentos", ctaLabel: "Alimentar" },
```
In `providers/action-plans.ts`:
```ts
link: { route: `/planos-acao/${r.id}`, ctaLabel: "Ver plano" },
```
In `providers/nonconformities.ts`, change the `NC_ROUTE` constant:
```ts
const NC_ROUTE = "/governanca/nao-conformidades";
```
In `providers/regulatory-documents.ts`:
```ts
link: { route: "/qualidade/regulatorios", ctaLabel: "Renovar" },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run --project integration artifacts/api-server/tests/services/pendencias`
Expected: PASS (all provider + aggregate tests).

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/services/pendencias/providers artifacts/api-server/tests/services/pendencias
git commit -m "fix(pendencias): root-relative deep-link routes (drop /app prefix)"
```

---

### Task 2: Pure presentation helpers (`pendencias-format.ts`)

**Files:**
- Create: `artifacts/web/src/lib/pendencias-format.ts`
- Test: `artifacts/web/tests/lib/pendencias-format.unit.test.ts`

**Interfaces:**
- Produces:
  - Types `PendenciaSource`, `PendenciaUrgency`, `PendenciaPriority`, `Pendencia`, `PendenciasResponse`, `PendenciasCounts`, `PendenciaUserBlock`.
  - `SOURCE_LABELS: Record<PendenciaSource, string>`, `ROLE_LABELS: Record<string, string>`.
  - `URGENCY_META: Record<PendenciaUrgency, { priority: PendenciaPriority | null; sectionTitle: string; badgeVariant: "danger" | "warning" | "info"; badgeLabel: string }>`.
  - `priorityOf(urgency): PendenciaPriority | null`.
  - `groupByPriority(items: Pendencia[]): { p1: Pendencia[]; p2: Pendencia[]; p3: Pendencia[] }` (excludes `upcoming`; each group sorted by dueDate asc, nulls last).
  - `formatRelativeDue(dueDate: string | null, now: Date): string`.
  - `formatLastAccess(iso: string | null, now: Date): string`.

- [ ] **Step 1: Write the failing test**

Create `artifacts/web/tests/lib/pendencias-format.unit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  groupByPriority,
  priorityOf,
  formatRelativeDue,
  formatLastAccess,
  URGENCY_META,
  type Pendencia,
} from "@/lib/pendencias-format";

const NOW = new Date(2026, 5, 15, 9, 30, 0); // 2026-06-15 09:30 local

function item(id: string, urgency: Pendencia["urgency"], dueDate: string | null): Pendencia {
  return {
    id,
    source: "action_plan",
    sourceLabel: "Plano de ação",
    title: id,
    statusLabel: "",
    dueDate,
    urgency,
    responsibleUserId: 1,
    link: { route: "/planos-acao/1", ctaLabel: "Ver plano" },
  };
}

describe("priorityOf / URGENCY_META", () => {
  it("maps urgency to priority", () => {
    expect(priorityOf("overdue")).toBe("p1");
    expect(priorityOf("due_soon")).toBe("p2");
    expect(priorityOf("no_due")).toBe("p3");
    expect(priorityOf("upcoming")).toBeNull();
  });
  it("exposes a danger/warning/info badge per actionable urgency", () => {
    expect(URGENCY_META.overdue.badgeVariant).toBe("danger");
    expect(URGENCY_META.due_soon.badgeVariant).toBe("warning");
    expect(URGENCY_META.no_due.badgeVariant).toBe("info");
  });
});

describe("groupByPriority", () => {
  it("groups into p1/p2/p3, drops upcoming, sorts by dueDate asc (nulls last)", () => {
    const items = [
      item("a", "due_soon", "2026-06-18"),
      item("b", "overdue", "2026-06-10"),
      item("c", "overdue", "2026-06-05"),
      item("d", "no_due", null),
      item("e", "upcoming", "2026-08-01"),
    ];
    const g = groupByPriority(items);
    expect(g.p1.map((i) => i.id)).toEqual(["c", "b"]); // earlier due first
    expect(g.p2.map((i) => i.id)).toEqual(["a"]);
    expect(g.p3.map((i) => i.id)).toEqual(["d"]);
    expect(JSON.stringify(g)).not.toContain('"e"'); // upcoming excluded
  });
});

describe("formatRelativeDue", () => {
  it("formats overdue / today / future deadlines in PT-BR", () => {
    expect(formatRelativeDue("2026-06-14", NOW)).toBe("venceu ontem");
    expect(formatRelativeDue("2026-06-10", NOW)).toBe("venceu há 5 dias");
    expect(formatRelativeDue("2026-06-15", NOW)).toBe("vence hoje");
    expect(formatRelativeDue("2026-06-16", NOW)).toBe("vence amanhã");
    expect(formatRelativeDue("2026-06-22", NOW)).toBe("vence em 7 dias");
    expect(formatRelativeDue(null, NOW)).toBe("sem prazo");
  });
});

describe("formatLastAccess", () => {
  it("formats today as time and past days as date", () => {
    expect(formatLastAccess("2026-06-15T08:12:00", NOW)).toBe("hoje às 08:12");
    expect(formatLastAccess("2026-06-12T14:30:00", NOW)).toBe("12/06 às 14:30");
    expect(formatLastAccess(null, NOW)).toBe("—");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/lib/pendencias-format.unit.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the module**

Create `artifacts/web/src/lib/pendencias-format.ts`:

```ts
export type PendenciaSource =
  | "kpi"
  | "action_plan"
  | "nonconformity"
  | "regulatory_document";
export type PendenciaUrgency = "overdue" | "due_soon" | "upcoming" | "no_due";
export type PendenciaPriority = "p1" | "p2" | "p3";

export interface Pendencia {
  id: string;
  source: PendenciaSource;
  sourceLabel: string;
  title: string;
  subtitle?: string;
  statusLabel: string;
  dueDate: string | null;
  urgency: PendenciaUrgency;
  responsibleUserId: number;
  responsibleName?: string;
  link: { route: string; ctaLabel: string };
  meta?: Record<string, unknown>;
}

export interface PendenciasCounts {
  total: number;
  overdue: number;
  dueSoon: number;
  noDue: number;
  upcoming: number;
  bySource: Record<PendenciaSource, number>;
}

export interface PendenciaUserBlock {
  id: number;
  name: string;
  role: string;
  lastLoginAt: string | null;
  filial: { id: number; name: string } | null;
}

export interface PendenciasResponse {
  user: PendenciaUserBlock;
  scope: "mine" | "unit" | "org";
  counts: PendenciasCounts;
  items: Pendencia[];
  completedToday: Pendencia[];
}

export const SOURCE_LABELS: Record<PendenciaSource, string> = {
  kpi: "Indicador",
  action_plan: "Plano de ação",
  nonconformity: "Não conformidade",
  regulatory_document: "Documento regulatório",
};

export const ROLE_LABELS: Record<string, string> = {
  platform_admin: "Admin Plataforma",
  org_admin: "Administrador",
  manager: "Gerente",
  operator: "Operador",
  analyst: "Analista",
};

export const URGENCY_META: Record<
  PendenciaUrgency,
  {
    priority: PendenciaPriority | null;
    sectionTitle: string;
    badgeVariant: "danger" | "warning" | "info";
    badgeLabel: string;
  }
> = {
  overdue: { priority: "p1", sectionTitle: "Fazer agora", badgeVariant: "danger", badgeLabel: "Vencido" },
  due_soon: { priority: "p2", sectionTitle: "Em breve", badgeVariant: "warning", badgeLabel: "A vencer" },
  no_due: { priority: "p3", sectionTitle: "Atenção", badgeVariant: "info", badgeLabel: "Aberto" },
  upcoming: { priority: null, sectionTitle: "Futuro", badgeVariant: "info", badgeLabel: "Futuro" },
};

export function priorityOf(urgency: PendenciaUrgency): PendenciaPriority | null {
  return URGENCY_META[urgency].priority;
}

function dueRank(p: Pendencia): number {
  return p.dueDate ? new Date(p.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
}

export function groupByPriority(items: Pendencia[]): {
  p1: Pendencia[];
  p2: Pendencia[];
  p3: Pendencia[];
} {
  const groups = { p1: [] as Pendencia[], p2: [] as Pendencia[], p3: [] as Pendencia[] };
  for (const it of items) {
    const prio = priorityOf(it.urgency);
    if (prio === "p1") groups.p1.push(it);
    else if (prio === "p2") groups.p2.push(it);
    else if (prio === "p3") groups.p3.push(it);
    // upcoming (prio null) excluded — calendar-only (F4)
  }
  const byDue = (a: Pendencia, b: Pendencia) => dueRank(a) - dueRank(b);
  groups.p1.sort(byDue);
  groups.p2.sort(byDue);
  groups.p3.sort(byDue);
  return groups;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseDateOnly(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(value);
}

export function formatRelativeDue(dueDate: string | null, now: Date): string {
  if (dueDate == null) return "sem prazo";
  const diff = Math.round(
    (startOfDay(parseDateOnly(dueDate)).getTime() - startOfDay(now).getTime()) / 86_400_000,
  );
  if (diff < -1) return `venceu há ${Math.abs(diff)} dias`;
  if (diff === -1) return "venceu ontem";
  if (diff === 0) return "vence hoje";
  if (diff === 1) return "vence amanhã";
  return `vence em ${diff} dias`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatLastAccess(iso: string | null, now: Date): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return `hoje às ${hm}`;
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)} às ${hm}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/lib/pendencias-format.unit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/web/src/lib/pendencias-format.ts artifacts/web/tests/lib/pendencias-format.unit.test.ts
git commit -m "feat(pendencias): pure presentation helpers (format/grouping)"
```

---

### Task 3: Client + `usePendencias` hook

**Files:**
- Create: `artifacts/web/src/lib/pendencias-client.ts`

**Interfaces:**
- Consumes: types/helpers from `pendencias-format`; `getAuthHeaders`, `resolveApiUrl` from `@/lib/api`; `useQuery` from `@tanstack/react-query`.
- Produces:
  - `pendenciasKeys.list(orgId, params)` query-key factory.
  - `fetchPendencias(orgId, params): Promise<PendenciasResponse>`.
  - `usePendencias(orgId: number | undefined, params: { scope: "mine" | "unit" | "org"; unitId?: number | null; dueSoonDays?: number }, options?: { enabled?: boolean })`.
  - Re-exports everything from `pendencias-format`.

- [ ] **Step 1: Create the client**

Create `artifacts/web/src/lib/pendencias-client.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { getAuthHeaders, resolveApiUrl } from "@/lib/api";
import type { PendenciasResponse } from "@/lib/pendencias-format";

export * from "@/lib/pendencias-format";

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(resolveApiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || "Erro ao carregar pendências");
  }
  return response.json() as Promise<T>;
}

export type PendenciasScope = "mine" | "unit" | "org";

export interface PendenciasParams {
  scope: PendenciasScope;
  unitId?: number | null;
  dueSoonDays?: number;
}

export const pendenciasKeys = {
  list: (orgId: number, params: PendenciasParams) =>
    ["pendencias", orgId, params.scope, params.unitId ?? null, params.dueSoonDays ?? 7] as const,
};

export async function fetchPendencias(
  orgId: number,
  params: PendenciasParams,
): Promise<PendenciasResponse> {
  const qs = new URLSearchParams();
  qs.set("scope", params.scope);
  if (params.scope === "unit" && params.unitId != null) qs.set("unitId", String(params.unitId));
  if (params.dueSoonDays != null) qs.set("dueSoonDays", String(params.dueSoonDays));
  return apiJson<PendenciasResponse>(`/organizations/${orgId}/pendencias?${qs.toString()}`);
}

export function usePendencias(
  orgId: number | undefined,
  params: PendenciasParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: pendenciasKeys.list(orgId ?? 0, params),
    queryFn: () => fetchPendencias(orgId as number, params),
    enabled: (options?.enabled ?? true) && !!orgId && (params.scope !== "unit" || params.unitId != null),
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @workspace/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add artifacts/web/src/lib/pendencias-client.ts
git commit -m "feat(pendencias): usePendencias client hook"
```

---

### Task 4: Page shell + user-identity block + summary cards

**Files:**
- Create: `artifacts/web/src/pages/app/pendencias.tsx`
- Test: `artifacts/web/tests/pages/pendencias.unit.test.tsx`

**Interfaces:**
- Consumes: `usePendencias` (Task 3), `useAuth`/`usePermissions` (`@/contexts/AuthContext`), `usePageTitle`/`usePageSubtitle`, `ROLE_LABELS`/`formatLastAccess`/`SOURCE_LABELS` from the client.
- Produces: default-exported `SuasPendenciasPage`. (Tasks 5/6 extend this file.)

- [ ] **Step 1: Write the failing render test**

Create `artifacts/web/tests/pages/pendencias.unit.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SuasPendenciasPage from "@/pages/app/pendencias";
import type { PendenciasResponse } from "@/lib/pendencias-format";

const response: PendenciasResponse = {
  user: {
    id: 1,
    name: "João Silva",
    role: "operator",
    lastLoginAt: "2026-06-15T08:12:00",
    filial: { id: 7, name: "POA" },
  },
  scope: "mine",
  counts: {
    total: 2,
    overdue: 1,
    dueSoon: 1,
    noDue: 0,
    upcoming: 0,
    bySource: { kpi: 1, action_plan: 1, nonconformity: 0, regulatory_document: 0 },
  },
  items: [],
  completedToday: [],
};

vi.mock("@/lib/pendencias-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pendencias-format")>(
    "@/lib/pendencias-format",
  );
  return { ...actual, usePendencias: vi.fn() };
});
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ organization: { id: 9 }, user: { id: 1, name: "João Silva", role: "operator" }, unitId: 7 }),
  usePermissions: () => ({ isAdmin: false, role: "operator" }),
}));
vi.mock("@/contexts/LayoutContext", () => ({
  usePageTitle: vi.fn(),
  usePageSubtitle: vi.fn(),
}));

import { usePendencias } from "@/lib/pendencias-client";

describe("SuasPendenciasPage — identity + cards", () => {
  it("renders the user block and summary counts", () => {
    (usePendencias as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: response,
      isLoading: false,
      isError: false,
    });
    render(<SuasPendenciasPage />);
    expect(screen.getByText("João Silva")).toBeInTheDocument();
    expect(screen.getByText("POA")).toBeInTheDocument(); // filial
    expect(screen.getByText("Operador")).toBeInTheDocument(); // perfil
    expect(screen.getByText(/hoje às 08:12/)).toBeInTheDocument(); // último acesso
    expect(screen.getByText("Total em aberto")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/pendencias.unit.test.tsx`
Expected: FAIL — page module does not exist.

- [ ] **Step 3: Create the page (shell + identity block + summary cards)**

Create `artifacts/web/src/pages/app/pendencias.tsx`:

```tsx
import { useState } from "react";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { usePageSubtitle, usePageTitle } from "@/contexts/LayoutContext";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  usePendencias,
  type PendenciasScope,
  ROLE_LABELS,
  formatLastAccess,
  type PendenciasResponse,
} from "@/lib/pendencias-client";
import { Building2, Clock, ShieldCheck, User } from "lucide-react";

function UserIdentityBlock({ user }: { user: PendenciasResponse["user"] }) {
  const now = new Date();
  const fields: { icon: typeof User; label: string; value: string }[] = [
    { icon: User, label: "Nome", value: user.name },
    { icon: Building2, label: "Filial", value: user.filial?.name ?? "—" },
    { icon: ShieldCheck, label: "Perfil", value: ROLE_LABELS[user.role] ?? user.role },
    { icon: Clock, label: "Último acesso", value: formatLastAccess(user.lastLoginAt, now) },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {fields.map((f) => (
        <div key={f.label} className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-card/40 px-3 py-2.5">
          <f.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{f.label}</p>
            <p className="truncate text-[13px] font-medium text-foreground">{f.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function SummaryCards({ counts }: { counts: PendenciasResponse["counts"] }) {
  const cards: { label: string; value: number; hint: string }[] = [
    { label: "Total em aberto", value: counts.total, hint: `${counts.overdue} vencido(s)` },
    { label: "Indicadores", value: counts.bySource.kpi, hint: "para alimentar" },
    { label: "Planos de ação", value: counts.bySource.action_plan, hint: "em andamento" },
    { label: "Não conformidades", value: counts.bySource.nonconformity, hint: "aguardam ação" },
    { label: "Documentos", value: counts.bySource.regulatory_document, hint: "a renovar" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{c.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{c.value}</p>
            <p className="text-[11px] text-muted-foreground">{c.hint}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function SuasPendenciasPage() {
  usePageTitle("Suas pendências");
  usePageSubtitle("Tudo que está sob a sua responsabilidade e precisa de ação");
  const { organization, user: authUser } = useAuth();
  const { isAdmin } = usePermissions();
  const orgId = organization?.id;

  // Scope state (the selector itself is added in Task 6; operators are always "mine").
  const [scope] = useState<PendenciasScope>("mine");
  const [unitId] = useState<number | null>(null);

  const { data, isLoading, isError } = usePendencias(orgId, { scope, unitId });

  const firstName = (authUser?.name ?? "").trim().split(/\s+/)[0] ?? "";

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-[13px] text-muted-foreground">Olá, {firstName} 👋</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Suas pendências</h1>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {isError && (
        <p className="text-sm text-destructive">Não foi possível carregar suas pendências.</p>
      )}

      {data && (
        <>
          <UserIdentityBlock user={data.user} />
          <SummaryCards counts={data.counts} />
          {/* Priority list (Task 5) and scope selector (Task 6) render here. */}
          <div data-testid="pendencias-list" className={cn(isAdmin && "scroll-mt-4")} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/pendencias.unit.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter @workspace/web typecheck` → PASS, then:
```bash
git add artifacts/web/src/pages/app/pendencias.tsx artifacts/web/tests/pages/pendencias.unit.test.tsx
git commit -m "feat(pendencias): panel page shell + identity block + summary cards"
```

---

### Task 5: Priority list + pendência card + deep-links + empty state

**Files:**
- Modify: `artifacts/web/src/pages/app/pendencias.tsx`
- Modify: `artifacts/web/tests/pages/pendencias.unit.test.tsx`

**Interfaces:**
- Consumes: `groupByPriority`, `URGENCY_META`, `formatRelativeDue` from the client; `Badge` from `@/components/ui/badge`; `Link`/`useLocation` from `wouter`.
- Produces: the actionable P1/P2/P3 sections + empty state inside the page.

- [ ] **Step 1: Extend the render test (RED)**

Add to `artifacts/web/tests/pages/pendencias.unit.test.tsx` a second `it(...)` (and add two items to a fresh response) inside the describe:

```tsx
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
    (usePendencias as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: withItems,
      isLoading: false,
      isError: false,
    });
    const { rerender } = render(<SuasPendenciasPage />);
    expect(screen.getByText("Fazer agora")).toBeInTheDocument();
    expect(screen.getByText("Revisar procedimento de carga")).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /Ver plano/ });
    expect(cta).toHaveAttribute("href", "/planos-acao/5");

    (usePendencias as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { ...response, items: [], counts: { ...response.counts, total: 0, overdue: 0, dueSoon: 0 } },
      isLoading: false,
      isError: false,
    });
    rerender(<SuasPendenciasPage />);
    expect(screen.getByText(/Você está em dia/)).toBeInTheDocument();
  });
```

(`screen.getByRole("link", ...)` requires Wouter's `Link` to render an `<a href>` — it does.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/pendencias.unit.test.tsx`
Expected: FAIL — "Fazer agora" / empty-state text not present yet.

- [ ] **Step 3: Add the list, card, and empty state to the page**

In `artifacts/web/src/pages/app/pendencias.tsx`, add imports:
```tsx
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import {
  groupByPriority,
  URGENCY_META,
  formatRelativeDue,
  type Pendencia,
} from "@/lib/pendencias-client";
import { ArrowUpRight, PartyPopper } from "lucide-react";
```

Add these components above `SuasPendenciasPage`:

```tsx
function PendenciaCard({ item, now }: { item: Pendencia; now: Date }) {
  const meta = URGENCY_META[item.urgency];
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={meta.badgeVariant}>{item.sourceLabel}</Badge>
            <span className="text-[12px] text-muted-foreground">
              {formatRelativeDue(item.dueDate, now)} · {item.statusLabel}
            </span>
          </div>
          <p className="mt-1 truncate text-[14px] font-medium text-foreground">{item.title}</p>
          {item.subtitle && (
            <p className="truncate text-[12px] text-muted-foreground">{item.subtitle}</p>
          )}
          {item.responsibleName && (
            <p className="text-[11px] text-muted-foreground">Responsável: {item.responsibleName}</p>
          )}
        </div>
        <Link
          href={item.link.route}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-muted/40"
        >
          {item.link.ctaLabel}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </CardContent>
    </Card>
  );
}

function PrioritySection({
  title,
  priority,
  items,
  now,
}: {
  title: string;
  priority: "P1" | "P2" | "P3";
  items: Pendencia[];
  now: Date;
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-2.5">
      <h2 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
        {title}
        <span className="text-[11px] font-normal text-muted-foreground">
          {priority} · {items.length}
        </span>
      </h2>
      <div className="space-y-2.5">
        {items.map((it) => (
          <PendenciaCard key={it.id} item={it} now={now} />
        ))}
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
        <PartyPopper className="h-8 w-8 text-emerald-500" />
        <p className="text-[15px] font-medium text-foreground">Você está em dia 🎉</p>
        <p className="text-[13px] text-muted-foreground">Nenhuma pendência em aberto no momento.</p>
      </CardContent>
    </Card>
  );
}
```

Then replace the placeholder `<div data-testid="pendencias-list" ... />` in the `{data && (...)}` block with:

```tsx
          {(() => {
            const now = new Date();
            const groups = groupByPriority(data.items);
            const empty = groups.p1.length + groups.p2.length + groups.p3.length === 0;
            if (empty) return <EmptyState />;
            return (
              <div className="space-y-6">
                <PrioritySection title={URGENCY_META.overdue.sectionTitle} priority="P1" items={groups.p1} now={now} />
                <PrioritySection title={URGENCY_META.due_soon.sectionTitle} priority="P2" items={groups.p2} now={now} />
                <PrioritySection title={URGENCY_META.no_due.sectionTitle} priority="P3" items={groups.p3} now={now} />
              </div>
            );
          })()}
```

(Remove the now-unused `cn`/`isAdmin` placeholder div; keep `isAdmin` if Task 6 uses it, otherwise drop the import.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/pendencias.unit.test.tsx`
Expected: PASS (both tests).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter @workspace/web typecheck` → PASS, then:
```bash
git add artifacts/web/src/pages/app/pendencias.tsx artifacts/web/tests/pages/pendencias.unit.test.tsx
git commit -m "feat(pendencias): priority list, pendência cards, deep-links, empty state"
```

---

### Task 6: Admin scope selector

**Files:**
- Modify: `artifacts/web/src/pages/app/pendencias.tsx`

**Interfaces:**
- Consumes: `usePermissions().isAdmin`, `useListUnits`/`getListUnitsQueryKey` (`@workspace/api-client-react`), `SearchableSelect`.
- Produces: a scope toggle (Minhas / Filial / Organização) visible only to admins; drives `usePendencias` params.

- [ ] **Step 1: Make scope state interactive + add the selector**

In `artifacts/web/src/pages/app/pendencias.tsx`:
1. Change the scope state to be settable:
```tsx
const [scope, setScope] = useState<PendenciasScope>("mine");
const [unitId, setUnitId] = useState<number | null>(authUser ? null : null);
```
2. Add the units query + import near the other hooks:
```tsx
import { useListUnits, getListUnitsQueryKey } from "@workspace/api-client-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
```
```tsx
const { data: units = [] } = useListUnits(orgId!, {
  query: { queryKey: getListUnitsQueryKey(orgId!), enabled: !!orgId && isAdmin },
});
```
3. Render the selector right after the `<UserIdentityBlock />` (only for admins):
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
```

(The `usePendencias(orgId, { scope, unitId })` call already reads this state; the hook is disabled while `scope === "unit"` and `unitId == null`, so no request fires until a filial is picked.)

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @workspace/web typecheck`
Expected: PASS.

- [ ] **Step 3: Mock `useListUnits` in the page test (else it crashes)**

The page now calls `useListUnits` (a real React Query hook) unconditionally, even when `isAdmin` is false. The render test has no `QueryClientProvider`, so the real hook would throw "No QueryClient set". Add a mock to `artifacts/web/tests/pages/pendencias.unit.test.tsx` (alongside the other `vi.mock` calls):

```tsx
vi.mock("@workspace/api-client-react", () => ({
  useListUnits: () => ({ data: [] }),
  getListUnitsQueryKey: () => ["units"],
}));
```

- [ ] **Step 4: Re-run the page test (no regression)**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/pendencias.unit.test.tsx`
Expected: PASS (the mocked `usePermissions` returns `isAdmin: false`, so the selector is absent — existing assertions hold; `useListUnits` is mocked so no QueryClient is needed).

- [ ] **Step 5: Commit**

```bash
git add artifacts/web/src/pages/app/pendencias.tsx artifacts/web/tests/pages/pendencias.unit.test.tsx
git commit -m "feat(pendencias): admin scope selector (minhas/filial/organização)"
```

---

### Task 7: Wire it in — route, landing redirect, sidebar item

**Files:**
- Modify: `artifacts/web/src/App.tsx` (route registration ~line 244; landing redirect line 411)
- Modify: `artifacts/web/src/components/layout/AppLayout.tsx` (sidebar, after the "Planos de Ação" item ~line 814)

**Interfaces:**
- Consumes: `SuasPendenciasPage` default export.
- Produces: `/pendencias` route; post-login landing → `/pendencias`; sidebar item.

- [ ] **Step 1: Register the route + import**

In `artifacts/web/src/App.tsx`, add the lazy/static import alongside the other page imports (match the file's existing import style for pages), e.g.:
```tsx
import SuasPendenciasPage from "@/pages/app/pendencias";
```
Add the route inside the `AppPages` `<Switch>`, just before the `/planos-acao` routes (~line 244):
```tsx
<Route path="/pendencias" component={SuasPendenciasPage} />
```

- [ ] **Step 2: Change the post-login landing**

In `artifacts/web/src/App.tsx`, line ~411, change:
```tsx
    return "/organizacao";
```
to:
```tsx
    return "/pendencias";
```
(This is the branch `isAuthenticated && !onboardingPending && (isOnboardingRoute || isAuthRoute)`.)

- [ ] **Step 3: Add the sidebar item**

In `artifacts/web/src/components/layout/AppLayout.tsx`, add `ListChecks` to the existing `lucide-react` import, then insert a top-level item (mirror the "Planos de Ação" `<Link>` block, ~after line 814). NO module gate:
```tsx
<Link
  href="/pendencias"
  className={cn(
    "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[13px] transition-colors cursor-pointer",
    isActive("/pendencias")
      ? "font-medium text-foreground"
      : "text-muted-foreground hover:text-foreground",
  )}
>
  <div className="flex items-center">
    <ListChecks className={cn("h-[18px] w-[18px] shrink-0", isSidebarOpen && "mr-2.5")} />
    {isSidebarOpen && <span>Suas Pendências</span>}
  </div>
</Link>
```
Place it at the TOP of the nav (it is the landing) — before the "Organização" item — so it reads as the home. If the collapsed/popover sidebar duplicates the item list, add it in both places consistently (match the file's structure for a no-submenu top-level link).

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @workspace/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/web/src/App.tsx artifacts/web/src/components/layout/AppLayout.tsx
git commit -m "feat(pendencias): landing redirect + route + sidebar item"
```

---

### Task 8: Un-gate the cadastro filial selector (all roles)

**Files:**
- Modify: `artifacts/web/src/components/settings/OrganizationUsersSettingsSection.tsx`

**Interfaces:**
- Produces: an admin can assign a filial (`unitId`) to ANY role (operator/analyst/manager), so non-managers get a filial for the pendências panel. Manager stays required.

- [ ] **Step 1: Un-gate the create dialog selector**

In `OrganizationUsersSettingsSection.tsx`, the create dialog currently wraps the filial `Select` in `{createUserRole === "manager" && ( ... )}` (~line 1125). Change the condition so the selector shows for every role except `org_admin`:
```tsx
{createUserRole !== "org_admin" && (
```
Change the label from "Filial do gerente" to:
```tsx
<Label>Filial{createUserRole === "manager" ? "" : " (opcional)"}</Label>
```

- [ ] **Step 2: Send unitId for any non-admin role on create**

In the create submit (~line 1020), change:
```tsx
unitId: data.role === "manager" ? data.unitId : null,
```
to:
```tsx
unitId: data.role === "org_admin" ? null : data.unitId ?? null,
```
Keep the manager-required validation (~line 1003) as-is (manager still must pick a filial).

- [ ] **Step 3: Un-gate the edit dialog selector**

In the edit dialog (the `{editRole === "manager" && ( ... )}` filial block, ~line 1270) apply the same change: show for `editRole !== "org_admin"`, relabel, and in the save handler (~line 1351) change `nextUnitId = editRole === "manager" ? editUnitId : null` to `nextUnitId = editRole === "org_admin" ? null : editUnitId ?? null`. Keep the manager-required check.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @workspace/web typecheck`
Expected: PASS.

- [ ] **Step 5: Manual verification note + commit**

This is a conditional-gating change on a large existing dialog; an isolated render test is disproportionate (no precedent for testing this dialog). Verify with typecheck + (when running the app) creating an operator with a filial and confirming it persists. Then commit:
```bash
git add artifacts/web/src/components/settings/OrganizationUsersSettingsSection.tsx
git commit -m "feat(settings): allow assigning a filial to any role (not only managers)"
```

---

### Task 9: Phase verification

- [ ] **Step 1: Full typecheck**

Run: `pnpm typecheck`
Expected: PASS across all projects.

- [ ] **Step 2: Run the F3 web-unit tests + the touched backend provider tests**

Run:
```bash
pnpm exec vitest run --project web-unit artifacts/web/tests/lib/pendencias-format.unit.test.ts artifacts/web/tests/pages/pendencias.unit.test.tsx
pnpm exec vitest run --project integration artifacts/api-server/tests/services/pendencias
```
Expected: all PASS.

- [ ] **Step 3: Stop for review**

F3 is complete. F4 (calendar mode + "Concluídos hoje") remains — it implements `listCompletedToday` on the providers, fills `completedToday`/`counts.completedToday`, adds the Lista/Calendário toggle, and surfaces `upcoming` items in the calendar. All F3 commits are on the `suas-pendencias` branch (PR #102) — no push without explicit go.

---

## Notes for later phases / follow-ups

- **F4:** calendar mode (consumes `upcoming` items already returned by the endpoint) + "Concluídos hoje" (`listCompletedToday` per provider).
- **Manager scope:** the endpoint currently treats `manager` as mine-only; when desired, extend scope resolution so a manager can see `scope=unit` for their own `unitId`.
- **`completedToday`:** the endpoint returns `[]` until F4 — the panel omits that section for now.
