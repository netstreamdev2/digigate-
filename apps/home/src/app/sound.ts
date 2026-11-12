import type { ProductId } from "@/products";

/*
 * Soft chimes made in the browser with the Web Audio API: no audio files to download.
 *
 * Browsers keep a page's audio asleep until the person clicks or presses a key on it, so the first hover of a
 * visit is silent. A click or key press anywhere wakes it, and a click on a card wakes it and plays at once.
 */

/** Each product has its own note, so no two sound alike. Together the four make one chord. */
const NOTE: Record<ProductId, number> = {
  digilog360: 523.25, // C5
  digigate: 659.25, // E5
  digitrack: 783.99, // G5
  digicomm: 987.77, // B5
};

// [frequency ratio, loudness, wave]: a pure tone, a twin a hair sharp so the pair beat into a soft hum,
// and two quiet overtones that make it ring like a small bell.
const PARTIALS: [number, number, OscillatorType][] = [
  [1, 1, "sine"],
  [1.0035, 0.6, "sine"],
  [2, 0.16, "triangle"],
  [2.76, 0.1, "sine"],
];

let context: AudioContext | null = null;
let output: AudioNode | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined" || typeof window.AudioContext !== "function") return null;
  if (!context) {
    context = new AudioContext();
    // Everything goes through one gentle low-pass, so no chime is ever sharp or tinny.
    const soften = context.createBiquadFilter();
    soften.type = "lowpass";
    soften.frequency.value = 3200;
    soften.connect(context.destination);
    output = soften;
  }
  return context;
}

/** Wakes audio during a click or key press. Resolves to the running context, or null if the browser says no. */
async function awake(): Promise<AudioContext | null> {
  const ctx = audio();
  if (!ctx) return null;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      // The browser refused: the page simply stays silent, which is never a problem for anyone signing in.
      return null;
    }
  }
  return ctx.state === "running" ? ctx : null;
}

export function wakeAudio() {
  void awake();
}

function bell(ctx: AudioContext, frequency: number, at: number, level: number, length: number) {
  if (!output) return;
  const voice = ctx.createGain();
  voice.gain.setValueAtTime(0.0001, at);
  voice.gain.exponentialRampToValueAtTime(level, at + 0.025);
  voice.gain.exponentialRampToValueAtTime(0.0001, at + length);
  voice.connect(output);
  for (const [ratio, loudness, wave] of PARTIALS) {
    const tone = ctx.createOscillator();
    tone.type = wave;
    tone.frequency.value = frequency * ratio;
    const weight = ctx.createGain();
    weight.gain.value = loudness;
    tone.connect(weight).connect(voice);
    tone.start(at);
    tone.stop(at + length + 0.05);
  }
}

/** A product that isn't out yet: its note, then a step up that hangs unresolved, like a question. */
export function soonChime(product: ProductId) {
  void awake().then((ctx) => {
    if (!ctx) return;
    const note = NOTE[product];
    const now = ctx.currentTime;
    bell(ctx, note, now, 0.06, 1.2);
    bell(ctx, note * 1.125, now + 0.12, 0.05, 1.9);
  });
}

/** A soft hum when a product is hovered. Only plays once audio is awake: hovering can't wake it. */
export function hoverChime(product: ProductId) {
  if (!context || context.state !== "running") return;
  bell(context, NOTE[product], context.currentTime, 0.045, 1.1);
}

/** A short rising chime (note, fifth, octave) when a product is picked. */
export function selectChime(product: ProductId) {
  void awake().then((ctx) => {
    if (!ctx) return;
    const note = NOTE[product];
    const now = ctx.currentTime;
    bell(ctx, note, now, 0.065, 1.4);
    bell(ctx, note * 1.5, now + 0.07, 0.055, 1.4);
    bell(ctx, note * 2, now + 0.14, 0.045, 1.6);
  });
}

/** The welcome: a slow rising chord (C, E, G, C) under the spoken greeting. */
export function welcomeChime() {
  void awake().then((ctx) => {
    if (!ctx) return;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((note, step) => {
      bell(ctx, note, now + step * 0.11, 0.05, 2.2);
    });
  });
}

/** Two notes up, to confirm sound is back on. */
export function soundOnChime() {
  void awake().then((ctx) => {
    if (!ctx) return;
    const now = ctx.currentTime;
    bell(ctx, 783.99, now, 0.05, 0.9); // G5
    bell(ctx, 1046.5, now + 0.09, 0.045, 1.1); // C6
  });
}

/* The on/off choice, kept on this browser. If storage is blocked it lasts for this visit only. */

export type SoundSetting = "on" | "off";

const SOUND_KEY = "digilog360.sound";
const listeners = new Set<() => void>();
let remembered: SoundSetting = "on";

export function readSound(): SoundSetting {
  try {
    const stored = window.localStorage.getItem(SOUND_KEY);
    return stored === "on" || stored === "off" ? stored : remembered;
  } catch {
    return remembered;
  }
}

export function writeSound(setting: SoundSetting) {
  remembered = setting;
  try {
    window.localStorage.setItem(SOUND_KEY, setting);
  } catch {
    // Kept in memory instead, for the rest of this visit.
  }
  for (const listener of listeners) listener();
}

export function subscribeSound(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}
