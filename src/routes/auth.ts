import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../prisma.js";
import { asyncHandler, AppError } from "../lib/http.js";
import { requireAuth, signToken } from "../middleware/auth.js";

const router = Router();

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      throw new AppError(400, "Email y contraseña son obligatorios");
    }

    const usuario = await prisma.usuario.findUnique({ where: { email } });
    if (!usuario || !usuario.activo || !(await bcrypt.compare(password, usuario.password))) {
      throw new AppError(401, "Credenciales inválidas");
    }

    if (usuario.rol !== "SUPER_ADMIN" && usuario.comercioId) {
      const comercio = await prisma.comercio.findUnique({
        where: { id: usuario.comercioId },
        select: { activo: true },
      });
      if (!comercio || !comercio.activo) {
        throw new AppError(403, "Comercio no encontrado");
      }
    }

    const token = signToken({
      uid: usuario.id,
      rol: usuario.rol,
      comercioId: usuario.comercioId,
    });

    res.json({
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
        comercioId: usuario.comercioId,
      },
    });
  })
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.auth!.uid },
      include: {
        comercio: {
          select: { id: true, nombre: true, rubro: true, membresia: true, logo: true },
        },
      },
    });
    if (!usuario) throw new AppError(404, "Usuario no encontrado");
    res.json({
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      avatar: usuario.avatar,
      comercio: usuario.comercio,
    });
  })
);

router.put(
  "/perfil",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { nombre, password, avatar, email } = req.body as {
      nombre?: string;
      password?: string;
      avatar?: string | null;
      email?: string;
    };
    const uid = req.auth!.uid;

    const data: any = {};
    if (nombre !== undefined) {
      if (!nombre.trim()) {
        throw new AppError(400, "El nombre de usuario no puede estar vacío");
      }
      data.nombre = nombre.trim();
    }
    if (avatar !== undefined) {
      data.avatar = avatar;
    }
    if (email !== undefined) {
      if (!email.trim() || !email.includes("@")) {
        throw new AppError(400, "Correo electrónico inválido");
      }
      const existente = await prisma.usuario.findFirst({
        where: { email: email.trim().toLowerCase(), id: { not: uid } },
      });
      if (existente) {
        throw new AppError(400, "El correo electrónico ya está registrado por otro usuario");
      }
      data.email = email.trim().toLowerCase();
    }
    if (password !== undefined) {
      if (password.length < 4) {
        throw new AppError(400, "La contraseña debe tener al menos 4 caracteres");
      }
      data.password = await bcrypt.hash(password, 10);
    }

    const usuarioActualizado = await prisma.usuario.update({
      where: { id: uid },
      data,
    });

    res.json({
      id: usuarioActualizado.id,
      nombre: usuarioActualizado.nombre,
      email: usuarioActualizado.email,
      rol: usuarioActualizado.rol,
      avatar: usuarioActualizado.avatar,
    });
  })
);

export default router;
