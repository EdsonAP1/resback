import { Router } from "express";
import bcrypt from "bcryptjs";
import type { Membresia } from "@prisma/client";
import { prisma } from "../prisma.js";
import { asyncHandler, AppError } from "../lib/http.js";
import { requireAuth, requireSuperAdmin } from "../middleware/auth.js";
import { diasDePlan } from "./planes.js";
import { getSystemConfig, saveSystemConfig } from "../lib/systemConfig.js";
import { getSolicitudes, saveSolicitudes } from "../lib/solicitudes.js";

const router = Router();

router.use(requireAuth, requireSuperAdmin);

const VALID_MEMBRESIA: Membresia[] = ["MENSUAL", "SEMESTRAL", "ANUAL", "SUSPENDIDO"];

function nuevaFechaVencimiento(base: Date, dias: number): Date {
  const f = new Date(base);
  f.setDate(f.getDate() + dias);
  return f;
}

router.get(
  "/comercios",
  asyncHandler(async (_req, res) => {
    const comercios = await prisma.comercio.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        nombre: true,
        rubro: true,
        contacto: true,
        nit: true,
        membresia: true,
        membresiaHasta: true,
        activo: true,
        createdAt: true,
        _count: { select: { usuarios: true, productos: true, ventas: true } },
      },
    });

    res.json(
      comercios.map((c) => ({
        id: c.id,
        nombre: c.nombre,
        rubro: c.rubro,
        contacto: c.contacto,
        nit: c.nit,
        membresia: c.membresia,
        membresiaHasta: c.membresiaHasta,
        membresiaVencida: c.membresiaHasta !== null && c.membresiaHasta < new Date(),
        activo: c.activo,
        fechaAlta: c.createdAt,
        usuarios: c._count.usuarios,
        productos: c._count.productos,
        ventas: c._count.ventas,
      }))
    );
  })
);

router.post(
  "/comercios",
  asyncHandler(async (req, res) => {
    const { nombre, rubro, contacto, plan = "MENSUAL", usuarioNombre, usuarioEmail, usuarioPassword } =
      req.body as {
        nombre?: string;
        rubro?: string;
        contacto?: string;
        plan?: Membresia;
        usuarioNombre?: string;
        usuarioEmail?: string;
        usuarioPassword?: string;
      };

    if (!nombre?.trim() || !rubro?.trim()) {
      throw new AppError(400, "Nombre y rubro del comercio son obligatorios");
    }
    if (!usuarioNombre?.trim() || !usuarioEmail?.trim() || !usuarioPassword) {
      throw new AppError(400, "Datos del usuario (nombre, email, contraseña) son obligatorios");
    }
    if (!VALID_MEMBRESIA.includes(plan) || plan === "SUSPENDIDO") {
      throw new AppError(400, "Plan de membresía inválido");
    }
    const existe = await prisma.usuario.findUnique({ where: { email: usuarioEmail } });
    if (existe) throw new AppError(409, "El email del usuario ya está registrado");

    const resultado = await prisma.$transaction(async (tx) => {
      const comercio = await tx.comercio.create({
        data: {
          nombre: nombre.trim(),
          rubro: rubro.trim(),
          contacto: contacto?.trim() || null,
          membresia: plan,
          membresiaHasta: nuevaFechaVencimiento(new Date(), diasDePlan(plan)),
          config: { create: {} },
        },
      });

      const usuario = await tx.usuario.create({
        data: {
          comercioId: comercio.id,
          nombre: usuarioNombre.trim(),
          email: usuarioEmail.trim(),
          password: await bcrypt.hash(usuarioPassword, 10),
          rol: "COMERCIO",
        },
      });

      return { comercio, usuario };
    });

    res.status(201).json({
      comercioId: resultado.comercio.id,
      nombre: resultado.comercio.nombre,
      membresia: resultado.comercio.membresia,
      entorno: "Entorno limpio e independiente creado",
      usuario: { nombre: resultado.usuario.nombre, email: resultado.usuario.email },
    });
  })
);

