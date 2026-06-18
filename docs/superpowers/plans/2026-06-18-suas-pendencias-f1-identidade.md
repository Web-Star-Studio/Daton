# Suas Pendências — Fase 1 (Identidade do usuário) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every user a recorded *last login* and a *primary filial*, expose both through the auth/me API, and let admins set a user's filial in the cadastro — the identity foundation the Pendências panel (F3) and its filial scope (F2) build on.

**Architecture:** Two nullable columns are added to `users` (`last_login_at`, `primary_unit_id → units.id`). The login handler stamps `last_login_at` on every successful login. The OpenAPI `User` schema gains both fields; the `MeResponse` gains a server-resolved `filial { id, name } | null`; `CreateOrgUserBody`/`OrgUser` gain `primaryUnitId`, plus a new `PATCH .../users/{userId}/unit` endpoint. The org-users settings UI gets a Filial `SearchableSelect`. No new pendências logic lands here — F1 is purely identity plumbing.

**Tech Stack:** Drizzle ORM (PostgreSQL/Neon), Express 5, Zod, OpenAPI 3.1 + Orval codegen, React 19 + TanStack Query, Vitest (`integration` project) + supertest.

## Global Constraints

- **Never run a plain `pnpm db push`** — it targets PROD Neon and would drop `users.theme` (memory `drizzle-push-prod-drift-theme`). Test DB schema is synced with `pnpm test:integration:db:push`; PROD gets the two columns via surgical `ALTER TABLE` only **with explicit user authorization at deploy time**.
- **Responsável/filial link is to `users.id` / `units.id`** — never an employee (memory `responsavel-must-be-user`).
- **Never manually edit generated files** under `lib/api-zod/src/generated/` or `lib/api-client-react/src/generated/`. Change `lib/api-spec/openapi.yaml`, then run `pnpm --filter @workspace/api-spec codegen` (needs `python3` available — memory `drizzle-push-prod-drift-theme`).
- **Use `SearchableSelect`**, never the native `Select`, for the filial picker (memory `searchable-select-pattern`).
- **Do not stage/commit/push** unless the user explicitly asks. The per-task "Commit" steps below are written for when that authorization is given; otherwise stop after the verify step.
- All code must pass `pnpm typecheck`. Strings shown to users are PT-BR.

---

### Task 1: Add `lastLoginAt` + `primaryUnitId` columns to `users`

**Files:**
- Modify: `lib/db/src/schema/users.ts`

**Interfaces:**
- Produces: `usersTable.lastLoginAt` (`Date | null`), `usersTable.primaryUnitId` (`number | null`). `insertUserSchema` (already `createInsertSchema(usersTable).omit(...)`) automatically accepts both as optional.

- [ ] **Step 1: Add the `units` import and the two columns**

In `lib/db/src/schema/users.ts`, add the import near the other schema imports (the file already imports `organizationsTable`):

```ts
import { unitsTable } from "./units";
```

Then add the two columns inside `usersTable`, immediately after the `theme` column and before `createdAt`:

```ts
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  primaryUnitId: integer("primary_unit_id").references(() => unitsTable.id),
```

(`timestamp` and `integer` are already imported in this file.)

- [ ] **Step 2: Sync the integration test database**

Run: `pnpm test:integration:up && pnpm test:integration:db:push`
Expected: docker test DB starts and the push reports the new `users.last_login_at` and `users.primary_unit_id` columns created with no errors.

- [ ] **Step 3: Typecheck the db package**

Run: `pnpm --filter @workspace/db typecheck`
Expected: PASS (no errors). This proves the new columns and the `unitsTable` reference compile and that `insertUserSchema`/`createInsertSchema` still resolve.

- [ ] **Step 4: Commit**

```bash
git add lib/db/src/schema/users.ts
git commit -m "feat(users): add lastLoginAt and primaryUnitId columns"
```

---

### Task 2: Stamp `lastLoginAt` on successful login

**Files:**
- Modify: `artifacts/api-server/src/routes/auth.ts` (login handler, ~lines 134-161)
- Test: `artifacts/api-server/tests/routes/auth-identity.integration.test.ts` (create)

**Interfaces:**
- Consumes: `usersTable.lastLoginAt` from Task 1.
- Produces: after `POST /api/auth/login` succeeds, the user's `lastLoginAt` is set to the current time.

- [ ] **Step 1: Write the failing test**

Create `artifacts/api-server/tests/routes/auth-identity.integration.test.ts`:

