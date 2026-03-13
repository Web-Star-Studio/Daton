import { Request, Response, NextFunction } from "express";

export interface AuthPayload {
  userId: number;
  organizationId: number;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  next();
}
