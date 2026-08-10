import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  return Number(v);
}