```ts
import bcrypt from "bcryptjs";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createTestContext,
  createUnit,
  type TestOrgContext,
} from "../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

describe("auth identity (F1)", () => {
  it("records lastLoginAt on successful login", async () => {
    const context = await createTestContext({ seed: "auth-lastlogin" });
    contexts.push(context);

    const password = "Secret123!";
    const passwordHash = await bcrypt.hash(password, 10);
    const email = `${context.prefix}-login@e2e.daton.example`;
    const [created] = await db
      .insert(usersTable)
      .values({
        name: `E2E ${context.prefix} Login`,
        email,
        passwordHash,
        organizationId: context.organizationId,
        role: "operator",
      })
      .returning({ id: usersTable.id });

    const before = await db
      .select({ lastLoginAt: usersTable.lastLoginAt })
      .from(usersTable)
      .where(eq(usersTable.id, created.id));
    expect(before[0].lastLoginAt).toBeNull();

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email, password });
    expect(res.status).toBe(200);

    const after = await db
      .select({ lastLoginAt: usersTable.lastLoginAt })
      .from(usersTable)
      .where(eq(usersTable.id, created.id));
    expect(after[0].lastLoginAt).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run --project integration artifacts/api-server/tests/routes/auth-identity.integration.test.ts`
Expected: FAIL on `expect(after[0].lastLoginAt).not.toBeNull()` (login does not yet write the column).

- [ ] **Step 3: Update the login handler**

In `artifacts/api-server/src/routes/auth.ts`, inside the `POST /auth/login` handler, after the password check passes and before issuing the token (between the `if (!valid) {...}` block and the `const token = await issueAuthToken(...)` line), add:

```ts
  await db
    .update(usersTable)
    .set({ lastLoginAt: new Date() })
    .where(eq(usersTable.id, user.id));
```

