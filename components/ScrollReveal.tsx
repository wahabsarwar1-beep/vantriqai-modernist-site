"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Reproduces the reveal-on-scroll behavior from the design prototype's
 * per-page componentDidMount: fades in each direct child of a <section> or
 * <footer> as it scrolls into view, with a short stagger, and a 2s safety
 * pass so nothing can stay hidden if the observer misses it.
 */
export default function ScrollReveal() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const els = Array.from(document.querySelectorAll<HTMLElement>("section > *, footer > *"));
    els.forEach((el) => el.setAttribute("data-reveal", ""));

    const show = (el: HTMLElement) => {
      if (el.classList.contains("in")) return;
      const sibs = Array.from(el.parentElement?.children ?? []);
      el.style.animationDelay = Math.min(sibs.indexOf(el), 5) * 60 + "ms";
      el.classList.add("in");
    };

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting || e.boundingClientRect.top < window.innerHeight) {
            show(e.target as HTMLElement);
            io.unobserve(e.target);
          }
        });
        els.forEach((el) => {
          if (el.getBoundingClientRect().bottom < 0) {
            show(el);
            io.unobserve(el);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
    );
    els.forEach((el) => io.observe(el));

    const safety = setTimeout(() => els.forEach(show), 2000);

    return () => {
      clearTimeout(safety);
      io.disconnect();
    };
  }, [pathname]);

  return null;
}
