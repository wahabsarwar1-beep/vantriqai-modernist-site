"use client";

import { useRef, type ReactNode } from "react";

export default function Magnetic({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);

  const handleMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    el.style.transition = "transform .12s ease-out";
    el.style.transform = `translate(${(dx * 0.25).toFixed(1)}px, ${(dy * 0.25).toFixed(1)}px)`;
  };

  const handleLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = "transform .3s cubic-bezier(.16,1,.3,1)";
    el.style.transform = "translate(0,0)";
  };

  return (
    <span
      ref={ref}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      style={{ display: "inline-flex" }}
    >
      {children}
    </span>
  );
}
