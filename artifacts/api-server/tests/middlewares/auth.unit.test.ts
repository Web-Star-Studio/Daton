import { beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

// Must be hoisted before any imports that load the module under test
const { selectMock, fromMock, whereMock, eqMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  fromMock: vi.fn(),
  whereMock: vi.fn(),
  eqMock: vi.fn(() => "eq-clause"),
}));

vi.mock("@workspace/db", () => ({
  db: { select: selectMock },
  organizationsTable: {
    id: "orgs.id",
    authVersion: "orgs.auth_version",
    onboardingStatus: "orgs.onboarding_status",
  },
  userModulePermissionsTable: {
    userId: "perms.user_id",
    module: "perms.module",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: eqMock,
}));

import {
  requireAuth,
  requireRole,
  requireModuleAccess,
  requireCompletedOnboarding,
  requireWriteAccess,
  type AuthPayload,
} from "../../src/middlewares/auth";

const TEST_JWT_SECRET = process.env.JWT_SECRET ?? "daton-test-jwt-secret";

// Each test uses a unique orgId to avoid the module-level auth state cache
// returning stale values across tests within the same file.
let nextOrgId = 5000;
function uniqueOrgId(): number {
  return nextOrgId++;
}

function makeToken(orgId: number, overrides: Partial<Omit<AuthPayload, "organizationId">> = {}): string {
  return jwt.sign(
    {
      userId: 1,
      organizationId: orgId,
      role: "operator",
      organizationAuthVersion: 1,
      onboardingStatus: "completed",
      ...overrides,
    },
    TEST_JWT_SECRET,
  );
}

function makeReq(overrides: Partial<Request> = {}): Request {
  return { headers: {}, ...overrides } as unknown as Request;
}

function makeRes() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { res: { status } as unknown as Response, status, json };
}

function makeNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

// Creates a req that already has req.auth populated (simulating a post-requireAuth state)
function makeAuthenticatedReq(authOverrides: Partial<AuthPayload> = {}): Request {
  return makeReq({
    auth: {
      userId: 1,
      organizationId: 10,
      role: "operator",
      organizationAuthVersion: 1,
      onboardingStatus: "completed",
      ...authOverrides,
    },
  });
}

// ─── requireAuth ─────────────────────────────────────────────────────────────

describe("requireAuth", () => {
  beforeEach(() => {
    selectMock.mockReset();
    fromMock.mockReset();
    whereMock.mockReset();
    eqMock.mockClear();

    // Default: org exists and state matches the token defaults
    whereMock.mockResolvedValue([{ authVersion: 1, onboardingStatus: "completed" }]);
    fromMock.mockReturnValue({ where: whereMock });
    selectMock.mockReturnValue({ from: fromMock });
  });

  it("returns 401 when Authorization header is absent", async () => {
    const { res, status, json } = makeRes();
    const next = makeNext();
    await requireAuth(makeReq({ headers: {} }), res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: "Não autenticado" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when header does not start with 'Bearer '", async () => {
    const { res, status, json } = makeRes();
    const next = makeNext();
    await requireAuth(makeReq({ headers: { authorization: "Basic abc123" } }), res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: "Não autenticado" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 for a token signed with the wrong secret", async () => {
    const token = jwt.sign({ userId: 1, organizationId: 10 }, "wrong-secret");
    const { res, status, json } = makeRes();
    await requireAuth(makeReq({ headers: { authorization: `Bearer ${token}` } }), res, makeNext());
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: "Token inválido" });
  });

  it("returns 401 for a token with missing required fields", async () => {
    // Missing organizationAuthVersion and onboardingStatus
    const token = jwt.sign({ userId: 1, organizationId: 10, role: "operator" }, TEST_JWT_SECRET);
    const { res, status, json } = makeRes();
    await requireAuth(makeReq({ headers: { authorization: `Bearer ${token}` } }), res, makeNext());
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: "Token inválido" });
  });

  it("returns 404 when organization is not found in the database", async () => {
    whereMock.mockResolvedValue([]);
    const orgId = uniqueOrgId();
    const token = makeToken(orgId);
    const { res, status, json } = makeRes();
    await requireAuth(makeReq({ headers: { authorization: `Bearer ${token}` } }), res, makeNext());
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ error: "Organização não encontrada" });
  });

  it("returns 401 with ORG_STATE_STALE when organizationAuthVersion diverges", async () => {
    const orgId = uniqueOrgId();
    whereMock.mockResolvedValue([{ authVersion: 99, onboardingStatus: "completed" }]);
    const token = makeToken(orgId, { organizationAuthVersion: 1 });
    const { res, status, json } = makeRes();
    await requireAuth(makeReq({ headers: { authorization: `Bearer ${token}` } }), res, makeNext());
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({
      error: "O estado da organização mudou. Faça login novamente.",
      code: "ORG_STATE_STALE",
    });
  });

  it("returns 401 with ORG_STATE_STALE when onboardingStatus diverges", async () => {
    const orgId = uniqueOrgId();
    whereMock.mockResolvedValue([{ authVersion: 1, onboardingStatus: "pending" }]);
    const token = makeToken(orgId, { onboardingStatus: "completed" });
    const { res, status, json } = makeRes();
    await requireAuth(makeReq({ headers: { authorization: `Bearer ${token}` } }), res, makeNext());
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: "ORG_STATE_STALE" }));
  });

  it("populates req.auth and calls next() for a valid token matching org state", async () => {
    const orgId = uniqueOrgId();
    whereMock.mockResolvedValue([{ authVersion: 1, onboardingStatus: "completed" }]);
    const token = makeToken(orgId, { userId: 42, role: "org_admin" });
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } });
    const { res } = makeRes();
    const next = makeNext();
    await requireAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.auth).toMatchObject({
      userId: 42,
      organizationId: orgId,
      role: "org_admin",
      organizationAuthVersion: 1,
      onboardingStatus: "completed",
    });
  });
});

