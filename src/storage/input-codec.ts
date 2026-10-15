import type { FrameInput } from "../sim/jump-logic";

/**
 * The input of a jump as text, frame by frame (index 0 is the input of the first step). Two forms are read: the
 * first one, two bytes a frame in base64, and the compact one this game writes now, "2:" and base64 of:
 *
 * - the number of frames;
 * - the presses: their count, then for each the frames since the end of the one before, its length and its
 *   buttons (1 left, 2 right, 3 both); frames between presses have no buttons;
 * - the motion: its first frame and its length, then one signed byte a frame; frames outside it have none.
 *
 * Numbers are unsigned LEB128. A jump has a handful of presses and moves only in the air, so most of it costs
 * nothing: a jump of 900 frames takes a few dozen bytes without motion, against 1800 in the first form.
 */

const COMPACT_PREFIX = "2:";
/** Bytes of a frame of input in the first form: the buttons, then the vertical motion as a signed byte. */
const FRAME_BYTES = 2;
/** More frames than any jump has: the start time runs out after 16 s, and a jump is over within 6000 frames. */
const MAX_FRAMES = 20_000;

const buttonsOf = (input: FrameInput): number => (input.left ? 1 : 0) | (input.right ? 2 : 0);

function writeNumber(out: number[], value: number): void {
  let rest = value;
  do {
    const low = rest & 0x7f;
    rest = Math.floor(rest / 0x80);
    out.push(rest > 0 ? low | 0x80 : low);
  } while (rest > 0);
}

/** The inputs of a jump as the compact text. */
export function encodeInputs(inputs: readonly FrameInput[]): string {
  const out: number[] = [];
  writeNumber(out, inputs.length);
  const presses: { from: number; length: number; buttons: number }[] = [];
  inputs.forEach((input, frame) => {
    const buttons = buttonsOf(input);
    const last = presses.at(-1);
    if (buttons === 0) return;
    if (last && last.buttons === buttons && last.from + last.length === frame) last.length++;
    else presses.push({ from: frame, length: 1, buttons });
  });
  writeNumber(out, presses.length);
  let end = 0;
  for (const press of presses) {
    writeNumber(out, press.from - end);
    writeNumber(out, press.length);
    out.push(press.buttons);
    end = press.from + press.length;
  }
  const first = inputs.findIndex((input) => input.dy !== 0);
  const last = inputs.findLastIndex((input) => input.dy !== 0);
  writeNumber(out, first === -1 ? 0 : first);
  writeNumber(out, first === -1 ? 0 : last - first + 1);
  if (first !== -1) for (const input of inputs.slice(first, last + 1)) out.push(input.dy & 0xff);
  return COMPACT_PREFIX + btoa(String.fromCharCode(...out));
}

const NO_INPUT: FrameInput = { left: false, right: false, dy: 0 };

/** Reads bytes in order; every read past the end is null, so a short text is refused, not read as zeros. */
function reader(bytes: string) {
  let at = 0;
  const byte = (): number | null => (at < bytes.length ? bytes.charCodeAt(at++) : null);
  const number = (): number | null => {
    let value = 0;
    for (let shift = 0; shift < 28; shift += 7) {
      const b = byte();
      if (b === null) return null;
      value += (b & 0x7f) * 2 ** shift;
      if ((b & 0x80) === 0) return value;
    }
    return null;
  };
  return { byte, number, done: () => at === bytes.length };
}

function decodeCompact(raw: string): FrameInput[] | null {
  const r = reader(raw);
  const frames = r.number();
  if (frames === null || frames > MAX_FRAMES) return null;
  const inputs: FrameInput[] = Array.from({ length: frames }, () => NO_INPUT);
  const presses = r.number();
  if (presses === null || presses > frames) return null;
  let end = 0;
  for (let i = 0; i < presses; i++) {
    const [gap, length, buttons] = [r.number(), r.number(), r.byte()];
    if (gap === null || length === null || buttons === null || length === 0 || buttons < 1 || buttons > 3) return null;
    const from = end + gap;
    if (from + length > frames) return null;
    for (let frame = from; frame < from + length; frame++) {
      inputs[frame] = { left: (buttons & 1) !== 0, right: (buttons & 2) !== 0, dy: 0 };
    }
    end = from + length;
  }
  const [first, length] = [r.number(), r.number()];
  if (first === null || length === null || first + length > frames) return null;
  for (let frame = first; frame < first + length; frame++) {
    const motion = r.byte();
    if (motion === null) return null;
    inputs[frame] = { ...(inputs[frame] ?? NO_INPUT), dy: motion > 127 ? motion - 256 : motion };
  }
  return r.done() ? inputs : null;
}

function decodeFirstForm(raw: string): FrameInput[] | null {
  if (raw.length % FRAME_BYTES !== 0) return null;
  const inputs: FrameInput[] = [];
  for (let i = 0; i < raw.length; i += FRAME_BYTES) {
    const buttons = raw.charCodeAt(i);
    const motion = raw.charCodeAt(i + 1);
    if (buttons > 3) return null;
    inputs.push({ left: (buttons & 1) !== 0, right: (buttons & 2) !== 0, dy: motion > 127 ? motion - 256 : motion });
  }
  return inputs;
}

/** The inputs back from their text, in either form; null for text that is not one of them. */
export function decodeInputs(text: string): FrameInput[] | null {
  const compact = text.startsWith(COMPACT_PREFIX);
  let raw: string;
  try {
    raw = atob(compact ? text.slice(COMPACT_PREFIX.length) : text);
  } catch {
    return null;
  }
  return compact ? decodeCompact(raw) : decodeFirstForm(raw);
}
