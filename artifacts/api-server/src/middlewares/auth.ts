import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db, organizationsTable, userModulePermissionsTable, type OrganizationOnboardingStatus } from "@workspace/db";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required");
  }
  return secret;
}

const JWT_SECRET: string = getJwtSecret();
const ORGANIZATION_AUTH_STATE_TTL_MS = 30_000;
const ORGANIZATION_AUTH_STATE_CLEANUP_INTERVAL_MS = 60_000;

export type UserRole = "platform_admin" | "org_admin" | "operator" | "analyst";

export const APP_MODULES = [
  "documents",
  "legislations",
  "employees",
  "units",
  "departments",
  "positions",
  "governance",
  "suppliers",
] as const;
export type AppModule = typeof APP_MODULES[number];

export interface AuthPayload {
  userId: number;
  organizationId: number;
  role: UserRole;
  organizationAuthVersion: number;
  onboardingStatus: OrganizationOnboardingStatus;
}

interface OrganizationAuthState {
  authVersion: number;
  onboardingStatus: OrganizationOnboardingStatus;
}

const organizationAuthStateCache = new Map<number, OrganizationAuthState & { expiresAt: number }>();
let lastOrganizationAuthStateCleanupAt = 0;

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

function cleanupExpiredOrganizationAuthState(now = Date.now()): void {
  if (now - lastOrganizationAuthStateCleanupAt < ORGANIZATION_AUTH_STATE_CLEANUP_INTERVAL_MS) {
    return;
  }

  lastOrganizationAuthStateCleanupAt = now;

  for (const [organizationId, cachedState] of organizationAuthStateCache.entries()) {
    if (cachedState.expiresAt <= now) {
      organizationAuthStateCache.delete(organizationId);
    }
  }
}

function cacheOrganizationAuthState(
  organizationId: number,
  state: OrganizationAuthState,
): OrganizationAuthState {
  cleanupExpiredOrganizationAuthState();
  organizationAuthStateCache.set(organizationId, {
    ...state,
    expiresAt: Date.now() + ORGANIZATION_AUTH_STATE_TTL_MS,
  });
  return state;
}

async function loadOrganizationAuthState(
  organizationId: number,
  forceRefresh = false,
): Promise<OrganizationAuthState | null> {
  const now = Date.now();
  const cached = organizationAuthStateCache.get(organizationId);
  if (!forceRefresh && cached && cached.expiresAt > now) {
    return {
      authVersion: cached.authVersion,
      onboardingStatus: cached.onboardingStatus,
    };
  }

  cleanupExpiredOrganizationAuthState(now);

  const [organization] = await db
    .select({
      authVersion: organizationsTable.authVersion,
      onboardingStatus: organizationsTable.onboardingStatus,
    })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, organizationId));

  if (!organization) {
    organizationAuthStateCache.delete(organizationId);
    return null;
  }

  return cacheOrganizationAuthState(organizationId, {
    authVersion: organization.authVersion,
    onboardingStatus: organization.onboardingStatus as OrganizationOnboardingStatus,
  });
}

export function issueAuthTokenFromState({
  userId,
  organizationId,
  role,
  authVersion,
  onboardingStatus,
}: {
  userId: number;
  organizationId: number;
  role: UserRole;
  authVersion: number;
  onboardingStatus: OrganizationOnboardingStatus;
}): string {
  cacheOrganizationAuthState(organizationId, { authVersion, onboardingStatus });

  return signToken({
    userId,
    organizationId,
    role,
    organizationAuthVersion: authVersion,
    onboardingStatus,
  });
}

export async function issueAuthToken({
  userId,
  organizationId,
  role,
}: {
  userId: number;
  organizationId: number;
  role: UserRole;
}): Promise<string> {
  const organization = await loadOrganizationAuthState(organizationId, true);
  if (!organization) {
    throw new Error("Organization not found while issuing auth token");
  }

  return issueAuthTokenFromState({
    userId,
    organizationId,
    role,
    authVersion: organization.authVersion,
    onboardingStatus: organization.onboardingStatus,
  });
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as unknown as Partial<AuthPayload>;
    if (
      typeof payload.userId !== "number" ||
      typeof payload.organizationId !== "number" ||
      typeof payload.role !== "string" ||
      typeof payload.organizationAuthVersion !== "number" ||
      typeof payload.onboardingStatus !== "string"
    ) {
      res.status(401).json({ error: "Token inválido" });
      return;
    }

    const organization = await loadOrganizationAuthState(payload.organizationId);
    if (!organization) {
      res.status(404).json({ error: "Organização não encontrada" });
      return;
    }

    if (
      payload.organizationAuthVersion !== organization.authVersion ||
      payload.onboardingStatus !== organization.onboardingStatus
    ) {
      res.status(401).json({
        error: "O estado da organização mudou. Faça login novamente.",
        code: "ORG_STATE_STALE",
      });
      return;
    }

    req.auth = {
      userId: payload.userId,
      organizationId: payload.organizationId,
      role: payload.role as UserRole,
      organizationAuthVersion: organization.authVersion,
      onboardingStatus: organization.onboardingStatus as OrganizationOnboardingStatus,
    };
    next();
  } catch {
    res.status(401).json({ error: "Token inválido" });
    return;
  }
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: "Não autenticado" });
      return;
    }
    if (req.auth.role === "platform_admin") {
      next();
      return;
    }
    if (!allowedRoles.includes(req.auth.role)) {
      res.status(403).json({ error: "Permissão insuficiente" });
      return;
    }
    next();
  };
}

export function requireModuleAccess(moduleName: AppModule) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.auth) {
      res.status(401).json({ error: "Não autenticado" });
      return;
    }
    if (req.auth.role === "platform_admin" || req.auth.role === "org_admin") {
      next();
      return;
    }
    const perms = await db.select().from(userModulePermissionsTable)
      .where(eq(userModulePermissionsTable.userId, req.auth.userId));
    const hasAccess = perms.some(p => p.module === moduleName);
    if (!hasAccess) {
      res.status(403).json({ error: "Sem acesso a este módulo" });
      return;
    }
    next();
  };
}

export function requireCompletedOnboarding(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  if (req.auth.role === "platform_admin") {
    next();
    return;
  }

  if (req.auth.onboardingStatus === "pending") {
    res.status(403).json({
      error: "Onboarding da organização pendente",
      code: "ONBOARDING_PENDING",
    });
    return;
  }

  next();
}

export function requireWriteAccess() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: "Não autenticado" });
      return;
    }
    if (req.auth.role === "analyst") {
      res.status(403).json({ error: "Analistas possuem apenas acesso de leitura" });
      return;
    }
    next();
  };
}
