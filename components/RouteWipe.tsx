"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import VantriqMark from "@/components/VantriqMark";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * The page-change curtain.
 *
 * Two sheets fall from the top — a cobalt-to-violet leading sheet and the
 * dark aurora stage behind it — each with a curved front edge. The VantriqAI
 * mark assembles in the middle over the name of the page being opened. Once
 * the new route has actually rendered (not after a fixed guess), both sheets
 * carry on downward and off the screen, so the motion reads as one
 * continuous fall rather than a panel going up and down.
 *
 * The destination is prefetched on click, so the wait is usually no longer
 * than the curtain itself. Links to a section of the current page, new tabs,
 * modified clicks and reduced motion all go through untouched.
 */
const IN_MS = 480;
const OUT_MS = 660;
/** The mark finishes assembling at about this point; never lift before it. */
const MIN_SHOW_MS = 760;
const MAX_WAIT_MS = 2500;

type Phase = "idle" | "in" | "hold" | "out";

function labelFor(anchor: HTMLAnchorElement, href: string): string {
  const own = (anchor.getAttribute("aria-label") || anchor.textContent || "").replace(/[→←]/g, "").replace(/\s+/g, " ").trim();
  if (own && own.length <= 42) return own;
  const path = href.split(/[?#]/)[0].replace(/^\/global/, "") || "/";
  if (path === "/") return "Home";
  const last = path.split("/").filter(Boolean).pop() ?? "";
  return last.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export default function RouteWipe() {
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("idle");
  const [label, setLabel] = useState("");
  const target = useRef<{ path: string; hash: boolean; at: number } | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const phaseRef = useRef<Phase>("idle");

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const finish = useCallback(() => {
    setPhase("out");
    timers.current.push(
      setTimeout(() => {
        setPhase("idle");
        target.current = null;
      }, OUT_MS),
    );
  }, []);

  // The new page is on screen: let the curtain go.
  useEffect(() => {
    if (phaseRef.current !== "hold" || !target.current) return;
    if (pathname !== target.current.path) return;
    if (!target.current.hash) window.scrollTo(0, 0);
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const wait = Math.max(0, MIN_SHOW_MS - (performance.now() - target.current.at));
    // At least one frame for the new page to paint under the curtain.
    timers.current.push(setTimeout(() => requestAnimationFrame(() => finish()), wait));
  }, [pathname, phase, finish]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement)?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || !href.startsWith("/") || href.startsWith("//")) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      const path = href.split(/[?#]/)[0] || "/";
      // Same page (including a jump to one of its sections): no curtain.
      if (path === pathname) return;
      if (phaseRef.current !== "idle") {
        e.preventDefault();
        return;
      }
      if (prefersReducedMotion()) return;

      e.preventDefault();
      target.current = { path, hash: href.includes("#"), at: performance.now() };
      setLabel(labelFor(anchor, href));
      router.prefetch(href);
      setPhase("in");

      timers.current.push(
        setTimeout(() => {
          // Cancel any in-flight smooth-scroll glide first — otherwise its
          // own scrollTo calls fight ours and the page bounces back toward the
          // pre-navigation target instead of staying at the top.
          window.__stopSmoothScroll?.();
          setPhase("hold");
          router.push(href);
          // A slow network must not trap the visitor behind the curtain.
          timers.current.push(setTimeout(finish, MAX_WAIT_MS));
        }, IN_MS),
      );
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname, router, finish]);

  if (phase === "idle") return null;

  return (
    <div aria-hidden="true" className="curtain" data-phase={phase}>
      <div className="curtain-sheet curtain-lead" />
      <div className="curtain-sheet curtain-stage">
        <div className="curtain-aurora" />
        <div className="curtain-grid" />
        <div className="curtain-center">
          <span className="curtain-mark">
            <span className="curtain-ring" />
            <VantriqMark size={64} frame="#ffffff" notch="#5a7cf0" className="curtain-logo" />
          </span>
          <span className="curtain-label">{label}</span>
          <span className="curtain-bar">
            <i />
          </span>
        </div>
        <span className="curtain-word">
          Vantriq<em>AI</em>
        </span>
      </div>
    </div>
  );
}
