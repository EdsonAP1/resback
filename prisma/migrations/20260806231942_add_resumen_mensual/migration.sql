-- CreateTable
CREATE TABLE "resumenes_mensuales" (
    "id" TEXT NOT NULL,
    "comercioId" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "ventasBrutas" DECIMAL(10,2) NOT NULL,
    "anulaciones" DECIMAL(10,2) NOT NULL,
    "ventasNetas" DECIMAL(10,2) NOT NULL,
    "totalVentas" INTEGER NOT NULL,
    "totalAnuladas" INTEGER NOT NULL,
    "porMetodoPago" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resumenes_mensuales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "resumenes_mensuales_comercioId_idx" ON "resumenes_mensuales"("comercioId");

-- CreateIndex
CREATE UNIQUE INDEX "resumenes_mensuales_comercioId_anio_mes_key" ON "resumenes_mensuales"("comercioId", "anio", "mes");

-- AddForeignKey
ALTER TABLE "resumenes_mensuales" ADD CONSTRAINT "resumenes_mensuales_comercioId_fkey" FOREIGN KEY ("comercioId") REFERENCES "comercios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
