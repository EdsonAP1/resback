import { defineConfig } from "vitest/config";

const TEST_DATABASE_URL =
  "postgresql://restostock:restostock@localhost:5432/restostock_test?schema=public";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_SECRET: "test_secret_no_real",
      JWT_EXPIRES_IN: "1h",
      ALLOWED_ORIGINS: "http://localhost:3000",
    },
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
