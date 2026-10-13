import { useEffect, useLayoutEffect, useState } from "react";
import { OWN_HILLS, originalHillChoices, type HillChoice } from "../game/hill-choice";
import { emptySave, withJump, withSettings, type SaveData, type Settings } from "../storage/save-data";
import { detectGameFilesStore, type GameFiles, type GameFilesStore } from "../storage/game-files-store";
import { detectBackend, loadSave, saveSave, type StorageBackend } from "../storage/save-store";
import { readOriginalHills } from "../original/original-hills";
import { HillScreen } from "./hill-screen";
import { HowToScreen } from "./how-to-jump";
import { InstallScreen } from "./install-screen";
import { JumpScreen, type JumpResult } from "./jump-screen";
import { MenuScreen } from "./menu-screen";
import { OutfitScreen } from "./outfit-screen";
import { screenTitle } from "./screen-title";
import { useOfflineState } from "./use-offline-state";

type Screen =
  | { kind: "menu" }
  | { kind: "hills" }
  | { kind: "outfit" }
  | { kind: "howto" }
  | { kind: "install" }
  | { kind: "jump"; hill: HillChoice };

interface InfoProps {
  kind: "howto" | "install";
  /** Whether a touch screen is steered by tilting the phone. */
  tilt: boolean;
  onBack: () => void;
  focusOnEntry: boolean;
}

/** The screens that only tell the player something and lead back to the menu. */
function InfoScreen({ kind, tilt, onBack, focusOnEntry }: InfoProps) {
  return kind === "howto" ? (
    <HowToScreen tilt={tilt} onBack={onBack} focusOnEntry={focusOnEntry} />
  ) : (
    <InstallScreen onBack={onBack} focusOnEntry={focusOnEntry} />
  );
}

/** The screen shown, and how to show another one. */
function useScreens(): { screen: Screen; navigated: boolean; show: (next: Screen) => void } {
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
  return { screen, navigated, show };
}

export function App() {
  const { screen, navigated, show } = useScreens();
  const offline = useOfflineState();
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
        key={hill.id}
        hill={hill}
        record={save.records[hill.id]}
        settings={save.settings}
        onSettings={onSettings}
        onFinished={(result) => onFinished(hill, result)}
        hills={[...OWN_HILLS, ...originalHills]}
        records={save.records}
        onPickHill={(picked) => show({ kind: "jump", hill: picked })}
        onExit={() => show({ kind: "menu" })}
        focusOnEntry={navigated}
      />
    );
  }
  if (screen.kind === "howto" || screen.kind === "install") {
    const tilt = save.settings.leanControl === "tilt";
    return <InfoScreen kind={screen.kind} tilt={tilt} onBack={() => show({ kind: "menu" })} focusOnEntry={navigated} />;
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
      offline={offline}
      onTraining={() => show({ kind: "hills" })}
      onOutfit={() => show({ kind: "outfit" })}
      onHowTo={() => show({ kind: "howto" })}
      onInstall={() => show({ kind: "install" })}
      focusOnEntry={navigated}
      onOriginalHills={setOriginalHills}
    />
  );
}
