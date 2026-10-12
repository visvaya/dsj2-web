import { useEffect, useLayoutEffect, useState } from "react";
import { OWN_HILLS, originalHillChoices, type HillChoice } from "../game/hill-choice";
import { emptySave, withJump, withSettings, type SaveData, type Settings } from "../storage/save-data";
import { detectGameFilesStore, type GameFiles, type GameFilesStore } from "../storage/game-files-store";
import { detectBackend, loadSave, saveSave, type StorageBackend } from "../storage/save-store";
import { readOriginalHills } from "../original/original-hills";
import { HillScreen } from "./hill-screen";
import { JumpScreen, type JumpResult } from "./jump-screen";
import { MenuScreen } from "./menu-screen";
import { OutfitScreen } from "./outfit-screen";
import { screenTitle } from "./screen-title";

type Screen = { kind: "menu" } | { kind: "hills" } | { kind: "outfit" } | { kind: "jump"; hill: HillChoice };

export function App() {
  const [screen, setScreen] = useState<Screen>({ kind: "menu" });
  // The first screen leaves the focus where the browser put it; every later one takes it (see useEntryFocus).
  const [navigated, setNavigated] = useState(false);
  const show = (next: Screen) => {
    setNavigated(true);
    setScreen(next);
  };
  // What follows the screen: the title of the page, and the scroll position. A new screen starts at its top; the
  // page would otherwise keep the scroll position of the screen before it, so a screen opened from the end of a
  // long one would show its middle. Before the paint, so the old position never shows.
  useLayoutEffect(() => {
    document.title = screenTitle(screen);
    window.scrollTo(0, 0);
  }, [screen]);
  const [originalHills, setOriginalHills] = useState<HillChoice[]>([]);
  const [gameFiles, setGameFiles] = useState<GameFiles>({});
  const [filesStore] = useState<GameFilesStore>(detectGameFilesStore);
  const [filesStoreName, setFilesStoreName] = useState(filesStore.name);

  // Game files kept from an earlier visit bring their hills back without asking again.
  useEffect(() => {
    let cancelled = false;
    void filesStore.load().then((files) => {
      setFilesStoreName(filesStore.name);
      if (cancelled || !files.exe) return;
      try {
        setOriginalHills(originalHillChoices(readOriginalHills(files.exe, files.dat)));
        setGameFiles(files);
      } catch {
        void filesStore.clear();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [filesStore]);

  const onGameFiles = (files: GameFiles) => {
    setGameFiles(files);
    void filesStore.save(files).then(() => setFilesStoreName(filesStore.name));
  };

  const onForgetFiles = () => {
    setGameFiles({});
    setOriginalHills([]);
    void filesStore.clear();
  };
  const [save, setSave] = useState<SaveData>(emptySave);
  const [backend] = useState<StorageBackend>(detectBackend);
  const [saveFailed, setSaveFailed] = useState(false);
  const persistent = backend.name !== "memory" && !saveFailed;

  useEffect(() => {
    let cancelled = false;
    void loadSave(backend).then((loaded) => {
      if (!cancelled) setSave(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [backend]);

  const onFinished = (hill: HillChoice, result: JumpResult) => {
    setSave((prev) => {
      const next = withJump(prev, hill.id, result, new Date());
      if (next !== prev) saveSave(backend, next).catch(() => setSaveFailed(true));
      return next;
    });
  };

  const onSettings = (change: Partial<Settings>) => {
    setSave((prev) => {
      const next = withSettings(prev, change);
      saveSave(backend, next).catch(() => setSaveFailed(true));
      return next;
    });
  };

  if (screen.kind === "jump") {
    const hill = screen.hill;
    return (
      <JumpScreen
        hill={hill}
        record={save.records[hill.id]}
        settings={save.settings}
        onSettings={onSettings}
        onFinished={(result) => onFinished(hill, result)}
        onExit={() => show({ kind: "hills" })}
        focusOnEntry={navigated}
      />
    );
  }
  if (screen.kind === "outfit") {
    return (
      <OutfitScreen
        outfit={save.settings.outfit}
        onChange={(outfit) => onSettings({ outfit })}
        onBack={() => show({ kind: "menu" })}
        focusOnEntry={navigated}
      />
    );
  }
  if (screen.kind === "hills") {
    return (
      <HillScreen
        hills={[...OWN_HILLS, ...originalHills]}
        records={save.records}
        onPick={(hill) => show({ kind: "jump", hill })}
        onBack={() => show({ kind: "menu" })}
        focusOnEntry={navigated}
      />
    );
  }
  return (
    <MenuScreen
      originalCount={originalHills.length}
      gameFiles={gameFiles}
      filesRemembered={filesStoreName !== "memory"}
      onGameFiles={onGameFiles}
      onForgetFiles={onForgetFiles}
      persistent={persistent}
      onTraining={() => show({ kind: "hills" })}
      onOutfit={() => show({ kind: "outfit" })}
      focusOnEntry={navigated}
      onOriginalHills={setOriginalHills}
    />
  );
}
