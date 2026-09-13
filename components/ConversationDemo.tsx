"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

const A1 = "Yes — the Aurora 3-seater in black is in stock at our Blue Area showroom. Want me to hold one for you?";
const A2 = "Done. I've held it for 48 hours and booked your visit for tomorrow, 6:30 PM. You'll get a reminder an hour before.";

type ChatState = { m1: boolean; m2: boolean; m3: boolean; m4: boolean; t1: boolean; t2: boolean; a1: string; a2: string };
const RESET: ChatState = { m1: false, m2: false, m3: false, m4: false, t1: false, t2: false, a1: "", a2: "" };

function wait(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

export default function ConversationDemo() {
  const [state, setState] = useState<ChatState>(RESET);
  const runId = useRef(0);
  const reduced = useRef(false);

  const runChat = useCallback(async () => {
    const id = ++runId.current;
    const alive = () => runId.current === id;
    setState(RESET);
    if (reduced.current) {
      setState({ m1: true, m2: true, m3: true, m4: true, t1: false, t2: false, a1: A1, a2: A2 });
      return;
    }
    while (alive()) {
      await wait(700); if (!alive()) return;
      setState((s) => ({ ...s, m1: true }));
      await wait(800); if (!alive()) return;
      setState((s) => ({ ...s, t1: true }));
      await wait(1000); if (!alive()) return;
      setState((s) => ({ ...s, t1: false, m2: true }));
      for (let i = 1; i <= A1.length; i++) {
        if (!alive()) return;
        setState((s) => ({ ...s, a1: A1.slice(0, i) }));
        await wait(14);
      }
      await wait(1100); if (!alive()) return;
      setState((s) => ({ ...s, m3: true }));
      await wait(800); if (!alive()) return;
      setState((s) => ({ ...s, t2: true }));
      await wait(900); if (!alive()) return;
      setState((s) => ({ ...s, t2: false, m4: true }));
      for (let i = 1; i <= A2.length; i++) {
        if (!alive()) return;
        setState((s) => ({ ...s, a2: A2.slice(0, i) }));
        await wait(14);
      }
      await wait(6000); if (!alive()) return;
      setState(RESET);
      await wait(500);
    }
  }, []);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const frame = requestAnimationFrame(() => runChat());
    window.addEventListener("replay-conversation", runChat);
    return () => {
      cancelAnimationFrame(frame);
      runId.current++;
      window.removeEventListener("replay-conversation", runChat);
    };
  }, [runChat]);

  const bubbleIn = { animation: "pop .3s ease both" as const };

  return (
    <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 296, justifySelf: "center", background: "var(--color-neutral-900)", border: "1px solid var(--color-neutral-800)", padding: 8, borderRadius: 46, boxShadow: "var(--shadow-lg)" }}>
      <div style={{ position: "relative", background: "var(--color-surface)", borderRadius: 38, overflow: "hidden", aspectRatio: "9 / 17", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 26px 10px", fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 12.5, letterSpacing: "-0.01em" }}>
          <span>9:41</span>
          <span style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
            <span style={{ display: "flex", gap: 1.5, alignItems: "flex-end" }}>
              <span style={{ width: 2.5, height: 4, borderRadius: 1, background: "var(--color-text)" }} />
              <span style={{ width: 2.5, height: 6, borderRadius: 1, background: "var(--color-text)" }} />
              <span style={{ width: 2.5, height: 8, borderRadius: 1, background: "var(--color-text)" }} />
              <span style={{ width: 2.5, height: 10, borderRadius: 1, background: "var(--color-text)" }} />
            </span>
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--color-text)", color: "var(--color-bg)", padding: "11px 16px" }}>
          <Image src="/ventriqai-mark-reversed-cobalt.svg" alt="" width={22} height={22} style={{ width: 22, height: 22, flex: "none", display: "block" }} />
          <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 13, letterSpacing: "-0.01em", whiteSpace: "nowrap", flex: "none" }}>
            Vantriq<span style={{ color: "var(--color-accent-400)" }}>AI</span> agent
          </span>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--color-accent-300)", flex: "none", animation: "blip 1.6s ease-in-out infinite" }} />
          <span style={{ marginLeft: "auto", flex: "none", fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", whiteSpace: "nowrap", color: "color-mix(in srgb, var(--color-bg) 60%, transparent)" }}>
            Online
          </span>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: "grid", gap: 12, padding: "18px 14px 20px", overflow: "hidden", alignContent: "end", background: "var(--color-surface)" }}>
          <p style={{ justifySelf: "center", fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 42%, transparent)", margin: "0 0 2px" }}>
            Today · 21:40
          </p>
          {state.m1 && (
            <div style={{ justifySelf: "start", maxWidth: "84%", border: "1px solid var(--color-divider)", borderRadius: "22px 22px 22px 6px", background: "var(--color-surface)", padding: "12px 16px", boxShadow: "var(--shadow-sm)", fontSize: 15, lineHeight: "24px", ...bubbleIn }}>
              Hi, do you have the black leather sofa in stock?
            </div>
          )}
          {state.t1 && (
            <div style={{ justifySelf: "end", display: "flex", gap: 5, alignItems: "center", background: "var(--color-text)", borderRadius: 999, padding: "14px 16px" }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--color-bg)", animation: "blip 1.1s infinite" }} />
              <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--color-bg)", animation: "blip 1.1s .18s infinite" }} />
              <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--color-bg)", animation: "blip 1.1s .36s infinite" }} />
            </div>
          )}
          {state.m2 && (
            <div style={{ justifySelf: "end", maxWidth: "88%" }}>
              <div style={{ background: "var(--color-text)", color: "var(--color-bg)", borderRadius: "22px 22px 6px 22px", padding: "12px 16px", fontSize: 15, lineHeight: "24px" }}>{state.a1}</div>
              {state.a1 === A1 && (
                <p style={{ margin: "7px 0 0", fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-accent)", textAlign: "right" }}>
                  Replied in 1.2s
                </p>
              )}
            </div>
          )}
          {state.m3 && (
            <div style={{ justifySelf: "start", maxWidth: "84%", border: "1px solid var(--color-divider)", borderRadius: "22px 22px 22px 6px", background: "var(--color-surface)", padding: "12px 16px", boxShadow: "var(--shadow-sm)", fontSize: 15, lineHeight: "24px", ...bubbleIn }}>
              Yes please. Can I see it tomorrow evening?
            </div>
          )}
          {state.t2 && (
            <div style={{ justifySelf: "end", display: "flex", gap: 5, alignItems: "center", background: "var(--color-text)", borderRadius: 999, padding: "14px 16px" }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--color-bg)", animation: "blip 1.1s infinite" }} />
              <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--color-bg)", animation: "blip 1.1s .18s infinite" }} />
              <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--color-bg)", animation: "blip 1.1s .36s infinite" }} />
            </div>
          )}
          {state.m4 && (
            <div style={{ justifySelf: "end", maxWidth: "88%" }}>
              <div style={{ background: "var(--color-text)", color: "var(--color-bg)", borderRadius: "22px 22px 6px 22px", padding: "12px 16px", fontSize: 15, lineHeight: "24px" }}>{state.a2}</div>
              {state.a2 === A2 && (
                <p style={{ margin: "7px 0 0", fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-accent)", textAlign: "right" }}>
                  Replied in 0.9s · Booked · Reminder set
                </p>
              )}
            </div>
          )}
        </div>
        <div style={{ flex: "none", height: 30, display: "grid", placeItems: "center", background: "var(--color-surface)" }}>
          <span style={{ width: 118, height: 5, background: "var(--color-text)", borderRadius: 3 }} />
        </div>
      </div>
    </div>
  );
}

export function ReplayButton() {
  return (
    <button
      type="button"
      className="btn btn-secondary"
      onClick={() => window.dispatchEvent(new Event("replay-conversation"))}
      style={{ gridColumn: "1 / -1", marginTop: 22, justifySelf: "start", minHeight: 44, paddingInline: 18, justifyContent: "center", borderWidth: 1, background: "transparent" }}
    >
      Replay the conversation
    </button>
  );
}
