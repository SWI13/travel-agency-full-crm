/**
 * Notification chime synthesised with the Web Audio API (no audio file to load).
 * Two soft sine notes — short and unobtrusive in an office.
 */
let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context ??= new Ctor();
  return context;
}

/** Browsers only allow sound after a user gesture; call this from the first click. */
export function unlockSound(): void {
  const ctx = getContext();
  if (ctx?.state === "suspended") void ctx.resume();
}

export function playChime(): void {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume();
    if (ctx.state === "suspended") return; // still locked: stay silent rather than throw
  }
  const now = ctx.currentTime;
  for (const [frequency, start] of [
    [880, 0],
    [1174.66, 0.14],
  ] as const) {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, now + start);
    gain.gain.exponentialRampToValueAtTime(0.16, now + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + 0.42);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(now + start);
    oscillator.stop(now + start + 0.45);
  }
}
