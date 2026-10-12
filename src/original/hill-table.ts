import type { InrunSpec, LandingSpec } from "../sim/hill-setup";

/**
 * Reads the hill definitions compiled into the original executable.
 *
 * The hill setup routine (0baf:631c in v2.10P) compares the hill number with
 * each value in turn:
 *
 *     cmp al, N ; je +3 ; jmp <next comparison>
 *     push <constant> ... ; call inrun_setup
 *     push <constant> ... ; call landing_setup
 *     push ... ; call <scenery and graphics routines> ...
 *
 * so the parameters are immediate operands of PUSH instructions. Pascal pushes
 * arguments left to right, and a Single argument as the high word followed by
 * the low word.
 */

export interface PushedCall {
  /** "far" for CALL ptr16:16 (target segment:offset), "near" for CALL rel16 (target offset in the image). */
  kind: "far" | "near";
  target: number;
  /** Immediate words pushed since the previous call, in push order. */
  words: number[];
}

export interface HillDefinition {
  number: number;
  kPointM: number;
  inrun: InrunSpec;
  landing: LandingSpec;
  /** All calls of the branch, for the presentation data used later (scenery, colours). */
  calls: PushedCall[];
}

const OP_CMP_AL = 0x3c;
const OP_JE_SHORT = 0x74;
const OP_JMP_NEAR = 0xe9;
const OP_PUSH_IMM16 = 0x68;
const OP_PUSH_IMM8 = 0x6a;
const OP_CALL_FAR = 0x9a;
const OP_CALL_NEAR = 0xe8;
const BRANCH_HEADER_BYTES = 7;
const INRUN_WORDS = 20;
const LANDING_WORDS = 21;
const MAX_BRANCH_BYTES = 0x400;

function u16(bytes: Uint8Array, at: number): number {
  return (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8);
}

function isBranchHeader(img: Uint8Array, at: number, n: number): boolean {
  return (
    img[at] === OP_CMP_AL &&
    img[at + 1] === n &&
    img[at + 2] === OP_JE_SHORT &&
    img[at + 3] === 3 &&
    img[at + 4] === OP_JMP_NEAR
  );
}

/** Decodes PUSH imm and CALL instructions until anything else. */
export function decodePushedCalls(img: Uint8Array, start: number): PushedCall[] {
  const calls: PushedCall[] = [];
  let words: number[] = [];
  let at = start;
  while (at < img.length && at - start < MAX_BRANCH_BYTES) {
    const op = img[at];
    if (op === OP_PUSH_IMM16) {
      words.push(u16(img, at + 1));
      at += 3;
    } else if (op === OP_PUSH_IMM8) {
      const b = img[at + 1] ?? 0;
      words.push(b >= 0x80 ? b | 0xff00 : b);
      at += 2;
    } else if (op === OP_CALL_FAR) {
      calls.push({ kind: "far", target: u16(img, at + 3) * 0x10000 + u16(img, at + 1), words });
      words = [];
      at += 5;
    } else if (op === OP_CALL_NEAR) {
      const rel = u16(img, at + 1);
      calls.push({ kind: "near", target: (at + 3 + (rel >= 0x8000 ? rel - 0x10000 : rel)) >>> 0, words });
      words = [];
      at += 3;
    } else {
      break;
    }
  }
  return calls;
}

const floatView = new DataView(new ArrayBuffer(4));

/** A Single pushed as high word then low word. */
function single(words: readonly number[], i: number): number {
  floatView.setUint16(0, words[i + 1] ?? 0, true);
  floatView.setUint16(2, words[i] ?? 0, true);
  return floatView.getFloat32(0, true);
}

function int16(words: readonly number[], i: number): number {
  const w = words[i] ?? 0;
  return w >= 0x8000 ? w - 0x10000 : w;
}

/** Argument order of 1eee:051f; see docs/hill-format.md. */
function inrunFromWords(w: readonly number[]): InrunSpec {
  return {
    flatEndXM: single(w, 2),
    lineEndXM: single(w, 4),
    takeoffXM: single(w, 6),
    startXM: single(w, 8),
    lineSlope: single(w, 11),
    lineInterceptM: single(w, 13),
    curveA: single(w, 15),
  };
}

/** Argument order of 1eee:06e1; see docs/hill-format.md. */
function landingFromWords(w: readonly number[]): LandingSpec {
  return {
    centerXM: single(w, 0),
    centerYM: single(w, 2),
    amplitudeM: single(w, 4),
    widthM: single(w, 6),
    outrunStartXM: single(w, 8),
    outrunCurveA: single(w, 10),
    knollBlend: single(w, 19),
  };
}

function readChain(img: Uint8Array, first: number): HillDefinition[] {
  const hills: HillDefinition[] = [];
  let at = first;
  for (let n = 1; n < 256 && isBranchHeader(img, at, n); n++) {
    const rel = u16(img, at + 5);
    const next = at + BRANCH_HEADER_BYTES + (rel >= 0x8000 ? rel - 0x10000 : rel);
    const calls = decodePushedCalls(img, at + BRANCH_HEADER_BYTES);
    const [inrun, landing] = calls;
    if (!inrun || !landing || inrun.words.length !== INRUN_WORDS || landing.words.length !== LANDING_WORDS) {
      break;
    }
    hills.push({
      number: n,
      kPointM: int16(landing.words, 14),
      inrun: inrunFromWords(inrun.words),
      landing: landingFromWords(landing.words),
      calls,
    });
    at = next;
  }
  return hills;
}

function plausible(h: HillDefinition): boolean {
  const inrunValues: unknown[] = Object.values(h.inrun);
  const landingValues: unknown[] = Object.values(h.landing);
  return (
    [...inrunValues, ...landingValues].every((v) => Number.isFinite(v)) &&
    h.kPointM > 0 &&
    h.kPointM < 400 &&
    h.inrun.takeoffXM > h.inrun.lineEndXM &&
    h.landing.widthM > 0 &&
    h.landing.outrunStartXM > h.inrun.takeoffXM
  );
}

/** Finds the hill table in an executable image; throws if it is missing or inconsistent. */
export function readHillTable(img: Uint8Array): HillDefinition[] {
  let best: HillDefinition[] = [];
  for (let at = 0; at + BRANCH_HEADER_BYTES <= img.length; at++) {
    if (isBranchHeader(img, at, 1)) {
      const chain = readChain(img, at);
      if (chain.length > best.length) best = chain;
    }
  }
  if (best.length === 0) {
    throw new Error("hill table not found");
  }
  const inrunTarget = best[0]?.calls[0]?.target;
  const landingTarget = best[0]?.calls[1]?.target;
  for (const h of best) {
    if (h.calls[0]?.target !== inrunTarget || h.calls[1]?.target !== landingTarget || !plausible(h)) {
      throw new Error(`hill ${h.number}: unexpected definition`);
    }
  }
  return best;
}
