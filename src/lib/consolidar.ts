import { prisma, num } from "../prisma.js";

export async function consolidarVentasAntiguas() {
  const hoy = new Date();
  // El límite es el primer día de hace 2 meses.
  // Ej: si hoy es Agosto, hace 2 meses es Junio, y el límite es 1 de Junio.
  // Cualquier venta anterior a 1 de Junio (Mayo o anterior) se consolida.
  const limite = new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1);

  // Obtener los grupos de comercio, año y mes que tienen ventas anteriores al límite
  const grupos: { comercioId: string; anio: number; mes: number }[] = await prisma.$queryRaw`
    SELECT "comercioId", 
           EXTRACT(YEAR FROM "createdAt")::int as anio, 
           EXTRACT(MONTH FROM "createdAt")::int as mes
    FROM ventas
    WHERE "createdAt" < ${limite}
    GROUP BY "comercioId", anio, mes
    ORDER BY "comercioId", anio, mes
  `;

  let consolidadosCount = 0;

  for (const g of grupos) {
    const { comercioId, anio, mes } = g;

    // Rango de fechas del mes a consolidar
    const inicioMes = new Date(anio, mes - 1, 1);
    const finMes = new Date(anio, mes, 1); // Primer día del mes siguiente

    // 1. Obtener todas las ventas del comercio en ese mes
    const ventas = await prisma.venta.findMany({
      where: {
        comercioId,
        createdAt: { gte: inicioMes, lt: finMes },
      },
      select: {
        total: true,
        estado: true,
        metodoPago: true,
      },
    });

    if (ventas.length === 0) continue;

    // 2. Calcular ventas brutas y conteos
    const completadas = ventas.filter((v) => v.estado === "COMPLETADA");
    const ventasBrutas = completadas.reduce((acc, v) => acc + num(v.total), 0);
    const totalVentas = completadas.length;
    const totalAnuladas = ventas.filter((v) => v.estado === "ANULADA").length;

    // 3. Calcular montos por método de pago
    const porMetodoPago: Record<string, number> = {};
    for (const v of completadas) {
      porMetodoPago[v.metodoPago] = (porMetodoPago[v.metodoPago] ?? 0) + num(v.total);
    }

    // 4. Calcular total de devoluciones por anulaciones en ese mes
    const agregadosAnulaciones = await prisma.anulacion.aggregate({
      where: {
        comercioId,
        createdAt: { gte: inicioMes, lt: finMes },
      },
      _sum: {
        montoDevuelto: true,
      },
    });
    const montoAnulado = num(agregadosAnulaciones._sum.montoDevuelto ?? 0);
    const ventasNetas = ventasBrutas - montoAnulado;

    // 5. Guardar en ResumenMensual usando upsert para evitar duplicados si se re-ejecuta
    await prisma.resumenMensual.upsert({
      where: {
        comercioId_anio_mes: {
          comercioId,
          anio,
          mes,
        },
      },
      create: {
        comercioId,
        anio,
        mes,
        ventasBrutas,
        anulaciones: montoAnulado,
        ventasNetas,
        totalVentas,
        totalAnuladas,
        porMetodoPago,
      },
      update: {
        ventasBrutas,
        anulaciones: montoAnulado,
        ventasNetas,
        totalVentas,
        totalAnuladas,
        porMetodoPago,
      },
    });

    // 6. Eliminar las ventas detalladas correspondientes
    // Esto disparará la eliminación en cascada de venta_detalles y anulaciones vinculadas.
    await prisma.venta.deleteMany({
      where: {
        comercioId,
        createdAt: { gte: inicioMes, lt: finMes },
      },
    });

    consolidadosCount++;
  }

  return {
    success: true,
    consolidados: consolidadosCount,
    fechaLimite: limite.toISOString().slice(0, 10),
  };
}
