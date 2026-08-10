-- CreateEnum
CREATE TYPE "EstadoSolicitud" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "PlanRenovacion" AS ENUM ('MENSUAL', 'SEMESTRAL', 'ANUAL');

-- CreateTable
CREATE TABLE "sistema_configs" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "precioMensual" INTEGER NOT NULL DEFAULT 100,
    "precioSemestral" INTEGER NOT NULL DEFAULT 540,
    "precioAnual" INTEGER NOT NULL DEFAULT 960,
    "qrMensual" TEXT,
    "qrSemestral" TEXT,
    "qrAnual" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sistema_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitudes_renovacion" (
    "id" TEXT NOT NULL,
    "comercioId" TEXT NOT NULL,
    "comercioNombre" TEXT NOT NULL,
    "plan" "PlanRenovacion" NOT NULL,
    "monto" INTEGER NOT NULL,
    "comprobante" TEXT,
    "estado" "EstadoSolicitud" NOT NULL DEFAULT 'PENDIENTE',
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solicitudes_renovacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "solicitudes_renovacion_comercioId_idx" ON "solicitudes_renovacion"("comercioId");

-- AddForeignKey
ALTER TABLE "solicitudes_renovacion" ADD CONSTRAINT "solicitudes_renovacion_comercioId_fkey" FOREIGN KEY ("comercioId") REFERENCES "comercios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
