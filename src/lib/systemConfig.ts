import { prisma } from "../prisma.js";

export type SystemConfig = {
  precioMensual: number;
  precioSemestral: number;
  precioAnual: number;
  qrMensual: string;
  qrSemestral: string;
  qrAnual: string;
};

const DEFAULTS: SystemConfig = {
  precioMensual: 100,
  precioSemestral: 540,
  precioAnual: 960,
  qrMensual: "https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=PagoRestoStockMensual",
  qrSemestral: "https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=PagoRestoStockSemestral",
  qrAnual: "https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=PagoRestoStockAnual",
};

export async function getSystemConfig(): Promise<SystemConfig> {
  const row = await prisma.sistemaConfig.findUnique({ where: { id: "global" } });
  if (!row) return DEFAULTS;
  return {
    precioMensual: row.precioMensual,
    precioSemestral: row.precioSemestral,
    precioAnual: row.precioAnual,
    qrMensual: row.qrMensual ?? DEFAULTS.qrMensual,
    qrSemestral: row.qrSemestral ?? DEFAULTS.qrSemestral,
    qrAnual: row.qrAnual ?? DEFAULTS.qrAnual,
  };
}

export async function saveSystemConfig(
  config: Partial<SystemConfig>
): Promise<SystemConfig> {
  const current = await getSystemConfig();
  const updated = { ...current, ...config };
  await prisma.sistemaConfig.upsert({
    where: { id: "global" },
    update: {
      precioMensual: updated.precioMensual,
      precioSemestral: updated.precioSemestral,
      precioAnual: updated.precioAnual,
      qrMensual: updated.qrMensual,
      qrSemestral: updated.qrSemestral,
      qrAnual: updated.qrAnual,
    },
    create: {
      id: "global",
      precioMensual: updated.precioMensual,
      precioSemestral: updated.precioSemestral,
      precioAnual: updated.precioAnual,
      qrMensual: updated.qrMensual,
      qrSemestral: updated.qrSemestral,
      qrAnual: updated.qrAnual,
    },
  });
  return updated;
}
