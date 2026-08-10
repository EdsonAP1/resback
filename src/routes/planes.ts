import { Router } from "express";
import type { PlanRenovacion } from "@prisma/client";
import { asyncHandler, AppError } from "../lib/http.js";
import { requireAuth, tenantId } from "../middleware/auth.js";
import { getSystemConfig } from "../lib/systemConfig.js";
import { addSolicitud, getSolicitudes } from "../lib/solicitudes.js";
import { prisma } from "../prisma.js";

export function diasDePlan(clave: string): number {
  if (clave === "SEMESTRAL") return 180;
  if (clave === "ANUAL") return 365;
  return 30; // MENSUAL
}

const PLANES_VALIDOS: PlanRenovacion[] = ["MENSUAL", "SEMESTRAL", "ANUAL"];

const router = Router();

// Endpoint público/autenticado para obtener planes con precios y QR configurados por el Super Administrador
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const config = await getSystemConfig();
    const planesInfo = [
      {
        clave: "MENSUAL",
        nombre: "Mensual",
        meses: 1,
        dias: 30,
        precioMensual: config.precioMensual,
        descuento: 0,
        total: config.precioMensual,
        precioEquivalenteMes: config.precioMensual,
        qrCode: config.qrMensual,
      },
      {
        clave: "SEMESTRAL",
        nombre: "Semestral",
        meses: 6,
        dias: 180,
        precioMensual: Math.round(config.precioSemestral / 6),
        descuento: 0.1,
        total: config.precioSemestral,
        precioEquivalenteMes: Math.round(config.precioSemestral / 6),
        qrCode: config.qrSemestral,
      },
      {
        clave: "ANUAL",
        nombre: "Anual",
        meses: 12,
        dias: 365,
        precioMensual: Math.round(config.precioAnual / 12),
        descuento: 0.2,
        total: config.precioAnual,
        precioEquivalenteMes: Math.round(config.precioAnual / 12),
        qrCode: config.qrAnual,
      },
    ];
    res.json(planesInfo);
  })
);

// Endpoint para que el Comercio cree una solicitud de renovación tras realizar el pago
router.post(
  "/pagar",
  requireAuth,
  asyncHandler(async (req, res) => {
    const comercioId = tenantId(req);
    const { plan, comprobante } = req.body as { plan?: string; comprobante?: string };

    if (!plan || !PLANES_VALIDOS.includes(plan as PlanRenovacion)) {
      throw new AppError(400, "Plan seleccionado inválido");
    }
    if (!comprobante) {
      throw new AppError(400, "El comprobante de pago es obligatorio");
    }

    const config = await getSystemConfig();
    let monto = config.precioMensual;
    if (plan === "SEMESTRAL") monto = config.precioSemestral;
    if (plan === "ANUAL") monto = config.precioAnual;

    // Obtener información del Comercio
    const comercio = await prisma.comercio.findUnique({ where: { id: comercioId } });
    if (!comercio) throw new AppError(404, "Comercio no encontrado");

    // Verificar si ya tiene una solicitud pendiente de aprobación
    const activa = await prisma.solicitudRenovacion.findFirst({
      where: { comercioId, estado: "PENDIENTE" },
    });
    if (activa) {
      throw new AppError(400, "Ya tienes una solicitud de renovación pendiente de aprobación.");
    }

    const nueva = await addSolicitud({
      comercioId,
      comercioNombre: comercio.nombre,
      plan: plan as PlanRenovacion,
      monto,
      comprobante,
    });

    res.status(201).json({
      status: "success",
      message: "Tu pago ha sido registrado. La solicitud de renovación está en revisión y será activada manualmente tras verificar tu comprobante.",
      solicitud: nueva,
    });
  })
);

// Endpoint para que el Comercio obtenga el estado de su solicitud actual
router.get(
  "/solicitud-actual",
  requireAuth,
  asyncHandler(async (req, res) => {
    const comercioId = tenantId(req);
    const activa = await prisma.solicitudRenovacion.findFirst({
      where: { comercioId, estado: "PENDIENTE" },
    });
    res.json(activa || null);
  })
);

export default router;