router.patch(
  "/comercios/:id",
  asyncHandler(async (req, res) => {
    const comercio = await prisma.comercio.findUnique({ where: { id: String(req.params.id) } });
    if (!comercio) throw new AppError(404, "Comercio no encontrado");

    const { membresia, activo, nit, plan, membresiaHasta } = req.body as {
      membresia?: Membresia;
      activo?: boolean;
      nit?: string;
      plan?: Membresia;
      membresiaHasta?: string | null;
    };
    if (membresia !== undefined && !VALID_MEMBRESIA.includes(membresia)) {
      throw new AppError(400, "Membresía inválida");
    }

    let fechaHasta: Date | null | undefined;
    if (plan !== undefined) {
      if (!VALID_MEMBRESIA.includes(plan) || plan === "SUSPENDIDO") {
        throw new AppError(400, "Plan inválido");
      }
      const base = new Date();
      const vigente = comercio.membresiaHasta && comercio.membresiaHasta > base ? comercio.membresiaHasta : base;
      fechaHasta = nuevaFechaVencimiento(vigente, diasDePlan(plan));
    } else if (membresiaHasta !== undefined) {
      fechaHasta = membresiaHasta === null || membresiaHasta === "" ? null : new Date(membresiaHasta);
      if (fechaHasta && Number.isNaN(fechaHasta.getTime())) {
        throw new AppError(400, "Fecha de membresía inválida");
      }
    }

    const actualizado = await prisma.comercio.update({
      where: { id: comercio.id },
      data: {
        ...(membresia !== undefined ? { membresia } : {}),
        ...(plan !== undefined ? { membresia: plan } : {}),
        ...(activo !== undefined ? { activo } : {}),
        ...(nit !== undefined ? { nit: nit?.trim() || null } : {}),
        ...(fechaHasta !== undefined ? { membresiaHasta: fechaHasta } : {}),
      },
      select: { id: true, nombre: true, membresia: true, activo: true, membresiaHasta: true },
    });

    res.json(actualizado);
  })
);

// --- NUEVOS ENDPOINTS: CONFIGURACIÓN GLOBAL (PRECIOS Y QR) ---
router.get(
  "/config",
  asyncHandler(async (_req, res) => {
    res.json(getSystemConfig());
  })
);

router.put(
  "/config",
  asyncHandler(async (req, res) => {
    const { precioMensual, precioSemestral, precioAnual, qrMensual, qrSemestral, qrAnual } = req.body as {
      precioMensual?: number;
      precioSemestral?: number;
      precioAnual?: number;
      qrMensual?: string;
      qrSemestral?: string;
      qrAnual?: string;
    };

    const updated = saveSystemConfig({
      ...(precioMensual !== undefined ? { precioMensual: Number(precioMensual) } : {}),
      ...(precioSemestral !== undefined ? { precioSemestral: Number(precioSemestral) } : {}),
      ...(precioAnual !== undefined ? { precioAnual: Number(precioAnual) } : {}),
      ...(qrMensual !== undefined ? { qrMensual } : {}),
      ...(qrSemestral !== undefined ? { qrSemestral } : {}),
      ...(qrAnual !== undefined ? { qrAnual } : {}),
    });

    res.json(updated);
  })
);

// --- NUEVOS ENDPOINTS: PROCESAR SOLICITUDES DE RENOVACIÓN ---
router.get(
  "/solicitudes",
  asyncHandler(async (_req, res) => {
    res.json(getSolicitudes());
  })
);

router.post(
  "/solicitudes/:id/procesar",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { accion } = req.body as { accion?: "APROBAR" | "RECHAZAR" };

    if (!accion || !["APROBAR", "RECHAZAR"].includes(accion)) {
      throw new AppError(400, "Acción inválida. Debe ser APROBAR o RECHAZAR.");
    }

    const solicitudes = getSolicitudes();
    const idx = solicitudes.findIndex((s) => s.id === id);
    if (idx === -1) throw new AppError(404, "Solicitud no encontrada");

    const solicitud = solicitudes[idx];
    if (solicitud.estado !== "PENDIENTE") {
      throw new AppError(400, `Esta solicitud ya fue procesada como ${solicitud.estado}.`);
    }

    if (accion === "APROBAR") {
      const comercio = await prisma.comercio.findUnique({ where: { id: solicitud.comercioId } });
      if (!comercio) throw new AppError(404, "Comercio asociado no encontrado");

      const base = new Date();
      const vigente = comercio.membresiaHasta && comercio.membresiaHasta > base ? comercio.membresiaHasta : base;
      const nuevaHasta = nuevaFechaVencimiento(vigente, diasDePlan(solicitud.plan));

      await prisma.comercio.update({
        where: { id: comercio.id },
        data: {
          membresia: solicitud.plan as Membresia,
          membresiaHasta: nuevaHasta,
        },
      });

      solicitud.estado = "APROBADA";
    } else {
      solicitud.estado = "RECHAZADA";
    }

    solicitudes[idx] = solicitud;
    saveSolicitudes(solicitudes);

    res.json({ status: "success", solicitud });
  })
);

