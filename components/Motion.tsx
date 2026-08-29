"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { MOTION_MULT, prefersReducedMotion } from "@/lib/motion";

/** Owns every scroll/mount-driven motion primitive that isn't the hero
 *  canvas or the nav shrink (those are self-contained in MotionBackground
 *  and Nav): headline [data-line] reveals, [data-anim="rise"|"rule"]
 *  reveal-on-scroll, [data-count] counters, [data-par] parallax, and the
 *  [data-pin] scroll-pinned stage. Re-wires on every route change, since
 *  each page swaps in a fresh set of these elements. */
export default function Motion() {
  const pathname = usePathname();
  const mouseRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const reduced = prefersReducedMotion();
    const m = MOTION_MULT;
    const timers: ReturnType<typeof setTimeout>[] = [];

    // headline lines — animate in immediately on mount/route change
    const lines = Array.from(document.querySelectorAll<HTMLElement>("[data-line]"));
    lines.forEach((el, i) => {
      if (reduced) {
        el.style.transform = "none";
        el.style.opacity = "1";
        return;
      }
      el.style.transform = "translateY(110%)";
      el.style.opacity = "0";
      const d = 140 + i * 170;
      requestAnimationFrame(() => {
        el.style.transition = `transform ${(0.95 / m).toFixed(2)}s cubic-bezier(.16,1,.3,1) ${d}ms, opacity .5s ease ${d}ms`;
        el.style.transform = "none";
        el.style.opacity = "1";
      });
    });

    // reveal-on-scroll: rise (fade + rise) or rule (scaleX draw-in)
    const animEls = Array.from(document.querySelectorAll<HTMLElement>("[data-anim]"));
    // Once the reveal has played, drop every inline override the effect added —
    // otherwise the inline transform/transition it leaves behind permanently
    // outranks any CSS :hover rule (cell-hover, why-block, etc.) on the same
    // element, and cards can never lift or tint on hover again.
    const clearInline = (el: HTMLElement) => {
      el.style.transition = "";
      el.style.opacity = "";
      el.style.transform = "";
      el.style.transformOrigin = "";
      el.style.willChange = "";
    };
    const show = (el: HTMLElement, i: number) => {
      const kind = el.getAttribute("data-anim");
      const delay = Math.min(i, 5) * 70;
      const onDone = () => {
        el.removeEventListener("transitionend", onDone);
        clearInline(el);
      };
      el.addEventListener("transitionend", onDone);
      timers.push(setTimeout(onDone, delay + 900));
      if (kind === "rule") {
        el.style.transition = `transform .85s cubic-bezier(.16,1,.3,1) ${delay}ms`;
        el.style.transform = "scaleX(1)";
      } else {
        el.style.transition = `opacity .6s ease ${delay}ms, transform .75s cubic-bezier(.16,1,.3,1) ${delay}ms`;
        el.style.opacity = "1";
        el.style.transform = "none";
      }
    };
    let io: IntersectionObserver | null = null;
    if (!reduced && animEls.length) {
      animEls.forEach((el) => {
        const kind = el.getAttribute("data-anim");
        el.style.willChange = "transform, opacity";
        if (kind === "rule") {
          el.style.transform = "scaleX(0)";
          el.style.transformOrigin = "left";
        } else {
          el.style.opacity = "0";
          el.style.transform = `translateY(${Math.round(30 * m)}px)`;
        }
      });
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (!e.isIntersecting) return;
            const target = e.target as HTMLElement;
            const sibs = Array.from(target.parentElement?.children ?? []);
            show(target, Math.max(0, sibs.indexOf(target)));
            io!.unobserve(target);
          });
        },
        { rootMargin: "0px 0px -6% 0px", threshold: 0.05 }
      );
      animEls.forEach((el) => io!.observe(el));
      timers.push(setTimeout(() => animEls.forEach((el) => show(el, 0)), 2400));
    }

    // product logo marks: shapes assemble in sequence
    const icons = Array.from(document.querySelectorAll<SVGElement>("[data-icon]"));
    let iio: IntersectionObserver | null = null;
    if (!reduced && icons.length) {
      icons.forEach((svg) => {
        svg.style.overflow = "visible";
        svg.querySelectorAll<SVGElement>("path, rect, circle, polygon").forEach((p) => {
          p.style.transformBox = "fill-box";
          p.style.transformOrigin = "center";
          p.style.opacity = "0";
          p.style.transform = "scale(.72)";
        });
      });
      const drawIcon = (svg: SVGElement, animate: boolean) => {
        svg.querySelectorAll<SVGElement>("path, rect, circle, polygon").forEach((p, i) => {
          if (p.style.opacity === "1") return;
          const delay = 120 + i * 110;
          p.style.transition = animate
            ? `opacity .34s ease ${delay}ms, transform ${(0.6 / m).toFixed(2)}s cubic-bezier(.16,1,.3,1) ${delay}ms`
            : "none";
          p.style.opacity = "1";
          p.style.transform = "none";
        });
      };
      iio = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (!e.isIntersecting) return;
            drawIcon(e.target as unknown as SVGElement, true);
            iio!.unobserve(e.target);
          });
        },
        { rootMargin: "0px 0px -2% 0px", threshold: 0.01 }
      );
      icons.forEach((svg) => iio!.observe(svg));
      timers.push(setTimeout(() => icons.forEach((svg) => drawIcon(svg, false)), 2400));
    }

    // counters
    const counters = Array.from(document.querySelectorAll<HTMLElement>("[data-count]"));
    const countUp = (el: HTMLElement) => {
      const target = parseFloat(el.getAttribute("data-count") || "0") || 0;
      const dur = 1100 / m;
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = String(Math.round(target * eased));
        if (p < 1) requestAnimationFrame(tick);
        else el.textContent = String(target);
      };
      requestAnimationFrame(tick);
    };
    let cio: IntersectionObserver | null = null;
    if (!reduced && counters.length) {
      counters.forEach((el) => {
        el.textContent = "0";
      });
      cio = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (!e.isIntersecting) return;
            countUp(e.target as HTMLElement);
            cio!.unobserve(e.target);
          });
        },
        { threshold: 0.4 }
      );
      counters.forEach((el) => cio!.observe(el));
      timers.push(
        setTimeout(() => {
          counters.forEach((el) => {
            if (el.textContent === "0") el.textContent = el.getAttribute("data-count") || "0";
          });
        }, 2400)
      );
    }

    // parallax shapes + the scroll-pinned three-step stage — both are inert
    // below 760px (shapes hidden, stage unpinned via CSS), so no scroll work there.
    const isMobile = window.matchMedia("(max-width: 760px)").matches;
    const parEls = Array.from(document.querySelectorAll<HTMLElement>("[data-par]"));
    const pinWrap = document.querySelector<HTMLElement>("[data-pin]");
    const pinPanels = pinWrap ? Array.from(pinWrap.querySelectorAll<HTMLElement>("[data-pin-panel]")) : [];
    const pinRows = pinWrap ? Array.from(pinWrap.querySelectorAll<HTMLElement>("[data-pin-row]")) : [];
    const pinRail = pinWrap?.querySelector<HTMLElement>("[data-pin-rail]") ?? null;
    const pinLabel = pinWrap?.querySelector<HTMLElement>("[data-pin-count]") ?? null;

    const parallax = () => {
      if (reduced) return;
      const mo = mouseRef.current;
      const y = window.scrollY;
      parEls.forEach((el) => {
        const k = parseFloat(el.getAttribute("data-par") || "0") * m;
        el.style.transform = `translate3d(${(mo.x * 60 * k).toFixed(1)}px,${(y * k + mo.y * 50 * k).toFixed(1)}px,0) rotate(${(mo.x * 6 * k).toFixed(2)}deg)`;
      });
    };

    const pin = () => {
      if (!pinWrap) return;
      const rect = pinWrap.getBoundingClientRect();
      const span = pinWrap.offsetHeight - window.innerHeight;
      const p = Math.max(0, Math.min(0.999, -rect.top / (span || 1)));
      const idx = Math.min(pinPanels.length - 1, Math.floor(p * pinPanels.length));
      pinPanels.forEach((el, i) => {
        const on = i === idx;
        el.style.transition = "opacity .45s ease, transform .55s cubic-bezier(.16,1,.3,1)";
        el.style.opacity = on ? "1" : "0";
        el.style.transform = on ? "none" : `translateY(${i < idx ? -34 : 34}px)`;
        el.style.pointerEvents = on ? "auto" : "none";
      });
      pinRows.forEach((el, i) => {
        const on = i === idx;
        el.style.background = on ? "var(--color-accent)" : "var(--color-bg)";
        el.style.color = on ? "var(--color-bg)" : "var(--color-text)";
      });
      if (pinRail) pinRail.style.transform = `scaleX(${Math.max(0.04, p).toFixed(3)})`;
      if (pinLabel) pinLabel.textContent = `0${idx + 1} / 0${pinPanels.length}`;
    };

    const onScroll = () => {
      parallax();
      pin();
    };
    const onMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX / window.innerWidth - 0.5, y: e.clientY / window.innerHeight - 0.5 };
      parallax();
    };

    const needsScrollWiring = !isMobile && (parEls.length > 0 || pinWrap != null);
    if (needsScrollWiring) {
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("mousemove", onMove, { passive: true });
      onScroll();
    }

    return () => {
      io?.disconnect();
      cio?.disconnect();
      iio?.disconnect();
      timers.forEach(clearTimeout);
      if (needsScrollWiring) {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("mousemove", onMove);
      }
    };
  }, [pathname]);

  return null;
}
