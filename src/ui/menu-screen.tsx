import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { originalHillChoices, type HillChoice } from "../game/hill-choice";
import { versionLabel } from "../game/version";
import { readOriginalHills } from "../original/original-hills";
import type { OfflineState } from "../pwa/offline-state";
import type { GameFiles } from "../storage/game-files-store";
import { gameFilesOutcome } from "./game-files-choice";
import { OfflineNotice } from "./offline-notice";
import { useEntryFocus } from "./use-entry-focus";
import { INSTALLED_QUERY, TOUCH_QUERY, useMediaQuery } from "./use-media-query";

/** Written by number: as characters in the source they could not be told from nothing and from a space. */
const SOFT_HYPHEN = String.fromCodePoint(0xad);
const NO_BREAK_SPACE = String.fromCodePoint(0xa0);

/**
 * Said when the browser does not let the page close its own window. The note is set flush to both edges of its
 * frame, so the long words carry the places where they may be divided at the end of a line ("|", shown as a
 * hyphen only where a word is divided), and "~" keeps a one-letter word with the word after it. Browsers divide
 * Polish words on their own only where they have a dictionary for it, which not every one has.
 */
const QUIT_REFUSED =
  "Gra nie może za|mknąć tej karty sama. Za|mknij ją krzy|ży|kiem karty albo kla|wi|sza|mi Ctrl+W. Możesz wyjść z~trybu peł|no|ekra|no|we|go przy|ci|skiem F11."
    .replaceAll("|", SOFT_HYPHEN)
    .replaceAll("~", NO_BREAK_SPACE);
/** A window that closes is gone before this; one that stays gets the note. */
const QUIT_NOTE_AFTER_MS = 300;

interface Props {
  originalCount: number;
  gameFiles: GameFiles;
  /** Whether chosen files are kept for the next visit (false: only until the page closes). */
  filesRemembered: boolean;
  onGameFiles: (files: GameFiles) => void;
  onForgetFiles: () => void;
  persistent: boolean;
  /** Whether the game can start without a network; null where it has no offline mode. */
  offline: OfflineState | null;
  /** Opens another screen of the game. */
  onOpen: (screen: "hills" | "outfit" | "settings" | "howto" | "install") => void;
  onOriginalHills: (hills: HillChoice[]) => void;
  /** Whether the heading takes the keyboard focus when the screen appears. */
  focusOnEntry: boolean;
}

async function bytesOf(files: FileList, name: string): Promise<Uint8Array | undefined> {
  const file = Array.from(files).find((f) => f.name.toLowerCase() === name);
  return file ? new Uint8Array(await file.arrayBuffer()) : undefined;
}

export function MenuScreen({
  originalCount,
  gameFiles,
  filesRemembered,
  onGameFiles,
  onForgetFiles,
  persistent,
  offline,
  onOpen,
  onOriginalHills,
  focusOnEntry,
}: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEntryFocus(headingRef, focusOnEntry);
  // Started from its own icon the game is installed already, and the instructions for that are left out.
  const installed = useMediaQuery(INSTALLED_QUERY);
  const touch = useMediaQuery(TOUCH_QUERY);
  const [quitRefused, setQuitRefused] = useState(false);
  const quitNoteRef = useRef<HTMLParagraphElement>(null);
  // The note takes the focus, so it is not missed: the eyes are on the button that was just pressed.
  useEffect(() => {
    if (quitRefused) quitNoteRef.current?.focus();
  }, [quitRefused]);
  /**
   * Closes the window of the game. A browser lets a page do that only for a window it has nowhere to go back
   * in (the installed game, a tab opened for it); where it refuses, the player is told how to close the tab.
   */
  const quit = () => {
    window.close();
    window.setTimeout(() => setQuitRefused(true), QUIT_NOTE_AFTER_MS);
  };
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (!files || files.length === 0) return;
    // Files may come one at a time (some pickers allow only one), so new ones join those chosen before.
    const exe = (await bytesOf(files, "dsj.exe")) ?? gameFiles.exe;
    const dat = (await bytesOf(files, "dsj.dat")) ?? gameFiles.dat;
    const outcome = gameFilesOutcome({ ...(exe ? { exe } : {}), ...(dat ? { dat } : {}) }, (exeBytes, datBytes) =>
      originalHillChoices(readOriginalHills(exeBytes, datBytes)),
    );
    if (outcome.keep) onGameFiles(outcome.keep);
    if (outcome.hills) onOriginalHills(outcome.hills);
    setMessage(outcome.message);
  };

  return (
    <main className="screen">
      <header>
        <h1 className="title" tabIndex={-1} ref={headingRef}>
          Telemark
        </h1>
        <p className="note">Skoki narciarskie · {versionLabel()}</p>
      </header>
      <hr className="rule" />
      <nav className="menu" aria-label="Główne menu">
        <h2>Główne menu</h2>
        <button type="button" className="pixel-button" onClick={() => onOpen("hills")}>
          Trening
        </button>
        <button type="button" className="pixel-button" onClick={() => onOpen("outfit")}>
          Strój
        </button>
        <button type="button" className="pixel-button" onClick={() => onOpen("settings")}>
          Ustawienia
        </button>
        <button type="button" className="pixel-button" onClick={() => onOpen("howto")}>
          Jak skakać
        </button>
        {!installed && (
          <button type="button" className="pixel-button" onClick={() => onOpen("install")}>
            Gra jako aplikacja
          </button>
        )}
        <label className="pixel-button file-label">
          Wczytaj pliki gry
          {/* No accept filter: iOS does not know .dat and greys such files out. The names are checked instead. */}
          <input type="file" multiple onChange={(e) => void onFiles(e)} />
        </label>
        {!touch && (
          <button type="button" className="pixel-button" onClick={quit}>
            Wyłącz grę
          </button>
        )}
        {quitRefused && (
          <p className="note quit-note" role="status" tabIndex={-1} ref={quitNoteRef}>
            {QUIT_REFUSED}
          </p>
        )}
      </nav>
      <p className="note">
        Skocznie z oryginału: wybierz Dsj.exe ze swojej kopii gry (zawiera skocznie). Dsj.dat jest opcjonalny: daje
        nazwy z Twojej wersji gry. Plik zostaje w przeglądarce, nic nie jest wysyłane.
      </p>
      {gameFiles.exe && (
        <div className="files-status">
          <p className="note">
            {`Skocznie z oryginału: ${originalCount}. `}
            {filesRemembered
              ? `Pliki (${gameFiles.dat ? "Dsj.exe, Dsj.dat" : "Dsj.exe"}) zapamiętane w tej przeglądarce.`
              : "Ta przeglądarka nie pozwala ich zapamiętać: po zamknięciu strony wybierz je ponownie."}
          </p>
          {filesRemembered && (
            <button
              type="button"
              className="pixel-button small-button"
              onClick={() => {
                onForgetFiles();
                setMessage({ text: "Zapomniano pliki gry.", error: false });
              }}
            >
              Zapomnij pliki
            </button>
          )}
        </div>
      )}
      {!persistent && (
        <p className="note error">Przeglądarka nie pozwala zapisywać danych: rekordy znikną po zamknięciu strony.</p>
      )}
      {message && (
        <p className={message.error ? "note error" : "note"} role="status">
          {message.text}
        </p>
      )}
      <OfflineNotice state={offline} />
    </main>
  );
}
