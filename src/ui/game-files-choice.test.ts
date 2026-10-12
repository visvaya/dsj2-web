import { describe, expect, it } from "vitest";
import { OWN_HILLS } from "../game/hill-choice";
import { gameFilesOutcome } from "./game-files-choice";

const exe = new Uint8Array([1, 2, 3]);
const dat = new Uint8Array([4, 5]);
const twoHills = () => [...OWN_HILLS, ...OWN_HILLS];
const unreadable = () => {
  throw new Error("not an MZ executable");
};

describe("choosing the files of the original game", () => {
  it("refuses a choice without the game files and keeps nothing", () => {
    const outcome = gameFilesOutcome({}, twoHills);
    expect(outcome.keep).toBeNull();
    expect(outcome.hills).toBeNull();
    expect(outcome.message).toEqual({ text: "Wśród wybranych plików nie ma Dsj.exe.", error: true });
  });

  it("keeps a lone Dsj.dat and asks for Dsj.exe", () => {
    const outcome = gameFilesOutcome({ dat }, twoHills);
    expect(outcome.keep).toEqual({ dat });
    expect(outcome.hills).toBeNull();
    expect(outcome.message).toEqual({
      text: "Wczytano Dsj.dat. Wybierz jeszcze Dsj.exe: w nim są skocznie.",
      error: false,
    });
  });

  it("reads the hills from Dsj.exe and keeps it", () => {
    const outcome = gameFilesOutcome({ exe }, twoHills);
    expect(outcome.keep).toEqual({ exe });
    expect(outcome.hills).toHaveLength(2);
    expect(outcome.message).toEqual({ text: "Wczytano skocznie: 2.", error: false });
  });

  it("passes Dsj.dat to the reader and says where the names come from", () => {
    const seen: (Uint8Array | undefined)[] = [];
    const outcome = gameFilesOutcome({ exe, dat }, (_exe, givenDat) => {
      seen.push(givenDat);
      return twoHills();
    });
    expect(seen).toEqual([dat]);
    expect(outcome.keep).toEqual({ exe, dat });
    expect(outcome.message.text).toBe("Wczytano skocznie: 2 (nazwy z Dsj.dat).");
  });

  it("keeps nothing of files that cannot be read and says so in Polish", () => {
    const outcome = gameFilesOutcome({ exe, dat }, unreadable);
    expect(outcome.keep).toBeNull();
    expect(outcome.hills).toBeNull();
    expect(outcome.message).toEqual({
      text: "Nie udało się odczytać plików: to nie są pliki gry Deluxe Ski Jump 2 w wersji 2.10P albo są uszkodzone.",
      error: true,
    });
  });
});
