// Serves the production build the way the host does: the same `_headers` file, a real 404 for an unknown
// path. The browser tests run against it; it is also the way to look at the built game on this machine.
// Usage: node scripts/serve-dist.mjs [--root <dir>] [--port <number>]  (run after `pnpm build`)
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { startStaticServer } from "./lib/static-server.mjs";

const DEFAULT_PORT = 4317;

const { values } = parseArgs({
  options: {
    root: { type: "string", default: "dist" },
    port: { type: "string", default: String(DEFAULT_PORT) },
  },
});

if (existsSync(join(values.root, "index.html")) !== true) {
  console.error(`serve-dist: ${values.root}/index.html does not exist; run \`pnpm build\` first.`);
  process.exitCode = 1;
} else {
  const server = await startStaticServer({ root: values.root, port: Number(values.port) });
  console.log(`serve-dist: ${values.root}/ at ${server.origin}`);
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      void server.close().then(() => process.exit(0));
    });
  }
}
