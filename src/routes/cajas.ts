import { Router } from "express";
import PDFDocument from "pdfkit";
import { prisma, num } from "../prisma.js";
import { asyncHandler, AppError } from "../lib/http.js";
import {
  checkMembresia,
  requireAuth,
  tenantId,
} from "../middleware/auth.js";

const router = Router();

router.use(requireAuth, checkMembresia);

function calcularEsperado(movimientos: { tipo: string; monto: unknown }[], montoInicial: unknown): number {
  const suma = movimientos.reduce((acc, m) => acc + num(m.monto), 0);
  return +((num(montoInicial) + suma).toFixed(2));
}

export async function verificarAutoCierre(comercioId: string, userId: string): Promise<boolean> {
  const abierta = await prisma.caja.findFirst({
    where: { comercioId, estado: "ABIERTA" },
    include: { movimientos: true },
  });
  if (!abierta) return false;

  const config = await prisma.comercioConfig.findUnique({
    where: { comercioId },
  });
  if (!config || !config.horaCierre) return true;

  const now = new Date();
  const [closeH, closeM] = config.horaCierre.split(":").map(Number);
  const todayClose = new Date(now);
  todayClose.setHours(closeH, closeM, 0, 0);

  let limitDate = todayClose;
  if (now < todayClose) {
    limitDate = new Date(todayClose);
    limitDate.setDate(limitDate.getDate() - 1);
  }

  if (abierta.abiertaAt < limitDate) {
    // Expirado! Cerrar automáticamente
    const montoEsperado = calcularEsperado(abierta.movimientos, abierta.montoInicial);
    
    await prisma.$transaction(async (tx) => {
      await tx.cierreCaja.create({
        data: {
          cajaId: abierta.id,
          comercioId,
          montoEsperado,
          montoContado: montoEsperado, // Asume caja cuadrada
          diferencia: 0,
          resultado: "CUADRADA",
          detalle: "Cierre automático programado por horario del negocio",
          usuarioId: userId,
        },
      });
      await tx.caja.update({
        where: { id: abierta.id },
        data: { 
          estado: "CERRADA", 
          cerradaAt: limitDate 
        },
      });
    });
    return false; // Ya no está abierta
  }

  return true; // Sigue abierta
}

export async function purgarCierresAntiguos(comercioId: string) {
  try {
    const hoy = new Date();
    if (hoy.getDate() >= 15) {
      const inicioMesActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      
      const cajasAEliminar = await prisma.caja.findMany({
        where: {
          comercioId,
          estado: "CERRADA",
          cerradaAt: {
            lt: inicioMesActual,
          },
        },
        select: { id: true },
      });
      
      if (cajasAEliminar.length > 0) {
        const ids = cajasAEliminar.map((c) => c.id);
        await prisma.caja.deleteMany({
          where: {
            id: { in: ids },
          },
        });
      }
    }
  } catch (err) {
    console.error("Error al purgar cierres de caja antiguos:", err);
  }
}

router.post(
  "/abrir",
  asyncHandler(async (req, res) => {
    const comercioId = tenantId(req);
    const montoInicial = num((req.body as { montoInicial?: number }).montoInicial);
    if (montoInicial < 0) throw new AppError(400, "El monto inicial no puede ser negativo");

    const abierta = await prisma.caja.findFirst({
      where: { comercioId, estado: "ABIERTA" },
    });
    if (abierta) throw new AppError(409, "Ya existe una caja abierta para este comercio");

    const caja = await prisma.caja.create({
      data: {
        comercioId,
        montoInicial,
        aperturaUsuarioId: req.auth!.uid,
      },
    });

    res.status(201).json({
      id: caja.id,
      montoInicial: num(caja.montoInicial),
      estado: caja.estado,
      abiertaAt: caja.abiertaAt,
    });
  })
);

router.get(
  "/actual",
  asyncHandler(async (req, res) => {
    const comercioId = tenantId(req);
    const hasOpen = await verificarAutoCierre(comercioId, req.auth!.uid);
    if (!hasOpen) {
      res.json(null);
      return;
    }

    const caja = await prisma.caja.findFirst({
      where: { comercioId, estado: "ABIERTA" },
      include: {
        movimientos: {
          include: { usuario: { select: { nombre: true } } },
          orderBy: { createdAt: "asc" },
        },
        aperturaUsuario: { select: { nombre: true } },
      },
      orderBy: { abiertaAt: "desc" },
    });

    if (!caja) {
      res.json(null);
      return;
    }

    res.json({
      id: caja.id,
      montoInicial: num(caja.montoInicial),
      montoEsperadoActual: calcularEsperado(caja.movimientos, caja.montoInicial),
      abiertaAt: caja.abiertaAt,
      aperturaPor: caja.aperturaUsuario.nombre,
      movimientos: caja.movimientos.map((m) => ({
        id: m.id,
        tipo: m.tipo,
        concepto: m.concepto,
        monto: num(m.monto),
        usuario: m.usuario.nombre,
        fecha: m.createdAt,
      })),
    });
  })
);

