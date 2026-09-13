"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export default function LineReveal({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const raf = requestAnimationFrame(() => setInView(true));
      return () => cancelAnimationFrame(raf);
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setInView(true);
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <span style={{ display: "block", overflow: "hidden", paddingBottom: "0.16em", marginBottom: "-0.12em" }}>
      <span ref={ref} data-line="" data-in={inView ? "" : undefined} style={{ display: "block" }}>
        {children}
      </span>
    </span>
  );
}
