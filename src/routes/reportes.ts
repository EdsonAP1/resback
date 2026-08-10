import { Router } from "express";
import { prisma, num } from "../prisma.js";
import { consolidarVentasAntiguas } from "../lib/consolidar.js";
import { asyncHandler } from "../lib/http.js";
import {
  checkMembresia,
  requireAuth,
  tenantId,
} from "../middleware/auth.js";

const router = Router();

router.use(requireAuth, checkMembresia);

router.get(
  "/diario",
  asyncHandler(async (req, res) => {
    const comercioId = tenantId(req);
    const hoy = new Date();
    const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const fin = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1);

    const ventas = await prisma.venta.findMany({
      where: { comercioId, createdAt: { gte: inicio, lt: fin } },
      select: { total: true, estado: true, metodoPago: true },
    });

    const brutas = ventas
      .filter((v) => v.estado === "COMPLETADA")
      .reduce((acc, v) => acc + num(v.total), 0);

    const anuladas = await prisma.anulacion.aggregate({
      where: { comercioId, createdAt: { gte: inicio, lt: fin } },
      _sum: { montoDevuelto: true },
    });

    const porMetodo: Record<string, number> = {};
    for (const v of ventas) {
      if (v.estado === "COMPLETADA") {
        porMetodo[v.metodoPago] = (porMetodo[v.metodoPago] ?? 0) + num(v.total);
      }
    }

    const productosFinitos = await prisma.producto.findMany({
      where: {
        comercioId,
        activo: true,
        tipoStock: "FINITO",
        stock: { not: null },
        limiteMinimo: { not: null },
      },
      select: { id: true, nombre: true, stock: true, limiteMinimo: true },
    });

    const bajoMinimo = productosFinitos.filter(
      (p) => p.stock !== null && p.limiteMinimo !== null && num(p.stock) <= num(p.limiteMinimo)
    );

    res.json({
      fecha: inicio.toISOString().slice(0, 10),
      ventasBrutas: +brutas.toFixed(2),
      anulaciones: +(num(anuladas._sum.montoDevuelto ?? 0)).toFixed(2),
      ventasNetas: +(brutas - num(anuladas._sum.montoDevuelto ?? 0)).toFixed(2),
      porMetodoPago: porMetodo,
      totalVentas: ventas.filter((v) => v.estado === "COMPLETADA").length,
      totalAnuladas: ventas.filter((v) => v.estado === "ANULADA").length,
      productosBajoMinimo: bajoMinimo.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        stock: num(p.stock),
        limiteMinimo: num(p.limiteMinimo),
      })),
    });
  })
);

router.get(
  "/historico",
  asyncHandler(async (req, res) => {
    const comercioId = tenantId(req);
    const resumenes = await prisma.resumenMensual.findMany({
      where: { comercioId },
      orderBy: [{ anio: "desc" }, { mes: "desc" }],
    });
    res.json(resumenes);
  })
);

router.post(
  "/consolidar",
  asyncHandler(async (req, res) => {
    const result = await consolidarVentasAntiguas();
    res.json(result);
  })
);

router.get(
  "/actividad-anual",
  asyncHandler(async (req, res) => {
    const comercioId = tenantId(req);
    const hoy = new Date();
    const haceUnAnio = new Date(hoy.getFullYear() - 1, hoy.getMonth(), hoy.getDate());

    const ventas = await prisma.venta.findMany({
      where: {
        comercioId,
        estado: "COMPLETADA",
        createdAt: { gte: haceUnAnio },
      },
      select: {
        total: true,
        createdAt: true,
      },
    });

    // Agrupar ventas por fecha YYYY-MM-DD local
    const agrupado: Record<string, number> = {};
    for (const v of ventas) {
      const date = new Date(v.createdAt);
      // Ajustar timezone a local para formatear YYYY-MM-DD
      const offset = date.getTimezoneOffset();
      const localDate = new Date(date.getTime() - offset * 60 * 1000);
      const key = localDate.toISOString().slice(0, 10);
      agrupado[key] = (agrupado[key] ?? 0) + num(v.total);
    }

    // Convertir a un formato plano ordenado
    const data = Object.entries(agrupado).map(([fecha, monto]) => ({
      fecha,
      monto: +monto.toFixed(2),
    }));

    res.json(data);
  })
);

export default router;
