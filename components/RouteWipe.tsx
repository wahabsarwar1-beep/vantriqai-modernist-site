"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { prefersReducedMotion } from "@/lib/motion";

/** Intercepts internal link clicks and covers the viewport with a red panel
 *  before navigating, mirroring the prototype's goTo(): wipe in (420ms),
 *  swap the route, wipe out (480ms more — 900ms total), then unmount.
 *  Reduced motion lets the click through untouched (default Link/browser
 *  navigation, no panel). */
export default function RouteWipe() {
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<"idle" | "in" | "out">("idle");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    []
  );

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement)?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || !href.startsWith("/") || href.startsWith("//")) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (href === pathname) return;
      if (phase !== "idle") return;
      if (prefersReducedMotion()) return;

      e.preventDefault();
      setPhase("in");
      timers.current.push(
        setTimeout(() => {
          router.push(href);
          window.scrollTo(0, 0);
          setPhase("out");
          timers.current.push(setTimeout(() => setPhase("idle"), 480));
        }, 420)
      );
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname, phase, router]);

  if (phase === "idle") return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        background: "var(--color-accent)",
        transformOrigin: "top",
        pointerEvents: "none",
        animation:
          phase === "in"
            ? "wipeIn 420ms cubic-bezier(.4,0,.2,1) forwards"
            : "wipeOut 480ms cubic-bezier(.4,0,.2,1) forwards",
      }}
    >
      <span
        style={{
          position: "absolute",
          left: "clamp(20px,5vw,64px)",
          bottom: "clamp(20px,5vw,56px)",
          fontFamily: "var(--font-heading)",
          fontWeight: 800,
          fontSize: "clamp(28px,6vw,72px)",
          letterSpacing: "-0.03em",
          color: "var(--color-bg)",
        }}
      >
        Vantriq<span style={{ color: "var(--color-text)" }}>AI</span>
      </span>
    </div>
  );
}