router.post(
  "/salida",
  asyncHandler(async (req, res) => {
    const comercioId = tenantId(req);
    const { concepto } = req.body as { concepto?: string };
    const monto = num((req.body as { monto?: number }).monto);

    if (!concepto || !concepto.trim()) throw new AppError(400, "El concepto es obligatorio");
    if (monto <= 0) throw new AppError(400, "El monto de la salida debe ser mayor a cero");

    const caja = await prisma.caja.findFirst({
      where: { comercioId, estado: "ABIERTA" },
      orderBy: { abiertaAt: "desc" },
    });
    if (!caja) throw new AppError(409, "No hay una caja abierta. Abre la caja primero");

    const mov = await prisma.cajaMovimiento.create({
      data: {
        cajaId: caja.id,
        comercioId,
        tipo: "SALIDA_MANUAL",
        concepto: concepto.trim(),
        monto: -monto,
        usuarioId: req.auth!.uid,
      },
    });

    res.status(201).json({ id: mov.id, concepto: mov.concepto, monto: num(mov.monto) });
  })
);

router.post(
  "/cerrar",
  asyncHandler(async (req, res) => {
    const comercioId = tenantId(req);
    const montoContado = num((req.body as { montoContado?: number }).montoContado);
    const detalle = (req.body as { detalle?: string }).detalle;

    const caja = await prisma.caja.findFirst({
      where: { comercioId, estado: "ABIERTA" },
      include: { movimientos: true },
      orderBy: { abiertaAt: "desc" },
    });
    if (!caja) throw new AppError(409, "No hay una caja abierta para cerrar");

    const montoEsperado = calcularEsperado(caja.movimientos, caja.montoInicial);
    const diferencia = +(montoContado - montoEsperado).toFixed(2);
    const resultado =
      Math.abs(diferencia) < 0.005 ? "CUADRADA" : diferencia > 0 ? "SOBRANTE" : "FALTANTE";

    const cierre = await prisma.$transaction(async (tx) => {
      const cierreCreado = await tx.cierreCaja.create({
        data: {
          cajaId: caja.id,
          comercioId,
          montoEsperado,
          montoContado,
          diferencia: Math.abs(diferencia),
          resultado,
          detalle: detalle?.trim() || null,
          usuarioId: req.auth!.uid,
        },
      });
      await tx.caja.update({
        where: { id: caja.id },
        data: { estado: "CERRADA", cerradaAt: new Date() },
      });
      return cierreCreado;
    });

    res.status(201).json({
      id: cierre.id,
      montoEsperado: num(cierre.montoEsperado),
      montoContado: num(cierre.montoContado),
      diferencia: num(cierre.diferencia),
      resultado: cierre.resultado,
      cerradoAt: cierre.cerradoAt,
    });
  })
);

router.get(
  "/historial",
  requireAuth,
  asyncHandler(async (req, res) => {
    const comercioId = tenantId(req);
    await purgarCierresAntiguos(comercioId);

    const cierres = await prisma.cierreCaja.findMany({
      where: { comercioId },
      include: { usuario: { select: { nombre: true } } },
      orderBy: { cerradoAt: "desc" },
      take: 90,
    });

    res.json(
      cierres.map((c) => ({
        id: c.id,
        montoEsperado: num(c.montoEsperado),
        montoContado: num(c.montoContado),
        diferencia: num(c.diferencia),
        resultado: c.resultado,
        cerradoPor: c.usuario.nombre,
        cerradoAt: c.cerradoAt,
      }))
    );
  })
);

