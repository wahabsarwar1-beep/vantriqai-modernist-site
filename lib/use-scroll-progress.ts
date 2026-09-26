"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * How far a pinned section has been scrolled through: 0 when its top meets
 * the top of the viewport, 1 when its bottom does.
 *
 * Two things this does that a plain scroll listener does not:
 *
 * It measures inside requestAnimationFrame and skips frames that are already
 * pending. Reading getBoundingClientRect on every scroll event forces a
 * layout on every scroll event, and these sections are two screens tall —
 * the whole point is that you scroll through them slowly.
 *
 * It reports through a callback rather than state. The things that need to
 * move continuously — a progress bar, a translated track — are written
 * straight to the element, so a section can animate at frame rate while React
 * re-renders only when the active step actually changes.
 */
export function useScrollProgress(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  onProgress: (progress: number) => void,
) {
  // Kept in a ref so changing the callback does not tear down the listener.
  const cb = useRef(onProgress);
  cb.current = onProgress;

  useEffect(() => {
    if (!enabled) return;
    let pending = false;

    const measure = () => {
      pending = false;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      if (total <= 0) return;
      cb.current(Math.min(1, Math.max(0, -rect.top / total)));
    };

    const schedule = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [ref, enabled]);
}
