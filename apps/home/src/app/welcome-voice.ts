/*
 * The spoken welcome: a recorded clip, so it sounds the same on every device and works offline.
 *
 * Made 2026-11-09 with Kokoro (open-source text to speech, Apache 2.0, free for commercial use), voice "Heart"
 * (af_heart, American English). The text given to it was "Welcome to the Diji platform." Spelled "Digi", Kokoro
 * says "diggy". Trimmed, levelled to -16 LUFS and saved as a 128 kbps MP3 with ffmpeg.
 */

const CLIP = "/sounds/welcome.mp3";

let clip: HTMLAudioElement | null = null;

/** Loads the clip early, so it plays the moment Enter is pressed. */
export function prepareWelcomeVoice() {
  if (typeof window === "undefined" || clip) return;
  clip = new Audio(CLIP);
  clip.preload = "auto";
  clip.volume = 0.9;
}

export function playWelcomeVoice() {
  prepareWelcomeVoice();
  if (!clip) return;
  clip.currentTime = 0;
  clip.play().catch(() => {
    // The browser refused to play it: the chime alone welcomes them, which is never a problem for anyone signing in.
  });
}

export function stopWelcomeVoice() {
  if (!clip) return;
  clip.pause();
  clip.currentTime = 0;
}
