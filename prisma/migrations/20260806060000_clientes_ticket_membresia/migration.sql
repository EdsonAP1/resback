-- Clientes, NIT, membresía con vencimiento y venta con cliente

CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "comercioId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "carnet" TEXT NOT NULL,
    "telefono" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "clientes_comercioId_carnet_key" ON "clientes"("comercioId", "carnet");
CREATE INDEX "clientes_comercioId_idx" ON "clientes"("comercioId");

ALTER TABLE "clientes" ADD CONSTRAINT "clientes_comercioId_fkey"
    FOREIGN KEY ("comercioId") REFERENCES "comercios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "comercios" ADD COLUMN "nit" TEXT;
ALTER TABLE "comercios" ADD COLUMN "membresiaHasta" TIMESTAMP(3);

ALTER TABLE "ventas" ADD COLUMN "clienteId" TEXT;
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_clienteId_fkey"
    FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
