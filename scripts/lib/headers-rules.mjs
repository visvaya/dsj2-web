// Reads the `_headers` file of the deployed game (the format of Cloudflare's static assets) and works out the
// headers of a response. Only the part of the format the project uses is understood; anything else is refused,
// so the test server can never apply a rule differently from the host without a test noticing.

// Limits of the host: at most 100 rules, at most 2000 characters a line.
const HEADERS_LIMITS = {
  MAX_RULES: 100,
  MAX_LINE_LENGTH_CHARS: 2000,
};

const HEADER_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9-]*$/;
// A path, with at most one `*` and only as its last character.
const RULE_PATTERN = /^\/[^\s*:]*\*?$/;

function fail(lineNumber, message) {
  throw new Error(`_headers line ${lineNumber}: ${message}`);
}

function parseHeaderLine(text, lineNumber) {
  if (text.startsWith("!") === true) fail(lineNumber, "removing a header is not supported");
  const colon = text.indexOf(":");
  if (colon <= 0) fail(lineNumber, `expected "Name: value", found "${text}"`);
  const name = text.slice(0, colon);
  const value = text.slice(colon + 1).trim();
  if (!HEADER_NAME_PATTERN.test(name)) fail(lineNumber, `invalid header name "${name}"`);
  if (value === "") fail(lineNumber, `header "${name}" has no value`);
  return { name, value };
}

function parseRuleLine(text, lineNumber) {
  if (!RULE_PATTERN.test(text)) {
    fail(lineNumber, `unsupported rule "${text}": a path, with one "*" allowed and only at its end`);
  }
  return text;
}

// Returns the rules in file order: [{ pattern, headers: [{ name, value }] }].
export function parseHeadersFile(text) {
  const rules = [];
  let current = null;
  text.split(/\r?\n/).forEach((line, index) => {
    const lineNumber = index + 1;
    if (line.length > HEADERS_LIMITS.MAX_LINE_LENGTH_CHARS) fail(lineNumber, "longer than the host allows");
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#") === true) return;
    if (/^\s/.test(line)) {
      if (current === null) fail(lineNumber, "a header before any rule");
      const header = parseHeaderLine(trimmed, lineNumber);
      if (current.headers.some((known) => known.name.toLowerCase() === header.name.toLowerCase()) === true) {
        fail(lineNumber, `header "${header.name}" is set twice in one rule`);
      }
      current.headers.push(header);
      return;
    }
    const pattern = parseRuleLine(trimmed, lineNumber);
    if (rules.some((rule) => rule.pattern === pattern)) fail(lineNumber, `rule "${pattern}" appears twice`);
    current = { pattern, headers: [] };
    rules.push(current);
  });
  const empty = rules.find((rule) => rule.headers.length === 0);
  if (empty !== undefined) throw new Error(`_headers: rule "${empty.pattern}" sets no header`);
  if (rules.length > HEADERS_LIMITS.MAX_RULES) throw new Error("_headers: more rules than the host allows");
  return rules;
}

function matches(pattern, pathname) {
  return pattern.endsWith("*") === true ? pathname.startsWith(pattern.slice(0, -1)) === true : pathname === pattern;
}

// The headers the rules give a path: [{ name, value }], names as first written. Rules that match add up, and
// a header set by several of them gets their values joined with ", ", as the host does.
export function headersForPath(rules, pathname) {
  const merged = new Map();
  for (const rule of rules.filter((candidate) => matches(candidate.pattern, pathname))) {
    for (const header of rule.headers) {
      const key = header.name.toLowerCase();
      const known = merged.get(key);
      merged.set(key, known === undefined ? header : { name: known.name, value: `${known.value}, ${header.value}` });
    }
  }
  return [...merged.values()];
}

// Header names that more than one rule sets for the same path; the project's file is expected to have none,
// because a joined Cache-Control or policy is not what any of the rules meant.
export function conflictingHeaders(rules, pathname) {
  const counts = new Map();
  for (const rule of rules.filter((candidate) => matches(candidate.pattern, pathname))) {
    for (const header of rule.headers) {
      const key = header.name.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts].filter(([, count]) => count > 1).map(([name]) => name);
}