// --- NUEVOS ENDPOINTS: GESTIÓN DE USUARIOS DE UN COMERCIO (ABM) ---
router.get(
  "/comercios/:comercioId/usuarios",
  asyncHandler(async (req, res) => {
    const { comercioId } = req.params;
    const usuarios = await prisma.usuario.findMany({
      where: { comercioId: String(comercioId) },
      orderBy: { createdAt: "desc" },
    });

    res.json(
      usuarios.map((u) => ({
        id: u.id,
        nombre: u.nombre,
        email: u.email,
        rol: u.rol,
        activo: u.activo,
      }))
    );
  })
);

router.post(
  "/comercios/:comercioId/usuarios",
  asyncHandler(async (req, res) => {
    const { comercioId } = req.params;
    const { nombre, email, password, rol = "COMERCIO" } = req.body as {
      nombre?: string;
      email?: string;
      password?: string;
      rol?: "COMERCIO" | "SUPER_ADMIN";
    };

    if (!nombre?.trim() || !email?.trim() || !password) {
      throw new AppError(400, "Nombre, email y contraseña son obligatorios");
    }

    const existe = await prisma.usuario.findUnique({ where: { email: email.trim() } });
    if (existe) throw new AppError(409, "El email ya está registrado");

    const nuevo = await prisma.usuario.create({
      data: {
        comercioId: String(comercioId),
        nombre: nombre.trim(),
        email: email.trim(),
        password: await bcrypt.hash(password, 10),
        rol,
      },
    });

    res.status(201).json({
      id: nuevo.id,
      nombre: nuevo.nombre,
      email: nuevo.email,
      rol: nuevo.rol,
      activo: nuevo.activo,
    });
  })
);

router.patch(
  "/comercios/:comercioId/usuarios/:usuarioId",
  asyncHandler(async (req, res) => {
    const { usuarioId } = req.params;
    const { nombre, email, password, rol, activo } = req.body as {
      nombre?: string;
      email?: string;
      password?: string;
      rol?: "COMERCIO" | "SUPER_ADMIN";
      activo?: boolean;
    };

    const usuario = await prisma.usuario.findUnique({ where: { id: String(usuarioId) } });
    if (!usuario) throw new AppError(404, "Usuario no encontrado");

    if (email && email.trim() !== usuario.email) {
      const existe = await prisma.usuario.findUnique({ where: { email: email.trim() } });
      if (existe) throw new AppError(409, "El nuevo email ya está registrado");
    }

    const data: any = {};
    if (nombre !== undefined) data.nombre = nombre.trim();
    if (email !== undefined) data.email = email.trim();
    if (rol !== undefined) data.rol = rol;
    if (activo !== undefined) data.activo = activo;
    if (password) {
      data.password = await bcrypt.hash(password, 10);
    }

    const actualizado = await prisma.usuario.update({
      where: { id: String(usuarioId) },
      data,
    });

    res.json({
      id: actualizado.id,
      nombre: actualizado.nombre,
      email: actualizado.email,
      rol: actualizado.rol,
      activo: actualizado.activo,
    });
  })
);

router.delete(
  "/comercios/:comercioId/usuarios/:usuarioId",
  asyncHandler(async (req, res) => {
    const { usuarioId } = req.params;
    const usuario = await prisma.usuario.findUnique({ where: { id: String(usuarioId) } });
    if (!usuario) throw new AppError(404, "Usuario no encontrado");

    await prisma.usuario.delete({ where: { id: String(usuarioId) } });

    res.json({ status: "success", message: "Usuario eliminado" });
  })
);

export default router;
