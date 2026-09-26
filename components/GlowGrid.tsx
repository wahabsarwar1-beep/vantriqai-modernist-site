"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";

/**
 * A grid whose cards light up where the pointer is.
 *
 * One listener on the grid, not one per card: it writes the pointer position
 * into --mx/--my on every `.glow` child, and CSS draws the light. Cards the
 * pointer is not over still get the value, so the glow bleeds across their
 * borders as it passes — the effect that makes a grid feel like one surface.
 * Touch devices never fire pointermove without a press, so they simply keep
 * the plain cards.
 */
export default function GlowGrid({ className, style, children }: { className?: string; style?: CSSProperties; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  return (
    <div
      ref={ref}
      className={`glow-grid${className ? ` ${className}` : ""}`}
      style={style}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse") return;
        const { clientX, clientY } = e;
        cancelAnimationFrame(frame.current);
        frame.current = requestAnimationFrame(() => {
          ref.current?.querySelectorAll<HTMLElement>(".glow").forEach((card) => {
            const r = card.getBoundingClientRect();
            card.style.setProperty("--mx", `${clientX - r.left}px`);
            card.style.setProperty("--my", `${clientY - r.top}px`);
          });
        });
      }}
    >
      {children}
    </div>
  );
}
