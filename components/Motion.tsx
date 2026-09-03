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

    /** The timed backstop below every observer exists so nothing is ever left
     *  invisible if an observer misses. It must only cover what the reader can
     *  already see: applied blindly it fires 2.4s after load and finishes every
     *  animation on the page — including sections metres below the fold — so by
     *  the time the reader scrolls there, everything has already played and the
     *  page looks static. Anything further down stays with its observer. */
    const withinReach = (el: Element) => el.getBoundingClientRect().top < window.innerHeight + 200;

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
      timers.push(setTimeout(onDone, delay + 1100));
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
      timers.push(setTimeout(() => animEls.filter(withinReach).forEach((el) => show(el, 0)), 2400));
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
      timers.push(setTimeout(() => icons.filter(withinReach).forEach((svg) => drawIcon(svg, false)), 2400));
    }

    // counters
    const counters = Array.from(document.querySelectorAll<HTMLElement>("[data-count]"));
    const countUp = (el: HTMLElement) => {
      const target = parseFloat(el.getAttribute("data-count") || "0") || 0;
      const dur = 1100 / m;
      // Zero it here, at the moment the run starts, rather than up front at
      // mount: the real number is authored as the element's own text, so a
      // counter whose observer never fires still reads correctly instead of
      // sitting at 0 waiting for the backstop.
      el.textContent = "0";
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
      counters.forEach((el) => {
        // A counter already on screen at mount (every hero figure) runs now.
        // Waiting for the observer would leave the headline number visibly
        // static for a frame or two before it jumped.
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) countUp(el);
        else cio!.observe(el);
      });
      timers.push(
        setTimeout(() => {
          counters.filter(withinReach).forEach((el) => {
            if (el.textContent === "0") el.textContent = el.getAttribute("data-count") || "0";
          });
        }, 2400)
      );
    }

    // bars: 0 -> the element's own --bar value, on entry. Horizontal by
    // default; data-bar="y" grows upward instead, for the sparkline columns
    // in the workspace mockup.
    const bars = Array.from(document.querySelectorAll<HTMLElement>("[data-bar]"));
    let bio: IntersectionObserver | null = null;
    if (bars.length) {
      const axis = (el: HTMLElement) => (el.getAttribute("data-bar") === "y" ? "height" : "width");
      const grow = (el: HTMLElement) => {
        el.style[axis(el)] = getComputedStyle(el).getPropertyValue("--bar").trim() || "0%";
      };
      if (reduced) {
        bars.forEach(grow);
      } else {
        bars.forEach((el, i) => {
          el.style[axis(el)] = "0%";
          // Columns read as a chart drawing itself when they stagger; a single
          // horizontal bar has nothing to stagger against, so it starts at once.
          const delay = axis(el) === "height" ? Math.min(i, 9) * 55 : 0;
          el.style.transition = `${axis(el)} ${1150 / m}ms cubic-bezier(.16,1,.3,1) ${delay}ms`;
        });
        // A collapsed bar has zero area, and a zero-area target can never
        // satisfy a non-zero threshold, so observing the bar itself would
        // never fire — the timed backstop was silently doing all the work.
        // Observe the track instead, which keeps its size, and grow the bars
        // inside it.
        const tracks = new Map<Element, HTMLElement[]>();
        bars.forEach((el) => {
          const track = el.parentElement ?? el;
          tracks.set(track, [...(tracks.get(track) ?? []), el]);
        });
        bio = new IntersectionObserver(
          (entries) => {
            entries.forEach((e) => {
              if (!e.isIntersecting) return;
              tracks.get(e.target)?.forEach(grow);
              bio!.unobserve(e.target);
            });
          },
          { threshold: 0.35 }
        );
        tracks.forEach((_, track) => bio!.observe(track));
        timers.push(setTimeout(() => bars.filter(withinReach).forEach(grow), 2400));
      }
    }

    // parallax shapes + the scroll-pinned three-step stage — both are inert
    // below 760px (shapes hidden, stage unpinned via CSS), so no scroll work there.
    const isMobile = window.matchMedia("(max-width: 760px)").matches;
    // The rail unpins at 900px, one step wider than everything else, so it
    // needs its own breakpoint rather than reusing isMobile.
    const isNarrowRail = window.matchMedia("(max-width: 900px)").matches;

    // Cache nodes (and, for parallax, the parsed factor) once per mount/route —
    // no frame should ever run a querySelectorAll or re-parse an attribute.
    const parEls = Array.from(document.querySelectorAll<HTMLElement>("[data-par]")).map((el) => ({
      el,
      k: (parseFloat(el.getAttribute("data-par") || "0") || 0) * m,
    }));
    const pinWrap = document.querySelector<HTMLElement>("[data-pin]");
    const pinPanels = pinWrap ? Array.from(pinWrap.querySelectorAll<HTMLElement>("[data-pin-panel]")) : [];
    const pinRows = pinWrap ? Array.from(pinWrap.querySelectorAll<HTMLElement>("[data-pin-row]")) : [];
    const pinRail = pinWrap?.querySelector<HTMLElement>("[data-pin-rail]") ?? null;
    const pinLabel = pinWrap?.querySelector<HTMLElement>("[data-pin-count]") ?? null;
    // Mutable, not reactive — read/written only inside the frame below.
    const pinState = { idx: -1, prog: -1 };

    let mio: IntersectionObserver | null = null;
    if (isMobile && pinPanels.length) {
      // Mobile doesn't scrub — each panel reveals independently on entry, and
      // the row/rail/counter it drags along just track whichever panel most
      // recently entered. Rail and counter stay visible (they used to be
      // hidden here; the stage now animates instead of sitting static).
      if (reduced) {
        pinPanels.forEach((el) => {
          el.style.opacity = "1";
          el.style.transform = "none";
        });
      } else {
        pinPanels.forEach((el) => {
          el.style.transition = "opacity .6s ease, transform .7s cubic-bezier(.16,1,.3,1)";
          el.style.opacity = "0";
          el.style.transform = "translateY(26px)";
        });
        mio = new IntersectionObserver(
          (entries) => {
            entries.forEach((e) => {
              if (!e.isIntersecting) return;
              const target = e.target as HTMLElement;
              const i = pinPanels.indexOf(target);
              target.style.opacity = "1";
              target.style.transform = "none";
              pinRows.forEach((row, j) => {
                const on = j === i;
                row.style.background = on ? "var(--color-accent)" : "var(--color-bg)";
                row.style.color = on ? "var(--color-bg)" : "var(--color-text)";
              });
              if (pinRail) pinRail.style.transform = `scaleX(${((i + 1) / pinPanels.length).toFixed(3)})`;
              if (pinLabel) pinLabel.textContent = `0${i + 1} / 0${pinPanels.length}`;
              mio!.unobserve(target);
            });
          },
          { rootMargin: "0px 0px -30% 0px", threshold: 0.25 }
        );
        pinPanels.forEach((el) => mio!.observe(el));
      }
    } else if (!isMobile && pinPanels.length) {
      // Desktop: transition + will-change assigned once here, never per frame.
      pinPanels.forEach((el) => {
        el.style.transition = "opacity .45s ease, transform .55s cubic-bezier(.16,1,.3,1)";
        el.style.willChange = "transform, opacity";
      });
    }

    const parallax = () => {
      if (reduced || isMobile) return;
      const mo = mouseRef.current;
      const y = window.scrollY;
      for (const { el, k } of parEls) {
        el.style.transform = `translate3d(${(mo.x * 60 * k).toFixed(1)}px,${(y * k + mo.y * 50 * k).toFixed(1)}px,0) rotate(${(mo.x * 6 * k).toFixed(2)}deg)`;
      }
    };

    const pin = () => {
      if (!pinWrap || isMobile) return;
      const rect = pinWrap.getBoundingClientRect();
      const span = pinWrap.offsetHeight - window.innerHeight;
      const p = Math.max(0, Math.min(0.999, -rect.top / (span || 1)));
      if (pinRail && Math.abs(p - pinState.prog) > 0.002) {
        pinRail.style.transform = `scaleX(${Math.max(0.04, p).toFixed(3)})`;
        pinState.prog = p;
      }
      const idx = Math.min(pinPanels.length - 1, Math.floor(p * pinPanels.length));
      if (idx === pinState.idx) return;
      pinState.idx = idx;
      pinPanels.forEach((el, i) => {
        const on = i === idx;
        el.style.opacity = on ? "1" : "0";
        el.style.transform = on ? "none" : `translateY(${i < idx ? -34 : 34}px)`;
        el.style.pointerEvents = on ? "auto" : "none";
      });
      pinRows.forEach((el, i) => {
        const on = i === idx;
        el.style.background = on ? "var(--color-accent)" : "var(--color-bg)";
        el.style.color = on ? "var(--color-bg)" : "var(--color-text)";
      });
      if (pinLabel) pinLabel.textContent = `0${idx + 1} / 0${pinPanels.length}`;
    };

    // The five-step rail: same sticky trick as the stage above, but scroll
    // progress drives the track sideways instead of cross-fading panels.
    // Unpinned below 900px by CSS, so this never runs there.
    const hWrap = document.querySelector<HTMLElement>("[data-hpin]");
    const hTrack = hWrap?.querySelector<HTMLElement>("[data-hpin-track]") ?? null;
    const hCards = hWrap ? Array.from(hWrap.querySelectorAll<HTMLElement>("[data-hpin-card]")) : [];
    const hDots = hWrap ? Array.from(hWrap.querySelectorAll<HTMLElement>("[data-hpin-dot]")) : [];
    const hLabel = hWrap?.querySelector<HTMLElement>("[data-hpin-count]") ?? null;
    const hState = { idx: -1, x: -1 };

    const hpin = () => {
      if (!hWrap || !hTrack || hCards.length < 2) return;
      const rect = hWrap.getBoundingClientRect();
      const span = hWrap.offsetHeight - window.innerHeight;
      const p = Math.max(0, Math.min(1, -rect.top / (span || 1)));
      const cardW = hCards[0].offsetWidth;
      const x = -p * (hCards.length - 1) * cardW;
      if (Math.abs(x - hState.x) > 0.5) {
        hTrack.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
        hState.x = x;
      }
      const idx = Math.round(p * (hCards.length - 1));
      if (idx === hState.idx) return;
      hState.idx = idx;
      hCards.forEach((el, i) => {
        el.style.opacity = i === idx ? "1" : "0.25";
      });
      hDots.forEach((el, i) => {
        const on = i === idx;
        el.style.background = on ? "var(--color-accent)" : "var(--color-neutral-200)";
        el.style.color = on ? "var(--color-bg)" : "var(--color-text)";
      });
      if (hLabel) hLabel.textContent = `0${idx + 1}`;
    };

    // One requestAnimationFrame coalescer for both scroll and mousemove: the
    // event handlers only store input and request a frame, never write style
    // directly, so a burst of events between frames does at most one
    // read-then-write pass instead of one per event.
    let rafPending = false;
    const scheduleFrame = () => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        parallax();
        pin();
        if (!isNarrowRail) hpin();
      });
    };
    const onScroll = () => scheduleFrame();
    const onMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX / window.innerWidth - 0.5, y: e.clientY / window.innerHeight - 0.5 };
      scheduleFrame();
    };

    const needsScrollWiring =
      (!isMobile && (parEls.length > 0 || pinWrap != null)) || (!isNarrowRail && hWrap != null);
    if (needsScrollWiring) {
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("mousemove", onMove, { passive: true });
      scheduleFrame();
    }

    return () => {
      io?.disconnect();
      cio?.disconnect();
      iio?.disconnect();
      mio?.disconnect();
      timers.forEach(clearTimeout);
      if (needsScrollWiring) {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("mousemove", onMove);
      }
    };
  }, [pathname]);

  return null;
}
