"use client";

import { useEffect, useRef, useState } from "react";

const A1 =
  "Yes — the Aurora 3-seater in black is in stock at our Blue Area showroom. Want me to hold one for you?";
const A2 =
  "Done. I've held it for 48 hours and booked your visit for tomorrow, 6:30 PM. You'll get a reminder an hour before.";

type ChatState = {
  m1: boolean;
  m2: boolean;
  m3: boolean;
  m4: boolean;
  t1: boolean;
  t2: boolean;
  c1: boolean;
  c2: boolean;
  a1: string;
  a2: string;
};

const RESET: ChatState = {
  m1: false,
  m2: false,
  m3: false,
  m4: false,
  t1: false,
  t2: false,
  c1: false,
  c2: false,
  a1: "",
  a2: "",
};

const NOTES = [
  { label: "Checked stock", body: "Against live inventory, not a canned answer." },
  { label: "Held the item", body: "A real action in your system, logged to the lead." },
  { label: "Booked the visit", body: "Into the calendar, with the reminder scheduled." },
];

/** Runs independently of scroll position, so it's always mid-conversation
 *  whenever a visitor scrolls back to it. */
export default function ChatDemo() {
  const [state, setState] = useState<ChatState>(RESET);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const runId = useRef(0);
  const dead = useRef(false);

  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      timers.current.push(setTimeout(resolve, ms));
    });

  const type = async (key: "a1" | "a2", text: string, alive: () => boolean) => {
    for (let i = 1; i <= text.length; i++) {
      if (!alive()) return;
      setState((s) => ({ ...s, [key]: text.slice(0, i) }));
      await wait(15);
    }
  };

  const runChat = async () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const run = (runId.current += 1);
    const alive = () => runId.current === run && !dead.current;

    setState({ ...RESET });

    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setState({ ...RESET, m1: true, m2: true, m3: true, m4: true, a1: A1, a2: A2 });
      return;
    }

    while (alive()) {
      await wait(700);
      if (!alive()) return;
      setState((s) => ({ ...s, m1: true }));
      await wait(850);
      if (!alive()) return;
      setState((s) => ({ ...s, t1: true }));
      await wait(1100);
      if (!alive()) return;
      setState((s) => ({ ...s, t1: false, m2: true, c1: true }));
      await type("a1", A1, alive);
      if (!alive()) return;
      setState((s) => ({ ...s, c1: false }));
      await wait(1200);
      if (!alive()) return;
      setState((s) => ({ ...s, m3: true }));
      await wait(800);
      if (!alive()) return;
      setState((s) => ({ ...s, t2: true }));
      await wait(950);
      if (!alive()) return;
      setState((s) => ({ ...s, t2: false, m4: true, c2: true }));
      await type("a2", A2, alive);
      if (!alive()) return;
      setState((s) => ({ ...s, c2: false }));
      await wait(6000);
      if (!alive()) return;
      setState({ ...RESET });
      await wait(500);
    }
  };

  useEffect(() => {
    dead.current = false;
    const kickoff = setTimeout(runChat, 0);
    return () => {
      dead.current = true;
      clearTimeout(kickoff);
      timers.current.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
        gap: "24px clamp(24px,4vw,56px)",
        alignItems: "start",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 360,
          background: "var(--color-text)",
          border: "2px solid var(--color-neutral-800)",
          padding: "12px 12px 14px",
          borderRadius: 46,
          boxShadow: "var(--shadow-lg)",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 14,
            transform: "translateX(-50%)",
            width: 104,
            height: 22,
            background: "var(--color-text)",
            borderRadius: "0 0 14px 14px",
            zIndex: 2,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: -3,
            top: 120,
            width: 3,
            height: 52,
            background: "var(--color-neutral-800)",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: -3,
            top: 150,
            width: 3,
            height: 74,
            background: "var(--color-neutral-800)",
          }}
        />
        <div style={{ background: "var(--color-bg)", borderRadius: 36, overflow: "hidden" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 24px 8px",
              fontFamily: "var(--font-heading)",
              fontWeight: 800,
              fontSize: 11,
              letterSpacing: "0.04em",
            }}
          >
            <span>9:41</span>
            <span style={{ display: "flex", gap: 5, alignItems: "center" }}>
              <span style={{ width: 15, height: 9, border: "1.5px solid var(--color-text)" }} />
              <span style={{ width: 11, height: 9, background: "var(--color-text)" }} />
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "var(--color-text)",
              color: "var(--color-bg)",
              padding: "11px 16px",
            }}
          >
            <img
              src="/ventriqai-mark-reversed.svg"
              alt=""
              style={{ width: 22, height: 22, flex: "none", display: "block" }}
            />
            <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 13, letterSpacing: "-0.01em" }}>
              Ventriq<span style={{ color: "var(--color-accent)" }}>AI</span> agent
            </span>
            <span
              style={{
                width: 7,
                height: 7,
                background: "var(--color-accent)",
                flex: "none",
                animation: "blip 1.6s ease-in-out infinite",
              }}
            />
            <span
              style={{
                marginLeft: "auto",
                fontFamily: "var(--font-heading)",
                fontWeight: 800,
                fontSize: 9.5,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "color-mix(in srgb, var(--color-bg) 60%, transparent)",
              }}
            >
              Online
            </span>
          </div>
          <div
            style={{
              display: "grid",
              gap: 12,
              padding: "18px 14px 20px",
              height: 430,
              overflow: "hidden",
              alignContent: "end",
              background:
                "repeating-linear-gradient(45deg, color-mix(in srgb, var(--color-text) 4%, transparent) 0 3px, transparent 3px 16px), repeating-linear-gradient(-45deg, color-mix(in srgb, var(--color-text) 3%, transparent) 0 3px, transparent 3px 16px), var(--color-surface)",
            }}
          >
            {state.m1 && (
              <div
                style={{
                  justifySelf: "start",
                  maxWidth: "84%",
                  border: "2px solid var(--color-text)",
                  background: "var(--color-bg)",
                  padding: "12px 14px",
                  boxShadow: "var(--shadow-sm)",
                  fontSize: 15,
                  lineHeight: "24px",
                  animation: "pop 0.3s ease both",
                }}
              >
                Hi, do you have the black leather sofa in stock?
              </div>
            )}
            {state.t1 && <TypingBubble />}
            {state.m2 && (
              <div style={{ justifySelf: "end", maxWidth: "88%" }}>
                <div style={{ background: "var(--color-text)", color: "var(--color-bg)", padding: "12px 14px", fontSize: 15, lineHeight: "24px" }}>
                  {state.a1}
                  {state.c1 && <Caret />}
                </div>
                <p
                  style={{
                    margin: "7px 0 0",
                    fontFamily: "var(--font-heading)",
                    fontWeight: 800,
                    fontSize: 10,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--color-accent)",
                    textAlign: "right",
                  }}
                >
                  Replied in 1.2s
                </p>
              </div>
            )}
            {state.m3 && (
              <div
                style={{
                  justifySelf: "start",
                  maxWidth: "84%",
                  border: "2px solid var(--color-text)",
                  background: "var(--color-bg)",
                  padding: "12px 14px",
                  boxShadow: "var(--shadow-sm)",
                  fontSize: 15,
                  lineHeight: "24px",
                  animation: "pop 0.3s ease both",
                }}
              >
                Yes please. Can I see it tomorrow evening?
              </div>
            )}
            {state.t2 && <TypingBubble />}
            {state.m4 && (
              <div style={{ justifySelf: "end", maxWidth: "88%" }}>
                <div style={{ background: "var(--color-text)", color: "var(--color-bg)", padding: "12px 14px", fontSize: 15, lineHeight: "24px" }}>
                  {state.a2}
                  {state.c2 && <Caret />}
                </div>
                <p
                  style={{
                    margin: "7px 0 0",
                    fontFamily: "var(--font-heading)",
                    fontWeight: 800,
                    fontSize: 10,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--color-accent)",
                    textAlign: "right",
                  }}
                >
                  Replied in 0.9s · Booked · Reminder set
                </p>
              </div>
            )}
          </div>
          <div style={{ height: 28, display: "grid", placeItems: "center", background: "var(--color-surface)" }}>
            <span style={{ width: 118, height: 5, background: "var(--color-text)", borderRadius: 3 }} />
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 0, alignContent: "start" }}>
        {NOTES.map((note, i) => (
          <div
            key={note.label}
            style={{
              borderTop: "2px solid var(--color-divider)",
              borderBottom: i === NOTES.length - 1 ? "2px solid var(--color-divider)" : undefined,
              padding: "16px 0",
            }}
          >
            <p
              style={{
                fontFamily: "var(--font-heading)",
                fontWeight: 800,
                fontSize: 11,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "color-mix(in srgb, var(--color-text) 62%, transparent)",
                margin: "0 0 8px",
              }}
            >
              {note.label}
            </p>
            <p style={{ fontSize: 15, lineHeight: "25px", margin: 0 }}>{note.body}</p>
          </div>
        ))}
        <button
          type="button"
          onClick={() => runChat()}
          className="btn btn-secondary"
          style={{
            marginTop: 22,
            justifySelf: "start",
            minHeight: 44,
            paddingInline: 18,
            justifyContent: "flex-start",
            borderWidth: 2,
            background: "transparent",
          }}
        >
          Replay the conversation
        </button>
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div style={{ justifySelf: "end", display: "flex", gap: 5, alignItems: "center", background: "var(--color-text)", padding: "14px 14px" }}>
      <span style={{ width: 7, height: 7, background: "var(--color-bg)", animation: "blip 1.1s infinite" }} />
      <span style={{ width: 7, height: 7, background: "var(--color-bg)", animation: "blip 1.1s 0.18s infinite" }} />
      <span style={{ width: 7, height: 7, background: "var(--color-bg)", animation: "blip 1.1s 0.36s infinite" }} />
    </div>
  );
}

function Caret() {
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 15,
        background: "var(--color-accent)",
        verticalAlign: -2,
        marginLeft: 3,
        animation: "blink 0.9s steps(1) infinite",
      }}
    />
  );
}
