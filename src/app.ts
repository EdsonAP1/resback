import "dotenv/config";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { errorHandler } from "./lib/http.js";
import { prisma } from "./prisma.js";
import authRoutes from "./routes/auth.js";
import productoRoutes from "./routes/productos.js";
import ventaRoutes from "./routes/ventas.js";
import cajaRoutes from "./routes/cajas.js";
import adminRoutes from "./routes/admin.js";
import reporteRoutes from "./routes/reportes.js";
import clienteRoutes from "./routes/clientes.js";
import configRoutes from "./routes/config.js";
import planRoutes from "./routes/planes.js";

const V1 = "/api/v1";
const IS_TEST = process.env.NODE_ENV === "test";

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Demasiadas peticiones. Intenta de nuevo más tarde" } },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Demasiados intentos de ingreso. Espera 15 minutos y vuelve a intentar" } },
});

export function corsWhitelist(
  allowed: string[]
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    const origin = req.headers.origin;

    // Si no hay cabecera Origin (peticiones nativas, cURL, etc.) o se permite todo con "*"
    if (!origin || allowed.includes("*")) {
      if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      if (req.method === "OPTIONS") {
        res.sendStatus(204);
        return;
      }
      next();
      return;
    }

    if (allowed.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      
      if (req.method === "OPTIONS") {
        res.sendStatus(204);
        return;
      }
      next();
      return;
    }

    // Responder preflight OPTIONS con 204 para no romper la negociación
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }

    res.status(403).json({ error: { code: "CORS_ERROR", message: `Origen no permitido por CORS: ${origin}` } });
  };
}

export function createApp() {
  const app = express();

  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  // CORS debe ir ANTES de Helmet para responder preflights correctamente
  app.use(corsWhitelist(allowedOrigins));
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(express.json({ limit: "10mb" }));

  if (!IS_TEST) {
    app.use(V1, apiLimiter);
    app.use(`${V1}/auth/login`, loginLimiter);
  }

  app.get("/health", async (_req, res) => {
    const dbOk = await prisma
      .$queryRaw`SELECT 1`
      .then(() => true)
      .catch(() => false);
    res.status(dbOk ? 200 : 503).json({
      ok: dbOk,
      servicio: "RestoStock API",
      entorno: process.env.NODE_ENV || "local",
      db: dbOk ? "ok" : "error",
    });
  });

  app.use(`${V1}/auth`, authRoutes);
  app.use(`${V1}/productos`, productoRoutes);
  app.use(`${V1}/ventas`, ventaRoutes);
  app.use(`${V1}/cajas`, cajaRoutes);
  app.use(`${V1}/admin`, adminRoutes);
  app.use(`${V1}/reportes`, reporteRoutes);
  app.use(`${V1}/clientes`, clienteRoutes);
  app.use(`${V1}/config`, configRoutes);
  app.use(`${V1}/planes`, planRoutes);

  app.use(errorHandler);

  return app;
}
