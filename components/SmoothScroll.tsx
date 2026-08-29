"use client";

import { useEffect } from "react";
import { prefersReducedMotion } from "@/lib/motion";

declare global {
  interface Window {
    /** Set while SmoothScroll is active; RouteWipe calls this before its own
     *  scrollTo(0, 0) so the two don't fight over the scroll position. */
    __stopSmoothScroll?: () => void;
  }
}

/** Eased wheel scrolling — momentum without ever touching the document's own
 *  transform, so position:sticky, the pinned stage, and anchor links all
 *  keep working underneath it. No library: wheel-delta accumulation plus a
 *  ~40-line requestAnimationFrame lerp. Mounted once, globally, not
 *  per-route — there's no page-specific state to cache here. */
export default function SmoothScroll() {
  useEffect(() => {
    if (prefersReducedMotion() || window.matchMedia("(pointer: coarse)").matches) return;

    let target = window.scrollY;
    let gliding = false;
    let lastGlideY: number | null = null;
    let raf = 0;

    const stopGlide = () => {
      gliding = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      target = window.scrollY;
    };

    const glide = () => {
      if (!gliding) return;
      const cur = window.scrollY;
      // Something else moved the page since our last write (scrollbar drag,
      // keyboard, an anchor jump, scrollIntoView) — hand control back rather
      // than yank the page to a now-stale target.
      if (lastGlideY != null && Math.abs(cur - lastGlideY) > 2) {
        gliding = false;
        raf = 0;
        target = cur;
        return;
      }
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      target = Math.max(0, Math.min(max, target));
      const diff = target - cur;
      if (Math.abs(diff) < 1) {
        // A looser exit threshold (e.g. < 0.5) never fires on a fractional-DPR
        // viewport, where scrollY only ever lands on sub-pixel values —
        // the loop would run forever, yanking the page to a stale target
        // every frame.
        window.scrollTo(0, Math.round(target));
        gliding = false;
        raf = 0;
        lastGlideY = null;
        return;
      }
      window.scrollTo(0, cur + diff * 0.135);
      lastGlideY = window.scrollY;
      raf = requestAnimationFrame(glide);
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.defaultPrevented || window.innerWidth < 900) return;
      for (let n = e.target as HTMLElement | null; n && n !== document.body; n = n.parentElement) {
        if (n.scrollHeight - n.clientHeight > 4) {
          const oy = getComputedStyle(n).overflowY;
          // This is what keeps the chat log (and any future modal) natively
          // scrollable instead of being hijacked by the page glide.
          if (oy === "auto" || oy === "scroll") return;
        }
      }
      let d = e.deltaY;
      if (e.deltaMode === 1) d *= 16;
      else if (e.deltaMode === 2) d *= window.innerHeight;
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      if (!gliding) target = window.scrollY;
      target = Math.max(0, Math.min(max, target + d));
      e.preventDefault();
      if (!gliding) {
        gliding = true;
        lastGlideY = window.scrollY;
        glide();
      }
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    ["keydown", "mousedown", "touchstart"].forEach((t) => window.addEventListener(t, stopGlide, { passive: true }));
    window.__stopSmoothScroll = stopGlide;

    return () => {
      window.removeEventListener("wheel", onWheel);
      ["keydown", "mousedown", "touchstart"].forEach((t) => window.removeEventListener(t, stopGlide));
      if (window.__stopSmoothScroll === stopGlide) delete window.__stopSmoothScroll;
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}
