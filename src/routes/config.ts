import { Router } from "express";
import { prisma } from "../prisma.js";
import { asyncHandler, AppError } from "../lib/http.js";
import {
  requireAuth,
  tenantId,
} from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const comercioId = tenantId(req);
    const comercio = await prisma.comercio.findUnique({
      where: { id: comercioId },
      select: {
        id: true,
        nombre: true,
        rubro: true,
        nit: true,
        contacto: true,
        logo: true,
        membresia: true,
        membresiaHasta: true,
        config: true,
      },
    });
    if (!comercio) throw new AppError(404, "Comercio no encontrado");

    res.json({
      ...comercio,
      membresiaVencida: comercio.membresiaHasta !== null && comercio.membresiaHasta < new Date(),
    });
  })
);

router.put(
  "/",
  asyncHandler(async (req, res) => {
    const comercioId = tenantId(req);
    const { nit, contacto, rubro, nombre, horaApertura, horaCierre, logo } = req.body as {
      nit?: string;
      contacto?: string;
      rubro?: string;
      nombre?: string;
      horaApertura?: string;
      horaCierre?: string;
      logo?: string | null;
    };

    const comercio = await prisma.$transaction(async (tx) => {
      const c = await tx.comercio.update({
        where: { id: comercioId },
        data: {
          ...(nit !== undefined ? { nit: nit?.trim() || null } : {}),
          ...(contacto !== undefined ? { contacto: contacto?.trim() || null } : {}),
          ...(rubro !== undefined ? { rubro: String(rubro).trim() } : {}),
          ...(nombre !== undefined ? { nombre: String(nombre).trim() } : {}),
          ...(logo !== undefined ? { logo } : {}),
        },
      });

      if (horaApertura !== undefined || horaCierre !== undefined) {
        await tx.comercioConfig.upsert({
          where: { comercioId },
          update: {
            ...(horaApertura !== undefined ? { horaApertura: horaApertura || null } : {}),
            ...(horaCierre !== undefined ? { horaCierre: horaCierre || null } : {}),
          },
          create: {
            comercioId,
            horaApertura: horaApertura || null,
            horaCierre: horaCierre || null,
          },
        });
      }

      return tx.comercio.findUnique({
        where: { id: comercioId },
        select: {
          id: true,
          nombre: true,
          rubro: true,
          nit: true,
          contacto: true,
          logo: true,
          membresia: true,
          membresiaHasta: true,
          config: true,
        },
      });
    });

    res.json(comercio);
  })
);

export default router;
