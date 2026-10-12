import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { goldenTraces, hillGoldenFiles, replayCases } from "./golden-files";

/** Golden files are only looked up here, never read: a few bytes stand in for each of them. */
function touch(dir: string, ...names: string[]): void {
  for (const name of names) writeFileSync(join(dir, name), "x");
}

describe("files of the golden tests", () => {
  let root = "";
  let traceDir = "";
  let gameDir = "";

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "golden-files-"));
    traceDir = join(root, "traces");
    gameDir = join(root, "game");
    mkdirSync(traceDir);
    mkdirSync(gameDir);
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  describe("traces", () => {
    it("asks for nothing when no variable is set, so the tests are skipped", () => {
      expect(goldenTraces({})).toEqual({ requested: false, traces: [], problems: [] });
      expect(goldenTraces({ DSJ2_TRACE_DIR: "", DSJ2_TRACE: "" })).toEqual({
        requested: false,
        traces: [],
        problems: [],
      });
    });

    it("lists every trace of the directory by the name of its replay, in order", () => {
      touch(traceDir, "WILD.trace", "Karpacz.trace", "hills.hilltrace", "notes.txt");
      expect(goldenTraces({ DSJ2_TRACE_DIR: traceDir })).toEqual({
        requested: true,
        traces: [
          { name: "Karpacz", path: join(traceDir, "Karpacz.trace") },
          { name: "WILD", path: join(traceDir, "WILD.trace") },
        ],
        problems: [],
      });
    });

    it("reports a directory without traces", () => {
      touch(traceDir, "hills.hilltrace");
      const found = goldenTraces({ DSJ2_TRACE_DIR: traceDir });
      expect(found.requested).toBe(true);
      expect(found.traces).toEqual([]);
      expect(found.problems).toEqual([`DSJ2_TRACE_DIR (${traceDir}) holds no .trace file`]);
    });

    it("reports a directory that cannot be read, and does not fall back to the single trace", () => {
      touch(root, "one.trace", "not-a-directory");
      for (const dir of [join(root, "absent"), join(root, "not-a-directory")]) {
        const found = goldenTraces({ DSJ2_TRACE_DIR: dir, DSJ2_TRACE: join(root, "one.trace") });
        expect(found.requested).toBe(true);
        expect(found.traces).toEqual([]);
        expect(found.problems).toEqual([`DSJ2_TRACE_DIR (${dir}) cannot be read`]);
      }
    });

    it("takes the single trace when no directory is given, and reports it when it is missing", () => {
      touch(root, "one.trace");
      expect(goldenTraces({ DSJ2_TRACE: join(root, "one.trace") })).toEqual({
        requested: true,
        traces: [{ name: "one", path: join(root, "one.trace") }],
        problems: [],
      });
      const missing = join(root, "absent.trace");
      expect(goldenTraces({ DSJ2_TRACE: missing })).toEqual({
        requested: true,
        traces: [],
        problems: [`DSJ2_TRACE (${missing}) does not exist`],
      });
    });
  });

  describe("replays of the traces", () => {
    const traces = [
      { name: "Karpacz", path: "Karpacz.trace" },
      { name: "WILD", path: "WILD.trace" },
    ];

    it("pairs every trace with its replay file, whatever the case of the file name", () => {
      touch(gameDir, "KARPACZ.RPL", "wild.rpl");
      expect(replayCases(traces, { DSJ2_GAME_DIR: gameDir })).toEqual({
        cases: [
          { name: "Karpacz", path: "Karpacz.trace", replay: join(gameDir, "KARPACZ.RPL") },
          { name: "WILD", path: "WILD.trace", replay: join(gameDir, "wild.rpl") },
        ],
        missing: [],
      });
    });

    it("names the trace whose replay file is missing instead of dropping it", () => {
      touch(gameDir, "Karpacz.rpl");
      const found = replayCases(traces, { DSJ2_GAME_DIR: gameDir });
      expect(found.cases.map((c) => c.name)).toEqual(["Karpacz"]);
      expect(found.missing).toEqual([`WILD.trace: no WILD.rpl in DSJ2_GAME_DIR (${gameDir})`]);
    });

    it("names every trace when the game directory is not set or cannot be read", () => {
      expect(replayCases(traces, {}).missing).toEqual([
        "Karpacz.trace: no Karpacz.rpl in DSJ2_GAME_DIR (not set)",
        "WILD.trace: no WILD.rpl in DSJ2_GAME_DIR (not set)",
      ]);
      const absent = join(root, "absent");
      expect(replayCases(traces, { DSJ2_GAME_DIR: absent })).toEqual({
        cases: [],
        missing: [
          `Karpacz.trace: no Karpacz.rpl in DSJ2_GAME_DIR (${absent})`,
          `WILD.trace: no WILD.rpl in DSJ2_GAME_DIR (${absent})`,
        ],
      });
    });

    it("has nothing to report without traces", () => {
      expect(replayCases([], {})).toEqual({ cases: [], missing: [] });
    });
  });

  describe("files of the hill comparison", () => {
    it("asks for nothing when neither directory is set", () => {
      expect(hillGoldenFiles({})).toEqual({
        requested: false,
        exe: undefined,
        dat: undefined,
        hillTrace: undefined,
        problems: [],
      });
    });

    it("finds the executable, the texts and the hill trace", () => {
      touch(gameDir, "DSJ.EXE", "dsj.dat");
      touch(traceDir, "hills.hilltrace");
      expect(hillGoldenFiles({ DSJ2_GAME_DIR: gameDir, DSJ2_TRACE_DIR: traceDir })).toEqual({
        requested: true,
        exe: join(gameDir, "DSJ.EXE"),
        dat: join(gameDir, "dsj.dat"),
        hillTrace: join(traceDir, "hills.hilltrace"),
        problems: [],
      });
    });

    it("does not ask for the hill trace when only the game directory is set", () => {
      touch(gameDir, "Dsj.exe", "Dsj.dat");
      const found = hillGoldenFiles({ DSJ2_GAME_DIR: gameDir });
      expect(found.requested).toBe(true);
      expect(found.hillTrace).toBeUndefined();
      expect(found.problems).toEqual([]);
    });

    it("reports each file that is missing from a directory that is set", () => {
      const found = hillGoldenFiles({ DSJ2_GAME_DIR: gameDir, DSJ2_TRACE_DIR: traceDir });
      expect(found.requested).toBe(true);
      expect(found.problems).toEqual([
        `no Dsj.exe in DSJ2_GAME_DIR (${gameDir})`,
        `no Dsj.dat in DSJ2_GAME_DIR (${gameDir})`,
        `no hills.hilltrace in DSJ2_TRACE_DIR (${traceDir})`,
      ]);
    });

    it("reports the game directory when only the trace directory is set", () => {
      touch(traceDir, "hills.hilltrace");
      expect(hillGoldenFiles({ DSJ2_TRACE_DIR: traceDir }).problems).toEqual([
        "no Dsj.exe in DSJ2_GAME_DIR (not set)",
        "no Dsj.dat in DSJ2_GAME_DIR (not set)",
      ]);
    });
  });
});
