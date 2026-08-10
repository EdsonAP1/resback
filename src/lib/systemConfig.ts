import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = path.join(__dirname, "../../data/system_config.json");

export type SystemConfig = {
  precioMensual: number;
  precioSemestral: number;
  precioAnual: number;
  qrMensual: string;
  qrSemestral: string;
  qrAnual: string;
};

const DEFAULT_CONFIG: SystemConfig = {
  precioMensual: 100,
  precioSemestral: 540,
  precioAnual: 960,
  qrMensual: "https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=PagoRestoStockMensual",
  qrSemestral: "https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=PagoRestoStockSemestral",
  qrAnual: "https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=PagoRestoStockAnual",
};

export function getSystemConfig(): SystemConfig {
  try {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(CONFIG_PATH)) {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf8");
      return DEFAULT_CONFIG;
    }
    const data = fs.readFileSync(CONFIG_PATH, "utf8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
  } catch (e) {
    return DEFAULT_CONFIG;
  }
}

export function saveSystemConfig(config: Partial<SystemConfig>): SystemConfig {
  const current = getSystemConfig();
  const updated = { ...current, ...config };
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), "utf8");
  return updated;
}