// ─── requireRole ─────────────────────────────────────────────────────────────

describe("requireRole", () => {
  it("returns 401 when req.auth is not set", () => {
    const { res, status, json } = makeRes();
    const next = makeNext();
    requireRole("org_admin")(makeReq(), res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: "Não autenticado" });
    expect(next).not.toHaveBeenCalled();
  });

  it("allows platform_admin regardless of the allowed roles list", () => {
    const req = makeAuthenticatedReq({ role: "platform_admin" });
    const { res } = makeRes();
    const next = makeNext();
    requireRole("org_admin")(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("calls next() when role is in the allowed list", () => {
    const req = makeAuthenticatedReq({ role: "org_admin" });
    const { res } = makeRes();
    const next = makeNext();
    requireRole("org_admin", "operator")(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("returns 403 when role is not in the allowed list", () => {
    const req = makeAuthenticatedReq({ role: "analyst" });
    const { res, status, json } = makeRes();
    const next = makeNext();
    requireRole("org_admin", "operator")(req, res, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: "Permissão insuficiente" });
    expect(next).not.toHaveBeenCalled();
  });
});

// ─── requireModuleAccess ─────────────────────────────────────────────────────

describe("requireModuleAccess", () => {
  beforeEach(() => {
    selectMock.mockReset();
    fromMock.mockReset();
    whereMock.mockReset();
    // Default: no permissions
    whereMock.mockResolvedValue([]);
    fromMock.mockReturnValue({ where: whereMock });
    selectMock.mockReturnValue({ from: fromMock });
  });

  it("returns 401 when req.auth is not set", async () => {
    const { res, status, json } = makeRes();
    const next = makeNext();
    await requireModuleAccess("documents")(makeReq(), res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: "Não autenticado" });
    expect(next).not.toHaveBeenCalled();
  });

  it("allows platform_admin without checking permissions", async () => {
    const req = makeAuthenticatedReq({ role: "platform_admin" });
    const { res } = makeRes();
    const next = makeNext();
    await requireModuleAccess("documents")(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("allows org_admin without checking permissions", async () => {
    const req = makeAuthenticatedReq({ role: "org_admin" });
    const { res } = makeRes();
    const next = makeNext();
    await requireModuleAccess("documents")(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("allows operator when the module permission exists", async () => {
    whereMock.mockResolvedValue([{ module: "documents" }]);
    const req = makeAuthenticatedReq({ role: "operator" });
    const { res } = makeRes();
    const next = makeNext();
    await requireModuleAccess("documents")(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("returns 403 when operator lacks the module permission", async () => {
    whereMock.mockResolvedValue([]);
    const req = makeAuthenticatedReq({ role: "operator" });
    const { res, status, json } = makeRes();
    const next = makeNext();
    await requireModuleAccess("documents")(req, res, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: "Sem acesso a este módulo" });
    expect(next).not.toHaveBeenCalled();
  });
});

// ─── requireCompletedOnboarding ──────────────────────────────────────────────

describe("requireCompletedOnboarding", () => {
  it("returns 401 when req.auth is not set", () => {
    const { res, status, json } = makeRes();
    const next = makeNext();
    requireCompletedOnboarding(makeReq(), res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: "Não autenticado" });
    expect(next).not.toHaveBeenCalled();
  });

  it("allows platform_admin even with pending onboarding", () => {
    const req = makeAuthenticatedReq({ role: "platform_admin", onboardingStatus: "pending" });
    const { res } = makeRes();
    const next = makeNext();
    requireCompletedOnboarding(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("returns 403 with ONBOARDING_PENDING when status is pending", () => {
    const req = makeAuthenticatedReq({ role: "org_admin", onboardingStatus: "pending" });
    const { res, status, json } = makeRes();
    const next = makeNext();
    requireCompletedOnboarding(req, res, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      error: "Onboarding da organização pendente",
      code: "ONBOARDING_PENDING",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() when onboarding is completed", () => {
    const req = makeAuthenticatedReq({ role: "org_admin", onboardingStatus: "completed" });
    const { res } = makeRes();
    const next = makeNext();
    requireCompletedOnboarding(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

// ─── issueAuthTokenFromState ──────────────────────────────────────────────────

import { issueAuthTokenFromState, issueAuthToken } from "../../src/middlewares/auth";

describe("issueAuthTokenFromState", () => {
  it("returns a JWT that decodes to the supplied payload", () => {
    const orgId = uniqueOrgId();
    const token = issueAuthTokenFromState({
      userId: 7,
      organizationId: orgId,
      role: "org_admin",
      authVersion: 3,
      onboardingStatus: "completed",
    });

    const decoded = jwt.verify(token, TEST_JWT_SECRET) as Record<string, unknown>;
    expect(decoded.userId).toBe(7);
    expect(decoded.organizationId).toBe(orgId);
    expect(decoded.role).toBe("org_admin");
    expect(decoded.organizationAuthVersion).toBe(3);
    expect(decoded.onboardingStatus).toBe("completed");
  });

  it("warms the cache so requireAuth skips the DB lookup", async () => {
    const orgId = uniqueOrgId();
    issueAuthTokenFromState({
      userId: 1,
      organizationId: orgId,
      role: "operator",
      authVersion: 1,
      onboardingStatus: "completed",
    });

    // Re-issue a token for the same org — the DB mock should NOT be called
    // because issueAuthTokenFromState populated the cache.
    const token = makeToken(orgId, { organizationAuthVersion: 1 });
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } });
    const { res } = makeRes();
    const next = makeNext();

    selectMock.mockReset(); // ensure it starts at 0 calls
    await requireAuth(req, res, next);

    expect(selectMock).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});

// ─── issueAuthToken ───────────────────────────────────────────────────────────

describe("issueAuthToken", () => {
  beforeEach(() => {
    selectMock.mockReset();
    fromMock.mockReset();
    whereMock.mockReset();
    whereMock.mockResolvedValue([{ authVersion: 2, onboardingStatus: "completed" }]);
    fromMock.mockReturnValue({ where: whereMock });
    selectMock.mockReturnValue({ from: fromMock });
  });

  it("returns a signed JWT using state fetched from the DB", async () => {
    const orgId = uniqueOrgId();
    const token = await issueAuthToken({ userId: 5, organizationId: orgId, role: "operator" });
    const decoded = jwt.verify(token, TEST_JWT_SECRET) as Record<string, unknown>;
    expect(decoded.userId).toBe(5);
    expect(decoded.organizationAuthVersion).toBe(2);
    expect(decoded.onboardingStatus).toBe("completed");
  });

  it("throws when the organization is not found", async () => {
    whereMock.mockResolvedValue([]);
    const orgId = uniqueOrgId();
    await expect(
      issueAuthToken({ userId: 1, organizationId: orgId, role: "operator" }),
    ).rejects.toThrow("Organization not found while issuing auth token");
  });
});

// ─── requireWriteAccess ──────────────────────────────────────────────────────

describe("requireWriteAccess", () => {
  it("returns 401 when req.auth is not set", () => {
    const { res, status, json } = makeRes();
    const next = makeNext();
    requireWriteAccess()(makeReq(), res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: "Não autenticado" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 for analyst role", () => {
    const req = makeAuthenticatedReq({ role: "analyst" });
    const { res, status, json } = makeRes();
    const next = makeNext();
    requireWriteAccess()(req, res, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: "Analistas possuem apenas acesso de leitura" });
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() for operator role", () => {
    const req = makeAuthenticatedReq({ role: "operator" });
    const { res } = makeRes();
    const next = makeNext();
    requireWriteAccess()(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("calls next() for org_admin role", () => {
    const req = makeAuthenticatedReq({ role: "org_admin" });
    const { res } = makeRes();
    const next = makeNext();
    requireWriteAccess()(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
