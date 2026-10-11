import { useState, type ChangeEvent } from "react";
import { originalHillChoices, type HillChoice } from "../game/hill-choice";
import { readOriginalHills } from "../original/original-hills";

interface Props {
  originalCount: number;
  persistent: boolean;
  onTraining: () => void;
  onOutfit: () => void;
  onOriginalHills: (hills: HillChoice[]) => void;
}

async function bytesOf(files: FileList, name: string): Promise<Uint8Array | undefined> {
  const file = Array.from(files).find((f) => f.name.toLowerCase() === name);
  return file ? new Uint8Array(await file.arrayBuffer()) : undefined;
}

export function MenuScreen({ originalCount, persistent, onTraining, onOutfit, onOriginalHills }: Props) {
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (!files || files.length === 0) return;
    try {
      const exe = await bytesOf(files, "dsj.exe");
      if (!exe) {
        setMessage({ text: "Brak pliku Dsj.exe wśród wybranych.", error: true });
        return;
      }
      const hills = originalHillChoices(readOriginalHills(exe, await bytesOf(files, "dsj.dat")));
      onOriginalHills(hills);
      setMessage({ text: `Wczytano skocznie: ${hills.length}.`, error: false });
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
          <input type="file" multiple accept=".exe,.dat" onChange={(e) => void onFiles(e)} />
        </label>
      </nav>
      <p className="note">
        Skocznie z oryginału: wybierz Dsj.exe i Dsj.dat ze swojej kopii gry. Pliki zostają w przeglądarce, nic nie jest wysyłane.
        {originalCount > 0 ? ` Wczytane: ${originalCount}.` : ""}
      </p>
      {!persistent && <p className="note error">Przeglądarka nie pozwala zapisywać danych: rekordy znikną po zamknięciu strony.</p>}
      {message && (
        <p className={message.error ? "note error" : "note"} role="status">
          {message.text}
        </p>
      )}
    </main>
  );
}
