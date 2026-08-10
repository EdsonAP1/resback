import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../prisma.js";
import { AppError } from "../lib/http.js";

export type AuthUser = {
  uid: string;
  rol: "SUPER_ADMIN" | "COMERCIO";
  comercioId: string | null;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser): string {
  const options = {
    expiresIn: process.env.JWT_EXPIRES_IN || "12h",
  } as jwt.SignOptions;
  return jwt.sign(user, process.env.JWT_SECRET!, options);
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    next(new AppError(401, "No autorizado: falta token"));
    return;
  }
  try {
    req.auth = jwt.verify(header.slice(7), process.env.JWT_SECRET!) as AuthUser;
    next();
  } catch {
    next(new AppError(401, "Sesión inválida o expirada"));
  }
}

export function requireSuperAdmin(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  if (req.auth?.rol !== "SUPER_ADMIN") {
    next(new AppError(403, "Acceso restringido al Superadministrador"));
    return;
  }
  next();
}

export function requireComercio(req: Request, _res: Response, next: NextFunction) {
  if (req.auth?.rol !== "COMERCIO") {
    next(new AppError(403, "Acción permitida solo para usuarios de un comercio"));
    return;
  }
  next();
}

export function tenantId(req: Request): string {
  if (!req.auth?.comercioId) {
    throw new AppError(403, "Operación requiere un comercio asociado");
  }
  return req.auth.comercioId;
}

export async function checkMembresia(req: Request, _res: Response, next: NextFunction) {
  try {
    if (req.auth?.rol === "SUPER_ADMIN") return next();
    const id = tenantId(req);
    const comercio = await prisma.comercio.findUnique({
      where: { id },
      select: { membresia: true, activo: true, membresiaHasta: true },
    });
    if (!comercio || !comercio.activo) {
      throw new AppError(403, "Comercio no encontrado");
    }
    if (comercio.membresia === "SUSPENDIDO") {
      throw new AppError(
        403,
        "Comercio suspendido. Contacta al Superadministrador para regularizar tu membresía"
      );
    }
    if (comercio.membresiaHasta && comercio.membresiaHasta < new Date()) {
      throw new AppError(
        403,
        `Tu membresía venció el ${comercio.membresiaHasta.toLocaleString("es-BO", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })}. Renueva tu plan para seguir operando`
      );
    }
    next();
  } catch (e) {
    next(e);
  }
}
