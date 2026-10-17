import { existsSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { GZIP_SUFFIX } from "./dsj-trace";

/**
 * Which files the golden tests compare against. The files are derived from the original game and stay outside
 * the repository: DSJ2_TRACE_DIR holds the traces (or DSJ2_TRACE names a single one), DSJ2_GAME_DIR the game.
 * A trace may be gzip-compressed (`.trace.gz`, `hills.hilltrace.gz`); the same trace in both forms is a
 * problem, because one of the two is stale.
 * Without these variables the golden tests are skipped. Once one is set, every file it promises is required:
 * what is missing is reported as a problem, and a test fails on it, so that no comparison is lost quietly.
 */
type Env = Readonly<Record<string, string | undefined>>;

export interface TraceFile {
  name: string;
  path: string;
}

interface GoldenTraces {
  /** False when no trace variable is set: the tests that need traces are skipped. */
  requested: boolean;
  traces: TraceFile[];
  /** What was asked for and is not there. */
  problems: string[];
}

/** File names of a directory, or nothing when it cannot be listed (absent, not a directory, no access). */
function filesIn(dir: string): string[] | undefined {
  try {
    return readdirSync(dir);
  } catch {
    return undefined;
  }
}

const TRACE_SUFFIX = ".trace";
const HILL_TRACE_FILE = "hills.hilltrace";

/** The file name without `suffix` or `suffix.gz`; undefined when it has neither. */
function stripSuffix(file: string, suffix: string): string | undefined {
  const plain = file.endsWith(GZIP_SUFFIX) ? file.slice(0, -GZIP_SUFFIX.length) : file;
  return plain.endsWith(suffix) ? plain.slice(0, -suffix.length) : undefined;
}

const traceName = (file: string): string => stripSuffix(basename(file), TRACE_SUFFIX) ?? basename(file);

/** The traces among the files of a directory, sorted by name, and the names present in both forms. */
function tracesAmong(dir: string, files: readonly string[]): { traces: TraceFile[]; problems: string[] } {
  const traces = files
    .flatMap((file) => {
      const name = stripSuffix(file, TRACE_SUFFIX);
      return name === undefined ? [] : [{ name, path: join(dir, file) }];
    })
    .toSorted((one, other) => (one.name < other.name ? -1 : one.name > other.name ? 1 : 0));
  const problems = traces
    .filter((trace, i) => traces[i + 1]?.name === trace.name)
    .map((trace) => `${trace.name}.trace exists both plain and gzip-compressed in ${dir}; remove one`);
  return { traces, problems };
}
const shown = (dir: string): string => (dir === "" ? "not set" : dir);

/**
 * Traces to test against: every *.trace and *.trace.gz in DSJ2_TRACE_DIR (named after the replay they record),
 * or the single file in DSJ2_TRACE when no directory is given.
 */
export function goldenTraces(env: Env = process.env): GoldenTraces {
  const dir = env["DSJ2_TRACE_DIR"] ?? "";
  const single = env["DSJ2_TRACE"] ?? "";
  if (dir !== "") {
    const files = filesIn(dir);
    if (files === undefined) {
      return { requested: true, traces: [], problems: [`DSJ2_TRACE_DIR (${dir}) cannot be read`] };
    }
    const { traces, problems: duplicates } = tracesAmong(dir, files);
    const problems = traces.length === 0 ? [`DSJ2_TRACE_DIR (${dir}) holds no .trace file`] : duplicates;
    return { requested: true, traces, problems };
  }
  if (single !== "") {
    return existsSync(single)
      ? { requested: true, traces: [{ name: traceName(single), path: single }], problems: [] }
      : { requested: true, traces: [], problems: [`DSJ2_TRACE (${single}) does not exist`] };
  }
  return { requested: false, traces: [], problems: [] };
}

/** A file of the original game directory, found whatever the case of its name. */
function gameFile(dir: string, name: string): string | undefined {
  if (dir === "") return undefined;
  const want = name.toLowerCase();
  const found = filesIn(dir)?.find((file) => file.toLowerCase() === want);
  return found === undefined ? undefined : join(dir, found);
}

interface ReplayCase extends TraceFile {
  replay: string;
}

/** Every trace with the replay file it was recorded from; `missing` names the traces that have none. */
export function replayCases(
  traces: readonly TraceFile[],
  env: Env = process.env,
): { cases: ReplayCase[]; missing: string[] } {
  const dir = env["DSJ2_GAME_DIR"] ?? "";
  const cases: ReplayCase[] = [];
  const missing: string[] = [];
  for (const trace of traces) {
    const replay = gameFile(dir, `${trace.name}.rpl`);
    if (replay === undefined) {
      missing.push(`${trace.name}.trace: no ${trace.name}.rpl in DSJ2_GAME_DIR (${shown(dir)})`);
    } else {
      cases.push({ ...trace, replay });
    }
  }
  return { cases, missing };
}

interface HillGoldenFiles {
  /** False when neither directory is set: the hill tests are skipped. */
  requested: boolean;
  exe: string | undefined;
  dat: string | undefined;
  /** Hill setup snapshots of tools/re/hill_capture.py: `hills.hilltrace` or its `.gz` form in DSJ2_TRACE_DIR. */
  hillTrace: string | undefined;
  problems: string[];
}

/**
 * Files of the hill comparison. The executable and the texts are required as soon as either directory is set;
 * the hill trace only when the trace directory is.
 */
export function hillGoldenFiles(env: Env = process.env): HillGoldenFiles {
  const gameDir = env["DSJ2_GAME_DIR"] ?? "";
  const traceDir = env["DSJ2_TRACE_DIR"] ?? "";
  if (gameDir === "" && traceDir === "") {
    return { requested: false, exe: undefined, dat: undefined, hillTrace: undefined, problems: [] };
  }
  const exe = gameFile(gameDir, "Dsj.exe");
  const dat = gameFile(gameDir, "Dsj.dat");
  const hillForms =
    traceDir === ""
      ? []
      : [HILL_TRACE_FILE, HILL_TRACE_FILE + GZIP_SUFFIX]
          .map((file) => join(traceDir, file))
          .filter((p) => existsSync(p));
  const hillTrace = hillForms.length === 1 ? hillForms[0] : undefined;
  const problems = [
    ...(exe === undefined ? [`no Dsj.exe in DSJ2_GAME_DIR (${shown(gameDir)})`] : []),
    ...(dat === undefined ? [`no Dsj.dat in DSJ2_GAME_DIR (${shown(gameDir)})`] : []),
    ...(traceDir !== "" && hillForms.length === 0 ? [`no hills.hilltrace in DSJ2_TRACE_DIR (${traceDir})`] : []),
    ...(hillForms.length > 1
      ? [`${HILL_TRACE_FILE} exists both plain and gzip-compressed in ${traceDir}; remove one`]
      : []),
  ];
  return { requested: true, exe, dat, hillTrace, problems };
}

const CPU_JUMP_SUFFIX = ".cputrace";
const CUP_SUFFIX = ".cuptrace";

/** Files of a directory with `suffix` (plain or gzip-compressed) as traces, sorted by name. */
function suffixedTraces(dir: string, files: readonly string[], suffix: string): TraceFile[] {
  return files
    .flatMap((file) => {
      const name = stripSuffix(file, suffix);
      return name === undefined ? [] : [{ name, path: join(dir, file) }];
    })
    .toSorted((one, other) => (one.name < other.name ? -1 : one.name > other.name ? 1 : 0));
}

interface CpuGoldenTraces {
  /** False when DSJ2_TRACE_DIR is not set: the computer jumper tests are skipped. */
  requested: boolean;
  /** One computer jump each (tools/re/cpu_capture.py): `<session>-NN.cputrace` or its `.gz` form. */
  jumps: TraceFile[];
  /** Cup and competition start of each capture session: `<session>.cuptrace` or its `.gz` form. */
  cups: TraceFile[];
  problems: string[];
}

/** Traces of computer jumps in DSJ2_TRACE_DIR; once it is set, at least one of each kind is required. */
export function cpuGoldenTraces(env: Env = process.env): CpuGoldenTraces {
  const dir = env["DSJ2_TRACE_DIR"] ?? "";
  if (dir === "") return { requested: false, jumps: [], cups: [], problems: [] };
  const files = filesIn(dir);
  if (files === undefined) {
    return { requested: true, jumps: [], cups: [], problems: [`DSJ2_TRACE_DIR (${dir}) cannot be read`] };
  }
  const jumps = suffixedTraces(dir, files, CPU_JUMP_SUFFIX);
  const cups = suffixedTraces(dir, files, CUP_SUFFIX);
  const doubled = [...jumps, ...cups]
    .filter((trace, i, all) => all[i + 1]?.name === trace.name)
    .map((trace) => `${trace.name} exists both plain and gzip-compressed in ${dir}; remove one`);
  const problems = [
    ...(jumps.length === 0 ? [`DSJ2_TRACE_DIR (${dir}) holds no .cputrace file`] : []),
    ...(cups.length === 0 ? [`DSJ2_TRACE_DIR (${dir}) holds no .cuptrace file`] : []),
    ...doubled,
  ];
  return { requested: true, jumps, cups, problems };
}
