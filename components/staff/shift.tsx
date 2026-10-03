"use client";

import { BellRing } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

// Browsers only allow sound after a tap, and tablets dim their screens, so the counter
// and kitchen start each session with one "Start shift" tap [D-25].

interface ShiftValue {
  started: boolean;
  chime: () => void;
}

const ShiftContext = createContext<ShiftValue>({ started: false, chime: () => {} });
export const useShift = () => useContext(ShiftContext);

type WakeLockSentinelLike = { release: () => Promise<void> };

/** A two-note bell, synthesised so there's no audio file to load. */
function playChime(ctx: AudioContext) {
  const now = ctx.currentTime;
  [
    { freq: 1318.5, at: 0 },
    { freq: 1760, at: 0.16 },
  ].forEach(({ freq, at }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now + at);
    gain.gain.linearRampToValueAtTime(0.35, now + at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + at + 0.9);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + at);
    osc.stop(now + at + 1);
  });
}

export function ShiftProvider({ children, title }: { children: ReactNode; title: string }) {
  const [started, setStarted] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const wakeLock = useRef<WakeLockSentinelLike | null>(null);

  const requestWakeLock = useCallback(async () => {
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> } };
      wakeLock.current = (await nav.wakeLock?.request("screen")) ?? null;
    } catch {
      // Not supported or refused (e.g. battery saver). The board still works.
    }
  }, []);

  const start = useCallback(() => {
    audio.current ??= new AudioContext();
    void audio.current.resume();
    playChime(audio.current); // confirms the sound works
    void requestWakeLock();
    setStarted(true);
  }, [requestWakeLock]);

  // The wake lock is dropped whenever the tab is hidden; take it again on return.
  useEffect(() => {
    if (!started) return;
    const onVisible = () => document.visibilityState === "visible" && void requestWakeLock();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void wakeLock.current?.release().catch(() => {});
    };
  }, [started, requestWakeLock]);

  const chime = useCallback(() => {
    if (!audio.current || document.visibilityState !== "visible") return;
    playChime(audio.current);
    navigator.vibrate?.([120, 80, 120]);
  }, []);

  return (
    <ShiftContext.Provider value={{ started, chime }}>
      {children}
      {!started && (
        <div className="anim-fade-in fixed inset-0 z-50 grid place-items-center bg-[var(--g-ink)]/70 px-4 backdrop-blur-sm">
          <div className="anim-rise flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl bg-[var(--g-surface)] p-8 text-center shadow-2xl">
            <span className="anim-ring-pulse grid size-16 place-items-center rounded-full bg-[var(--brand)] text-[var(--brand-fg)]">
              <BellRing className="size-8" />
            </span>
            <div>
              <h2 className="font-heading text-2xl font-bold">{title}</h2>
              <p className="mt-1 text-sm text-[var(--g-muted)]">Tap to turn on order alerts and keep this screen awake.</p>
            </div>
            <button
              type="button"
              onClick={start}
              autoFocus
              className="h-14 w-full rounded-2xl bg-[var(--brand)] text-lg font-semibold text-[var(--brand-fg)] transition-transform active:scale-[0.98]"
            >
              Start shift
            </button>
          </div>
        </div>
      )}
    </ShiftContext.Provider>
  );
}

/**
 * Rings when something new needs attention, then every 20 s until it's handled, and shows
 * the count in the tab title. Silent until the shift has started.
 */
export function useAttentionAlert(count: number, label: string) {
  const { started, chime } = useShift();
  const previous = useRef(count);

  useEffect(() => {
    if (started && count > previous.current) chime();
    previous.current = count;
  }, [count, started, chime]);

  useEffect(() => {
    if (!started || count === 0) return;
    const timer = setInterval(chime, 20_000);
    return () => clearInterval(timer);
  }, [count, started, chime]);

  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, "");
    document.title = count > 0 ? `(${count}) ${base}` : base;
    return () => {
      document.title = document.title.replace(/^\(\d+\) /, "");
    };
  }, [count, label]);
}
