"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Magnetic from "@/components/Magnetic";
import { waLink } from "@/lib/whatsapp";

const SCENES = [
  {
    tag: "Messaging",
    badge: "3 conversations live",
    lines: ["Never miss another", "customer message."],
    body: "AI agents that reply, qualify, and book — 24 hours a day. On WhatsApp, Instagram, and your website, in seconds, at any volume.",
  },
  {
    tag: "Voice agents",
    badge: "1 call answered",
    lines: ["Never miss another", "phone call, either."],
    body: "A voice agent that answers the phone, speaks naturally, and books the appointment — while your team is busy, or the shop is closed.",
  },
  {
    tag: "Automations",
    badge: "6 follow-ups sent",
    lines: ["The follow-up that", "never gets forgotten."],
    body: "Every abandoned quote, unpaid invoice, and unanswered booking gets reopened automatically — at the hour people actually reply, until it's resolved.",
  },
];

function ScenePhoto({ scene }: { scene: number }) {
  if (scene === 0) {
    return (
      <div style={{ position: "relative", width: "52%", aspectRatio: 1.4, background: "var(--color-surface)", borderRadius: "12px 12px 12px 4px", boxShadow: "var(--shadow-sm)", display: "flex", alignItems: "center", justifyContent: "center", gap: "8%" }}>
        <span style={{ width: "12%", aspectRatio: 1, borderRadius: "50%", background: "var(--color-accent)", animation: "blip 1.4s infinite" }} />
        <span style={{ width: "12%", aspectRatio: 1, borderRadius: "50%", background: "var(--color-accent)", animation: "blip 1.4s infinite", animationDelay: ".2s" }} />
        <span style={{ width: "12%", aspectRatio: 1, borderRadius: "50%", background: "var(--color-accent)", animation: "blip 1.4s infinite", animationDelay: ".4s" }} />
      </div>
    );
  }
  if (scene === 1) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, height: "36%" }}>
        {[0, 0.15, 0.3, 0.45, 0.6].map((d) => (
          <span key={d} style={{ width: 7, height: "100%", borderRadius: 4, background: "var(--color-accent)", animation: "wavebar 1s ease-in-out infinite", animationDelay: `${d}s` }} />
        ))}
      </div>
    );
  }
  return (
    <svg width="38%" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth={1.6} style={{ animation: "spinslow 6s linear infinite" }}>
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1" strokeLinecap="round" />
      <circle cx={12} cy={12} r={5.2} />
    </svg>
  );
}

export default function HeroRotator() {
  const [scene, setScene] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setScene((s) => (s + 1) % 3), 5200);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: "clamp(28px,5vw,54px)" }}>
        <span data-anim="" style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 13, letterSpacing: "0.08em" }}>
          Vantriq<span style={{ color: "var(--color-accent)" }}>AI</span>
        </span>
        <span data-anim="rule" style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
      </div>
      <div data-anim="" style={{ marginBottom: 14 }}>
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-accent-700)", background: "var(--color-accent-100)", borderRadius: 999, padding: "6px 13px", display: "inline-block" }}>
          {SCENES[scene].tag}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(min(460px,100%),1.6fr) minmax(min(180px,100%),0.4fr)", gap: "clamp(28px,4vw,56px)", alignItems: "start" }}>
        <div>
          <div style={{ position: "relative", minHeight: "clamp(260px,26vw,340px)" }}>
            {SCENES.map((s, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  inset: 0,
                  transition: "opacity .55s cubic-bezier(.16,1,.3,1), transform .55s cubic-bezier(.16,1,.3,1)",
                  opacity: i === scene ? 1 : 0,
                  transform: i === scene ? "translateY(0)" : i < scene ? "translateY(-14px)" : "translateY(14px)",
                  pointerEvents: i === scene ? "auto" : "none",
                }}
              >
                <h1 style={{ fontSize: "clamp(34px,5vw,64px)", lineHeight: 0.98, letterSpacing: "-0.03em", margin: 0, maxWidth: "16ch", overflowWrap: "break-word" }}>
                  <span style={{ display: "block" }}>{s.lines[0]}</span>
                  <span style={{ display: "block", color: "var(--color-accent)" }}>{s.lines[1]}</span>
                </h1>
                <p style={{ fontSize: 18, lineHeight: "30px", maxWidth: "48ch", margin: "clamp(32px,4vw,56px) 0 0" }}>{s.body}</p>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 28, flexWrap: "wrap" }}>
            <Magnetic>
              <a className="btn btn-primary" href={waLink()} target="_blank" rel="noopener" style={{ minHeight: 38, paddingInline: 16 }}>
                Message us on WhatsApp
              </a>
            </Magnetic>
            <Magnetic>
              <Link className="btn btn-secondary" href="/how-it-works" style={{ minHeight: 38, paddingInline: 16 }}>
                See how it works
              </Link>
            </Magnetic>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
            {SCENES.map((s, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Show ${s.tag}`}
                onClick={() => setScene(i)}
                style={{ width: 28, height: 4, borderRadius: 2, border: "none", padding: 0, cursor: "pointer", background: i === scene ? "var(--color-accent)" : "var(--color-divider)" }}
              />
            ))}
          </div>
        </div>
        <div style={{ position: "relative", justifySelf: "center", width: "min(90%,280px)", aspectRatio: 1, marginTop: 8 }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: 58, overflow: "hidden", boxShadow: "var(--shadow-lg)", background: "var(--color-accent-100)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ScenePhoto scene={scene} />
          </div>
          <span aria-hidden="true" style={{ position: "absolute", inset: "9%", borderRadius: "50%", border: "1.5px dashed var(--color-accent-300)", animation: "spinslow 14s linear infinite", zIndex: 4, pointerEvents: "none" }} />
          <span aria-hidden="true" style={{ position: "absolute", inset: 0, animation: "orbitspin 7s linear infinite", zIndex: 4, pointerEvents: "none" }}>
            <span style={{ position: "absolute", top: "3%", left: "50%", width: 10, height: 10, marginLeft: -5, borderRadius: "50%", background: "var(--color-accent)", boxShadow: "0 0 0 5px color-mix(in srgb, var(--color-accent) 16%, transparent)" }} />
          </span>
          <div aria-hidden="true" style={{ position: "absolute", left: "50%", bottom: -16, transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 6, background: "color-mix(in srgb, var(--color-bg) 88%, transparent)", backdropFilter: "blur(6px)", borderRadius: 999, padding: "6px 11px", boxShadow: "var(--shadow-sm)", whiteSpace: "nowrap", pointerEvents: "none", zIndex: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-accent)", animation: "blip 1.6s infinite" }} />
            <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 10.5, letterSpacing: "-0.01em" }}>{SCENES[scene].badge}</span>
          </div>
        </div>
      </div>
    </>
  );
}
