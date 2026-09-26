"use client";

import { useEffect, useState } from "react";

/**
 * The id of the anchored section currently nearest the top of the viewport.
 *
 * Lets the menu mark which module, sector or tier you are actually looking at
 * — so opening Products while halfway down that page shows you where you are
 * rather than an undifferentiated list.
 *
 * An IntersectionObserver rather than a scroll handler: it fires only when a
 * section crosses the band, costs nothing while you sit still, and never
 * measures during a scroll.
 */
export function useActiveSection(pathname: string): string | null {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    setActive(null);
    const targets = document.querySelectorAll<HTMLElement>(".anchor-target[id]");
    if (!targets.length) return;

    const visible = new Set<string>();
    const order = [...targets].map((t) => t.id);

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        // First in document order wins, so scrolling down moves the mark
        // forward one section at a time rather than jumping around.
        const first = order.find((id) => visible.has(id)) ?? null;
        setActive(first);
      },
      // A band across the upper middle: a section counts as "where you are"
      // once its top clears the sticky bar, and stops counting well before it
      // leaves the screen entirely.
      { rootMargin: "-20% 0px -55% 0px", threshold: 0 },
    );

    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, [pathname]);

  return active;
}
