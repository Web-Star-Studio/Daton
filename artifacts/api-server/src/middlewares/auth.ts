import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db, userModulePermissionsTable } from "@workspace/db";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required");
  }
  return secret;
}

const JWT_SECRET: string = getJwtSecret();

export type UserRole = "platform_admin" | "org_admin" | "operator" | "analyst";

export const APP_MODULES = ["documents", "legislations", "employees", "units", "departments", "positions"] as const;
export type AppModule = typeof APP_MODULES[number];

export interface AuthPayload {
  userId: number;
  organizationId: number;
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as unknown as AuthPayload;
    req.auth = payload;
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

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}
