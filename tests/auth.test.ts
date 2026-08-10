import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeApp, request, crearComercioYUsuario, crearSuperAdmin, limpiarComercio, limpiarUsuario, type Fixture } from "./helpers.js";

const app = makeApp();
let fx: Fixture;
let adminEmail = "";
let adminPassword = "";

beforeAll(async () => {
  fx = await crearComercioYUsuario();
  const admin = await crearSuperAdmin();
  adminEmail = admin.email;
  adminPassword = admin.password;
});

afterAll(async () => {
  await limpiarComercio(fx.comercioId);
  await limpiarUsuario(adminEmail);
});

describe("POST /api/v1/auth/login", () => {
  it("inicia sesión con credenciales válidas", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: fx.email, password: fx.password });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.usuario.rol).toBe("COMERCIO");
  });

  it("rechaza contraseña incorrecta con error estructurado", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: fx.email, password: "incorrecta" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
    expect(res.body.error.message).toBeTruthy();
  });

  it("rechaza body incompleto", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({ email: fx.email });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
  });
});

describe("GET /api/v1/auth/me", () => {
  it("devuelve el usuario con su comercio", async () => {
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${fx.token}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(fx.email);
    expect(res.body.comercio.id).toBe(fx.comercioId);
  });

  it("rechaza sin token", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rechaza token inválido", async () => {
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer token-invalido");
    expect(res.status).toBe(401);
  });
});

describe("Roles", () => {
  it("permite login de SUPER_ADMIN", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: adminEmail, password: adminPassword });
    expect(res.status).toBe(200);
    expect(res.body.usuario.rol).toBe("SUPER_ADMIN");
  });
});
