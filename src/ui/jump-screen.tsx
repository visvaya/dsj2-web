import { useEffect, useRef, useState } from "react";
import { planSteps } from "../game/fixed-step";
import type { HillChoice } from "../game/hill-choice";
import { PlayerInput } from "../game/player-input";
import { isJumpOver, newSeed, startTrainingJump, stepTrainingJump, type TrainingJump } from "../game/training-session";
import { FrameBuffer } from "../render/frame-buffer";
import { VIEW_HEIGHT_PX, drawJumpView, viewWidthFor } from "../render/jump-view";

interface Props {
  hill: HillChoice;
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

export function JumpScreen({ hill, onExit }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [announcement, setAnnouncement] = useState("");
  const exitRef = useRef(onExit);
  useEffect(() => {
    exitRef.current = onExit;
  });

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!stage || !canvas || !ctx) return undefined;

    const input = new PlayerInput();
    let jump: TrainingJump = startTrainingJump(hill, newSeed());
    let view = makeView(viewWidthFor(stage.clientWidth, stage.clientHeight));
    let announced = false;
    let acc = 0;
    let last = performance.now();
    let raf = 0;
    const touches = new Map<number, "left" | "right">();

    const restart = () => {
      jump = startTrainingJump(hill, newSeed());
      input.reset();
      touches.clear();
      announced = false;
      setAnnouncement("");
    };

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

    const frame = (now: number) => {
      const plan = planSteps(acc, (now - last) / 1000);
      last = now;
      acc = plan.accumulatorS;
      for (let i = 0; i < plan.steps; i++) stepTrainingJump(jump, input.takeFrame());
      drawJumpView(view.fb, {
        profile: hill.profile,
        kPointM: hill.kPointM,
        hillName: hill.name,
        playerName: PLAYER_NAME,
        state: jump.state,
      });
      ctx.putImageData(view.image, 0, 0);
      if (!announced && isJumpOver(jump)) {
        announced = true;
        const L = jump.state.logic;
        setAnnouncement(`Odległość ${L.distanceM.toFixed(2)} metra, ${L.points.toFixed(1)} punktu. R: jeszcze raz.`);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const zoneOf = (e: PointerEvent): "left" | "right" => {
      const r = canvas.getBoundingClientRect();
      return e.clientX < r.left + r.width / 2 ? "left" : "right";
    };
    const syncTouches = () => {
      const zones = new Set(touches.values());
      input.left = zones.has("left");
      input.right = zones.has("right");
    };
    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      if (e.pointerType === "mouse") {
        if (document.pointerLockElement !== canvas) canvas.requestPointerLock().catch(() => undefined);
        if (e.button === MOUSE_LEFT) input.left = true;
        if (e.button === MOUSE_RIGHT) input.right = true;
      } else {
        canvas.setPointerCapture(e.pointerId);
        touches.set(e.pointerId, zoneOf(e));
        syncTouches();
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === "mouse") {
        if (e.button === MOUSE_LEFT) input.left = false;
        if (e.button === MOUSE_RIGHT) input.right = false;
      } else {
        touches.delete(e.pointerId);
        syncTouches();
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      // Mouse: any vertical motion leans; touch: dragging in the left zone does.
      if (e.pointerType === "mouse" || touches.get(e.pointerId) === "left") input.addMotion(e.movementY);
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
          if (down && document.pointerLockElement !== canvas) exitRef.current();
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    const onKeyDown = (e: KeyboardEvent) => onKey(e, true);
    const onKeyUp = (e: KeyboardEvent) => onKey(e, false);
    const onRestart = () => restart();

    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("contextmenu", onContextMenu);
    canvas.addEventListener("telemark-restart", onRestart);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("contextmenu", onContextMenu);
      canvas.removeEventListener("telemark-restart", onRestart);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    };
  }, [hill]);

  return (
    <div className="game">
      <div className="game-stage" ref={stageRef}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Skok na skoczni ${hill.name} K${hill.kPointM}. Lewy przycisk myszy lub Z: start, oba przyciski lub Z i X: wybicie, mysz lub strzałki: pochylenie, jeden przycisk: lądowanie.`}
        />
      </div>
      <div className="game-toolbar">
        <button
          type="button"
          className="pixel-button"
          onClick={() => canvasRef.current?.dispatchEvent(new Event("telemark-restart"))}
        >
          Jeszcze raz (R)
        </button>
        <button type="button" className="pixel-button" onClick={onExit}>
          Skocznie (Esc)
        </button>
      </div>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
