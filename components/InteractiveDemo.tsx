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
  /** A made-up business, so the screen reads like a real chat. */
  business: string;
  label: string;
  channel: string;
  time: string;
  turns: Turn[];
};

const SCENARIOS: Scenario[] = [
  {
    key: "retail",
    business: "Aurora Furniture",
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
    business: "Smile Dental Clinic",
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
    business: "Keystone Estates",
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
    const toggle = document.querySelector<HTMLElement>("[data-chat-launcher]");
    if (toggle) toggle.click();
    else window.open(waLink(), "_blank", "noopener");
  };

  const next = scenario.turns[played];

  return (
    <div style={{ position: "relative", zIndex: 1, width: "100%", display: "grid", justifyItems: "center", gap: 18 }}>
      {/* Which business. Real buttons, because this is the first choice the
          visitor makes and it should survive a keyboard. */}
      <div role="tablist" aria-label="Choose a business" className="demo-tabs" style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
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

      {/* A realistic handset: metal edge, bezel, Dynamic Island, status bar,
          and the chat styled like the real app for the scenario's channel. */}
      <div className="phone" data-channel={scenario.channel.toLowerCase()}>
        <span aria-hidden="true" className="phone-btn phone-btn-action" />
        <span aria-hidden="true" className="phone-btn phone-btn-vol" />
        <span aria-hidden="true" className="phone-btn phone-btn-power" />
        <div className="phone-screen">
          <div aria-hidden="true" className="phone-status">
            <span className="phone-time">{scenario.time}</span>
            <span className="phone-island" />
            <span className="phone-icons">
              <svg width="17" height="11" viewBox="0 0 17 11"><rect x="0" y="7" width="3" height="4" rx="1" /><rect x="4.5" y="5" width="3" height="6" rx="1" /><rect x="9" y="2.5" width="3" height="8.5" rx="1" /><rect x="13.5" y="0" width="3" height="11" rx="1" /></svg>
              <svg width="15" height="11" viewBox="0 0 15 11"><path d="M7.5 2.2c2.2 0 4.2.8 5.7 2.2l1.1-1.2A9.6 9.6 0 0 0 7.5.5 9.6 9.6 0 0 0 .7 3.2l1.1 1.2a8 8 0 0 1 5.7-2.2Zm0 3.3c1.3 0 2.5.5 3.4 1.3l1.1-1.2a6.6 6.6 0 0 0-9 0l1.1 1.2c.9-.8 2.1-1.3 3.4-1.3Zm0 3.2c.5 0 .9.2 1.2.5L7.5 10.5 6.3 9.2c.3-.3.7-.5 1.2-.5Z" /></svg>
              <span className="phone-battery"><i /></span>
            </span>
          </div>

          <div className="chat-head">
            <span aria-hidden="true" className="chat-back">‹</span>
            <span aria-hidden="true" className="chat-avatar">
              <Image src="/ventriqai-mark-reversed-cobalt.svg" alt="" width={18} height={18} />
            </span>
            <span className="chat-who">
              <strong>{scenario.business}</strong>
              <span>{typing ? "typing…" : scenario.channel === "Website" ? "AI assistant · online" : "online"}</span>
            </span>
            <span aria-hidden="true" className="chat-tools">
              {scenario.channel === "Website" ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              ) : (
                <>
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><rect x="2.5" y="6" width="13" height="12" rx="3" /><path d="M15.5 10.5l6-3.5v10l-6-3.5z" /></svg>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M5 3h3.5l2 5-2.5 1.5a11 11 0 0 0 6.5 6.5L16 13.5l5 2V19a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z" /></svg>
                </>
              )}
            </span>
          </div>

          <div ref={threadRef} aria-live="polite" className="chat-thread">
            <p className="chat-day">Today</p>
            <div className="chat-msg chat-in">
              Hi! You&rsquo;ve reached {scenario.business}. How can I help?
              <span className="chat-meta">{scenario.time}</span>
            </div>

            {scenario.turns.slice(0, pending === null ? played : pending + 1).map((turn, i) => {
              const answered = i < played;
              const answerText = answered ? turn.a : typed;
              return (
                <div key={turn.q} className="chat-turn">
                  <div className="chat-msg chat-out">
                    {turn.q}
                    <span className="chat-meta">
                      {scenario.time}
                      {scenario.channel === "WhatsApp" ? <span className="chat-ticks">✓✓</span> : null}
                    </span>
                  </div>

                  {!answered && typing ? (
                    <div aria-label="Agent is typing" className="chat-msg chat-in chat-typing">
                      <i />
                      <i />
                      <i />
                    </div>
                  ) : null}

                  {answerText ? (
                    <div className="chat-msg chat-in">
                      {answerText}
                      {answered ? <span className="chat-meta">{turn.speed}</span> : null}
                    </div>
                  ) : null}

                  {answered ? (
                    <div className="chat-did">
                      {turn.actions.map((a) => (
                        <span key={a}>
                          <span aria-hidden="true">✓</span> {a}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* The suggested reply sits above the message bar, like a quick
              reply; tapping it is what drives the demo. */}
          <div className="chat-compose">
            {next ? (
              <button type="button" className="chat-suggest" onClick={() => play(played)} disabled={busy}>
                <span className="chat-suggest-k">Tap to send</span>
                <span className="chat-suggest-q">{next.q}</span>
                <span aria-hidden="true" className="chat-send">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 20.5V14l9-2-9-2V3.5L22 12z" /></svg>
                </span>
              </button>
            ) : (
              <button type="button" className="chat-suggest chat-restart" onClick={reset}>
                <span className="chat-suggest-q">Answered, booked and logged — start over</span>
                <span aria-hidden="true" className="chat-send">↺</span>
              </button>
            )}
            <div aria-hidden="true" className="chat-bar">
              <span className="chat-plus">+</span>
              <span className="chat-input">Message</span>
              <span className="chat-mic">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
              </span>
            </div>
            <span aria-hidden="true" className="phone-home" />
          </div>
        </div>
      </div>

      {/* Said out loud, because someone will try to break it. */}
      <p style={{ margin: 0, maxWidth: "46ch", textAlign: "center", fontSize: 13, lineHeight: "21px", color: "color-mix(in srgb, var(--color-text) 58%, transparent)" }}>
        A scripted walkthrough of how the agent works.{" "}
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
