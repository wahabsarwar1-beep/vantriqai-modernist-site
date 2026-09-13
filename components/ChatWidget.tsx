"use client";

import { useState } from "react";
import Image from "next/image";
import { waLink } from "@/lib/whatsapp";

type Msg = { side: "start" | "end"; bg: string; fg: string; border: string; text: string };

const WELCOME: Msg = {
  side: "start",
  bg: "var(--color-surface)",
  fg: "var(--color-text)",
  border: "1px solid var(--color-divider)",
  text: "Hi! I'm the VantriqAI assistant. Ask me anything, or message us directly on WhatsApp for a real conversation with the team.",
};

const CHIPS = ["Book a demo", "What does it cost?", "Which module?"];

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<Msg[]>([WELCOME]);
  const [typing, setTyping] = useState(false);
  const [value, setValue] = useState("");

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setLog((l) => [...l, { side: "end", bg: "var(--color-text)", fg: "var(--color-bg)", border: "none", text: trimmed }]);
    setValue("");
    setTyping(true);
    window.setTimeout(() => {
      setTyping(false);
      setLog((l) => [
        ...l,
        {
          side: "start",
          bg: "var(--color-surface)",
          fg: "var(--color-text)",
          border: "1px solid var(--color-divider)",
          text: "Good question — the fastest way to get a real answer is on WhatsApp. Tap below and the team will pick it up from here.",
        },
      ]);
    }, 900);
  };

  return (
    <div
      style={{
        position: "fixed",
        right: "clamp(16px,3vw,28px)",
        bottom: "clamp(16px,3vw,28px)",
        zIndex: 70,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 12,
        pointerEvents: "none",
      }}
    >
      {open && (
        <div
          style={{
            pointerEvents: "auto",
            width: "min(380px,calc(100vw - 32px))",
            borderRadius: 28,
            overflow: "hidden",
            height: "min(560px,calc(100vh - 132px))",
            display: "flex",
            flexDirection: "column",
            background: "var(--color-bg)",
            border: "1px solid var(--color-text)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--color-text)", color: "var(--color-bg)", padding: "14px 16px", flex: "none" }}>
            <Image src="/ventriqai-mark-reversed-cobalt.svg" alt="" width={22} height={22} style={{ width: 22, height: 22, flex: "none", display: "block" }} />
            <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "clamp(12.5px,3.6vw,14px)", lineHeight: 1.2, letterSpacing: "-0.01em" }}>
                Vantriq<span style={{ color: "var(--color-accent-400)", marginLeft: -8 }}>AI</span> Assistant
                <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--color-accent-300)", flex: "none", animation: "blip 1.6s ease-in-out infinite" }} />
              </span>
              <span style={{ fontSize: 10.5, lineHeight: 1.2, letterSpacing: "0.06em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-bg) 58%, transparent)" }}>We&rsquo;re here to help</span>
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              style={{ marginLeft: "auto", flex: "none", width: 30, height: 30, display: "grid", placeItems: "center", background: "transparent", border: "1px solid color-mix(in srgb, var(--color-bg) 40%, transparent)", color: "var(--color-bg)", fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 14, lineHeight: 1, cursor: "pointer" }}
            >
              &times;
            </button>
          </div>
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              display: "grid",
              gap: 12,
              alignContent: "start",
              padding: "18px 16px",
              background: "var(--color-surface)",
            }}
          >
            {log.map((msg, i) => (
              <div key={i} style={{ maxWidth: "86%", justifySelf: msg.side, background: msg.bg, color: msg.fg, border: msg.border, padding: "11px 14px", fontSize: 14.5, lineHeight: "23px" }}>
                {msg.text}
              </div>
            ))}
            {typing && (
              <div style={{ justifySelf: "end", display: "flex", gap: 5, alignItems: "center", background: "var(--color-text)", borderRadius: 999, padding: "13px 15px" }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--color-bg)", animation: "blip 1.1s infinite" }} />
                <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--color-bg)", animation: "blip 1.1s .18s infinite" }} />
                <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--color-bg)", animation: "blip 1.1s .36s infinite" }} />
              </div>
            )}
          </div>
          <div style={{ flex: "none", display: "flex", flexWrap: "wrap", gap: 10, borderTop: "1px solid var(--color-divider)", background: "var(--color-bg)", padding: "10px 10px 0" }}>
            {CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => send(chip)}
                style={{ minHeight: 34, padding: "0 14px", borderRadius: 999, background: "var(--color-surface)", border: "1px solid var(--color-divider)", color: "var(--color-text)", fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}
              >
                {chip}
              </button>
            ))}
          </div>
          <div style={{ flex: "none", display: "flex", gap: 10, background: "var(--color-bg)", padding: 10 }}>
            <input
              className="input"
              placeholder="Type your message..."
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send(value);
              }}
              style={{ flex: 1, minHeight: 44, borderWidth: 1 }}
            />
            <button type="button" className="btn btn-primary" onClick={() => send(value)} style={{ minHeight: 44, paddingInline: 16, justifyContent: "center", fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Send
            </button>
          </div>
          <div style={{ flex: "none", padding: "8px 16px 14px", background: "var(--color-bg)" }}>
            <a href={waLink()} target="_blank" rel="noopener" className="btn btn-secondary btn-block" style={{ minHeight: 40, justifyContent: "center", fontSize: 13 }}>
              Continue on WhatsApp
            </a>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Open the VantriqAI assistant"
        data-cursor-label="Chat with us"
        style={{
          pointerEvents: "auto",
          position: "relative",
          display: "flex",
          alignItems: "stretch",
          gap: 0,
          padding: 0,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          borderRadius: 999,
          overflow: "hidden",
          boxShadow: "var(--shadow-md)",
        }}
      >
        <span
          className="chat-launcher-label"
          style={{ display: "flex", alignItems: "center", padding: "0 16px", background: "var(--color-text)", color: "var(--color-bg)", fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 13, letterSpacing: "0.02em", whiteSpace: "nowrap" }}
        >
          Ask Vantriq<span style={{ color: "var(--color-accent-400)" }}>AI</span>
        </span>
        <span style={{ position: "relative", display: "grid", placeItems: "center", width: 60, height: 60, flex: "none", background: "var(--color-accent)", color: "var(--color-bg)" }}>
          <span aria-hidden="true" style={{ position: "absolute", inset: 0, border: "1px solid var(--color-accent)", pointerEvents: "none" }} />
          <svg width="30" height="30" viewBox="0 0 48 48" aria-hidden="true" style={{ display: "block" }}>
            <path d="M24 4l4.6 12.8L41.4 21.4 28.6 26 24 38.8 19.4 26 6.6 21.4 19.4 16.8z" fill="var(--color-bg)" />
            <path d="M38 30l1.8 5.2L45 37l-5.2 1.8L38 44l-1.8-5.2L31 37l5.2-1.8z" fill="var(--color-text)" />
          </svg>
        </span>
      </button>
    </div>
  );
}