router.get(
  "/reporte-pdf",
  requireAuth,
  asyncHandler(async (req, res) => {
    const comercioId = tenantId(req);
    const queryDesde = req.query.desde ? String(req.query.desde) : null;
    const queryHasta = req.query.hasta ? String(req.query.hasta) : null;

    let dateDesde = queryDesde ? new Date(queryDesde) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    let dateHasta = queryHasta ? new Date(queryHasta) : new Date();

    // Asegurarse de que cubra todo el día hasta las 23:59:59 si solo se envió fecha
    if (queryHasta && queryHasta.length <= 10) {
      dateHasta.setHours(23, 59, 59, 999);
    }
    if (queryDesde && queryDesde.length <= 10) {
      dateDesde.setHours(0, 0, 0, 0);
    }

    // Obtener los arqueos y la información del comercio
    const [comercio, cierres] = await Promise.all([
      prisma.comercio.findUnique({
        where: { id: comercioId },
        select: { nombre: true, nit: true, rubro: true, contacto: true },
      }),
      prisma.cierreCaja.findMany({
        where: {
          comercioId,
          cerradoAt: { gte: dateDesde, lte: dateHasta },
        },
        include: {
          usuario: { select: { nombre: true } },
          caja: { select: { montoInicial: true } },
        },
        orderBy: { cerradoAt: "asc" },
      }),
    ]);

    if (!comercio) throw new AppError(404, "Comercio no encontrado");

    // Configurar PDF
    const doc = new PDFDocument({ size: "letter", margin: 36 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="reporte-cajas-${comercioId}.pdf"`);
    doc.pipe(res);

    // Dimensiones
    const W = 612; // 8.5" * 72 pt/in
    const pad = 36;
    const innerW = W - pad * 2;

    // Encabezado
    doc.font("Helvetica-Bold").fontSize(18).text(comercio.nombre, pad, pad);
    doc.font("Helvetica").fontSize(9).fillColor("#666666");
    if (comercio.rubro) doc.text(comercio.rubro);
    if (comercio.nit) doc.text(`NIT: ${comercio.nit}`);
    if (comercio.contacto) doc.text(comercio.contacto);
    doc.moveDown(0.8);

    doc.font("Helvetica-Bold").fontSize(13).fillColor("#000000").text("REPORTE HISTÓRICO DE ARQUEOS DE CAJA");
    doc.font("Helvetica").fontSize(9.5).fillColor("#333333").text(
      `Período: ${dateDesde.toLocaleDateString("es-BO")} al ${dateHasta.toLocaleDateString("es-BO")}`
    );
    doc.moveDown(1);

    // Línea divisoria
    doc.moveTo(pad, doc.y).lineTo(W - pad, doc.y).strokeColor("#cccccc").lineWidth(0.5).stroke();
    doc.moveDown(1);

    if (cierres.length === 0) {
      doc.font("Helvetica-Oblique").fontSize(10).text("No se registraron arqueos de caja en este período.", { align: "center" });
    } else {
      // Totales agregados
      let totInicial = 0;
      let totEsperado = 0;
      let totContado = 0;
      let totDiferencia = 0;
      let conFaltantes = 0;
      let conSobrantes = 0;

      for (const c of cierres) {
        const ini = num(c.caja?.montoInicial ?? 0);
        totInicial += ini;
        totEsperado += num(c.montoEsperado);
        totContado += num(c.montoContado);
        const dif = num(c.montoContado) - num(c.montoEsperado);
        totDiferencia += dif;

        if (c.resultado === "FALTANTE") conFaltantes += Math.abs(dif);
        if (c.resultado === "SOBRANTE") conSobrantes += Math.abs(dif);
      }

      // Cuadros Resumen ejecutivo
      const summaryY = doc.y;
      doc.rect(pad, summaryY, 120, 50).fillAndStroke("#f8fafc", "#e2e8f0");
      doc.rect(pad + 135, summaryY, 120, 50).fillAndStroke("#f8fafc", "#e2e8f0");
      doc.rect(pad + 270, summaryY, 120, 50).fillAndStroke("#f8fafc", "#e2e8f0");
      doc.rect(pad + 405, summaryY, 135, 50).fillAndStroke("#f8fafc", "#e2e8f0");

      doc.fillColor("#475569").fontSize(7.5).font("Helvetica-Bold");
      doc.text("TOTAL ARQUEOS", pad + 10, summaryY + 10);
      doc.text("TOTAL ESPERADO", pad + 145, summaryY + 10);
      doc.text("TOTAL CONTADO", pad + 280, summaryY + 10);
      doc.text("DIFERENCIA CONSOLIDADA", pad + 415, summaryY + 10);

      doc.fillColor("#0f172a").fontSize(13).font("Helvetica-Bold");
      doc.text(`${cierres.length}`, pad + 10, summaryY + 24);
      doc.text(`Bs ${totEsperado.toFixed(2)}`, pad + 145, summaryY + 24);
      doc.text(`Bs ${totContado.toFixed(2)}`, pad + 280, summaryY + 24);

      const colorDif = Math.abs(totDiferencia) < 0.01 ? "#10b981" : totDiferencia > 0 ? "#eab308" : "#ef4444";
      doc.fillColor(colorDif);
      doc.text(
        `${totDiferencia >= 0 ? "+" : "−"} Bs ${Math.abs(totDiferencia).toFixed(2)}`,
        pad + 415,
        summaryY + 24
      );

      doc.moveDown(4.2);

      // Tabla de arqueos
      const tableY = doc.y;
      doc.fillColor("#ffffff").rect(pad, tableY, innerW, 18).fill("#1e293b");

      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(8);
      doc.text("FECHA / HORA", pad + 6, tableY + 5, { width: 110 });
      doc.text("FONDO INI.", pad + 120, tableY + 5, { width: 65, align: "right" });
      doc.text("M. ESPERADO", pad + 190, tableY + 5, { width: 70, align: "right" });
      doc.text("M. CONTADO", pad + 265, tableY + 5, { width: 70, align: "right" });
      doc.text("DIFERENCIA", pad + 340, tableY + 5, { width: 65, align: "right" });
      doc.text("ESTADO", pad + 415, tableY + 5, { width: 50, align: "center" });
      doc.text("CAJERO", pad + 470, tableY + 5, { width: 68 });

      doc.moveDown(0.2);

      let rowY = doc.y + 3;
      doc.font("Helvetica").fontSize(7.5).fillColor("#0f172a");

      for (let i = 0; i < cierres.length; i++) {
        const c = cierres[i];
        // Prevenir desborde de página
        if (rowY > 730) {
          doc.addPage();
          rowY = 36;
          // Redibujar cabecera de tabla
          doc.fillColor("#ffffff").rect(pad, rowY, innerW, 18).fill("#1e293b");
          doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(8);
          doc.text("FECHA / HORA", pad + 6, rowY + 5, { width: 110 });
          doc.text("FONDO INI.", pad + 120, rowY + 5, { width: 65, align: "right" });
          doc.text("M. ESPERADO", pad + 190, rowY + 5, { width: 70, align: "right" });
          doc.text("M. CONTADO", pad + 265, rowY + 5, { width: 70, align: "right" });
          doc.text("DIFERENCIA", pad + 340, rowY + 5, { width: 65, align: "right" });
          doc.text("ESTADO", pad + 415, rowY + 5, { width: 50, align: "center" });
          doc.text("CAJERO", pad + 470, rowY + 5, { width: 68 });
          rowY += 21;
          doc.font("Helvetica").fontSize(7.5).fillColor("#0f172a");
        }

        // Alternar color de fondo
        if (i % 2 === 1) {
          doc.fillColor("#f8fafc").rect(pad, rowY - 2, innerW, 15).fill();
        }

        const fec = new Date(c.cerradoAt).toLocaleString("es-BO");
        const ini = num(c.caja?.montoInicial ?? 0).toFixed(2);
        const esp = num(c.montoEsperado).toFixed(2);
        const con = num(c.montoContado).toFixed(2);
        const difVal = num(c.montoContado) - num(c.montoEsperado);
        const dif = `${difVal >= 0 ? "+" : "−"} Bs ${Math.abs(difVal).toFixed(2)}`;

        const colorText = c.resultado === "CUADRADA" ? "#10b981" : c.resultado === "SOBRANTE" ? "#d97706" : "#dc2626";

        doc.fillColor("#334155");
        doc.text(fec, pad + 6, rowY);
        doc.text(`Bs ${ini}`, pad + 120, rowY, { width: 65, align: "right" });
        doc.text(`Bs ${esp}`, pad + 190, rowY, { width: 70, align: "right" });
        doc.text(`Bs ${con}`, pad + 265, rowY, { width: 70, align: "right" });

        doc.fillColor(colorText);
        doc.text(dif, pad + 340, rowY, { width: 65, align: "right" });
        doc.text(
          c.resultado === "CUADRADA" ? "Cuadrada" : c.resultado === "SOBRANTE" ? "Sobrante" : "Faltante",
          pad + 415,
          rowY,
          { width: 50, align: "center" }
        );

        doc.fillColor("#334155");
        doc.text(c.usuario.nombre.slice(0, 14), pad + 470, rowY);

        rowY += 15;
      }
    }

    doc.end();
  })
);

export default router;
