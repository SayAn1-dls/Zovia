import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// Vite 8 resolves tsconfig "paths" natively, so "@/..." needs no extra plugin.
const resolve = { tsconfigPaths: true };

// Integration tests talk to the local Supabase stack: give them the same
// variables Next.js reads from .env / .env.local (process env still wins).
const integrationEnv = loadEnv("test", process.cwd(), [
  "NEXT_PUBLIC_",
  "SUPABASE_",
]);

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        resolve,
        test: {
          name: "unit",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}"],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
      {
        resolve,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          env: integrationEnv,
          testTimeout: 30_000,
          hookTimeout: 30_000,
          // All integration tests share one local database.
          fileParallelism: false,
        },
      },
    ],
  },
});
