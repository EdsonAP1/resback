-- Roles y moneda Bolivia (tablas vacías en dev, sin pérdida de datos)

-- AlterEnum MetodoPago: agregar QR
ALTER TYPE "MetodoPago" ADD VALUE 'QR';

-- AlterEnum Rol: reconstruir con SUPER_ADMIN | COMERCIO
CREATE TYPE "Rol_new" AS ENUM ('SUPER_ADMIN', 'COMERCIO');
ALTER TABLE "usuarios" ALTER COLUMN "rol" DROP DEFAULT;
ALTER TABLE "usuarios" ALTER COLUMN "rol" TYPE "Rol_new" USING ("rol"::text::"Rol_new");
ALTER TYPE "Rol" RENAME TO "Rol_old";
ALTER TYPE "Rol_new" RENAME TO "Rol";
DROP TYPE "Rol_old";
ALTER TABLE "usuarios" ALTER COLUMN "rol" SET DEFAULT 'COMERCIO';

-- Moneda por defecto: BOB (Boliviano)
ALTER TABLE "comercio_configs" ALTER COLUMN "moneda" SET DEFAULT 'BOB';
