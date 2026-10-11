import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { planSteps } from "../game/fixed-step";
import type { HillChoice } from "../game/hill-choice";
import { PlayerInput } from "../game/player-input";
import { isJumpOver, newSeed, startTrainingJump, stepTrainingJump, type TrainingJump } from "../game/training-session";
import { FrameBuffer } from "../render/frame-buffer";
import { VIEW_HEIGHT_PX, drawJumpView, viewWidthFor } from "../render/jump-view";
import type { HillRecord } from "../storage/save-data";

export interface JumpResult {
  distanceM: number;
  points: number;
  fell: boolean;
}

interface Props {
  hill: HillChoice;
  record: HillRecord | undefined;
  onFinished: (result: JumpResult) => void;
  onExit: () => void;
}

const PLAYER_NAME = "GRACZ 1";
const MOUSE_LEFT = 0;
const MOUSE_RIGHT = 2;

interface View {
  fb: FrameBuffer;
  image: ImageData;
}

function makeView(width: number): View {
  const fb = new FrameBuffer(width, VIEW_HEIGHT_PX);
  return { fb, image: new ImageData(fb.bytes, width, VIEW_HEIGHT_PX) };
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

interface TouchPadProps {
  side: "left" | "right";
  onPress: (down: boolean) => void;
  onDrag: (dy: number) => void;
}

/** A touch zone standing in for a mouse button; dragging in the left one leans like the mouse. */
function TouchPad({ side, onPress, onDrag }: TouchPadProps) {
  const lastY = useRef(new Map<number, number>());
  const release = (e: ReactPointerEvent<HTMLButtonElement>) => {
    lastY.current.delete(e.pointerId);
    if (lastY.current.size === 0) onPress(false);
  };
  return (
    <button
      type="button"
      className={`touch-pad touch-pad-${side}`}
      aria-label={side === "left" ? "Lewy przycisk; przesuwanie w pionie pochyla skoczka" : "Prawy przycisk"}
      onPointerDown={(e) => {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // The pointer is already gone; the press still counts.
        }
        lastY.current.set(e.pointerId, e.clientY);
        onPress(true);
      }}
      onPointerMove={(e) => {
        const prev = lastY.current.get(e.pointerId);
        if (prev === undefined) return;
        lastY.current.set(e.pointerId, e.clientY);
        onDrag(e.clientY - prev);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="touch-pad-key">{side === "left" ? "L" : "P"}</span>
      <span className="touch-pad-hint">{side === "left" ? "przeciągnij: pochylenie" : "L+P: wybicie"}</span>
    </button>
  );
}

export function JumpScreen({ hill, record, onFinished, onExit }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef(new PlayerInput());
  const restartRef = useRef<() => void>(() => undefined);
  const [announcement, setAnnouncement] = useState("");
  const touch = useMediaQuery("(pointer: coarse)");
  const latest = useRef({ onExit, onFinished, record });
  useEffect(() => {
    latest.current = { onExit, onFinished, record };
  });

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!stage || !canvas || !ctx) return undefined;

    const input = inputRef.current;
    input.reset();
    let jump: TrainingJump = startTrainingJump(hill, newSeed());
    let view = makeView(viewWidthFor(stage.clientWidth, stage.clientHeight));
    let finished = false;
    let recordLine: string | undefined;
    let acc = 0;
    let last = performance.now();
    let raf = 0;

    const restart = () => {
      jump = startTrainingJump(hill, newSeed());
      input.reset();
      finished = false;
      recordLine = undefined;
      setAnnouncement("");
    };
    restartRef.current = restart;

    const fit = () => {
      const width = viewWidthFor(stage.clientWidth, stage.clientHeight);
      if (width !== view.fb.width) view = makeView(width);
      canvas.width = width;
      canvas.height = VIEW_HEIGHT_PX;
      // Whole device pixels per game pixel keep every pixel the same size.
      const dpr = window.devicePixelRatio || 1;
      const scale = Math.max(1, Math.floor(Math.min((stage.clientWidth * dpr) / width, (stage.clientHeight * dpr) / VIEW_HEIGHT_PX)));
      canvas.style.width = `${(width * scale) / dpr}px`;
      canvas.style.height = `${(VIEW_HEIGHT_PX * scale) / dpr}px`;
    };
    fit();
    const resize = new ResizeObserver(fit);
    resize.observe(stage);

    const finish = () => {
      finished = true;
      const L = jump.state.logic;
      const result: JumpResult = { distanceM: L.distanceM, points: L.points, fell: L.fallType !== 0 };
      const best = latest.current.record;
      const isRecord = !result.fell && result.distanceM > 0 && (!best || result.distanceM > best.distanceM);
      recordLine = isRecord ? "NOWY REKORD SKOCZNI!" : best ? `REKORD: ${best.distanceM.toFixed(2)} M` : undefined;
      latest.current.onFinished(result);
      setAnnouncement(
        `Odległość ${result.distanceM.toFixed(2)} metra, ${result.points.toFixed(1)} punktu.${isRecord ? " Nowy rekord skoczni." : ""} R: jeszcze raz.`,
      );
    };

    const frame = (now: number) => {
      const plan = planSteps(acc, (now - last) / 1000);
      last = now;
      acc = plan.accumulatorS;
      for (let i = 0; i < plan.steps; i++) stepTrainingJump(jump, input.takeFrame());
      if (!finished && isJumpOver(jump)) finish();
      drawJumpView(view.fb, {
        profile: hill.profile,
        kPointM: hill.kPointM,
        hillName: hill.name,
        playerName: PLAYER_NAME,
        state: jump.state,
        ...(recordLine === undefined ? {} : { recordLine }),
      });
      ctx.putImageData(view.image, 0, 0);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      e.preventDefault();
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock().catch(() => undefined);
      if (e.button === MOUSE_LEFT) input.left = true;
      if (e.button === MOUSE_RIGHT) input.right = true;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      if (e.button === MOUSE_LEFT) input.left = false;
      if (e.button === MOUSE_RIGHT) input.right = false;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse") input.addMotion(e.movementY);
    };
    const onContextMenu = (e: Event) => e.preventDefault();
    const onKey = (e: KeyboardEvent, down: boolean) => {
      switch (e.code) {
        case "KeyZ":
          input.left = down;
          break;
        case "KeyX":
          input.right = down;
          break;
        case "ArrowUp":
          input.setLeanKeys(down ? -1 : 0);
          break;
        case "ArrowDown":
          input.setLeanKeys(down ? 1 : 0);
          break;
        case "KeyR":
          if (down) restart();
          break;
        case "Escape":
          if (down && document.pointerLockElement !== canvas) latest.current.onExit();
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    const onKeyDown = (e: KeyboardEvent) => onKey(e, true);
    const onKeyUp = (e: KeyboardEvent) => onKey(e, false);

    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      restartRef.current = () => undefined;
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    };
  }, [hill]);

  return (
    <div className={touch ? "game touch" : "game"}>
      <div className="game-stage" ref={stageRef}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Skok na skoczni ${hill.name} K${hill.kPointM}. Lewy przycisk myszy lub Z: start, oba przyciski lub Z i X: wybicie, mysz lub strzałki: pochylenie, jeden przycisk: lądowanie.`}
        />
      </div>
      <div className="game-toolbar">
        <button type="button" className="pixel-button" onClick={() => restartRef.current()}>
          Jeszcze raz{touch ? "" : " (R)"}
        </button>
        <button type="button" className="pixel-button" onClick={onExit}>
          Skocznie{touch ? "" : " (Esc)"}
        </button>
      </div>
      {touch && (
        <TouchPad
          side="left"
          onPress={(down) => {
            inputRef.current.left = down;
          }}
          onDrag={(dy) => inputRef.current.addMotion(dy)}
        />
      )}
      {touch && (
        <TouchPad
          side="right"
          onPress={(down) => {
            inputRef.current.right = down;
          }}
          onDrag={() => undefined}
        />
      )}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
