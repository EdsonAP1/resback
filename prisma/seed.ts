import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

if (process.env.NODE_ENV === "production") {
  console.error("[seed] Bloqueado: el seed de datos demo está prohibido en producción.");
  process.exit(1);
}

const prisma = new PrismaClient();

function mas30Dias(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d;
}

async function main() {
  const admin = await prisma.usuario.upsert({
    where: { email: "admin@restostock.bo" },
    update: {},
    create: {
      nombre: "Super Administrador",
      email: "admin@restostock.bo",
      password: await bcrypt.hash("Admin123!", 10),
      rol: "SUPER_ADMIN",
    },
  });
  console.log("SuperAdmin OK:", admin.email);

  const comercio1 = await prisma.comercio.upsert({
    where: { id: "cm_demo_salteneria" },
    update: {},
    create: {
      id: "cm_demo_salteneria",
      nombre: "Salteñería Doña Rosa",
      rubro: "Salteñería",
      contacto: "ventas@donarosa.bo | +591 700 12345",
      membresia: "MENSUAL",
      membresiaHasta: mas30Dias(),
      nit: "1025487021",
      config: { create: { moneda: "BOB" } },
    },
  });
  console.log("Comercio OK:", comercio1.nombre);

  await prisma.usuario.upsert({
    where: { email: "usuario@donarosa.bo" },
    update: {},
    create: {
      comercioId: comercio1.id,
      nombre: "Rosa Mamani",
      email: "usuario@donarosa.bo",
      password: await bcrypt.hash("Usuario123!", 10),
      rol: "COMERCIO",
    },
  });
  console.log("Usuario del comercio OK");

  const productos1 = [
    { nombre: "Salteña de Pollo", precio: 7.5, stock: 60, permiteFracciones: false, limiteMinimo: 20, descripcion: "Con oliva, papa y huevo" },
    { nombre: "Salteña de Carne", precio: 8.0, stock: 55, permiteFracciones: false, limiteMinimo: 20 },
    { nombre: "Salteña Frita", precio: 8.5, stock: 40, permiteFracciones: false, limiteMinimo: 15 },
    { nombre: "Empanada de Queso", precio: 5.0, stock: 80, permiteFracciones: false, limiteMinimo: 25 },
    { nombre: "Jugo de Maracuyá", precio: 6.0, stock: 45, permiteFracciones: false, limiteMinimo: 15 },
    { nombre: "Llajwa (extra picante)", precio: 0, stock: null, permiteFracciones: false, limiteMinimo: null, tipoStock: "INFINITO" },
    { nombre: "Gaseosa 500ml", precio: 7.0, stock: 70, permiteFracciones: false, limiteMinimo: 20 },
  ];

  for (const p of productos1) {
    await prisma.producto.create({
      data: {
        comercioId: comercio1.id,
        nombre: p.nombre,
        descripcion: p.descripcion ?? null,
        precio: p.precio,
        tipoStock: p.tipoStock ?? "FINITO",
        stock: p.stock,
        permiteFracciones: p.permiteFracciones,
        limiteMinimo: p.limiteMinimo,
      },
    });
  }
  console.log("Productos Doña Rosa OK");

  await prisma.cliente.createMany({
    data: [
      { comercioId: comercio1.id, nombre: "María Condori", carnet: "5834123", telefono: "+591 701 22331" },
      { comercioId: comercio1.id, nombre: "Juan Mamani", carnet: "7022118" },
      { comercioId: comercio1.id, nombre: "Ana Flores", carnet: "4455092", telefono: "+591 712 55678" },
    ],
  });
  console.log("Clientes Doña Rosa OK");

  const comercio2 = await prisma.comercio.upsert({
    where: { id: "cm_demo_pollerias" },
    update: {},
    create: {
      id: "cm_demo_pollerias",
      nombre: "Pollo a la Spiedo Don Ernesto",
      rubro: "Pollería",
      contacto: "pedidos@donernesto.bo | +591 720 98765",
      membresia: "ANUAL",
      membresiaHasta: mas30Dias(),
      config: { create: { moneda: "BOB" } },
    },
  });
  console.log("Comercio OK:", comercio2.nombre);

  await prisma.usuario.upsert({
    where: { email: "usuario@donernesto.bo" },
    update: {},
    create: {
      comercioId: comercio2.id,
      nombre: "Ernesto Quispe",
      email: "usuario@donernesto.bo",
      password: await bcrypt.hash("Usuario123!", 10),
      rol: "COMERCIO",
    },
  });

  const productos2 = [
    { nombre: "Pollo Entero a la Spiedo", precio: 45.0, stock: 20, permiteFracciones: false, limiteMinimo: 6 },
    { nombre: "Medio Pollo", precio: 24.0, stock: 35, permiteFracciones: false, limiteMinimo: 10 },
    { nombre: "Cuarto de Pollo", precio: 12.5, stock: 50, permiteFracciones: false, limiteMinimo: 15 },
    { nombre: "Papa Frita (porción)", precio: 6.0, stock: 90, permiteFracciones: false, limiteMinimo: 25 },
    { nombre: "Lomo a la Plancha (kg)", precio: 55.0, stock: 10.5, permiteFracciones: true, limiteMinimo: 4 },
    { nombre: "Llajwa", precio: 0, stock: null, permiteFracciones: false, limiteMinimo: null, tipoStock: "INFINITO" },
    { nombre: "Gaseosa 1L", precio: 9.0, stock: 45, permiteFracciones: false, limiteMinimo: 12 },
  ];

  for (const p of productos2) {
    await prisma.producto.create({
      data: {
        comercioId: comercio2.id,
        nombre: p.nombre,
        descripcion: p.descripcion ?? null,
        precio: p.precio,
        tipoStock: p.tipoStock ?? "FINITO",
        stock: p.stock,
        permiteFracciones: p.permiteFracciones,
        limiteMinimo: p.limiteMinimo,
      },
    });
  }
  console.log("Productos Don Ernesto OK");

  await prisma.cliente.createMany({
    data: [
      { comercioId: comercio2.id, nombre: "Pedro Choque", carnet: "6612304" },
      { comercioId: comercio2.id, nombre: "Lucía Quispe", carnet: "5178890", telefono: "+591 733 44112" },
    ],
  });
  console.log("Clientes Don Ernesto OK");

  console.log("\n=== CREDENCIALES DE PRUEBA ===");
  console.log("SuperAdmin     : admin@restostock.bo / Admin123!");
  console.log("Salteñería     : usuario@donarosa.bo / Usuario123!");
  console.log("Pollo Spiedo   : usuario@donernesto.bo / Usuario123!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
