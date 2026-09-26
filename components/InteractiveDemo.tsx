"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { waLink } from "@/lib/whatsapp";

/**
 * The demo the visitor drives.
 *
 * The old one played a single retail conversation on a loop, which is a thing
 * you watch. This one asks you to pick the business and then to pick what the
 * customer says next, because the question people actually have is "would it
 * handle MY case" — and three businesses answering three questions each is a
 * better answer than one scripted reel.
 *
 * Every reply below is scripted. That is stated on the page rather than
 * implied away: the live agent is the one in the corner, and the button under
 * the phone opens it. A demo that pretends to be the product is the fastest
 * way to lose the person who tries to break it.
 */

type Turn = {
  /** What the customer taps. Kept short — it is a button, not a paragraph. */
  q: string;
  a: string;
  speed: string;
  /** What the agent did, not just said. This is the part that sells. */
  actions: string[];
};

type Scenario = {
  key: string;
  label: string;
  channel: string;
  time: string;
  turns: Turn[];
};

const SCENARIOS: Scenario[] = [
  {
    key: "retail",
    label: "Furniture shop",
    channel: "WhatsApp",
    time: "21:40",
    turns: [
      {
        q: "Is the black leather sofa in stock?",
        a: "Yes — the Aurora 3-seater in black, two left in the main showroom. Shall I hold one for you?",
        speed: "Replied in 1.2s",
        actions: ["Checked live inventory", "2 in stock · main showroom"],
      },
      {
        q: "Do you deliver to my area?",
        a: "We do. Same-day if the order is in before 4pm, next morning after that. Which area are you in?",
        speed: "Replied in 0.9s",
        actions: ["Applied your delivery rules"],
      },
      {
        q: "Can I come and see it tomorrow evening?",
        a: "Booked for tomorrow at 18:30. I've held the sofa for 48 hours and you'll get a reminder an hour before.",
        speed: "Replied in 1.1s",
        actions: ["Visit booked · tomorrow 18:30", "Item held 48 hours", "Reminder scheduled"],
      },
    ],
  },
  {
    key: "clinic",
    label: "Dental clinic",
    channel: "Website",
    time: "19:05",
    turns: [
      {
        q: "Do you have anything on Saturday?",
        a: "Saturday has 10:30 and 11:15 free with the consultant. Which suits you better?",
        speed: "Replied in 1.0s",
        actions: ["Checked the live calendar"],
      },
      {
        q: "Do I need a referral first?",
        a: "Not for a first consultation. Bring any previous X-rays or reports if you have them to hand.",
        speed: "Replied in 0.8s",
        actions: ["Answered from clinic policy"],
      },
      {
        q: "Book me the 10:30.",
        a: "Done — Saturday 10:30. Confirmation is on its way, with the pre-visit instructions attached.",
        speed: "Replied in 1.2s",
        actions: ["Appointment created", "Confirmation sent", "Reminder scheduled"],
      },
    ],
  },
  {
    key: "property",
    label: "Estate agency",
    channel: "Instagram",
    time: "22:15",
    turns: [
      {
        q: "Do you have any 2-bed apartments?",
        a: "Several. What area are you looking at, and roughly what budget should I work to?",
        speed: "Replied in 1.1s",
        actions: ["Qualification started"],
      },
      {
        q: "Near the centre, mid budget.",
        a: "Two fit that well. Sending details now — both have parking and are free to move into this month.",
        speed: "Replied in 1.3s",
        actions: ["Matched 2 listings", "Lead scored · A-grade"],
      },
      {
        q: "Can I view one on Saturday?",
        a: "Viewing booked for Saturday at 17:00 with an agent, who has the whole thread already.",
        speed: "Replied in 1.0s",
        actions: ["Viewing booked · Sat 17:00", "Lead written to your CRM", "Transcript attached"],
      },
    ],
  },
];

const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));

const bubbleIn = { animation: "pop .3s ease both" as const };

const mono = {
  fontFamily: "var(--font-heading)",
  fontWeight: 800,
  fontSize: 10,
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
};

