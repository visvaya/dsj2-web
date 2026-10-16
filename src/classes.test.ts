import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The code is functions and plain data. Two classes are the exceptions: the pixel buffer, a mutable wrapper of a
 * typed array that hundreds of drawing statements call, and the seeded generator of the port.
 */
const ALLOWED_CLASSES = ["render/frame-buffer.ts: FrameBuffer", "sim/borland-random.ts: BorlandRandom"];

/** A slash starts a regular expression after one of these, and a division anywhere else. */
const BEFORE_REGEX = "(,=:[!&|?{};+-*%<>~^";
const KEYWORD_BEFORE_REGEX = /(?:^|[^\w$.])(?:return|typeof|case|void|in|of|delete|throw)$/;

function endOfLine(src: string, from: number): number {
  const end = src.indexOf("\n", from);
  return end === -1 ? src.length : end;
}

/** Position after a quoted string that starts at `from`; an unclosed one ends with its line. */
function endOfString(src: string, from: number): number {
  const quote = src[from];
  for (let i = from + 1; i < src.length; i++) {
    if (src[i] === "\\") i++;
    else if (src[i] === quote) return i + 1;
    else if (src[i] === "\n") return i;
  }
  return src.length;
}

/** Position after a regular expression literal that starts at `from`. */
function endOfRegex(src: string, from: number): number {
  let inSet = false;
  for (let i = from + 1; i < src.length; i++) {
    const ch = src[i];
    if (ch === "\\") i++;
    else if (ch === "\n") return i;
    else if (ch === "[") inSet = true;
    else if (ch === "]") inSet = false;
    else if (ch === "/" && !inSet) return i + 1;
  }
  return src.length;
}

function startsRegex(code: string): boolean {
  const before = code.trimEnd();
  const last = before.at(-1);
  return last === undefined || BEFORE_REGEX.includes(last) || KEYWORD_BEFORE_REGEX.test(before);
}

/** Code and position after the template literal that starts at `from`; only its `${}` parts are code. */
function skipTemplate(src: string, from: number): { code: string; next: number } {
  let code = "";
  let i = from + 1;
  while (i < src.length && src[i] !== "`") {
    if (src[i] === "\\") {
      i += 2;
    } else if (src[i] === "$" && src[i + 1] === "{") {
      const inner = stripNonCode(src, i + 2, "}");
      code += ` ${inner.code} `;
      i = inner.next + 1;
    } else {
      i++;
    }
  }
  return { code, next: i + 1 };
}

/**
 * The source from `from` with comments, strings, templates and regular expressions blanked out. With `until`,
 * stops at that closing brace (nested braces are passed over) and reports where.
 */
function stripNonCode(src: string, from = 0, until?: string): { code: string; next: number } {
  let code = "";
  let depth = 0;
  let i = from;
  while (i < src.length) {
    const ch = src.charAt(i);
    const two = src.slice(i, i + 2);
    if (two === "//") {
      i = endOfLine(src, i);
    } else if (two === "/*") {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? src.length : end + 2;
      code += " ";
    } else if (ch === '"' || ch === "'") {
      i = endOfString(src, i);
      code += '""';
    } else if (ch === "`") {
      const template = skipTemplate(src, i);
      code += `""${template.code}`;
      i = template.next;
    } else if (ch === "/" && startsRegex(code)) {
      i = endOfRegex(src, i);
      code += '""';
    } else if (ch === until && depth === 0) {
      return { code, next: i };
    } else {
      if (ch === "{") depth++;
      if (ch === "}") depth--;
      code += ch;
      i++;
    }
  }
  return { code, next: i };
}

/** A class declaration or expression: an optional name, an optional parent, then type parameters or the body. */
const CLASS = /(?<![\w$.])class(?![\w$])\s*(?!extends\b)([\w$]*)\s*(?:extends\s+([\w$.]+))?[^{;=]*\{/g;

/** Names of the classes in a source text; subclasses of Error are not counted. */
function classesIn(source: string): string[] {
  return [...stripNonCode(source).code.matchAll(CLASS)]
    .filter((match) => match[2] !== "Error")
    .map((match) => (match[1] === undefined || match[1] === "" ? "(anonymous)" : match[1]));
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("classes", () => {
  it("finds declarations and expressions, named or not", () => {
    expect(classesIn("export class Buffer {\n  x = 1;\n}")).toEqual(["Buffer"]);
    expect(classesIn("abstract class Shape<T extends object> implements Drawn {}")).toEqual(["Shape"]);
    expect(classesIn("const a = class {};\nconst b = class extends Base {};")).toEqual(["(anonymous)", "(anonymous)"]);
    expect(classesIn("class Child extends ns.Parent {}")).toEqual(["Child"]);
    expect(classesIn("const text = `${count} of ${new (class Inner {})().size}`;")).toEqual(["Inner"]);
  });

  it("is not fooled by the word in comments, strings, templates, regular expressions or names", () => {
    expect(classesIn("// class Line {}\n/* class Block {} */\n/** class Doc {} */")).toEqual([]);
    expect(classesIn("const a = \"class Double {}\";\nconst b = 'class Single {}';")).toEqual([]);
    expect(classesIn("const a = `class Template {}\nclass Second {}`;")).toEqual([]);
    expect(classesIn("const a = /class Pattern {/.test(x);")).toEqual([]);
    expect(classesIn("const half = total / 2; // class After {}\nconst b = c / d;")).toEqual([]);
    expect(classesIn('<div className="game" />;\nconst o = { class: 1 };\no.class = { subclass };')).toEqual([]);
    expect(classesIn('const quote = "it\'s"; class Real {}')).toEqual(["Real"]);
  });

  it("accepts subclasses of Error only", () => {
    expect(classesIn("export class FormatError extends Error {}")).toEqual([]);
    expect(classesIn("class Odd extends ErrorLike {}")).toEqual(["Odd"]);
  });

  // Reads and scans every source file: seconds on a loaded machine, past vitest's default of 5 s.
  it("are only the pixel buffer and the seeded generator", { timeout: 30_000 }, () => {
    const root = fileURLToPath(new URL(".", import.meta.url));
    const found = sourceFiles(root).flatMap((path) => {
      const file = relative(root, path).replaceAll("\\", "/");
      return classesIn(readFileSync(path, "utf8")).map((name) => `${file}: ${name}`);
    });
    expect(found.toSorted()).toEqual(ALLOWED_CLASSES.toSorted());
  });
});
