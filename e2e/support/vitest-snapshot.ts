/**
 * Reads the values of a Vitest snapshot file without running it. Each entry is an export of a template string
 * that holds the value in Vitest's pretty format; for plain objects of numbers and strings that format is JSON
 * with a comma after the last item.
 */
const ENTRY = /^exports\[`(.+?)`\] = `\n([\s\S]*?)\n`;$/gm;
const TRAILING_COMMA = /,(\s*[\]}])/g;

export function parseVitestSnapshot(source: string): Map<string, unknown> {
  const entries = new Map<string, unknown>();
  for (const match of source.matchAll(ENTRY)) {
    const [, name, body] = match;
    if (name === undefined || body === undefined) continue;
    entries.set(name, JSON.parse(body.replace(TRAILING_COMMA, "$1")) as unknown);
  }
  return entries;
}
