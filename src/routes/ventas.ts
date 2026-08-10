import { Router } from "express";
import type { MetodoPago, VentaEstado } from "@prisma/client";
import PDFDocument from "pdfkit";
import { prisma, num } from "../prisma.js";
import { asyncHandler, AppError } from "../lib/http.js";
import {
  checkMembresia,
  requireAuth,
  tenantId,
} from "../middleware/auth.js";
import { verificarAutoCierre } from "./cajas.js";

const router = Router();

router.use(requireAuth, checkMembresia);

const VALID_METODO: MetodoPago[] = ["EFECTIVO", "TARJETA", "QR", "TRANSFERENCIA", "OTRO"];

const NOMBRE_METODO: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA: "Tarjeta",
  QR: "QR Simple",
  TRANSFERENCIA: "Transferencia",
  OTRO: "Otro",
};

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const comercioId = tenantId(req);
    const body = req.body as {
      items?: { productoId: string; cantidad: number }[];
      metodoPago?: MetodoPago;
      clienteId?: string | null;
      clienteNombre?: string | null;
      clienteCarnet?: string | null;
    };
    const items = body.items;
    const metodoPago = body.metodoPago;
    let clienteId = body.clienteId ?? null;
    const clienteNombre = body.clienteNombre?.trim() || null;
    const clienteCarnet = body.clienteCarnet?.trim() || null;

    // Verificar si corresponde auto-cierre de caja por horario
    await verificarAutoCierre(comercioId, req.auth!.uid);

    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError(400, "El pedido debe contener al menos un artículo");
    }
    if (!metodoPago || !VALID_METODO.includes(metodoPago)) {
      throw new AppError(400, "Método de pago inválido");
    }
    if (items.some((i) => !i.productoId || num(i.cantidad) <= 0)) {
      throw new AppError(400, "Cada línea requiere producto y cantidad mayor a cero");
    }

    if (!clienteId && clienteCarnet) {
      const existente = await prisma.cliente.findFirst({
        where: { comercioId, carnet: clienteCarnet },
      });
      if (existente) {
        clienteId = existente.id;
      } else if (clienteNombre) {
        const nuevo = await prisma.cliente.create({
          data: {
            comercioId,
            nombre: clienteNombre,
            carnet: clienteCarnet,
          },
        });
        clienteId = nuevo.id;
      }
    } else if (clienteId) {
      const cliente = await prisma.cliente.findFirst({ where: { id: clienteId, comercioId } });
      if (!cliente) throw new AppError(404, "Cliente no encontrado");
    }

    const resultado = await prisma.$transaction(async (tx) => {
      const ids = [...new Set(items.map((i) => i.productoId))];

      const productos = await tx.$queryRaw<
        Array<{ id: string; nombre: string; precio: string; tipoStock: string; stock: string | null; permiteFracciones: boolean }>
      >`
        SELECT id, nombre, precio, "tipoStock", stock, "permiteFracciones"
        FROM productos
        WHERE "comercioId" = ${comercioId} AND id = ANY(${ids}) AND activo = true
        FOR UPDATE
      `;

      const porId = new Map(productos.map((p) => [p.id, p]));
      const detalle: { productoId: string; productoNombre: string; cantidad: number; precioUnitario: number; totalLinea: number }[] = [];
      const alertas: string[] = [];

      for (const item of items) {
        const prod = porId.get(item.productoId);
        if (!prod) throw new AppError(404, `Producto no encontrado: ${item.productoId}`);
        const cantidad = num(item.cantidad);

        if (prod.tipoStock === "FINITO") {
          const stock = num(prod.stock);
          const disponible = prod.permiteFracciones ? stock >= cantidad - 1e-9 : stock >= Math.ceil(cantidad) - 1e-9;
          if (cantidad % 1 !== 0 && !prod.permiteFracciones) {
            throw new AppError(400, `"${prod.nombre}" no admite cantidades fraccionadas`);
          }
          if (!disponible) {
            throw new AppError(
              409,
              `Existencias insuficientes para "${prod.nombre}": disponible ${stock}, solicitado ${cantidad}. El pedido no fue procesado`
            );
          }
        }

        const precioUnitario = num(prod.precio);
        const totalLinea = +(cantidad * precioUnitario).toFixed(2);
        detalle.push({
          productoId: prod.id,
          productoNombre: prod.nombre,
          cantidad,
          precioUnitario,
          totalLinea,
        });
      }

      const subtotal = +detalle.reduce((acc, d) => acc + d.totalLinea, 0).toFixed(2);
      const total = subtotal;

      const ultimo = await tx.venta.aggregate({
        where: { comercioId },
        _max: { numero: true },
      });
      const numero = (ultimo._max.numero ?? 0) + 1;

      const caja = await tx.caja.findFirst({
        where: { comercioId, estado: "ABIERTA" },
        orderBy: { abiertaAt: "desc" },
      });

      const ventaCreada = await tx.venta.create({
        data: {
          comercioId,
          numero,
          metodoPago,
          subtotal,
          total,
          vendedorId: req.auth!.uid,
          clienteId: clienteId ?? undefined,
          cajaId: caja?.id ?? null,
          detalles: {
            create: detalle,
          },
        },
      });

      for (const d of detalle) {
        const prod = porId.get(d.productoId)!;
        if (prod.tipoStock === "FINITO") {
          await tx.producto.update({
            where: { id: d.productoId },
            data: { stock: { decrement: d.cantidad } },
          });
          const nuevoStock = num(prod.stock) - d.cantidad;
          const limite = await tx.producto.findUnique({
            where: { id: d.productoId },
            select: { limiteMinimo: true },
          });
          if (limite?.limiteMinimo !== null && limite?.limiteMinimo !== undefined && nuevoStock <= num(limite.limiteMinimo)) {
            alertas.push(d.productoNombre);
          }
        }
      }

      if (caja && metodoPago === "EFECTIVO") {
        await tx.cajaMovimiento.create({
          data: {
            cajaId: caja.id,
            comercioId,
            tipo: "VENTA",
            concepto: `Venta #${numero}`,
            monto: total,
            usuarioId: req.auth!.uid,
            ventaId: ventaCreada.id,
          },
        });
      }

      return { venta: ventaCreada, alertas };
    });

    const { venta, alertas } = resultado;

    res.status(201).json({
      venta: {
        id: venta.id,
        numero: venta.numero,
        total: num(venta.total),
        metodoPago: venta.metodoPago,
        estado: venta.estado,
      },
      alertasReabastecimiento: alertas,
    });
  })
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const comercioId = tenantId(req);
    const desde = req.query.desde ? new Date(String(req.query.desde)) : null;
    const hasta = req.query.hasta ? new Date(String(req.query.hasta)) : null;

    const ventas = await prisma.venta.findMany({
      where: {
        comercioId,
        ...(desde || hasta
          ? {
              createdAt: {
                ...(desde ? { gte: desde } : {}),
                ...(hasta ? { lte: hasta } : {}),
              },
            }
          : {}),
      },
      include: {
        detalles: true,
        anulaciones: true,
        vendedor: { select: { nombre: true } },
        cliente: { select: { nombre: true, carnet: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    res.json(
      ventas.map((v) => ({
        id: v.id,
        numero: v.numero,
        estado: v.estado as VentaEstado,
        metodoPago: v.metodoPago,
        subtotal: num(v.subtotal),
        total: num(v.total),
        vendedor: v.vendedor.nombre,
        cliente: v.cliente ? `${v.cliente.nombre} (${v.cliente.carnet})` : "-",
        fecha: v.createdAt,
        anuladoEn: v.anulaciones.length > 0,
        lineas: v.detalles.length,
      }))
    );
  })
);

router.post(
  "/:id/anular",
  asyncHandler(async (req, res) => {
    const comercioId = tenantId(req);
    const { motivo } = req.body as { motivo?: string };
    const destinoGlobal = (req.body as { destino?: "STOCK" | "MERMA" }).destino ?? "STOCK";
    const itemsBody = (req.body as { items?: { productoId: string; cantidad: number; destino: "STOCK" | "MERMA" }[] })
      .items;

    if (!motivo || !motivo.trim()) {
      throw new AppError(400, "El motivo de la anulación es obligatorio");
    }

    const venta = await prisma.venta.findFirst({
      where: { id: String(req.params.id), comercioId },
      include: { detalles: true },
    });
    if (!venta) throw new AppError(404, "Venta no encontrada");
    if (venta.estado === "ANULADA") {
      throw new AppError(409, "Esta venta ya fue anulada completamente");
    }

    const anuladoPorLinea = new Map<string, number>();
    const previas = await prisma.anulacionDetalle.findMany({
      where: { anulacion: { ventaId: venta.id } },
      select: { productoId: true, cantidad: true },
    });
    for (const p of previas) {
      const k = p.productoId ?? "";
      anuladoPorLinea.set(k, (anuladoPorLinea.get(k) ?? 0) + num(p.cantidad));
    }

    const lineas = venta.detalles;
    const target =
      itemsBody && itemsBody.length > 0
        ? itemsBody
        : lineas.map((l) => ({
            productoId: l.productoId ?? "",
            cantidad: num(l.cantidad),
            destino: destinoGlobal,
          }));

    const porId = new Map(lineas.map((l) => [l.productoId ?? "", l]));
    let montoDevuelto = 0;
    let cubreTodo = true;
    const aProcesar: {
      productoId: string | null;
      productoNombre: string;
      cantidad: number;
      precioUnitario: number;
      destino: "STOCK" | "MERMA";
    }[] = [];

    for (const t of target) {
      const linea = porId.get(t.productoId);
      if (!linea) {
        throw new AppError(400, "La línea anulada no pertenece a esta venta");
      }
      const cantidad = num(t.cantidad);
      const ya = anuladoPorLinea.get(t.productoId) ?? 0;
      if (cantidad <= 0 || ya + cantidad > num(linea.cantidad) + 1e-9) {
        throw new AppError(
          400,
          `Cantidad a anular inválida para "${linea.productoNombre}" (ya anulado: ${ya}, original: ${num(linea.cantidad)})`
        );
      }
      anuladoPorLinea.set(t.productoId, ya + cantidad);
      if (ya + cantidad < num(linea.cantidad) - 1e-9) cubreTodo = false;
      const monto = +(cantidad * num(linea.precioUnitario)).toFixed(2);
      montoDevuelto += monto;
      aProcesar.push({
        productoId: linea.productoId,
        productoNombre: linea.productoNombre,
        cantidad,
        precioUnitario: num(linea.precioUnitario),
        destino: t.destino === "MERMA" ? "MERMA" : "STOCK",
      });
    }

    const resultado = await prisma.$transaction(async (tx) => {
      const anulacion = await tx.anulacion.create({
        data: {
          comercioId,
          ventaId: venta.id,
          tipo: cubreTodo ? "TOTAL" : "PARCIAL",
          motivo: motivo.trim(),
          montoDevuelto: +montoDevuelto.toFixed(2),
          usuarioId: req.auth!.uid,
          detalles: { create: aProcesar },
        },
      });

      for (const p of aProcesar) {
        if (p.destino === "STOCK" && p.productoId) {
          const prod = await tx.producto.findFirst({
            where: { id: p.productoId, comercioId },
          });
          if (prod && prod.tipoStock === "FINITO") {
            await tx.producto.update({
              where: { id: p.productoId },
              data: { stock: { increment: p.cantidad } },
            });
          }
        }
      }

      if (cubreTodo) {
        await tx.venta.update({
          where: { id: venta.id },
          data: { estado: "ANULADA" },
        });
      }

      if (venta.metodoPago === "EFECTIVO") {
        const caja = await tx.caja.findFirst({
          where: { comercioId, estado: "ABIERTA" },
          orderBy: { abiertaAt: "desc" },
        });
        if (caja) {
          await tx.cajaMovimiento.create({
            data: {
              cajaId: caja.id,
              comercioId,
              tipo: "ANULACION",
              concepto: `Anulación venta #${venta.numero}`,
              monto: -montoDevuelto,
              usuarioId: req.auth!.uid,
              ventaId: venta.id,
            },
          });
        }
      }

      return anulacion;
    });

    res.status(201).json({
      id: resultado.id,
      tipo: resultado.tipo,
      montoDevuelto: num(resultado.montoDevuelto),
      ventaNumero: venta.numero,
      ventaEstado: cubreTodo ? "ANULADA" : "COMPLETADA (anulación parcial)",
    });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const comercioId = tenantId(req);
    const venta = await prisma.venta.findFirst({
      where: { id: String(req.params.id), comercioId },
      include: {
        detalles: true,
        anulaciones: { include: { detalles: true, usuario: { select: { nombre: true } } } },
        cliente: { select: { nombre: true, carnet: true } },
        vendedor: { select: { nombre: true } },
      },
    });
    if (!venta) throw new AppError(404, "Venta no encontrada");

    res.json({
      id: venta.id,
      numero: venta.numero,
      estado: venta.estado,
      metodoPago: venta.metodoPago,
      subtotal: num(venta.subtotal),
      total: num(venta.total),
      fecha: venta.createdAt,
      vendedor: venta.vendedor.nombre,
      cliente: venta.cliente ? `${venta.cliente.nombre} (${venta.cliente.carnet})` : null,
      detalles: venta.detalles.map((d) => ({
        productoId: d.productoId,
        producto: d.productoNombre,
        cantidad: num(d.cantidad),
        precioUnitario: num(d.precioUnitario),
        totalLinea: num(d.totalLinea),
      })),
      anulaciones: venta.anulaciones.map((a) => ({
        id: a.id,
        tipo: a.tipo,
        motivo: a.motivo,
        montoDevuelto: num(a.montoDevuelto),
        usuario: a.usuario.nombre,
        fecha: a.createdAt,
        lineas: a.detalles.map((d) => ({
          producto: d.productoNombre,
          cantidad: num(d.cantidad),
          destino: d.destino,
        })),
      })),
    });
  })
);

router.get(
  "/:id/ticket",
  asyncHandler(async (req, res) => {
    const comercioId = tenantId(req);
    const venta = await prisma.venta.findFirst({
      where: { id: String(req.params.id), comercioId },
      include: {
        detalles: true,
        cliente: true,
        comercio: { select: { nombre: true, rubro: true, nit: true, contacto: true } },
      },
    });
    if (!venta) throw new AppError(404, "Venta no encontrada");

    const W = 226;
    const baseH = 180 + (venta.cliente ? 25 : 0);
    const H = Math.max(260, baseH + venta.detalles.length * 22);
    const doc = new PDFDocument({ size: [W, H], margin: 12 });
    doc.font("Helvetica");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="ticket-${venta.numero}.pdf"`);
    doc.pipe(res);

    const linea = () => {
      const y = doc.y;
      doc.moveTo(12, y).dash(1.5, { space: 2.5 }).lineTo(W - 12, y).stroke();
      doc.undash();
    };

    doc.fontSize(13).font("Helvetica-Bold").text(venta.comercio.nombre, { align: "center", width: W - 24 });
    if (venta.comercio.rubro) doc.font("Helvetica").fontSize(8).text(venta.comercio.rubro, { align: "center", width: W - 24 });
    if (venta.comercio.nit) doc.font("Helvetica").fontSize(8).text(`NIT: ${venta.comercio.nit}`, { align: "center", width: W - 24 });
    if (venta.comercio.contacto) doc.font("Helvetica").fontSize(7.5).text(venta.comercio.contacto, { align: "center", width: W - 24 });
    doc.moveDown(0.4);
    linea();
    doc.moveDown(0.3);

    doc.font("Helvetica").fontSize(8);
    doc.text(`TICKET N° ${venta.numero}`, { continued: false, width: W - 24 });
    doc.text(
      new Date(venta.createdAt).toLocaleString("es-BO", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
      })
    );
    if (venta.cliente) {
      doc.text(`Cliente: ${venta.cliente.nombre}`);
      doc.text(`Carnet: ${venta.cliente.carnet}`);
    }
    doc.moveDown(0.3);
    linea();
    doc.moveDown(0.3);

    const tableY = doc.y;
    doc.font("Helvetica-Bold").fontSize(7.5);
    doc.text("ITEM", 12, tableY, { width: 100 });
    doc.text("CANT x P.U.", 115, tableY, { width: 55, align: "right" });
    doc.text("TOTAL", 170, tableY, { width: 44, align: "right" });
    doc.moveDown(0.2);

    doc.font("Helvetica").fontSize(7.5);
    for (const d of venta.detalles) {
      const nombre = d.productoNombre.slice(0, 18);
      const cant = `${num(d.cantidad)}`;
      const pu = `${num(d.precioUnitario).toFixed(2)}`;
      const tot = `${num(d.totalLinea).toFixed(2)}`;
      
      const itemY = doc.y;
      doc.text(nombre, 12, itemY, { width: 100 });
      doc.text(`${cant} x ${pu}`, 115, itemY, { width: 55, align: "right" });
      doc.text(tot, 170, itemY, { width: 44, align: "right" });
      doc.moveDown(0.15);
    }

    doc.moveDown(0.3);
    linea();
    doc.moveDown(0.3);
    doc.font("Helvetica-Bold").fontSize(10).text(
      `TOTAL: Bs ${num(venta.total).toFixed(2)}`,
      { align: "right", width: W - 24 }
    );
    doc.font("Helvetica").fontSize(8).text(
      `Pago: ${NOMBRE_METODO[venta.metodoPago] ?? venta.metodoPago}`,
      { width: W - 24 }
    );
    doc.moveDown(0.4);
    doc.fontSize(8).text("Gracias por su compra", { align: "center", width: W - 24 });

    doc.end();
  })
);

export default router;
