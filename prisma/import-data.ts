import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "../data");

const prisma = new PrismaClient();

async function importarConfig() {
  const file = path.join(DATA_DIR, "system_config.json");
  if (!fs.existsSync(file)) {
    console.log("[import] system_config.json no existe, se omite");
    return;
  }
  const config = JSON.parse(fs.readFileSync(file, "utf8"));
  const { precioMensual, precioSemestral, precioAnual, qrMensual, qrSemestral, qrAnual } = config;
  const datos = {
    precioMensual: Number(precioMensual) || 100,
    precioSemestral: Number(precioSemestral) || 540,
    precioAnual: Number(precioAnual) || 960,
    qrMensual: qrMensual || null,
    qrSemestral: qrSemestral || null,
    qrAnual: qrAnual || null,
  };
  await prisma.sistemaConfig.upsert({
    where: { id: "global" },
    update: datos,
    create: { id: "global", ...datos },
  });
  console.log("[import] system_config.json -> sistema_configs OK");
}

async function importarSolicitudes() {
  const file = path.join(DATA_DIR, "solicitudes_renovacion.json");
  if (!fs.existsSync(file)) {
    console.log("[import] solicitudes_renovacion.json no existe, se omite");
    return;
  }
  const lista = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(lista) || lista.length === 0) {
    console.log("[import] no hay solicitudes que importar");
    return;
  }

  const idsExistentes = new Set(
    (await prisma.solicitudRenovacion.findMany({ select: { id: true } })).map((s) => s.id)
  );

  let importadas = 0;
  let omitidas = 0;
  for (const s of lista) {
    if (!s || !s.comercioId || !s.plan) {
      omitidas++;
      continue;
    }
    if (idsExistentes.has(s.id)) {
      omitidas++;
      continue;
    }
    const comercio = await prisma.comercio.findUnique({ where: { id: s.comercioId } });
    if (!comercio) {
      console.log(`[import] se omite solicitud ${s.id}: comercio ${s.comercioId} no existe en la BD`);
      omitidas++;
      continue;
    }
    const plan = String(s.plan).toUpperCase();
    if (!["MENSUAL", "SEMESTRAL", "ANUAL"].includes(plan)) {
      omitidas++;
      continue;
    }
    const estado = ["PENDIENTE", "APROBADA", "RECHAZADA"].includes(String(s.estado))
      ? String(s.estado)
      : "PENDIENTE";
    await prisma.solicitudRenovacion.create({
      data: {
        id: String(s.id),
        comercioId: String(s.comercioId),
        comercioNombre: String(s.comercioNombre ?? comercio.nombre),
        plan: plan as "MENSUAL" | "SEMESTRAL" | "ANUAL",
        monto: Number(s.monto) || 0,
        comprobante: s.comprobante ? String(s.comprobante) : null,
        estado: estado as "PENDIENTE" | "APROBADA" | "RECHAZADA",
        fecha: s.fecha ? new Date(String(s.fecha)) : new Date(),
      },
    });
    importadas++;
  }
  console.log(`[import] solicitudes_renovacion.json -> solicitudes_renovacion OK (importadas: ${importadas}, omitidas: ${omitidas})`);
}

async function main() {
  await importarConfig();
  await importarSolicitudes();
  console.log("[import] terminado");
}

main()
  .catch((e) => {
    console.error("[import] error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