export default function InteractiveDemo() {
  const [scenarioIndex, setScenarioIndex] = useState(0);
  /** How many turns have completed. */
  const [played, setPlayed] = useState(0);
  const [pending, setPending] = useState<number | null>(null);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");

  const runId = useRef(0);
  const reduced = useRef(false);
  const threadRef = useRef<HTMLDivElement>(null);

  const scenario = SCENARIOS[scenarioIndex];
  const busy = pending !== null;
  const done = played >= scenario.turns.length;

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const reset = useCallback(() => {
    runId.current++;
    setPlayed(0);
    setPending(null);
    setTyping(false);
    setTyped("");
  }, []);

  const play = useCallback(
    async (index: number) => {
      const id = ++runId.current;
      const alive = () => runId.current === id;
      const turn = scenario.turns[index];

      setPending(index);
      setTyped("");

      if (reduced.current) {
        setTyped(turn.a);
        setTyping(false);
        setPending(null);
        setPlayed(index + 1);
        return;
      }

      await wait(420);
      if (!alive()) return;
      setTyping(true);
      await wait(760);
      if (!alive()) return;
      setTyping(false);

      for (let i = 1; i <= turn.a.length; i++) {
        if (!alive()) return;
        setTyped(turn.a.slice(0, i));
        await wait(13);
      }
      await wait(160);
      if (!alive()) return;
      setPending(null);
      setPlayed(index + 1);
    },
    [scenario],
  );

  // Keep the newest message in view as the thread grows.
  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: reduced.current ? "auto" : "smooth" });
  }, [played, typed, typing, pending]);

  /** Open the real assistant, or fall back to WhatsApp if it has not loaded. */
  const openLiveAgent = () => {
    const toggle = document.querySelector<HTMLElement>(".chat-window-toggle");
    if (toggle) toggle.click();
    else window.open(waLink(), "_blank", "noopener");
  };

  const next = scenario.turns[played];

  return (
    <div style={{ position: "relative", zIndex: 1, width: "100%", display: "grid", justifyItems: "center", gap: 18 }}>
      {/* Which business. Real buttons, because this is the first choice the
          visitor makes and it should survive a keyboard. */}
      <div role="tablist" aria-label="Choose a business" style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
        {SCENARIOS.map((s, i) => {
          const active = i === scenarioIndex;
          return (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setScenarioIndex(i);
                reset();
              }}
              style={{
                ...mono,
                fontSize: 11,
                letterSpacing: "0.06em",
                minHeight: 38,
                padding: "0 14px",
                borderRadius: 999,
                cursor: "pointer",
                border: `1px solid ${active ? "var(--color-accent)" : "var(--color-divider)"}`,
                background: active ? "var(--color-accent)" : "var(--color-surface)",
                color: active ? "var(--color-bg)" : "color-mix(in srgb, var(--color-text) 70%, transparent)",
                transition: "background-color .2s ease, color .2s ease, border-color .2s ease",
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <div style={{ width: "100%", maxWidth: 320, background: "var(--color-neutral-900)", border: "1px solid var(--color-neutral-800)", padding: 8, borderRadius: 46, boxShadow: "var(--shadow-lg)" }}>
        <div style={{ position: "relative", background: "var(--color-surface)", borderRadius: 38, overflow: "hidden", minHeight: 470, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--color-text)", color: "var(--color-bg)", padding: "12px 16px" }}>
            <Image src="/ventriqai-mark-reversed-cobalt.svg" alt="" width={22} height={22} style={{ width: 22, height: 22, flex: "none", display: "block" }} />
            <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 13, letterSpacing: "-0.01em", whiteSpace: "nowrap", flex: "none" }}>
              Vantriq<span style={{ color: "var(--color-accent-400)" }}>AI</span> agent
            </span>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: "var(--color-accent-300)", flex: "none", animation: "blip 1.6s ease-in-out infinite" }} />
            <span style={{ marginLeft: "auto", flex: "none", ...mono, fontSize: 9.5, whiteSpace: "nowrap", color: "color-mix(in srgb, var(--color-bg) 60%, transparent)" }}>
              {scenario.channel}
            </span>
          </div>

          <div
            ref={threadRef}
            aria-live="polite"
            style={{ flex: 1, minHeight: 0, maxHeight: 360, display: "grid", gap: 12, padding: "16px 14px", overflowY: "auto", alignContent: "start", background: "var(--color-surface)" }}
          >
            <p style={{ justifySelf: "center", ...mono, fontWeight: 700, color: "color-mix(in srgb, var(--color-text) 42%, transparent)", margin: "0 0 2px" }}>
              Today · {scenario.time}
            </p>

            {scenario.turns.slice(0, pending === null ? played : pending + 1).map((turn, i) => {
              const answered = i < played;
              const answerText = answered ? turn.a : typed;
              return (
                <div key={turn.q} style={{ display: "grid", gap: 12 }}>
                  <div style={{ justifySelf: "start", maxWidth: "84%", border: "1px solid var(--color-divider)", borderRadius: "22px 22px 22px 6px", background: "var(--color-surface)", padding: "11px 15px", boxShadow: "var(--shadow-sm)", fontSize: 14.5, lineHeight: "23px", ...bubbleIn }}>
                    {turn.q}
                  </div>

                  {!answered && typing ? (
                    <div aria-label="Agent is typing" style={{ justifySelf: "end", display: "flex", gap: 5, alignItems: "center", background: "var(--color-text)", borderRadius: 999, padding: "13px 15px" }}>
                      <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--color-bg)", animation: "blip 1.1s infinite" }} />
                      <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--color-bg)", animation: "blip 1.1s .18s infinite" }} />
                      <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--color-bg)", animation: "blip 1.1s .36s infinite" }} />
                    </div>
                  ) : null}

                  {answerText ? (
                    <div style={{ justifySelf: "end", maxWidth: "88%" }}>
                      <div style={{ background: "var(--color-text)", color: "var(--color-bg)", borderRadius: "22px 22px 6px 22px", padding: "11px 15px", fontSize: 14.5, lineHeight: "23px" }}>
                        {answerText}
                      </div>
                      {answered ? (
                        <>
                          <p style={{ margin: "7px 0 0", ...mono, color: "var(--color-accent)", textAlign: "right" }}>{turn.speed}</p>
                          <div style={{ marginTop: 8, background: "var(--color-accent-100)", border: "1px dashed var(--color-accent-300)", borderRadius: 14, padding: "9px 12px", display: "grid", gap: 3, ...bubbleIn }}>
                            {turn.actions.map((a, j) => (
                              <p key={a} style={{ margin: 0, fontSize: 12, lineHeight: "18px", color: "var(--color-accent-800)" }}>
                                {j === 0 ? <span aria-hidden="true" style={{ marginRight: 6 }}>✓</span> : null}
                                {a}
                              </p>
                            ))}
                          </div>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* The quick-reply rail, which is what makes this a demo you drive. */}
          <div style={{ flex: "none", borderTop: "1px solid var(--color-divider)", background: "var(--color-bg)", padding: "12px 14px", display: "grid", gap: 8 }}>
            {next ? (
              <button
                type="button"
                onClick={() => play(played)}
                disabled={busy}
                style={{
                  textAlign: "left",
                  border: "1px solid var(--color-accent-300)",
                  background: busy ? "var(--color-neutral-100)" : "var(--color-accent-100)",
                  color: "var(--color-accent-800)",
                  borderRadius: 14,
                  padding: "11px 14px",
                  minHeight: 44,
                  fontSize: 14,
                  lineHeight: "20px",
                  cursor: busy ? "default" : "pointer",
                  opacity: busy ? 0.55 : 1,
                  transition: "opacity .2s ease, background-color .2s ease",
                }}
              >
                <span style={{ ...mono, fontSize: 9, display: "block", marginBottom: 4, color: "var(--color-accent)" }}>
                  Tap to send
                </span>
                {next.q}
              </button>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                <p style={{ margin: 0, fontSize: 13, lineHeight: "20px", color: "color-mix(in srgb, var(--color-text) 66%, transparent)" }}>
                  That is the whole thread — answered, booked and logged, with nobody watching the inbox.
                </p>
                <button
                  type="button"
                  onClick={reset}
                  style={{ ...mono, fontSize: 10.5, border: "1px solid var(--color-divider)", background: "var(--color-surface)", borderRadius: 999, minHeight: 40, cursor: "pointer", color: "var(--color-text)" }}
                >
                  Start over
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Said out loud, because someone will try to break it. */}
      <p style={{ margin: 0, maxWidth: "46ch", textAlign: "center", fontSize: 13, lineHeight: "21px", color: "color-mix(in srgb, var(--color-text) 58%, transparent)" }}>
        A scripted walkthrough of a real deployment.{" "}
        <button
          type="button"
          onClick={openLiveAgent}
          style={{ border: "none", background: "none", padding: 0, font: "inherit", color: "var(--color-accent-700)", textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer" }}
        >
          Talk to the live agent
        </button>{" "}
        to ask it anything.
      </p>
    </div>
  );
}
