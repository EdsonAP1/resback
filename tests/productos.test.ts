import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeApp, request, crearComercioYUsuario, crearProducto, limpiarComercio, type Fixture } from "./helpers.js";
import { prisma, num } from "../src/prisma.js";

const app = makeApp();
let fx: Fixture;

beforeAll(async () => {
  fx = await crearComercioYUsuario();
});

afterAll(async () => {
  await limpiarComercio(fx.comercioId);
});

describe("CRUD /api/v1/productos", () => {
  it("crea un producto", async () => {
    const res = await request(app)
      .post("/api/v1/productos")
      .set("Authorization", `Bearer ${fx.token}`)
      .send({ nombre: "Salteña de Pollo", precio: 7.5, tipoStock: "FINITO", stock: 60, limiteMinimo: 20 });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    
    // Verificar en base de datos
    const p = await prisma.producto.findUnique({ where: { id: res.body.id } });
    expect(p).toBeTruthy();
    expect(p!.comercioId).toBe(fx.comercioId);
    expect(p!.nombre).toBe("Salteña de Pollo");
    await limpiarProducto(res.body.id);
  });

  it("rechaza producto sin nombre", async () => {
    const res = await request(app)
      .post("/api/v1/productos")
      .set("Authorization", `Bearer ${fx.token}`)
      .send({ precio: 7.5 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
  });

  it("lista solo los productos del comercio", async () => {
    const p = await crearProducto(fx.comercioId, { nombre: "Listable" });
    const res = await request(app)
      .get("/api/v1/productos")
      .set("Authorization", `Bearer ${fx.token}`);
    expect(res.status).toBe(200);
    const ids = (res.body as { id: string }[]).map((x) => x.id);
    expect(ids).toContain(p.id);
    await limpiarProducto(p.id);
  });

  it("actualiza precio y stock", async () => {
    const p = await crearProducto(fx.comercioId);
    const res = await request(app)
      .put(`/api/v1/productos/${p.id}`)
      .set("Authorization", `Bearer ${fx.token}`)
      .send({ precio: 12, stock: 5 });
    expect(res.status).toBe(200);
    
    // Verificar en base de datos
    const updated = await prisma.producto.findUnique({ where: { id: p.id } });
    expect(updated).toBeTruthy();
    expect(Number(updated!.precio)).toBe(12);
    expect(num(updated!.stock)).toBe(5);
    
    await limpiarProducto(p.id);
  });

  it("elimina un producto", async () => {
    const p = await crearProducto(fx.comercioId);
    const del = await request(app)
      .delete(`/api/v1/productos/${p.id}`)
      .set("Authorization", `Bearer ${fx.token}`);
    expect(del.status).toBe(200);
    const get = await request(app)
      .get(`/api/v1/productos/${p.id}`)
      .set("Authorization", `Bearer ${fx.token}`);
    expect(get.status).toBe(404);
  });
});

describe("Tenancy en productos", () => {
  it("otro comercio no ve ni modifica el producto ajeno", async () => {
    const p = await crearProducto(fx.comercioId);
    const otro = await crearComercioYUsuario();
    try {
      const get = await request(app)
        .get("/api/v1/productos")
        .set("Authorization", `Bearer ${otro.token}`);
      const ids = (get.body as { id: string }[]).map((x) => x.id);
      expect(ids).not.toContain(p.id);

      const put = await request(app)
        .put(`/api/v1/productos/${p.id}`)
        .set("Authorization", `Bearer ${otro.token}`)
        .send({ precio: 99 });
      expect(put.status).toBe(404);
    } finally {
      await limpiarComercio(otro.comercioId);
      await limpiarProducto(p.id);
    }
  });
});

async function limpiarProducto(id: string) {
  const { prisma } = await import("../src/prisma.js");
  await prisma.producto.deleteMany({ where: { id } });
}
