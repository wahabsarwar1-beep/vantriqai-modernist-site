"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import type { Region } from "@/lib/region";

/**
 * The agent's reasoning, one step at a time.
 *
 * A chatbot matches a keyword to a script; this shows what the agent does
 * between the message arriving and the reply leaving — what it understood,
 * which of your systems it asked, which rule it checked, and what it did.
 * Three cases: a sale, a booking in a second language, and a dispute it
 * correctly hands to a person. The traces are illustrative and say so.
 *
 * Steps stream in once the console is on screen and the cases advance on
 * their own until the visitor picks one. With reduced motion, every step is
 * simply there.
 */

type Kind = "understand" | "extract" | "tool" | "guard" | "decide";
type Step = { kind: Kind; text: string; result?: string };
type Case = {
  key: string;
  label: string;
  channel: string;
  message: string;
  steps: Step[];
  reply: string;
  actions: string[];
  handover?: boolean;
};

const KIND_LABEL: Record<Kind, string> = {
  understand: "Understand",
  extract: "Extract",
  tool: "Tool call",
  guard: "Guardrail",
  decide: "Decide",
};

const cases = (region: Region): Case[] => {
  const pk = region.key === "pk";
  return [
    {
      key: "retail",
      label: "Retail · a sale",
      channel: "WhatsApp",
      message: "Is the black leather sofa in stock? Could I see it on Saturday?",
      steps: [
        { kind: "understand", text: "Two requests: stock check, then a showroom visit · English" },
        { kind: "extract", text: "product = black leather sofa · day = Saturday" },
        { kind: "tool", text: 'inventory.lookup("black leather sofa")', result: "2 in stock · Showroom A" },
        { kind: "tool", text: "calendar.free_slots(Saturday)", result: "11:00 · 14:30 · 18:30" },
        { kind: "guard", text: "Price and stock only from the live catalogue", result: "passed" },
      ],
      reply: "Yes — two in stock at our showroom. On Saturday I have 11:00, 14:30 or 18:30. Which suits you?",
      actions: ["Item held 24 h", "Lead written to CRM", "Visit slots offered"],
    },
    pk
      ? {
          key: "clinic",
          label: "Clinic · Roman Urdu",
          channel: "WhatsApp",
          message: "Kal shaam 6 baje Dr. Sana ke saath appointment mil sakti hai?",
          steps: [
            { kind: "understand", text: "Booking request · language: Roman Urdu" },
            { kind: "extract", text: "doctor = Dr. Sana · when = tomorrow, 18:00" },
            { kind: "tool", text: 'clinic.availability("Dr. Sana", tomorrow 18:00)', result: "taken · nearest free 18:30" },
            { kind: "guard", text: "Booking only — no clinical advice", result: "passed" },
            { kind: "decide", text: "Offer the nearest slot, reply in Roman Urdu" },
          ],
          reply: "6 baje ka slot book ho chuka hai — 6:30 khali hai. Aap ke liye book kar doon?",
          actions: ["Slot held 10 min", "Reminder queued for tomorrow"],
        }
      : {
          key: "clinic",
          label: "Clinic · Spanish",
          channel: "WhatsApp",
          message: "¿Tienen cita con la Dra. Sana mañana a las 6 de la tarde?",
          steps: [
            { kind: "understand", text: "Booking request · language: Spanish" },
            { kind: "extract", text: "doctor = Dr. Sana · when = tomorrow, 18:00" },
            { kind: "tool", text: 'clinic.availability("Dr. Sana", tomorrow 18:00)', result: "taken · nearest free 18:30" },
            { kind: "guard", text: "Booking only — no clinical advice", result: "passed" },
            { kind: "decide", text: "Offer the nearest slot, reply in Spanish" },
          ],
          reply: "A las 6 ya está ocupada, pero tengo libre a las 6:30. ¿Se la reservo?",
          actions: ["Slot held 10 min", "Reminder queued for tomorrow"],
        },
    {
      key: "dispute",
      label: "Support · knows its limits",
      channel: "Instagram",
      message: "I was charged twice for order #4471. Really not happy about this.",
      steps: [
        { kind: "understand", text: "Billing dispute · customer is frustrated" },
        { kind: "tool", text: 'orders.get("#4471")', result: "two payments found, 3 min apart" },
        { kind: "guard", text: "Refunds need a person", result: "hand over" },
        { kind: "decide", text: "Apologise, confirm what it found, route to accounts" },
      ],
      reply: "I'm sorry about that — I can see two payments on #4471. I've passed it to our accounts team with everything attached, and they'll pick it up from here.",
      actions: ["Handed to accounts · high priority", "Full thread attached"],
      handover: true,
    },
  ];
};

