import request from "supertest";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import { prisma } from "../src/prisma.js";

export { request };

export function makeApp() {
  return createApp();
}

let seq = 0;

export type Fixture = {
  comercioId: string;
  usuarioId: string;
  email: string;
  password: string;
  token: string;
};

export async function crearComercioYUsuario(): Promise<Fixture> {
  seq += 1;
  const rand = Math.random().toString(36).substring(2, 7);
  const sufijo = `${Date.now()}_${seq}_${rand}`;
  const password = "Test123!";

  const comercio = await prisma.comercio.create({
    data: {
      nombre: `Comercio Test ${sufijo}`,
      rubro: "Test",
      membresia: "MENSUAL",
      membresiaHasta: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      config: { create: {} },
    },
  });

  const email = `usuario_${sufijo}@test.bo`;
  const usuario = await prisma.usuario.create({
    data: {
      comercioId: comercio.id,
      nombre: "Usuario Test",
      email,
      password: await bcrypt.hash(password, 10),
      rol: "COMERCIO",
    },
  });

  const res = await request(createApp())
    .post("/api/v1/auth/login")
    .send({ email, password });

  return {
    comercioId: comercio.id,
    usuarioId: usuario.id,
    email,
    password,
    token: res.body.token as string,
  };
}

export async function crearSuperAdmin(): Promise<{ email: string; password: string }> {
  seq += 1;
  const rand = Math.random().toString(36).substring(2, 7);
  const email = `admin_${Date.now()}_${seq}_${rand}@test.bo`;
  const password = "AdminTest123!";
  await prisma.usuario.create({
    data: {
      nombre: "Admin Test",
      email,
      password: await bcrypt.hash(password, 10),
      rol: "SUPER_ADMIN",
    },
  });
  return { email, password };
}

export async function crearProducto(
  comercioId: string,
  overrides: Record<string, unknown> = {}
) {
  return prisma.producto.create({
    data: {
      comercioId,
      nombre: "Producto Test",
      precio: 10,
      tipoStock: "FINITO",
      stock: 10,
      permiteFracciones: false,
      limiteMinimo: 2,
      ...overrides,
    },
  });
}

export async function limpiarComercio(comercioId: string) {
  await prisma.comercio.deleteMany({ where: { id: comercioId } });
}

export async function limpiarUsuario(email: string) {
  await prisma.usuario.deleteMany({ where: { email } });
}
