import type { HillChoice } from "../game/hill-choice";
import { fileStamp } from "../storage/replay-file";
import type { ShelfEntry } from "../storage/replay-shelf";
import { zipFile, type ZipEntry } from "../storage/zip-file";
import { UI_TEXT } from "../text/ui-text";
import { handOverFile } from "./hand-over-file";
import { rplExport, rplExportable, rplFileName } from "./rpl-export";

const T = UI_TEXT.replays;

/** Tells the player what came of it, next to what was pressed. */
export type Say = (text: string, error?: boolean) => void;

/** Lets the page show what was said before a long check holds it up. */
const nextPaint = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });

/** One replay as a file of the original, through the share sheet on a phone or as a download. */
export async function handOverRpl(
  entry: ShelfEntry,
  hills: readonly HillChoice[],
  preferShare: boolean,
  say: Say,
): Promise<void> {
  // Checking plays the jump many times, a second or more on a slow phone: the message shows first.
  say(T.rplChecking);
  await nextPaint();
  const made = rplExport(entry, hills);
  if (!made.ok) return say(made.message, true);
  const file = new File([made.file], rplFileName(entry), { type: "application/octet-stream" });
  const outcome = await handOverFile(file, T.rplTitle, preferShare);
  if (outcome === "cancelled") return say("");
  return say(made.approximate ? `${T.rplExported[outcome]} ${T.rplApproximate}` : T.rplExported[outcome]);
}

/** File names of DOS are eight characters: a second file of the same second ends in a letter instead. */
function distinctNames(files: readonly ZipEntry[]): ZipEntry[] {
  const taken = new Set<string>();
  return files.map((file) => {
    const letter = Array.from({ length: 26 }, (_, i) => `${file.name.slice(0, 7)}${String.fromCharCode(97 + i)}.rpl`);
    const name = [file.name, ...letter].find((candidate) => !taken.has(candidate)) ?? file.name;
    taken.add(name);
    return { ...file, name };
  });
}

/** Checks the replays one after another, telling how far it got; the ones that fit, and how many did not. */
async function checkedFiles(entries: readonly ShelfEntry[], hills: readonly HillChoice[], say: Say) {
  const files: ZipEntry[] = [];
  let unfit = 0;
  let approximate = 0;
  for (const [i, entry] of entries.entries()) {
    say(T.rplCheckingMany(i + 1, entries.length));
    // One replay at a time, each after a paint: the page keeps telling how far the check is.
    // oxlint-disable-next-line no-await-in-loop
    await nextPaint();
    const made = rplExport(entry, hills);
    if (made.ok) files.push({ name: rplFileName(entry), bytes: made.file });
    else unfit++;
    if (made.ok && made.approximate) approximate++;
  }
  return { files: distinctNames(files), unfit, approximate };
}

/**
 * The selected replays as files of the original: one file as it is, several in one ZIP archive (a browser asks
 * before it saves many downloads at once, or refuses). Replays of this game's own hills have no such file.
 */
export async function handOverManyRpl(
  entries: readonly ShelfEntry[],
  hills: readonly HillChoice[],
  preferShare: boolean,
  say: Say,
): Promise<void> {
  const exportable = entries.filter(rplExportable);
  const ownHills = entries.length - exportable.length;
  const { files, unfit, approximate } = await checkedFiles(exportable, hills, say);
  const [single] = files;
  if (single === undefined) return say(T.rplNoneFit(unfit, ownHills), true);
  const file =
    files.length === 1
      ? new File([single.bytes], single.name, { type: "application/octet-stream" })
      : new File([zipFile(files)], `telemark-rpl-${fileStamp(new Date())}.zip`, { type: "application/zip" });
  const outcome = await handOverFile(file, T.rplTitle, preferShare);
  if (outcome === "cancelled") return say("");
  return say(T.rplExportedMany(files.length, outcome, { approximate, unfit, ownHills }), unfit + ownHills > 0);
}
