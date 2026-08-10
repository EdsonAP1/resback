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

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function stockDe(id: string): Promise<number> {
  const p = await prisma.producto.findUnique({ where: { id } });
  return num(p?.stock);
}

describe("POST /api/v1/ventas", () => {
  it("crea una venta atómica y descuenta stock", async () => {
    const p = await crearProducto(fx.comercioId, { nombre: "Salteña", precio: 7.5, stock: 10, limiteMinimo: 2 });

    const res = await request(app)
      .post("/api/v1/ventas")
      .set(auth(fx.token))
      .send({ items: [{ productoId: p.id, cantidad: 2 }], metodoPago: "EFECTIVO" });

    expect(res.status).toBe(201);
    expect(res.body.venta.total).toBe(15);
    expect(res.body.venta.numero).toBe(1);
    expect(await stockDe(p.id)).toBe(8);
  });

  it("rechaza pedido vacío", async () => {
    const res = await request(app)
      .post("/api/v1/ventas")
      .set(auth(fx.token))
      .send({ items: [], metodoPago: "EFECTIVO" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
  });

  it("rechaza método de pago inválido", async () => {
    const p = await crearProducto(fx.comercioId);
    const res = await request(app)
      .post("/api/v1/ventas")
      .set(auth(fx.token))
      .send({ items: [{ productoId: p.id, cantidad: 1 }], metodoPago: "CHEQUE" });
    expect(res.status).toBe(400);
  });

  it("no procesa nada si una línea excede el stock (409)", async () => {
    const p = await crearProducto(fx.comercioId, { nombre: "Limitado", stock: 3 });
    const ventasAntes = await prisma.venta.count({ where: { comercioId: fx.comercioId } });

    const res = await request(app)
      .post("/api/v1/ventas")
      .set(auth(fx.token))
      .send({ items: [{ productoId: p.id, cantidad: 5 }], metodoPago: "EFECTIVO" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(await stockDe(p.id)).toBe(3);
    const ventasDespues = await prisma.venta.count({ where: { comercioId: fx.comercioId } });
    expect(ventasDespues).toBe(ventasAntes);
  });

  it("rechaza cantidades fraccionadas sin permiteFracciones", async () => {
    const p = await crearProducto(fx.comercioId, { permiteFracciones: false });
    const res = await request(app)
      .post("/api/v1/ventas")
      .set(auth(fx.token))
      .send({ items: [{ productoId: p.id, cantidad: 1.5 }], metodoPago: "EFECTIVO" });
    expect(res.status).toBe(400);
  });

  it("incluye alertasReabastecimiento al tocar el límite mínimo", async () => {
    const p = await crearProducto(fx.comercioId, { nombre: "Bajo Stock", stock: 3, limiteMinimo: 2 });
    const res = await request(app)
      .post("/api/v1/ventas")
      .set(auth(fx.token))
      .send({ items: [{ productoId: p.id, cantidad: 1 }], metodoPago: "EFECTIVO" });
    expect(res.status).toBe(201);
    expect(res.body.alertasReabastecimiento).toContain("Bajo Stock");
  });
});

describe("Anulaciones", () => {
  it("anulación parcial devuelve stock y mantiene la venta", async () => {
    const p = await crearProducto(fx.comercioId, { nombre: "Parcial", stock: 10 });

    const venta = await request(app)
      .post("/api/v1/ventas")
      .set(auth(fx.token))
      .send({ items: [{ productoId: p.id, cantidad: 4 }], metodoPago: "EFECTIVO" });
    const ventaId = venta.body.venta.id as string;

    const res = await request(app)
      .post(`/api/v1/ventas/${ventaId}/anular`)
      .set(auth(fx.token))
      .send({
        motivo: "Error de caja",
        items: [{ productoId: p.id, cantidad: 1, destino: "STOCK" }],
      });

    expect(res.status).toBe(201);
    expect(res.body.montoDevuelto).toBe(10);
    expect(res.body.ventaEstado).toContain("parcial");
    expect(await stockDe(p.id)).toBe(7);

    const detalle = await prisma.venta.findUnique({ where: { id: ventaId } });
    expect(detalle?.estado).toBe("COMPLETADA");
  });

  it("anulación total pasa la venta a ANULADA", async () => {
    const p = await crearProducto(fx.comercioId, { nombre: "Total", stock: 10 });

    const venta = await request(app)
      .post("/api/v1/ventas")
      .set(auth(fx.token))
      .send({ items: [{ productoId: p.id, cantidad: 3 }], metodoPago: "TARJETA" });
    const ventaId = venta.body.venta.id as string;

    const res = await request(app)
      .post(`/api/v1/ventas/${ventaId}/anular`)
      .set(auth(fx.token))
      .send({ motivo: "Cliente no vino", destino: "STOCK" });

    expect(res.status).toBe(201);
    expect(res.body.ventaEstado).toBe("ANULADA");
    expect(await stockDe(p.id)).toBe(10);

    const detalle = await prisma.venta.findUnique({ where: { id: ventaId } });
    expect(detalle?.estado).toBe("ANULADA");
  });
});
