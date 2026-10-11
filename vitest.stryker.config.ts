import { defineConfig } from "vitest/config";

// Minimal config for mutation testing: only the simulation tests, no Vite plugins.
export default defineConfig({
  test: {
    include: ["src/sim/**/*.test.ts"],
  },
});
