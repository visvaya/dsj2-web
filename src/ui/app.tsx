import { useState } from "react";
import { OWN_HILLS, type HillChoice } from "../game/hill-choice";
import { HillScreen } from "./hill-screen";
import { JumpScreen } from "./jump-screen";
import { MenuScreen } from "./menu-screen";

type Screen = { kind: "menu" } | { kind: "hills" } | { kind: "jump"; hill: HillChoice };

export function App() {
  const [screen, setScreen] = useState<Screen>({ kind: "menu" });
  const [originalHills, setOriginalHills] = useState<HillChoice[]>([]);

  if (screen.kind === "jump") {
    return <JumpScreen hill={screen.hill} onExit={() => setScreen({ kind: "hills" })} />;
  }
  if (screen.kind === "hills") {
    return (
      <HillScreen
        hills={[...OWN_HILLS, ...originalHills]}
        onPick={(hill) => setScreen({ kind: "jump", hill })}
        onBack={() => setScreen({ kind: "menu" })}
      />
    );
  }
  return (
    <MenuScreen
      originalCount={originalHills.length}
      onTraining={() => setScreen({ kind: "hills" })}
      onOriginalHills={setOriginalHills}
    />
  );
}
