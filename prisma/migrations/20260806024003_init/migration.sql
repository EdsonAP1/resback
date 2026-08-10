-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('SUPER_ADMIN', 'OWNER', 'EMPLEADO');

-- CreateEnum
CREATE TYPE "Membresia" AS ENUM ('ACTIVO', 'SUSPENDIDO', 'DEMO');

-- CreateEnum
CREATE TYPE "TipoStock" AS ENUM ('FINITO', 'INFINITO');

-- CreateEnum
CREATE TYPE "MetodoPago" AS ENUM ('EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'OTRO');

-- CreateEnum
CREATE TYPE "VentaEstado" AS ENUM ('COMPLETADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "TipoAnulacion" AS ENUM ('TOTAL', 'PARCIAL');

-- CreateEnum
CREATE TYPE "DestinoProducto" AS ENUM ('STOCK', 'MERMA');

-- CreateEnum
CREATE TYPE "CajaEstado" AS ENUM ('ABIERTA', 'CERRADA');

-- CreateEnum
CREATE TYPE "TipoMovimiento" AS ENUM ('VENTA', 'ANULACION', 'SALIDA_MANUAL');

-- CreateEnum
CREATE TYPE "ResultadoCierre" AS ENUM ('CUADRADA', 'FALTANTE', 'SOBRANTE');

-- CreateTable
CREATE TABLE "comercios" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rubro" TEXT NOT NULL,
    "contacto" TEXT,
    "membresia" "Membresia" NOT NULL DEFAULT 'DEMO',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comercios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comercio_configs" (
    "id" TEXT NOT NULL,
    "comercioId" TEXT NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'PEN',
    "horaApertura" TEXT,
    "horaCierre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comercio_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "comercioId" TEXT,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "rol" "Rol" NOT NULL DEFAULT 'EMPLEADO',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productos" (
    "id" TEXT NOT NULL,
    "comercioId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "precio" DECIMAL(10,2) NOT NULL,
    "tipoStock" "TipoStock" NOT NULL DEFAULT 'FINITO',
    "stock" DECIMAL(12,3),
    "permiteFracciones" BOOLEAN NOT NULL DEFAULT false,
    "limiteMinimo" DECIMAL(12,3),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "productos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventas" (
    "id" TEXT NOT NULL,
    "comercioId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "estado" "VentaEstado" NOT NULL DEFAULT 'COMPLETADA',
    "metodoPago" "MetodoPago" NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "cajaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ventas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venta_detalles" (
    "id" TEXT NOT NULL,
    "ventaId" TEXT NOT NULL,
    "productoId" TEXT,
    "productoNombre" TEXT NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "precioUnitario" DECIMAL(10,2) NOT NULL,
    "totalLinea" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "venta_detalles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anulaciones" (
    "id" TEXT NOT NULL,
    "comercioId" TEXT NOT NULL,
    "ventaId" TEXT NOT NULL,
    "tipo" "TipoAnulacion" NOT NULL,
    "motivo" TEXT NOT NULL,
    "montoDevuelto" DECIMAL(10,2) NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anulaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anulacion_detalles" (
    "id" TEXT NOT NULL,
    "anulacionId" TEXT NOT NULL,
    "productoId" TEXT,
    "productoNombre" TEXT NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "precioUnitario" DECIMAL(10,2) NOT NULL,
    "destino" "DestinoProducto" NOT NULL DEFAULT 'STOCK',

    CONSTRAINT "anulacion_detalles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cajas" (
    "id" TEXT NOT NULL,
    "comercioId" TEXT NOT NULL,
    "montoInicial" DECIMAL(10,2) NOT NULL,
    "estado" "CajaEstado" NOT NULL DEFAULT 'ABIERTA',
    "aperturaUsuarioId" TEXT NOT NULL,
    "abiertaAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerradaAt" TIMESTAMP(3),

    CONSTRAINT "cajas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caja_movimientos" (
    "id" TEXT NOT NULL,
    "cajaId" TEXT NOT NULL,
    "comercioId" TEXT NOT NULL,
    "tipo" "TipoMovimiento" NOT NULL,
    "concepto" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "ventaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "caja_movimientos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cierre_cajas" (
    "id" TEXT NOT NULL,
    "cajaId" TEXT NOT NULL,
    "comercioId" TEXT NOT NULL,
    "montoEsperado" DECIMAL(10,2) NOT NULL,
    "montoContado" DECIMAL(10,2) NOT NULL,
    "diferencia" DECIMAL(10,2) NOT NULL,
    "resultado" "ResultadoCierre" NOT NULL,
    "detalle" TEXT,
    "usuarioId" TEXT NOT NULL,
    "cerradoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cierre_cajas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "comercio_configs_comercioId_key" ON "comercio_configs"("comercioId");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "usuarios_comercioId_idx" ON "usuarios"("comercioId");

-- CreateIndex
CREATE INDEX "productos_comercioId_idx" ON "productos"("comercioId");

-- CreateIndex
CREATE INDEX "ventas_comercioId_idx" ON "ventas"("comercioId");

-- CreateIndex
CREATE UNIQUE INDEX "ventas_comercioId_numero_key" ON "ventas"("comercioId", "numero");

-- CreateIndex
CREATE INDEX "anulaciones_comercioId_idx" ON "anulaciones"("comercioId");

-- CreateIndex
CREATE INDEX "cajas_comercioId_idx" ON "cajas"("comercioId");

-- CreateIndex
CREATE INDEX "caja_movimientos_cajaId_idx" ON "caja_movimientos"("cajaId");

-- CreateIndex
CREATE UNIQUE INDEX "cierre_cajas_cajaId_key" ON "cierre_cajas"("cajaId");

-- CreateIndex
CREATE INDEX "cierre_cajas_comercioId_idx" ON "cierre_cajas"("comercioId");

-- AddForeignKey
ALTER TABLE "comercio_configs" ADD CONSTRAINT "comercio_configs_comercioId_fkey" FOREIGN KEY ("comercioId") REFERENCES "comercios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_comercioId_fkey" FOREIGN KEY ("comercioId") REFERENCES "comercios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_comercioId_fkey" FOREIGN KEY ("comercioId") REFERENCES "comercios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_comercioId_fkey" FOREIGN KEY ("comercioId") REFERENCES "comercios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_cajaId_fkey" FOREIGN KEY ("cajaId") REFERENCES "cajas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta_detalles" ADD CONSTRAINT "venta_detalles_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "ventas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta_detalles" ADD CONSTRAINT "venta_detalles_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anulaciones" ADD CONSTRAINT "anulaciones_comercioId_fkey" FOREIGN KEY ("comercioId") REFERENCES "comercios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anulaciones" ADD CONSTRAINT "anulaciones_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "ventas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anulaciones" ADD CONSTRAINT "anulaciones_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anulacion_detalles" ADD CONSTRAINT "anulacion_detalles_anulacionId_fkey" FOREIGN KEY ("anulacionId") REFERENCES "anulaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anulacion_detalles" ADD CONSTRAINT "anulacion_detalles_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cajas" ADD CONSTRAINT "cajas_comercioId_fkey" FOREIGN KEY ("comercioId") REFERENCES "comercios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cajas" ADD CONSTRAINT "cajas_aperturaUsuarioId_fkey" FOREIGN KEY ("aperturaUsuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caja_movimientos" ADD CONSTRAINT "caja_movimientos_cajaId_fkey" FOREIGN KEY ("cajaId") REFERENCES "cajas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caja_movimientos" ADD CONSTRAINT "caja_movimientos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cierre_cajas" ADD CONSTRAINT "cierre_cajas_cajaId_fkey" FOREIGN KEY ("cajaId") REFERENCES "cajas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cierre_cajas" ADD CONSTRAINT "cierre_cajas_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
