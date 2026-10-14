import { BorlandRandom } from "./borland-random";
import type { FrameInput } from "./jump-logic";
import type { WindState } from "./wind";

/**
 * Replays of the original DSJ2 v2.x (.rpl), see docs/replay-format.md.
 * A replay holds the random seed, the starting wind and the player's input;
 * the jump itself is recomputed by the simulation.
 */
const REPLAY_KEY = 0x26b51b17;
const REPLAY_HEADER_BYTES = 13;
const REPLAY_RECORD_BYTES = 0x4b5;
const REPLAY_FILE_BYTES = REPLAY_HEADER_BYTES + REPLAY_RECORD_BYTES + 4;
const BUTTON_WINDOW_FRAMES = 20;

export interface ReplayRecord {
  versionTag: string;
  wind: WindState;
  hillIndex: number;
  hillRecordValue: number;
  distanceText: string;
  randomSeed: number;
  flag449: number;
  startFrame: number;
  buttonWindowStart: number;
  motionStart: number;
  motionEnd: number;
  leftLandingFrame: number;
  rightLandingFrame: number;
  /** Raw record bytes; input lookups index into them like the original. */
  bytes: Uint8Array;
  jumperName: string;
  date: string;
  licensee: string;
}

function random31(rng: BorlandRandom): number {
  const hi = rng.below(0x8000);
  const lo = rng.below(0xffff);
  return (hi * 0x10000 + lo) >>> 0;
}

/** Decrypts header and record; throws if the size or the checksum is wrong. */
export function decodeReplayFile(file: Uint8Array): { header: Uint8Array; record: Uint8Array } {
  if (file.length !== REPLAY_FILE_BYTES) {
    throw new RangeError(`replay must have ${REPLAY_FILE_BYTES} bytes, got ${file.length}`);
  }
  const rng = new BorlandRandom(REPLAY_KEY);
  let checksum = random31(rng);
  const plain = new Uint8Array(REPLAY_HEADER_BYTES + REPLAY_RECORD_BYTES);
  for (let i = 0; i < plain.length; i++) {
    const c = file[i] ?? 0;
    const k = rng.below(0x100);
    rng.seed = rng.seed + c;
    const factor = Math.floor(random31(rng) / 256);
    checksum = (checksum + (c - 1) * factor) >>> 0;
    plain[i] = (c - k) & 0xff;
  }
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const stored = view.getUint32(REPLAY_HEADER_BYTES + REPLAY_RECORD_BYTES, true);
  if (stored !== checksum) {
    throw new Error("replay checksum mismatch");
  }
  return { header: plain.subarray(0, REPLAY_HEADER_BYTES), record: plain.subarray(REPLAY_HEADER_BYTES) };
}

function pascalString(bytes: Uint8Array, offset: number): string {
  const length = bytes[offset] ?? 0;
  let text = "";
  for (let i = 1; i <= length; i++) {
    text += String.fromCharCode(bytes[offset + i] ?? 0);
  }
  return text;
}

export function parseReplayRecord(header: Uint8Array, record: Uint8Array): ReplayRecord {
  const v = new DataView(record.buffer, record.byteOffset, record.byteLength);
  const f = (o: number) => v.getFloat32(o, true);
  const i32 = (o: number) => v.getInt32(o, true);
  return {
    // The header is the 13 characters themselves, with no length byte before them (docs/replay-format.md).
    versionTag: String.fromCharCode(...header.subarray(0, REPLAY_HEADER_BYTES)),
    wind: {
      xMPerS: f(0x00),
      yMPerS: f(0x04),
      variabilityMPerS: f(0x08),
      speedMPerS: f(0x0c),
      directionRad: f(0x10),
      indicatorDirectionRad: f(0x14),
      indicatorTurnRateRad: f(0x18),
      indicatorMaxTurnRateRad: f(0x1c),
    },
    hillIndex: record[0x20] ?? 0,
    hillRecordValue: f(0x21),
    distanceText: pascalString(record, 0x25),
    randomSeed: v.getUint32(0x2c, true),
    flag449: record[0x449] ?? 0,
    startFrame: i32(0x44a),
    buttonWindowStart: i32(0x44e),
    motionStart: i32(0x452),
    leftLandingFrame: i32(0x46a),
    rightLandingFrame: i32(0x46e),
    motionEnd: i32(0x472),
    bytes: record,
    jumperName: pascalString(record, 0x476),
    date: pascalString(record, 0x490),
    licensee: pascalString(record, 0x49b),
  };
}

/** 190d:026d: the input the player gave in a given frame. */
export function replayInputForFrame(r: ReplayRecord, frame: number): FrameInput {
  let left = false;
  let right = false;
  let dy = 0;
  const byte = (o: number) => r.bytes[o] ?? 0;
  if (frame === r.startFrame) {
    left = true;
  }
  if (frame >= r.buttonWindowStart && frame < r.buttonWindowStart + BUTTON_WINDOW_FRAMES) {
    const b = byte(0x455 + frame - r.buttonWindowStart + 1);
    left = b > 0;
    right = b > 1;
  }
  if (frame >= r.motionStart && frame <= r.motionEnd) {
    const raw = byte(0x2f + frame - r.motionStart + 1);
    dy = raw > 127 ? raw - 256 : raw;
  }
  if (frame === r.leftLandingFrame && r.leftLandingFrame > 0) {
    left = true;
  }
  if (frame === r.rightLandingFrame && r.rightLandingFrame > 0) {
    right = true;
  }
  return { left, right, dy };
}
