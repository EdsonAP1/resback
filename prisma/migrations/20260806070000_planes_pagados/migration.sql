-- Planes de membresía pagados: MENSUAL | SEMESTRAL | ANUAL | SUSPENDIDO

CREATE TYPE "Membresia_new" AS ENUM ('MENSUAL', 'SEMESTRAL', 'ANUAL', 'SUSPENDIDO');

ALTER TABLE "comercios" ALTER COLUMN "membresia" DROP DEFAULT;

ALTER TABLE "comercios" ALTER COLUMN "membresia" TYPE "Membresia_new" USING (
  CASE "membresia"::text
    WHEN 'ACTIVO' THEN 'MENSUAL'
    WHEN 'DEMO' THEN 'MENSUAL'
    WHEN 'SUSPENDIDO' THEN 'SUSPENDIDO'
    ELSE 'MENSUAL'
  END::"Membresia_new"
);

ALTER TYPE "Membresia" RENAME TO "Membresia_old";
ALTER TYPE "Membresia_new" RENAME TO "Membresia";
DROP TYPE "Membresia_old";

ALTER TABLE "comercios" ALTER COLUMN "membresia" SET DEFAULT 'MENSUAL';
