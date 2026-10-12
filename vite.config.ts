import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["src/**/*.test.ts"],
    globals: false,
    // Coverage is measured for the simulation only, where a wrong number does not crash anything.
    coverage: {
      provider: "v8",
      include: ["src/sim/**"],
      exclude: ["src/sim/**/*.test.ts", "src/sim/test-support/**", "src/sim/data/**"],
      reporter: ["text-summary", "html"],
      // Two points under the values measured on 2026-10-12 without files of the original game, as in CI,
      // where the golden tests are skipped: statements 93.8, branches 80.35, functions 95, lines 94.66.
      // Raise them when coverage improves; never lower them to make a run pass.
      thresholds: { statements: 91, branches: 78, functions: 93, lines: 92 },
    },
  },
});
