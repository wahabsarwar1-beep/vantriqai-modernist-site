"use client";

import { useEffect, useRef } from "react";

const INK = "32, 30, 29";
const ACCENT = "236, 48, 19";

type Node = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  accent: boolean;
};

/** Full-bleed animated node network behind a hero section. Density scales
 *  with viewport area, pauses when off-screen or the tab is hidden, and
 *  renders one static frame under prefers-reduced-motion instead of
 *  animating. Purely decorative — pointer-events are disabled throughout. */
export default function MotionBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;
    let nodes: Node[] = [];
    let raf = 0;
    let running = false;

    const rand = (min: number, max: number) => min + Math.random() * (max - min);

    function buildNodes() {
      const area = width * height;
      const count = Math.max(32, Math.min(130, Math.round(area / 13000)));
      nodes = Array.from({ length: count }, () => ({
        x: rand(0, width),
        y: rand(0, height),
        vx: rand(-0.16, 0.16),
        vy: rand(-0.13, 0.13),
        r: rand(1.4, 3.2),
        accent: Math.random() < 0.16,
      }));
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildNodes();
    }

    function step() {
      ctx!.clearRect(0, 0, width, height);
      const linkDist = Math.min(190, Math.max(110, width / 6.5));

      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < -20) n.x = width + 20;
        if (n.x > width + 20) n.x = -20;
        if (n.y < -20) n.y = height + 20;
        if (n.y > height + 20) n.y = -20;
      }

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < linkDist) {
            const near = a.accent || b.accent;
            const alpha = (1 - dist / linkDist) * (near ? 0.4 : 0.28);
            ctx!.strokeStyle = near ? `rgba(${ACCENT}, ${alpha})` : `rgba(${INK}, ${alpha})`;
            ctx!.lineWidth = 1;
            ctx!.beginPath();
            ctx!.moveTo(a.x, a.y);
            ctx!.lineTo(b.x, b.y);
            ctx!.stroke();
          }
        }
      }

      for (const n of nodes) {
        ctx!.fillStyle = n.accent ? `rgba(${ACCENT}, 0.75)` : `rgba(${INK}, 0.5)`;
        ctx!.beginPath();
        ctx!.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx!.fill();
      }

      if (running) raf = requestAnimationFrame(step);
    }

    function start() {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(step);
    }
    function stop() {
      running = false;
      cancelAnimationFrame(raf);
    }

    resize();
    if (reduced) {
      step();
    } else {
      start();
    }

    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) step();
    });
    ro.observe(canvas);

    const onVisibility = () => {
      if (reduced) return;
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const io = new IntersectionObserver(
      (entries) => {
        if (reduced) return;
        const visible = entries[0]?.isIntersecting;
        if (visible && !document.hidden) start();
        else stop();
      },
      { threshold: 0.01 }
    );
    io.observe(canvas);

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        maskImage: "linear-gradient(to bottom, black 0%, black 65%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 65%, transparent 100%)",
      }}
    />
  );
}
