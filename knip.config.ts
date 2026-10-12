import type { KnipConfig } from "knip";

/**
 * Unused files, exports and dependencies. Run through `pnpm check:unused`, which sets
 * KNIP_DISABLE_RAW_TRANSFER=1 (knip needs it on Windows).
 *
 * The application entry (src/main.tsx) is found through index.html and the Vite and Vitest configuration
 * files through knip's plugins, so none of them is listed. tools/ is Python and is not analysed.
 */
const config: KnipConfig = {
  entry: [
    // Tests are entry points, so a module used only by tests (src/**/test-support) counts as used.
    "src/**/*.test.ts",
    "scripts/*.mjs",
    "scripts/**/*.test.mjs",
    // Loaded by path from scripts/plan-replays.mjs (through scripts/lib/load-typescript.mjs).
    "src/original/test-support/hill-plans.ts",
    // Named only in stryker.config.json ("vitest.configFile"), which knip does not follow.
    "vitest.stryker.config.ts",
  ],
  project: ["src/**/*.{ts,tsx}", "scripts/**/*.mjs", "*.config.ts"],
};

export default config;