(`db`, `usersTable`, and `eq` are already imported in this file.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run --project integration artifacts/api-server/tests/routes/auth-identity.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/auth.ts artifacts/api-server/tests/routes/auth-identity.integration.test.ts
git commit -m "feat(auth): record lastLoginAt on login"
```

---

### Task 3: Extend the OpenAPI spec and regenerate the client

**Files:**
- Modify: `lib/api-spec/openapi.yaml` (`User`, `OrgUser`, `MeResponse`, `CreateOrgUserBody` schemas + new `PATCH /organizations/{orgId}/users/{userId}/unit` path)
- Generated (do not hand-edit): `lib/api-zod/src/generated/*`, `lib/api-client-react/src/generated/*`

**Interfaces:**
- Produces (TS types after codegen):
  - `User` gains `lastLoginAt: string | null` and `primaryUnitId: number | null`.
  - `OrgUser` gains `primaryUnitId: number | null`.
  - `MeResponse` gains `filial: { id: number; name: string } | null`.
  - `CreateOrgUserBody` gains optional `primaryUnitId?: number | null`.
  - New hook `useUpdateUserUnit` + function `updateUserUnit(orgId, userId, { primaryUnitId })`.

- [ ] **Step 1: Add fields to the `User` schema**

In `lib/api-spec/openapi.yaml`, find `    User:` (around line 9738). Add these two properties after the `createdAt` property and add them to the `required` list:

```yaml
        lastLoginAt:
          type: ["string", "null"]
          format: date-time
        primaryUnitId:
          type: ["integer", "null"]
```

Resulting `required` block for `User`:

```yaml
      required:
        - id
        - name
        - email
        - organizationId
        - role
        - theme
        - createdAt
        - lastLoginAt
        - primaryUnitId
```

- [ ] **Step 2: Add `filial` to `MeResponse`**

In the `    MeResponse:` schema (around line 9766), add a `filial` property and list it in `required`:

```yaml
        filial:
          type: ["object", "null"]
          properties:
            id:
              type: integer
            name:
              type: string
          required:
            - id
            - name
```

Resulting `required` block for `MeResponse`:

```yaml
      required:
        - user
        - organization
        - modules
        - filial
```

- [ ] **Step 3: Add `primaryUnitId` to `OrgUser` and `CreateOrgUserBody`**

In `    OrgUser:` (around line 11874), add after `modules` property and to `required`:

```yaml
        primaryUnitId:
          type: ["integer", "null"]
```

```yaml
      required:
        - id
        - name
        - email
        - role
        - createdAt
        - modules
        - primaryUnitId
```

In `    CreateOrgUserBody:` (around line 11918), add `primaryUnitId` as an **optional** property (do NOT add it to `required`):

```yaml
        primaryUnitId:
          type: ["integer", "null"]
```

- [ ] **Step 4: Add the new `PATCH .../users/{userId}/unit` path**

In `lib/api-spec/openapi.yaml`, immediately after the `/organizations/{orgId}/users/{userId}/role:` path block ends (before `/organizations/{orgId}/users/{userId}/modules:`, around line 3212), insert:

```yaml
  /organizations/{orgId}/users/{userId}/unit:
    patch:
      operationId: updateUserUnit
      tags: [organizations]
      summary: Set a user's primary filial (unit)
      parameters:
        - name: orgId
          in: path
          required: true
          schema:
            type: integer
        - name: userId
          in: path
          required: true
          schema:
            type: integer
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                primaryUnitId:
                  type: ["integer", "null"]
              required:
                - primaryUnitId
      responses:
        "200":
          description: Primary unit updated
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/OrgUser"
```

- [ ] **Step 5: Regenerate the client/zod code**

Run: `pnpm --filter @workspace/api-spec codegen`
Expected: completes with no errors; `git status` shows changes under `lib/api-zod/src/generated/` and `lib/api-client-react/src/generated/` (including a new `updateUserUnit`/`useUpdateUserUnit`).

- [ ] **Step 6: Verify generated types compile**

Run: `pnpm --filter @workspace/api-zod typecheck && pnpm --filter @workspace/api-client-react typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod/src/generated lib/api-client-react/src/generated
git commit -m "feat(api): expose user identity (lastLoginAt, filial, primaryUnitId) + updateUserUnit"
```

---

### Task 4: Serialize the new fields and resolve `filial` in `/auth/me`

**Files:**
- Modify: `artifacts/api-server/src/routes/auth.ts` (`serializeAuthUser` ~29-47, `serializeMeResponse` ~49-67, `GET /auth/me` handler ~167-186)
- Test: `artifacts/api-server/tests/routes/auth-identity.integration.test.ts` (add a case)

**Interfaces:**
- Consumes: `User`/`MeResponse` shapes from Task 3; `usersTable.lastLoginAt`/`primaryUnitId` from Task 1; `unitsTable` for the filial name.
- Produces: `GET /api/auth/me` returns `user.lastLoginAt` (ISO string | null), `user.primaryUnitId` (number | null) and top-level `filial: { id, name } | null`.

- [ ] **Step 1: Write the failing test (append to the existing file)**

Append this `it(...)` inside the existing `describe("auth identity (F1)", () => { ... })` block in `artifacts/api-server/tests/routes/auth-identity.integration.test.ts`:

```ts
  it("returns lastLoginAt, primaryUnitId and resolved filial from /auth/me", async () => {
    const context = await createTestContext({ seed: "auth-me-identity" });
    contexts.push(context);
    const unit = await createUnit(context, `Filial POA ${context.prefix}`);

    await db
      .update(usersTable)
      .set({ primaryUnitId: unit.id, lastLoginAt: new Date() })
      .where(eq(usersTable.id, context.userId));

    const res = await request(app)
      .get("/api/auth/me")
      .set(authHeader(context));

    expect(res.status).toBe(200);
    expect(res.body.user.primaryUnitId).toBe(unit.id);
    expect(typeof res.body.user.lastLoginAt).toBe("string");
    expect(res.body.filial).toMatchObject({ id: unit.id });
    expect(res.body.filial.name).toContain("Filial POA");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run --project integration artifacts/api-server/tests/routes/auth-identity.integration.test.ts`
Expected: FAIL — `res.body.user.primaryUnitId` is `undefined` and `res.body.filial` is `undefined`.

- [ ] **Step 3: Add the fields to `serializeAuthUser`**

In `artifacts/api-server/src/routes/auth.ts`, extend `serializeAuthUser`'s input type and return value. The input type currently lists `id, name, email, organizationId, role, theme, createdAt`; add:

```ts
    lastLoginAt: Date | null;
    primaryUnitId: number | null;
```

and in the returned object, after `createdAt: user.createdAt.toISOString(),` add:

```ts
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    primaryUnitId: user.primaryUnitId ?? null,
```

- [ ] **Step 4: Resolve and include `filial` in the me response**

Change `serializeMeResponse` to accept and pass through a `filial` argument. Update its signature to add a 4th parameter:

```ts
  filial: { id: number; name: string } | null,
```

and add `filial,` to the returned object (alongside `user`, `organization`, `modules`).

Then in the `GET /auth/me` handler, after the user/organization/modules are loaded and before calling `serializeMeResponse`, resolve the filial:

```ts
  let filial: { id: number; name: string } | null = null;
  if (user.primaryUnitId) {
    const [unit] = await db
      .select({ id: unitsTable.id, name: unitsTable.name })
      .from(unitsTable)
      .where(eq(unitsTable.id, user.primaryUnitId));
    filial = unit ?? null;
  }
```

Pass `filial` as the new last argument to `serializeMeResponse(...)`. Add `unitsTable` to the existing `@workspace/db` import in this file if it is not already imported.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run --project integration artifacts/api-server/tests/routes/auth-identity.integration.test.ts`
Expected: PASS (both cases).

- [ ] **Step 6: Typecheck the api-server**

Run: `pnpm --filter @workspace/api-server typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add artifacts/api-server/src/routes/auth.ts artifacts/api-server/tests/routes/auth-identity.integration.test.ts
git commit -m "feat(auth): serialize lastLoginAt/primaryUnitId and resolve filial in /auth/me"
```

---

### Task 5: Accept `primaryUnitId` in cadastro (create) + `PATCH .../unit` endpoint

**Files:**
- Modify: `artifacts/api-server/src/routes/org-users.ts` (create schema/insert ~11-17 & ~93-109; `listOrgUsers` ~63; add new PATCH handler near the role/modules handlers)
- Test: `artifacts/api-server/tests/routes/org-users-identity.integration.test.ts` (create)

**Interfaces:**
- Consumes: `usersTable.primaryUnitId` (Task 1); the `updateUserUnit` contract (Task 3).
- Produces: `POST /organizations/:orgId/users` accepts optional `primaryUnitId` and returns it; `GET /organizations/:orgId/users` returns `primaryUnitId` per user; `PATCH /organizations/:orgId/users/:userId/unit` sets/clears it and returns the updated `OrgUser`.

- [ ] **Step 1: Write the failing test**

Create `artifacts/api-server/tests/routes/org-users-identity.integration.test.ts`:

```ts
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createTestContext,
  createUnit,
  type TestOrgContext,
} from "../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

describe("org-users filial (F1)", () => {
  it("creates a user with primaryUnitId, lists it, and updates via PATCH /unit", async () => {
    const context = await createTestContext({ seed: "orguser-filial" });
    contexts.push(context);
    const unitA = await createUnit(context, `Filial A ${context.prefix}`);
    const unitB = await createUnit(context, `Filial B ${context.prefix}`);

    const created = await request(app)
      .post(`/api/organizations/${context.organizationId}/users`)
      .set(authHeader(context))
      .send({
        name: `Novo ${context.prefix}`,
        email: `${context.prefix}-novo@e2e.daton.example`,
        password: "Secret123!",
        role: "operator",
        modules: [],
        primaryUnitId: unitA.id,
      });
    expect(created.status).toBe(201);
    expect(created.body.primaryUnitId).toBe(unitA.id);

    const listed = await request(app)
      .get(`/api/organizations/${context.organizationId}/users`)
      .set(authHeader(context));
    expect(listed.status).toBe(200);
    const row = listed.body.find((u: { id: number }) => u.id === created.body.id);
    expect(row.primaryUnitId).toBe(unitA.id);

    const patched = await request(app)
      .patch(
        `/api/organizations/${context.organizationId}/users/${created.body.id}/unit`,
      )
      .set(authHeader(context))
      .send({ primaryUnitId: unitB.id });
    expect(patched.status).toBe(200);
    expect(patched.body.primaryUnitId).toBe(unitB.id);

    const cleared = await request(app)
      .patch(
        `/api/organizations/${context.organizationId}/users/${created.body.id}/unit`,
      )
      .set(authHeader(context))
      .send({ primaryUnitId: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.primaryUnitId).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run --project integration artifacts/api-server/tests/routes/org-users-identity.integration.test.ts`
Expected: FAIL — created user has no `primaryUnitId`, and the PATCH route 404s.

- [ ] **Step 3: Accept `primaryUnitId` on create**

In `artifacts/api-server/src/routes/org-users.ts`, extend `createOrgUserBodySchema` with:

```ts
  primaryUnitId: z.number().int().positive().nullable().optional(),
```

In the create transaction, destructure `primaryUnitId` from the parsed body and include it in the insert values:

```ts
    const [user] = await tx
      .insert(usersTable)
      .values({
        name: name.toUpperCase(),
        email,
        passwordHash,
        organizationId: orgId,
        role,
        primaryUnitId: primaryUnitId ?? null,
      })
      .returning();
```

- [ ] **Step 4: Return `primaryUnitId` from create and list**

Ensure the create response and `listOrgUsers` include `primaryUnitId`. In `listOrgUsers`, add `primaryUnitId: usersTable.primaryUnitId` to the selected columns (or, if it selects whole rows, ensure the serializer includes it). In the POST response object, add `primaryUnitId: user.primaryUnitId ?? null` to the returned `OrgUser` shape. Match whatever serialization the file already uses for `OrgUser` (id, name, email, role, createdAt, modules) and add `primaryUnitId` consistently to both.

- [ ] **Step 5: Add the `PATCH .../users/:userId/unit` handler**

Add a handler next to the existing role/modules handlers in `org-users.ts`:

```ts
const updateUserUnitBodySchema = z.object({
  primaryUnitId: z.number().int().positive().nullable(),
});

router.patch(
  "/organizations/:orgId/users/:userId/unit",
  requireOrgAdmin, // reuse the same guard the role/modules handlers use
  async (req, res) => {
    const orgId = Number(req.params.orgId);
    const userId = Number(req.params.userId);
    const parsed = updateUserUnitBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { primaryUnitId } = parsed.data;

    if (primaryUnitId !== null) {
      const [unit] = await db
        .select({ id: unitsTable.id })
        .from(unitsTable)
        .where(and(eq(unitsTable.id, primaryUnitId), eq(unitsTable.organizationId, orgId)));
      if (!unit) {
        res.status(400).json({ error: "Filial inválida" });
        return;
      }
    }

    const [updated] = await db
      .update(usersTable)
      .set({ primaryUnitId })
      .where(and(eq(usersTable.id, userId), eq(usersTable.organizationId, orgId)))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Usuário não encontrado" });
      return;
    }

    // Reuse the same OrgUser serializer used by listOrgUsers/createOrgUser
    res.status(200).json(await serializeOrgUser(updated));
  },
);
```

Notes for the implementer:
- Use the **same authorization guard** the sibling role/modules handlers use (e.g. `requireOrgAdmin` or the inline role check already present) — match the file, don't invent a new one.
- `and`, `eq` come from `drizzle-orm`; add `unitsTable` to the `@workspace/db` import. If the file builds the `OrgUser` response inline rather than via a `serializeOrgUser` helper, build the same object inline here (id, name, email, role, createdAt, modules, primaryUnitId) — load the user's modules the same way `listOrgUsers` does.

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm exec vitest run --project integration artifacts/api-server/tests/routes/org-users-identity.integration.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @workspace/api-server typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add artifacts/api-server/src/routes/org-users.ts artifacts/api-server/tests/routes/org-users-identity.integration.test.ts
git commit -m "feat(org-users): accept primaryUnitId on create + PATCH user unit"
```

---

### Task 6: Filial selector in the org-users settings UI

**Files:**
- Modify: `artifacts/web/src/components/settings/OrganizationUsersSettingsSection.tsx`

**Interfaces:**
- Consumes: `useListUnits(orgId)`, `useCreateOrgUser`, the regenerated `CreateOrgUserBody.primaryUnitId`, and `useUpdateUserUnit` (Task 3); `SearchableSelect` from `@/components/ui/searchable-select`.
- Produces: admins can set a filial when creating a user and change it for an existing user; the value persists via the API.

- [ ] **Step 1: Add `primaryUnitId` to the create form state**

In `OrganizationUsersSettingsSection.tsx`, extend `CreateUserFormData` (around line 53):

```ts
  primaryUnitId: number | null;
```

Add `primaryUnitId: null` to the form's `defaultValues`/initial state wherever the create form is initialized (alongside `name`, `email`, `password`, `role`, `modules`).

- [ ] **Step 2: Load units and render the Filial SearchableSelect**

Near the other hooks at the top of the component, add (the component already has `orgId` in scope from `useAuth`/props — use the same source the existing `useCreateOrgUser` uses):

```tsx
const { data: units = [] } = useListUnits(orgId);
```

Import `SearchableSelect` and `useListUnits`:

```tsx
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useListUnits } from "@workspace/api-client-react";
```

In the create dialog form, after the Role select (around line 1095), add a Filial field:

```tsx
<div className="space-y-2">
  <Label>Filial</Label>
  <SearchableSelect
    value={form.primaryUnitId != null ? String(form.primaryUnitId) : ""}
    onValueChange={(v) =>
      setForm((prev) => ({ ...prev, primaryUnitId: v ? Number(v) : null }))
    }
    options={units.map((u) => ({ value: String(u.id), label: u.name }))}
    placeholder="Sem filial"
  />
</div>
```

Match the exact prop names of the project's `SearchableSelect` (check `@/components/ui/searchable-select` — `value`/`onValueChange`/`options`/`placeholder` shown here are the expected shape; adapt field/state wiring to whether the form uses `react-hook-form` or local `useState`, matching the surrounding fields).

- [ ] **Step 3: Send `primaryUnitId` on create**

In the create submission (the `createOrgUserMut.mutateAsync({...})` call, around lines 975-1011), add `primaryUnitId: form.primaryUnitId` to the payload object.

- [ ] **Step 4: Allow editing an existing user's filial**

Where the section renders each existing user's editable controls (the role/modules editors), add a filial control bound to `useUpdateUserUnit`:

```tsx
const updateUserUnit = useUpdateUserUnit();
```

```tsx
<SearchableSelect
  value={user.primaryUnitId != null ? String(user.primaryUnitId) : ""}
  onValueChange={(v) =>
    updateUserUnit.mutate({
      orgId,
      userId: user.id,
      data: { primaryUnitId: v ? Number(v) : null },
    })
  }
  options={units.map((u) => ({ value: String(u.id), label: u.name }))}
  placeholder="Sem filial"
/>
```

Match the generated `useUpdateUserUnit` mutate signature (Orval typically uses `{ orgId, userId, data }`) — confirm against the regenerated hook in `lib/api-client-react/src/generated/`. Invalidate/refetch the org-users query on success the same way the sibling role/modules mutations do in this file.

- [ ] **Step 5: Typecheck the web app**

Run: `pnpm --filter @workspace/web typecheck`
Expected: PASS.

- [ ] **Step 6: Manual verification (no automated UI test for this dialog)**

This is a field addition on a large existing settings component; an isolated render test would require mocking the full dialog and is disproportionate (the F3 panel is where the spec calls for frontend render tests). Verify manually instead: start the web app on a non-prod port against the local docker DB, open Configurações → Usuários, create a user with a Filial selected, confirm it persists, then change an existing user's filial and confirm it sticks after refresh. Do not start dev servers without explicit user authorization.

- [ ] **Step 7: Commit**

```bash
git add artifacts/web/src/components/settings/OrganizationUsersSettingsSection.tsx
git commit -m "feat(settings): filial selector in user cadastro"
```

---

### Task 7: Phase verification + DDL note

- [ ] **Step 1: Full typecheck**

Run: `pnpm typecheck`
Expected: PASS across all packages.

- [ ] **Step 2: Run the F1 integration tests together**

Run: `pnpm exec vitest run --project integration artifacts/api-server/tests/routes/auth-identity.integration.test.ts artifacts/api-server/tests/routes/org-users-identity.integration.test.ts`
Expected: PASS.

- [ ] **Step 3: Record the PROD DDL for deploy (do NOT run without explicit authorization)**

The two columns must be applied to PROD Neon via surgical DDL at deploy time (never `db push`). The exact statements:

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS primary_unit_id integer REFERENCES units(id);
```

Surface this to the user when the PR is ready; apply only with explicit go.

- [ ] **Step 4: Stop for review**

F1 is complete and testable. Hand off for review / PR per the user's instruction (no auto-merge, no push without explicit go).

---

## Notes for later phases (not implemented here)

- **F2 (motor de pendências):** provider registry + `GET /organizations/:orgId/pendencias` with scope resolved via `users.primaryUnitId` (this task's column). Separate plan.
- **F3 (painel):** `pendencias-client.ts`, the panel page, the user-identity block (consumes `lastLoginAt` + `filial` from `/auth/me` added here), landing redirect, sidebar item. Separate plan.
- **F4 (calendário & concluídos hoje):** calendar mode + "Concluídos hoje". Separate plan.

Each later phase gets its own plan written once its predecessor lands (so file paths/contracts are verified against reality, per the spec's risk notes).
