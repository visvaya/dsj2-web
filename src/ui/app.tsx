import { useEffect, useState } from "react";
import { OWN_HILLS, type HillChoice } from "../game/hill-choice";
import { emptySave, withJump, withSettings, type SaveData, type Settings } from "../storage/save-data";
import { detectBackend, loadSave, saveSave, type StorageBackend } from "../storage/save-store";
import { HillScreen } from "./hill-screen";
import { JumpScreen, type JumpResult } from "./jump-screen";
import { MenuScreen } from "./menu-screen";

type Screen = { kind: "menu" } | { kind: "hills" } | { kind: "jump"; hill: HillChoice };

export function App() {
  const [screen, setScreen] = useState<Screen>({ kind: "menu" });
  const [originalHills, setOriginalHills] = useState<HillChoice[]>([]);
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
        onExit={() => setScreen({ kind: "hills" })}
      />
    );
  }
  if (screen.kind === "hills") {
    return (
      <HillScreen
        hills={[...OWN_HILLS, ...originalHills]}
        records={save.records}
        onPick={(hill) => setScreen({ kind: "jump", hill })}
        onBack={() => setScreen({ kind: "menu" })}
      />
    );
  }
  return (
    <MenuScreen
      originalCount={originalHills.length}
      persistent={persistent}
      onTraining={() => setScreen({ kind: "hills" })}
      onOriginalHills={setOriginalHills}
    />
  );
}
