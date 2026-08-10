import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { asyncHandler, AppError } from "../lib/http.js";
import {
  checkMembresia,
  requireAuth,
  tenantId,
} from "../middleware/auth.js";

const router = Router();

router.use(requireAuth, checkMembresia);

function buscarCarneUnico(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const comercioId = tenantId(req);
    const q = req.query.q ? String(req.query.q).trim() : null;

    const clientes = await prisma.cliente.findMany({
      where: {
        comercioId,
        ...(q
          ? {
              OR: [
                { nombre: { contains: q, mode: "insensitive" as const } },
                { carnet: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: { nombre: "asc" },
      include: { _count: { select: { ventas: true } } },
    });

    res.json(
      clientes.map((c) => ({
        id: c.id,
        nombre: c.nombre,
        carnet: c.carnet,
        telefono: c.telefono,
        createdAt: c.createdAt,
        ventas: c._count.ventas,
      }))
    );
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const comercioId = tenantId(req);
    const { nombre, carnet, telefono } = req.body as {
      nombre?: string;
      carnet?: string;
      telefono?: string;
    };

    if (!nombre?.trim() || !carnet?.trim()) {
      throw new AppError(400, "Nombre y carnet del cliente son obligatorios");
    }

    try {
      const cliente = await prisma.cliente.create({
        data: {
          comercioId,
          nombre: nombre.trim(),
          carnet: carnet.trim(),
          telefono: telefono?.trim() || null,
        },
      });
      res.status(201).json({ id: cliente.id, nombre: cliente.nombre, carnet: cliente.carnet });
    } catch (e) {
      if (buscarCarneUnico(e)) {
        throw new AppError(409, "Ya existe un cliente con ese carnet");
      }
      throw e;
    }
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const comercioId = tenantId(req);
    const idCliente = String(req.params.id);
    const { nombre, carnet, telefono } = req.body as {
      nombre?: string;
      carnet?: string;
      telefono?: string;
    };

    const actual = await prisma.cliente.findFirst({ where: { id: idCliente, comercioId } });
    if (!actual) throw new AppError(404, "Cliente no encontrado");

    try {
      const cliente = await prisma.cliente.update({
        where: { id: actual.id },
        data: {
          ...(nombre !== undefined ? { nombre: String(nombre).trim() } : {}),
          ...(carnet !== undefined ? { carnet: String(carnet).trim() } : {}),
          ...(telefono !== undefined ? { telefono: telefono?.trim() || null } : {}),
        },
      });
      res.json({ id: cliente.id, nombre: cliente.nombre, carnet: cliente.carnet });
    } catch (e) {
      if (buscarCarneUnico(e)) {
        throw new AppError(409, "Ya existe un cliente con ese carnet");
      }
      throw e;
    }
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const comercioId = tenantId(req);
    const actual = await prisma.cliente.findFirst({
      where: { id: String(req.params.id), comercioId },
    });
    if (!actual) throw new AppError(404, "Cliente no encontrado");

    await prisma.cliente.delete({ where: { id: actual.id } });
    res.json({ ok: true });
  })
);

export default router;
