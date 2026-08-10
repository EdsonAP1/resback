import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEST_DATABASE_URL =
  "postgresql://restostock:restostock@localhost:5432/restostock_test?schema=public";
const DB_NAME = "restostock_test";
const CONTAINER = "restostock_db";

function dbExists(): boolean {
  try {
    const out = execSync(
      `docker exec ${CONTAINER} psql -U restostock -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'"`,
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );
    return out.trim() === "1";
  } catch {
    return false;
  }
}

export default function globalSetup() {
  console.log("[global-setup] Preparando base de datos de pruebas...");
  if (!dbExists()) {
    execSync(
      `docker exec ${CONTAINER} psql -U restostock -d postgres -c "CREATE DATABASE ${DB_NAME}"`,
      { stdio: "inherit" }
    );
    console.log(`[global-setup] Base ${DB_NAME} creada`);
  }
  execSync("npx prisma migrate deploy", {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "inherit",
  });
  console.log("[global-setup] Migraciones aplicadas en la BD de pruebas");
}
