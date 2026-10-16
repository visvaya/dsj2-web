import { useEffect, useReducer, useState } from "react";
import { reduceUpdateCheck, type OfflineState } from "../pwa/offline-state";
import { UI_TEXT } from "../text/ui-text";
import type { UpdateControls } from "./use-offline-state";

/** Whether the game can be played without a network. */
export function OfflineNotice({ state }: { state: OfflineState | null }) {
  if (state === null) return null;
  return (
    <div className="offline-notice">
      <p className="note">{UI_TEXT.offline.readiness[state.readiness]}</p>
    </div>
  );
}

/**
 * How long a release has to wait before the note about it shows. On the first launch after an update the browser
 * may report the new release as waiting for a moment before it takes over; a note for that moment would flash.
 */
const UPDATE_NOTE_AFTER_MS = 1500;

/** Whether a release has been waiting for a while, not only for the moment of a takeover. */
export function useLastingWait(waiting: boolean): boolean {
  const [lasting, setLasting] = useState(false);
  useEffect(() => {
    if (!waiting) return undefined;
    const timer = setTimeout(() => setLasting(true), UPDATE_NOTE_AFTER_MS);
    // Once the release no longer waits, a later one waits its own while again.
    return () => {
      clearTimeout(timer);
      setLasting(false);
    };
  }, [waiting]);
  return waiting && lasting;
}

/** The note of a waiting release in the main menu: the fact, the button that installs it now, the slow way. */
function InstallNote({ version, onInstall }: { version: string | null; onInstall: (onFailed: () => void) => boolean }) {
  const [install, setInstall] = useState<"idle" | "installing" | "failed">("idle");
  const installing = install === "installing";
  const onPress = () => {
    if (installing) return;
    // The page reloads once the release has taken over; until then the player is told it is under way.
    const started = onInstall(() => setInstall("failed"));
    setInstall(started ? "installing" : "failed");
  };
  return (
    <div className="framed-note update-note install-note">
      <p className="note update-fact">{UI_TEXT.offline.updateFound(version)}</p>
      <button type="button" className="pixel-button small-button" aria-disabled={installing} onClick={onPress}>
        {UI_TEXT.offline.installNow}
      </button>
      <div aria-live="polite">
        {install !== "idle" && (
          <p className="note update-fact">{installing ? UI_TEXT.offline.installing : UI_TEXT.offline.installFailed}</p>
        )}
      </div>
      <p className="note">{UI_TEXT.offline.slowWay}</p>
    </div>
  );
}

/** A release has taken over from another window; this page still runs the code it started with. */
function ElsewhereNote({ onReload }: { onReload: (() => void) | undefined }) {
  return (
    <div className="framed-note update-note install-note">
      <p className="note update-fact">{UI_TEXT.offline.updatedElsewhere}</p>
      {onReload && (
        <button type="button" className="pixel-button small-button" onClick={onReload}>
          {UI_TEXT.offline.reload}
        </button>
      )}
    </div>
  );
}

/**
 * That a newer release is waiting and how to get it, framed so it is seen: at the top of the main menu and in the
 * menu of the jump screen. It is announced to screen readers when it appears; nothing here takes the focus. The
 * region is empty until then and sits inside a block of its own place, so it leaves no gap in a column of buttons.
 *
 * With `updates` it also offers to install the release at once, or to load a release installed from another
 * window, both by reloading the page. Only the main menu passes it: on the jump screen a reload would end the
 * jump that is paused there, so the note there only says what to do.
 */
export function UpdateNotice({
  state,
  updates,
}: {
  state: OfflineState | null;
  updates?: UpdateControls | null | undefined;
}) {
  const shown = useLastingWait(state?.updateWaiting === true);
  const elsewhere = state?.updatedElsewhere === true && !shown;
  return (
    <div aria-live="polite">
      {shown && state && !updates && (
        <p className="note framed-note update-note">{UI_TEXT.offline.updateWaiting(state.updateVersion)}</p>
      )}
      {shown && state && updates && <InstallNote version={state.updateVersion} onInstall={updates.installNow} />}
      {elsewhere && <ElsewhereNote onReload={updates?.reloadNow} />}
    </div>
  );
}

/**
 * A button that looks for a new release now, and what it found, said in a live region beside it. Presses while
 * a check runs make no second check. A release that is found is stored in the background as any other, and
 * `UpdateNotice` offers it once it waits; from then on the note says it, and the line here says nothing.
 */
export function UpdateCheck({
  updates,
  noteShown,
  failures,
}: {
  updates: UpdateControls;
  noteShown: boolean;
  /** How many newer releases could not be stored so far (`OfflineState.updateFailures`). */
  failures: number;
}) {
  const [check, dispatch] = useReducer(reduceUpdateCheck, "idle");
  // The failures counted when the last check started: one more since then is the release that check found.
  const [failuresAtCheck, setFailuresAtCheck] = useState(failures);
  const checking = check === "checking";
  const onCheck = () => {
    if (checking) return;
    setFailuresAtCheck(failures);
    dispatch("start");
    void updates.checkNow().then(dispatch);
  };
  const line = (() => {
    if (check === "idle") return null;
    if (check !== "found") return UI_TEXT.offline.check[check];
    if (failures > failuresAtCheck) return UI_TEXT.offline.check.downloadFailed;
    // Once the note of the waiting release shows, the note alone says it.
    return noteShown ? null : UI_TEXT.offline.check.found;
  })();
  return (
    <div className="update-check">
      <button type="button" className="quiet-button" aria-disabled={checking} onClick={onCheck}>
        {UI_TEXT.offline.check.button}
      </button>
      {/* A region of its own, there before the first answer so that answer is announced. */}
      <div aria-live="polite">{line !== null && <p className="note">{line}</p>}</div>
    </div>
  );
}
