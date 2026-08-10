import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FILE_PATH = path.join(__dirname, "../../data/solicitudes_renovacion.json");

export type Solicitud = {
  id: string;
  comercioId: string;
  comercioNombre: string;
  plan: string;
  monto: number;
  comprobante?: string | null;
  estado: "PENDIENTE" | "APROBADA" | "RECHAZADA";
  fecha: string;
};

export function getSolicitudes(): Solicitud[] {
  try {
    const dir = path.dirname(FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(FILE_PATH)) {
      fs.writeFileSync(FILE_PATH, "[]", "utf8");
      return [];
    }
    const data = fs.readFileSync(FILE_PATH, "utf8");
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

export function saveSolicitudes(list: Solicitud[]) {
  const dir = path.dirname(FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(FILE_PATH, JSON.stringify(list, null, 2), "utf8");
}

export function addSolicitud(s: Omit<Solicitud, "id" | "fecha" | "estado">): Solicitud {
  const list = getSolicitudes();
  const nueva: Solicitud = {
    ...s,
    id: Math.random().toString(36).substring(2, 9).toUpperCase(),
    fecha: new Date().toISOString(),
    estado: "PENDIENTE",
  };
  list.unshift(nueva);
  saveSolicitudes(list);
  return nueva;
}
