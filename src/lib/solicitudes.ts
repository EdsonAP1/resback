import type { EstadoSolicitud, PlanRenovacion } from "@prisma/client";
import { prisma } from "../prisma.js";

export type Solicitud = {
  id: string;
  comercioId: string;
  comercioNombre: string;
  plan: PlanRenovacion;
  monto: number;
  comprobante?: string | null;
  estado: EstadoSolicitud;
  fecha: string;
};

function toDto(row: {
  id: string;
  comercioId: string;
  comercioNombre: string;
  plan: PlanRenovacion;
  monto: number;
  comprobante: string | null;
  estado: EstadoSolicitud;
  fecha: Date;
}): Solicitud {
  return {
    id: row.id,
    comercioId: row.comercioId,
    comercioNombre: row.comercioNombre,
    plan: row.plan,
    monto: row.monto,
    comprobante: row.comprobante,
    estado: row.estado,
    fecha: row.fecha.toISOString(),
  };
}

export async function getSolicitudes(): Promise<Solicitud[]> {
  const rows = await prisma.solicitudRenovacion.findMany({
    orderBy: { fecha: "desc" },
  });
  return rows.map(toDto);
}

export async function addSolicitud(
  s: Omit<Solicitud, "id" | "fecha" | "estado">
): Promise<Solicitud> {
  const creada = await prisma.solicitudRenovacion.create({
    data: {
      comercioId: s.comercioId,
      comercioNombre: s.comercioNombre,
      plan: s.plan,
      monto: s.monto,
      comprobante: s.comprobante ?? null,
    },
  });
  return toDto(creada);
}

export async function setSolicitudEstado(
  id: string,
  estado: EstadoSolicitud
): Promise<Solicitud | null> {
  const existe = await prisma.solicitudRenovacion.findUnique({ where: { id } });
  if (!existe) return null;
  const actualizada = await prisma.solicitudRenovacion.update({
    where: { id },
    data: { estado },
  });
  return toDto(actualizada);
}
