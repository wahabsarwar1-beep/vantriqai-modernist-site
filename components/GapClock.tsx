"use client";

import { useEffect, useRef } from "react";

function pad(v: number) {
  return String(v).padStart(2, "0");
}

export default function GapClock() {
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setInterval> | null = null;

    const run = () => {
      const t0 = performance.now();
      const paint = () => {
        const s = Math.floor((performance.now() - t0) / 1000);
        el.textContent = `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
      };
      paint();
      timer = setInterval(paint, 1000);
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !timer) {
          run();
          io.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    io.observe(el);

    return () => {
      io.disconnect();
      if (timer) clearInterval(timer);
    };
  }, []);

  return (
    <p
      ref={ref}
      style={{
        fontFamily: "var(--font-heading)",
        fontWeight: 800,
        fontSize: "clamp(44px,6.4vw,94px)",
        lineHeight: 0.9,
        letterSpacing: "-0.05em",
        margin: "16px 0 0",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      00:00:00
    </p>
  );
}
