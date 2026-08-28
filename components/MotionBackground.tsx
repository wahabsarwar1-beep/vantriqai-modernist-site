"use client";

import { useEffect, useRef } from "react";
import { MOTION_MULT, prefersReducedMotion } from "@/lib/motion";

const GAP = 46;

type Packet = {
  axis: "v" | "h";
  lane: number;
  dir: 1 | -1;
  pos: number;
  speed: number;
  len: number;
  ink: boolean;
};

type Pulse = { x: number; y: number; r: number; a: number };

/** Hero background: a faint 46px signal grid with packets of light tracing
 *  the lanes (mostly red, some ink) and pulse rings where they respawn.
 *  Density scales with hero area and the motion-level multiplier, pauses
 *  off-screen or when the tab is hidden, and draws exactly one frame under
 *  prefers-reduced-motion instead of animating. Purely decorative —
 *  pointer-events are disabled throughout. */
export default function MotionBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = prefersReducedMotion();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let w = 0;
    let h = 0;
    let lanesX: number[] = [];
    let lanesY: number[] = [];
    let packets: Packet[] = [];
    let pulses: Pulse[] = [];
    let raf = 0;
    let running = false;

    function makePacket(width: number, height: number, lx: number[], ly: number[]): Packet {
      const vert = Math.random() < 0.62;
      const lanes = vert ? lx : ly;
      const lane = lanes.length ? lanes[Math.floor(Math.random() * lanes.length)] : vert ? width / 2 : height / 2;
      const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
      const extent = vert ? height : width;
      return {
        axis: vert ? "v" : "h",
        lane,
        dir,
        pos: dir === 1 ? -Math.random() * extent : extent + Math.random() * extent,
        speed: (0.9 + Math.random() * 2.6) * MOTION_MULT,
        len: 60 + Math.random() * 190,
        ink: Math.random() < 0.35,
      };
    }

    function build() {
      const rect = canvas!.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas!.width = Math.round(w * dpr);
      canvas!.height = Math.round(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      lanesX = [];
      lanesY = [];
      for (let x = GAP; x < w; x += GAP) lanesX.push(x);
      for (let y = GAP; y < h; y += GAP) lanesY.push(y);
      const n = Math.round(Math.max(6, Math.min(22, w / 70)) * MOTION_MULT);
      packets = Array.from({ length: n }, () => makePacket(w, h, lanesX, lanesY));
      pulses = [];
    }

    function draw() {
      ctx!.clearRect(0, 0, w, h);
      ctx!.lineWidth = 1;
      ctx!.strokeStyle = "rgba(32,30,29,0.07)";
      ctx!.beginPath();
      lanesX.forEach((x) => {
        ctx!.moveTo(x, 0);
        ctx!.lineTo(x, h);
      });
      lanesY.forEach((y) => {
        ctx!.moveTo(0, y);
        ctx!.lineTo(w, y);
      });
      ctx!.stroke();

      packets.forEach((p, i) => {
        const vert = p.axis === "v";
        const hx = vert ? p.lane : p.pos;
        const hy = vert ? p.pos : p.lane;
        const tx = vert ? p.lane : p.pos - p.dir * p.len;
        const ty = vert ? p.pos - p.dir * p.len : p.lane;
        const grad = ctx!.createLinearGradient(tx, ty, hx, hy);
        grad.addColorStop(0, "rgba(236,48,19,0)");
        grad.addColorStop(1, p.ink ? "rgba(32,30,29,0.55)" : "rgba(236,48,19,0.85)");
        ctx!.strokeStyle = grad;
        ctx!.lineWidth = p.ink ? 1.5 : 2.5;
        ctx!.beginPath();
        ctx!.moveTo(tx, ty);
        ctx!.lineTo(hx, hy);
        ctx!.stroke();
        ctx!.fillStyle = p.ink ? "rgba(32,30,29,0.75)" : "#ec3013";
        ctx!.fillRect(hx - 2.5, hy - 2.5, 5, 5);

        if (!reduced) {
          p.pos += p.dir * p.speed;
          const extent = vert ? h : w;
          if (p.pos < -p.len - 40 || p.pos > extent + p.len + 40) {
            if (Math.random() < 0.5 && pulses.length < 8) pulses.push({ x: hx, y: hy, r: 0, a: 0.5 });
            packets[i] = makePacket(w, h, lanesX, lanesY);
          }
        }
      });

      pulses = pulses.filter((q) => q.a > 0.02);
      pulses.forEach((q) => {
        ctx!.strokeStyle = `rgba(236,48,19,${q.a.toFixed(3)})`;
        ctx!.lineWidth = 2;
        ctx!.strokeRect(q.x - q.r, q.y - q.r, q.r * 2, q.r * 2);
        q.r += 1.4;
        q.a *= 0.965;
      });

      if (running) raf = requestAnimationFrame(draw);
    }

    function start() {
      if (running || reduced) return;
      running = true;
      raf = requestAnimationFrame(draw);
    }
    function stop() {
      running = false;
      cancelAnimationFrame(raf);
    }

    build();
    draw();
    if (!reduced) start();

    const ro = new ResizeObserver(() => {
      build();
      if (reduced) draw();
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
      className="hero-canvas"
      style={{
        position: "absolute",
        inset: -1,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        maskImage: "linear-gradient(to bottom, black 0%, black 62%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 62%, transparent 100%)",
      }}
    />
  );
}
