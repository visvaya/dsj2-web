import { useState, type ChangeEvent } from "react";
import { originalHillChoices, type HillChoice } from "../game/hill-choice";
import { readOriginalHills } from "../original/original-hills";
import type { GameFiles } from "../storage/game-files-store";

interface Props {
  originalCount: number;
  gameFiles: GameFiles;
  /** Whether chosen files are kept for the next visit (false: only until the page closes). */
  filesRemembered: boolean;
  onGameFiles: (files: GameFiles) => void;
  onForgetFiles: () => void;
  persistent: boolean;
  onTraining: () => void;
  onOutfit: () => void;
  onOriginalHills: (hills: HillChoice[]) => void;
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
  onTraining,
  onOutfit,
  onOriginalHills,
}: Props) {
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (!files || files.length === 0) return;
    try {
      // Files may come one at a time (some pickers allow only one), so new ones join those chosen before.
      const exe = (await bytesOf(files, "dsj.exe")) ?? gameFiles.exe;
      const dat = (await bytesOf(files, "dsj.dat")) ?? gameFiles.dat;
      onGameFiles({ ...(exe ? { exe } : {}), ...(dat ? { dat } : {}) });
      if (!exe) {
        setMessage({
          text: dat ? "Wczytano Dsj.dat. Wybierz jeszcze Dsj.exe: w nim są skocznie." : "Wśród wybranych plików nie ma Dsj.exe.",
          error: !dat,
        });
        return;
      }
      const hills = originalHillChoices(readOriginalHills(exe, dat));
      onOriginalHills(hills);
      setMessage({
        text: dat
          ? `Wczytano skocznie: ${hills.length} (nazwy z Dsj.dat).`
          : `Wczytano skocznie: ${hills.length}.`,
        error: false,
      });
    } catch (err) {
      setMessage({ text: `Nie udało się odczytać plików: ${err instanceof Error ? err.message : String(err)}`, error: true });
    }
  };

  return (
    <main className="screen">
      <header>
        <h1 className="title">Telemark</h1>
        <p className="note">Skoki narciarskie · wersja robocza</p>
      </header>
      <hr className="rule" />
      <nav className="menu" aria-label="Główne menu">
        <h2>Główne menu</h2>
        <button type="button" className="pixel-button" onClick={onTraining}>
          Trening
        </button>
        <button type="button" className="pixel-button" onClick={onOutfit}>
          Strój
        </button>
        <label className="pixel-button file-label">
          Wczytaj pliki gry
          {/* No accept filter: iOS does not know .dat and greys such files out. The names are checked instead. */}
          <input type="file" multiple onChange={(e) => void onFiles(e)} />
        </label>
      </nav>
      <p className="note">
        Skocznie z oryginału: wybierz Dsj.exe ze swojej kopii gry (zawiera skocznie). Dsj.dat jest opcjonalny: daje nazwy
        z Twojej wersji gry. Plik zostaje w przeglądarce, nic nie jest wysyłane.
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
      {!persistent && <p className="note error">Przeglądarka nie pozwala zapisywać danych: rekordy znikną po zamknięciu strony.</p>}
      {message && (
        <p className={message.error ? "note error" : "note"} role="status">
          {message.text}
        </p>
      )}
    </main>
  );
}
