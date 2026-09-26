"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Magnetic from "@/components/Magnetic";
import HeroChatCard, { type ChatBubble } from "@/components/HeroChatCard";
import ResponseGapStrip from "@/components/ResponseGapStrip";
import { waLink } from "@/lib/whatsapp";
import { hrefIn, type Region } from "@/lib/region";

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

/** One exchange per scene, so the card argues the same case the headline
 *  does instead of showing a generic chat. */
const CHATS = (region: Region): { channel: string; time: string; bubbles: ChatBubble[]; speed: string; outcome: string[] }[] => [
  {
    channel: "WhatsApp",
    time: "21:40",
    bubbles: [
      { from: "them", text: "Is the black leather sofa in stock?" },
      { from: "us", text: "Yes — in stock. Shall I hold one for you?" },
    ],
    speed: "Replied in 1.2 s",
    outcome: ["Visit booked · tomorrow, 18:30", "Reminder scheduled"],
  },
  {
    channel: "Voice",
    time: "19:05",
    bubbles: [
      { from: "them", text: "Calling — do you have anything Saturday morning?" },
      { from: "us", text: "We do. 10:30 or 11:15 — which suits?" },
    ],
    speed: "Answered on ring 2",
    outcome: ["Appointment set · Sat, 10:30", "Confirmation sent by SMS"],
  },
  {
    channel: "WhatsApp",
    time: "08:15",
    bubbles: [
      { from: "us", text: "Morning! Your quote from Tuesday is still open — shall I hold the price?" },
      { from: "them", text: "Yes please, go ahead." },
    ],
    speed: "Reopened after 3 days",
    outcome: [region.quoteOutcome, "Deal moved to Negotiation"],
  },
];

export default function HeroRotator({ region }: { region: Region }) {
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
      <div className="hero-split" style={{ alignItems: "start" }}>
        <div>
          {/* All three scenes share one grid cell, so the stage is exactly as
              tall as the tallest of them at any width. The old fixed
              minHeight could not be right at both ends: it reserved ~70px of
              dead space at 1440, and at 320px it was ~85px too short, so the
              copy ran over the buttons underneath. */}
          <div style={{ display: "grid" }}>
            {SCENES.map((s, i) => (
              <div
                key={i}
                style={{
                  gridArea: "1 / 1",
                  transition: "opacity .55s cubic-bezier(.16,1,.3,1), transform .55s cubic-bezier(.16,1,.3,1)",
                  opacity: i === scene ? 1 : 0,
                  transform: i === scene ? "translateY(0)" : i < scene ? "translateY(-14px)" : "translateY(14px)",
                  pointerEvents: i === scene ? "auto" : "none",
                }}
                aria-hidden={i === scene ? undefined : true}
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
              <Link className="btn btn-secondary" href={hrefIn(region, "/how-it-works")} style={{ minHeight: 38, paddingInline: 16 }}>
                See how it works
              </Link>
            </Magnetic>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            {SCENES.map((s, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Show ${s.tag}`}
                aria-pressed={i === scene}
                onClick={() => setScene(i)}
                /* The mark stays a 28x4 bar, but the button around it is 44px
                   tall so it can actually be hit with a thumb — the extra
                   height is padding, so the row still sits where it did. */
                style={{ width: 28, height: 44, padding: "20px 0", border: "none", background: "none", cursor: "pointer", display: "block" }}
              >
                <span
                  aria-hidden="true"
                  style={{ display: "block", width: 28, height: 4, borderRadius: 2, background: i === scene ? "var(--color-accent)" : "var(--color-divider)", transition: "background-color .2s ease" }}
                />
              </button>
            ))}
          </div>
        </div>
        {/* Keyed on the scene so the card remounts and its bubbles wave in
            again on every switch — the arrival is the point. */}
        <div style={{ position: "relative", justifySelf: "center", width: "min(100%,340px)", marginTop: 8 }}>
          <HeroChatCard key={scene} {...CHATS(region)[scene]} />
          <div aria-hidden="true" style={{ position: "absolute", left: "50%", bottom: -16, transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 6, background: "color-mix(in srgb, var(--color-bg) 88%, transparent)", backdropFilter: "blur(6px)", borderRadius: 999, padding: "6px 11px", boxShadow: "var(--shadow-sm)", whiteSpace: "nowrap", pointerEvents: "none", zIndex: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-accent)", animation: "blip 1.6s infinite" }} />
            <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 10.5, letterSpacing: "-0.01em" }}>{SCENES[scene].badge}</span>
          </div>
        </div>
        <div className="hero-split-full">
          <ResponseGapStrip />
        </div>
      </div>
    </>
  );
}
