import type { NextFunction, Request, Response } from "express";
import { verifySessionToken, type SessionPayload } from "../utils/jwt.js";

declare global {
  namespace Express {
    interface Request {
      session?: SessionPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No autenticado." });

  try {
    req.session = verifySessionToken(token);
    return next();
  } catch {
    return res.status(401).json({ error: "Sesión inválida o expirada." });
  }
}

export function requireRole(...roles: Array<"admin" | "cajero">) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.session?.tipo !== "staff" || !roles.includes(req.session.rol)) {
      return res.status(403).json({ error: "No tienes permiso para esto." });
    }
    return next();
  };
}
