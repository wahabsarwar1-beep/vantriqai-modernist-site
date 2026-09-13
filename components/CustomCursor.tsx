"use client";

import { useEffect, useRef } from "react";

export default function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (window.matchMedia("(hover: none), (pointer: coarse)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const dot = dotRef.current;
    const label = labelRef.current;
    if (!dot || !label) return;

    const onMove = (e: MouseEvent) => {
      dot.style.opacity = "1";
      dot.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0) translate(-50%,-50%)`;
      const target = e.target as HTMLElement;
      const interactive = target.closest?.("a, button, [role='button'], [data-tilt]");
      if (interactive) {
        dot.style.width = "34px";
        dot.style.height = "34px";
        dot.style.opacity = ".55";
      } else {
        dot.style.width = "14px";
        dot.style.height = "14px";
        dot.style.opacity = "1";
      }
      const labelEl = target.closest?.("[data-cursor-label]") as HTMLElement | null;
      if (labelEl) {
        label.textContent = labelEl.getAttribute("data-cursor-label");
        label.style.opacity = "1";
        label.style.transform = `translate3d(${e.clientX + 22}px, ${e.clientY + 16}px, 0)`;
      } else {
        label.style.opacity = "0";
      }
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <>
      <div
        ref={dotRef}
        aria-hidden="true"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: "var(--color-accent)",
          border: "2px solid var(--color-bg)",
          boxShadow: "0 0 0 1px color-mix(in srgb, var(--color-text) 20%, transparent)",
          zIndex: 200,
          pointerEvents: "none",
          transform: "translate3d(-50%,-50%,0)",
          transition:
            "width .25s cubic-bezier(.16,1,.3,1), height .25s cubic-bezier(.16,1,.3,1), background-color .25s ease, opacity .2s ease",
          opacity: 0,
        }}
      />
      <span
        ref={labelRef}
        aria-hidden="true"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          zIndex: 200,
          pointerEvents: "none",
          fontFamily: "var(--font-heading)",
          fontWeight: 800,
          fontSize: 11,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          background: "var(--color-text)",
          color: "var(--color-bg)",
          padding: "5px 10px",
          borderRadius: 999,
          opacity: 0,
          transition: "opacity .2s ease",
          whiteSpace: "nowrap",
        }}
      />
    </>
  );
}
