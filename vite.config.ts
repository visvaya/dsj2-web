import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/** The version of the game has one source, package.json; the build writes it into the game (src/game/version.ts). */
function packageVersion(): string {
  const pkg: unknown = JSON.parse(readFileSync(new URL("package.json", import.meta.url), "utf8"));
  if (typeof pkg === "object" && pkg !== null && "version" in pkg && typeof pkg.version === "string") {
    return pkg.version;
  }
  throw new Error("package.json names no version");
}

export default defineConfig({
  plugins: [react()],
  define: { "import.meta.env.GAME_VERSION": JSON.stringify(packageVersion()) },
  build: {
    // The fonts go into the stylesheet instead of separate files: a font fetched on its own arrives after the
    // first screen has been laid out in the fallback font, and moves that screen when it replaces it.
    assetsInlineLimit: (filePath) => (filePath.endsWith(".woff2") ? true : undefined),
  },
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
