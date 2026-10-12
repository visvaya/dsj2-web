import type { Page } from "@playwright/test";

/**
 * Watches the page's sound from the outside. An init script wraps `AudioContext` before the game loads, keeps
 * every context the page creates and listens, through an analyser, to whatever the page connects to a context's
 * output. Nothing in the game knows about it.
 */
interface AudioProbe {
  contexts: AudioContext[];
  taps: { context: BaseAudioContext; analyser: AnalyserNode }[];
}

declare global {
  interface Window {
    audioProbe?: AudioProbe;
  }
}

export interface AudioState {
  /** Contexts the page has created so far. */
  created: number;
  /** Contexts that are running, that is, allowed to make sound. */
  running: number;
  /** Loudness (root mean square of the samples, full scale 1) of what running contexts send to their output. */
  level: number;
}

/** Above this level the output is a sound; the quietest continuous layer (wind at the gate) is far louder. */
export const AUDIBLE_LEVEL = 0.001;
/** Below this level the output is silence: a faded-out gain keeps decaying towards zero and never reaches it. */
export const SILENT_LEVEL = 0.0001;

export async function installAudioProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const probe: AudioProbe = { contexts: [], taps: [] };
    window.audioProbe = probe;
    if (typeof AudioContext === "undefined") return;
    window.AudioContext = new Proxy(AudioContext, {
      construct(target, parameters: ConstructorParameters<typeof AudioContext>) {
        const context = new target(...parameters);
        probe.contexts.push(context);
        return context;
      },
    });
    const original: unknown = Reflect.get(AudioNode.prototype, "connect");
    if (typeof original !== "function") return;
    // Every node the page connects to an output is also connected to the probe's analyser of that context.
    Reflect.set(AudioNode.prototype, "connect", function (this: AudioNode, ...parameters: unknown[]) {
      const [destination] = parameters;
      if (destination === this.context.destination) {
        const context = this.context;
        let tap = probe.taps.find((candidate) => candidate.context === context);
        if (!tap) {
          tap = { context, analyser: context.createAnalyser() };
          probe.taps.push(tap);
        }
        Reflect.apply(original, this, [tap.analyser]);
      }
      return Reflect.apply(original, this, parameters) as unknown;
    });
  });
}

export function audioState(page: Page): Promise<AudioState> {
  return page.evaluate(() => {
    const probe = window.audioProbe ?? { contexts: [], taps: [] };
    let level = 0;
    for (const tap of probe.taps) {
      if (tap.context.state !== "running") continue;
      const samples = new Float32Array(tap.analyser.fftSize);
      tap.analyser.getFloatTimeDomainData(samples);
      const meanSquare = samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length;
      level = Math.max(level, Math.sqrt(meanSquare));
    }
    return {
      created: probe.contexts.length,
      running: probe.contexts.filter((context) => context.state === "running").length,
      level,
    };
  });
}
