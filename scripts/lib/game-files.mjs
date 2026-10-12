// Reads files of the player's own copy of the original game for the command-line scripts.
// The directory is given by the caller; nothing is read from or written to it otherwise.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// The name is matched without regard to letter case, like the game's own file system does.
function findGameFile(gameDir, name) {
  const found = readdirSync(gameDir).find((file) => file.toLowerCase() === name.toLowerCase());
  return found === undefined ? undefined : join(gameDir, found);
}

// Returns { exe, dat }; dat is undefined when the directory has no Dsj.dat (hills then have no names).
export function readGameFiles(gameDir) {
  const exePath = findGameFile(gameDir, "Dsj.exe");
  if (exePath === undefined) {
    throw new Error(`no Dsj.exe in ${gameDir}`);
  }
  const datPath = findGameFile(gameDir, "Dsj.dat");
  return {
    exe: new Uint8Array(readFileSync(exePath)),
    dat: datPath === undefined ? undefined : new Uint8Array(readFileSync(datPath)),
  };
}