const REDUCE = "(prefers-reduced-motion: reduce)";
function useReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(REDUCE);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCE).matches,
    () => false,
  );
}

const STEP_MS = 700;
const HOLD_MS = 4200;

export default function AgentTrace({ region }: { region: Region }) {
  const all = cases(region);
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(0);
  const [inView, setInView] = useState(false);
  const [auto, setAuto] = useState(true);
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const baseId = useId();

  const current = all[index];
  // message, each step, the reply, the actions
  const total = current.steps.length + 3;
  const visible = reduced ? total : shown;

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.35 });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (reduced || !inView) return;
    if (shown < total) {
      const t = setTimeout(() => setShown((s) => s + 1), shown === 0 ? 250 : STEP_MS);
      return () => clearTimeout(t);
    }
    if (!auto) return;
    const t = setTimeout(() => {
      setIndex((i) => (i + 1) % all.length);
      setShown(0);
    }, HOLD_MS);
    return () => clearTimeout(t);
  }, [shown, total, inView, auto, reduced, all.length]);

  const pick = (i: number) => {
    setAuto(false);
    setIndex(i);
    setShown(0);
  };

  const thinking = !reduced && visible > 0 && visible < current.steps.length + 1;

  return (
    <div ref={ref} className="trace">
      <div role="tablist" aria-label="Example conversations" className="trace-tabs">
        {all.map((c, i) => {
          const on = i === index;
          return (
            <button
              key={c.key}
              type="button"
              role="tab"
              id={`${baseId}-t${i}`}
              aria-selected={on}
              aria-controls={`${baseId}-p`}
              tabIndex={on ? 0 : -1}
              className="trace-tab"
              data-on={on ? "" : undefined}
              onClick={() => pick(i)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                e.preventDefault();
                const next = (i + (e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1) + all.length) % all.length;
                pick(next);
                document.getElementById(`${baseId}-t${next}`)?.focus();
              }}
            >
              <span className="trace-tab-label">{c.label}</span>
              <span className="trace-tab-msg">&ldquo;{c.message}&rdquo;</span>
              {on && auto && !reduced ? (
                <span aria-hidden="true" className="trace-tab-progress" style={{ animationDuration: `${total * STEP_MS + HOLD_MS}ms` }} key={`${index}-${auto}`} />
              ) : null}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`${baseId}-p`} aria-labelledby={`${baseId}-t${index}`} className="trace-console">
        <div className="trace-bar">
          <span aria-hidden="true" className="trace-dots">
            <i />
            <i />
            <i />
          </span>
          <span className="trace-title">agent.trace</span>
          <span className="trace-chip">{current.channel}</span>
          <span className="trace-note">Illustrative</span>
        </div>

        <ol className="trace-lines" key={current.key}>
          {visible >= 1 ? (
            <li className="trace-in">
              <span className="trace-k">Message in</span>
              <span className="trace-msg">{current.message}</span>
            </li>
          ) : null}
          {current.steps.map((s, i) =>
            visible >= i + 2 ? (
              <li key={i} data-kind={s.kind}>
                <span className="trace-k">{KIND_LABEL[s.kind]}</span>
                <span className="trace-v">
                  <code>{s.text}</code>
                  {s.result ? (
                    <span className={`trace-r${s.result === "hand over" ? " trace-r-warn" : ""}`}>
                      {s.kind === "guard" ? (s.result === "passed" ? "✓ passed" : "↗ hand over") : `→ ${s.result}`}
                    </span>
                  ) : null}
                </span>
              </li>
            ) : null,
          )}
          {thinking ? (
            <li className="trace-thinking" aria-hidden="true">
              <span className="trace-k">Thinking</span>
              <span className="trace-shimmer" />
            </li>
          ) : null}
        </ol>

        {visible >= current.steps.length + 2 ? (
          <div className="trace-reply" data-handover={current.handover ? "" : undefined}>
            <span className="trace-k">Reply</span>
            <p>{current.reply}</p>
          </div>
        ) : null}

        {visible >= current.steps.length + 3 ? (
          <div className="trace-actions">
            {current.actions.map((a) => (
              <span key={a} className="trace-action">
                <span aria-hidden="true">✓</span>
                {a}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
