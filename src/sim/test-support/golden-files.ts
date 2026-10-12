import { existsSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

/**
 * Which files the golden tests compare against. The files are derived from the original game and stay outside
 * the repository: DSJ2_TRACE_DIR holds the traces (or DSJ2_TRACE names a single one), DSJ2_GAME_DIR the game.
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

const traceName = (file: string): string => basename(file).replace(/\.trace$/, "");
const shown = (dir: string): string => (dir === "" ? "not set" : dir);

/**
 * Traces to test against: every *.trace in DSJ2_TRACE_DIR (named after the replay they record), or the single
 * file in DSJ2_TRACE when no directory is given.
 */
export function goldenTraces(env: Env = process.env): GoldenTraces {
  const dir = env["DSJ2_TRACE_DIR"] ?? "";
  const single = env["DSJ2_TRACE"] ?? "";
  if (dir !== "") {
    const files = filesIn(dir);
    if (files === undefined) {
      return { requested: true, traces: [], problems: [`DSJ2_TRACE_DIR (${dir}) cannot be read`] };
    }
    const traces = files
      .filter((file) => file.endsWith(".trace"))
      .toSorted()
      .map((file) => ({ name: traceName(file), path: join(dir, file) }));
    const problems = traces.length === 0 ? [`DSJ2_TRACE_DIR (${dir}) holds no .trace file`] : [];
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
  /** Hill setup snapshots of tools/re/hill_capture.py: `hills.hilltrace` in DSJ2_TRACE_DIR. */
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
  const tracePath = join(traceDir, "hills.hilltrace");
  const hillTrace = traceDir !== "" && existsSync(tracePath) ? tracePath : undefined;
  const problems = [
    ...(exe === undefined ? [`no Dsj.exe in DSJ2_GAME_DIR (${shown(gameDir)})`] : []),
    ...(dat === undefined ? [`no Dsj.dat in DSJ2_GAME_DIR (${shown(gameDir)})`] : []),
    ...(traceDir !== "" && hillTrace === undefined ? [`no hills.hilltrace in DSJ2_TRACE_DIR (${traceDir})`] : []),
  ];
  return { requested: true, exe, dat, hillTrace, problems };
}
