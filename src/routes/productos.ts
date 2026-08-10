import { Router } from "express";
import type { TipoStock } from "@prisma/client";
import { prisma, num } from "../prisma.js";
import { asyncHandler, AppError } from "../lib/http.js";
import {
  checkMembresia,
  requireAuth,
  requireComercio,
  tenantId,
} from "../middleware/auth.js";

const router = Router();

router.use(requireAuth, checkMembresia);

const VALID_TIPO_STOCK: TipoStock[] = ["FINITO", "INFINITO"];

function validarProducto(body: Record<string, unknown>, parcial = false) {
  const errores: string[] = [];
  const datos: {
    nombre?: string;
    descripcion?: string | null;
    precio?: number;
    tipoStock?: TipoStock;
    stock?: number | null;
    permiteFracciones?: boolean;
    limiteMinimo?: number | null;
  } = {};

  if (body.nombre !== undefined || !parcial) {
    if (typeof body.nombre !== "string" || !body.nombre.trim()) {
      errores.push("El nombre es obligatorio");
    } else datos.nombre = body.nombre.trim();
  }

  if (body.descripcion !== undefined) {
    datos.descripcion = body.descripcion ? String(body.descripcion) : null;
  }

  if (body.precio !== undefined || !parcial) {
    const precio = num(body.precio);
    if (precio <= 0) errores.push("El precio debe ser mayor a cero");
    else datos.precio = precio;
  }

  if (body.tipoStock !== undefined || !parcial) {
    if (!VALID_TIPO_STOCK.includes(body.tipoStock as TipoStock)) {
      errores.push("tipoStock debe ser FINITO o INFINITO");
    } else datos.tipoStock = body.tipoStock as TipoStock;
  }

  const tipoStock = datos.tipoStock ?? (body.tipoStock as TipoStock | undefined);

  if (body.stock !== undefined && body.stock !== null && body.stock !== "") {
    if (tipoStock === "INFINITO") {
      datos.stock = null;
    } else {
      const stock = num(body.stock);
      if (stock < 0) errores.push("El stock no puede ser negativo");
      else datos.stock = stock;
    }
  } else {
    datos.stock = null;
  }

  if (body.permiteFracciones !== undefined) {
    datos.permiteFracciones = Boolean(body.permiteFracciones);
  }

  if (body.limiteMinimo !== undefined) {
    datos.limiteMinimo = body.limiteMinimo === null || body.limiteMinimo === "" ? null : num(body.limiteMinimo);
    if (datos.limiteMinimo !== null && (datos.limiteMinimo as number) < 0) {
      errores.push("El límite mínimo no puede ser negativo");
    }
  }

  return { datos, errores };
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const comercioId = tenantId(req);
    const soloAlertas = req.query.alertas === "true";
    const termino = req.query.q ? String(req.query.q).trim() : null;

    const productos = await prisma.producto.findMany({
      where: {
        comercioId,
        activo: true,
        ...(termino ? { nombre: { contains: termino, mode: "insensitive" } } : {}),
        ...(soloAlertas
          ? {
              tipoStock: "FINITO",
              stock: { not: null, lte: undefined },
            }
          : {}),
      },
      orderBy: { nombre: "asc" },
    });

    let lista = productos.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion,
      precio: num(p.precio),
      tipoStock: p.tipoStock,
      stock: p.stock === null ? null : num(p.stock),
      permiteFracciones: p.permiteFracciones,
      limiteMinimo: p.limiteMinimo === null ? null : num(p.limiteMinimo),
      activo: p.activo,
      bajoMinimo: p.tipoStock === "FINITO" && p.stock !== null && p.limiteMinimo !== null && num(p.stock) <= num(p.limiteMinimo),
    }));

    if (soloAlertas) {
      lista = lista.filter((p) => p.bajoMinimo);
    }

    res.json(lista);
  })
);

router.post(
  "/",
  requireComercio,
  asyncHandler(async (req, res) => {
    const comercioId = tenantId(req);
    const { datos, errores } = validarProducto(req.body);
    if (errores.length) throw new AppError(400, errores.join(". "));

    const producto = await prisma.producto.create({
      data: {
        comercioId,
        ...datos,
      } as never,
    });

    res.status(201).json({ id: producto.id, nombre: producto.nombre });
  })
);

router.put(
  "/:id",
  requireComercio,
  asyncHandler(async (req, res) => {
    const comercioId = tenantId(req);
    const { datos, errores } = validarProducto(req.body, true);
    if (errores.length) throw new AppError(400, errores.join(". "));

    const idProducto = String(req.params.id);

    const actual = await prisma.producto.findFirst({
      where: { id: idProducto, comercioId },
    });
    if (!actual) throw new AppError(404, "Producto no encontrado");

    const producto = await prisma.producto.update({
      where: { id: actual.id },
      data: datos as never,
    });

    res.json({ id: producto.id, nombre: producto.nombre });
  })
);

router.delete(
  "/:id",
  requireComercio,
  asyncHandler(async (req, res) => {
    const comercioId = tenantId(req);
    const idProducto = String(req.params.id);
    const actual = await prisma.producto.findFirst({
      where: { id: idProducto, comercioId },
    });
    if (!actual) throw new AppError(404, "Producto no encontrado");

    await prisma.producto.update({
      where: { id: actual.id },
      data: { activo: false },
    });
    res.json({ ok: true });
  })
);

export default router;
