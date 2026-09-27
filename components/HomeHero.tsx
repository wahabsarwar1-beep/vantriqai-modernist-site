"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Magnetic from "@/components/Magnetic";
import Marquee from "@/components/Marquee";
import VantriqMark from "@/components/VantriqMark";
import { waLink } from "@/lib/whatsapp";
import { hrefIn, type Region } from "@/lib/region";
import { products } from "@/lib/products";

/**
 * The home page's opening: the agent, visibly working.
 *
 * Messages arrive from the four channels on the left, pass through the core
 * and leave as actions on the right. The feed underneath narrates the same
 * event the diagram is lighting up, so the picture and the words say one
 * thing at a time. The events are illustrative and labelled as such.
 */

const INPUTS = [
  { id: "wa", label: "WhatsApp" },
  { id: "ig", label: "Instagram" },
  { id: "web", label: "Website" },
  { id: "voice", label: "Voice" },
];
const OUTPUTS = [
  { id: "cal", label: "Calendar" },
  { id: "crm", label: "CRM" },
  { id: "pay", label: "Payments" },
  { id: "team", label: "Your team" },
];

const EVENTS = [
  { from: 0, to: 0, channel: "WhatsApp", text: "Stock checked · viewing booked for 18:30", time: "1.2 s" },
  { from: 3, to: 0, channel: "Voice", text: "Call answered · Saturday 10:30 confirmed", time: "ring 2" },
  { from: 1, to: 1, channel: "Instagram", text: "Comment moved to DM · lead scored hot", time: "4 s" },
  { from: 0, to: 2, channel: "WhatsApp", text: "Invoice reminder sent · payment received", time: "auto" },
  { from: 2, to: 3, channel: "Website", text: "Refund request · handed to your team, thread attached", time: "3 s" },
];

const WORDS = ["message.", "call.", "lead.", "booking."];

/* Tools the agent works inside — named as text, not logos, since they are
   integrations rather than endorsements. */
const WORKS_WITH = ["WhatsApp Business Platform", "Instagram", "Messenger", "Google Calendar", "Outlook", "HubSpot", "Salesforce", "Zoho", "Shopify", "WooCommerce", "Stripe", "Google Sheets"];

/* Node rows as a share of the stage height, and the curve each one draws to
   the core. The SVG and the HTML nodes read the same numbers. */
const ROWS = [16, 38, 62, 84];
const W = 600;
const H = 440;
const CX = W / 2;
const CY = H / 2;
const inPath = (y: number) => `M 70 ${y} C 170 ${y}, 190 ${CY}, ${CX - 60} ${CY}`;
const outPath = (y: number) => `M ${CX + 60} ${CY} C ${W - 190} ${CY}, ${W - 170} ${y}, ${W - 70} ${y}`;

export default function HomeHero({ region }: { region: Region }) {
  const [tick, setTick] = useState(0);
  const [words, setWords] = useState<{ word: number; prev: number | null }>({ word: 0, prev: null });
  const { word, prev: prevWord } = words;
  const stageRef = useRef<HTMLDivElement>(null);
  const tiltFrame = useRef(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const a = setInterval(() => setTick((t) => t + 1), 2800);
    const b = setInterval(() => setWords(({ word: w }) => ({ word: (w + 1) % WORDS.length, prev: w })), 2200);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, []);

  const event = EVENTS[tick % EVENTS.length];

  return (
    <section className="hh">
      <div aria-hidden="true" className="hh-aurora" />
      <div aria-hidden="true" className="hh-grid" />

      <div className="hh-inner">
        <div className="hh-copy">
          <Link href={hrefIn(region, "/products/vantriq-pulse")} className="hh-announce">
            <span className="hh-announce-tag">New</span>
            Vantriq Pulse &amp; Echo — every conversation, measured
            <span aria-hidden="true" className="hh-announce-arrow">→</span>
          </Link>

          <h1 className="hh-title">
            <span className="sr-only">Never miss another customer message, call or lead.</span>
            <span aria-hidden="true">
              Never miss
              <br />
              another{" "}
              <span className="hh-word">
                {WORDS.map((w, i) => (
                  <span key={w} data-on={i === word ? "" : undefined} data-out={i === prevWord ? "" : undefined}>
                    {w}
                  </span>
                ))}
              </span>
            </span>
          </h1>

          <p className="hh-lede">
            VantriqAI agents reply, qualify and book on WhatsApp, Instagram, your website and the phone — then do the work: the calendar, the CRM, the payment link. In {region.languagesPhrase}, at any volume.
          </p>

          <div className="hh-actions">
            <Magnetic>
              <a className="btn hh-btn-primary" href={waLink()} target="_blank" rel="noopener">
                Talk to the agent on WhatsApp
                <span aria-hidden="true">→</span>
              </a>
            </Magnetic>
            <Magnetic>
              <Link className="btn hh-btn-ghost" href={hrefIn(region, "/how-it-works")}>
                See how it works
              </Link>
            </Magnetic>
          </div>

          <dl className="hh-facts">
            <div>
              <dt>Always on</dt>
              <dd>24/7</dd>
            </div>
            <div>
              <dt>Channels</dt>
              <dd>4 in one</dd>
            </div>
            <div>
              <dt>Modules</dt>
              <dd>{products(region).length}</dd>
            </div>
            <div>
              <dt>Live in</dt>
              <dd>2–4 wks</dd>
            </div>
          </dl>
        </div>

        {/* The stage leans a few degrees toward the pointer — depth, not a
            gimmick, and only for a mouse with motion allowed. */}
        <div
          className="hh-stage-wrap"
          ref={stageRef}
          onPointerMove={(e) => {
            if (e.pointerType !== "mouse") return;
            const el = stageRef.current;
            if (!el) return;
            const { clientX, clientY } = e;
            cancelAnimationFrame(tiltFrame.current);
            tiltFrame.current = requestAnimationFrame(() => {
              const r = el.getBoundingClientRect();
              el.style.setProperty("--tx", ((clientX - r.left) / r.width - 0.5).toFixed(3));
              el.style.setProperty("--ty", ((clientY - r.top) / r.height - 0.5).toFixed(3));
            });
          }}
          onPointerLeave={() => {
            cancelAnimationFrame(tiltFrame.current);
            stageRef.current?.style.setProperty("--tx", "0");
            stageRef.current?.style.setProperty("--ty", "0");
          }}
        >
          <div className="hh-stage" role="img" aria-label="Messages from WhatsApp, Instagram, the website and the phone pass through the VantriqAI agent and become calendar bookings, CRM records, payments and handovers to your team.">
            <svg className="hh-wires" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="hh-pulse" x1="0" x2="1">
                  <stop offset="0" stopColor="#7f9bf2" stopOpacity="0" />
                  <stop offset=".5" stopColor="#a9bbf7" />
                  <stop offset="1" stopColor="#f3a071" />
                </linearGradient>
              </defs>
              {ROWS.map((r, i) => {
                const y = (r / 100) * H;
                const onIn = event.from === i;
                const onOut = event.to === i;
                return (
                  <g key={r}>
                    <path d={inPath(y)} className="hh-wire" />
                    <path d={outPath(y)} className="hh-wire" />
                    <path d={inPath(y)} pathLength={100} className="hh-packet" data-on={onIn ? "" : undefined} style={{ animationDelay: `${i * -0.7}s` }} />
                    <path d={outPath(y)} pathLength={100} className="hh-packet hh-packet-out" data-on={onOut ? "" : undefined} style={{ animationDelay: `${i * -0.7 - 0.9}s` }} />
                  </g>
                );
              })}
            </svg>

            {INPUTS.map((n, i) => (
              <span key={n.id} className="hh-node hh-node-in" data-on={event.from === i ? "" : undefined} style={{ top: `${ROWS[i]}%` }}>
                {n.label}
              </span>
            ))}
            {OUTPUTS.map((n, i) => (
              <span key={n.id} className="hh-node hh-node-out" data-on={event.to === i ? "" : undefined} style={{ top: `${ROWS[i]}%` }}>
                {n.label}
              </span>
            ))}

            <div className="hh-core" aria-hidden="true">
              <span className="hh-core-ring" />
              <span className="hh-core-ring hh-core-ring-2" />
              <span className="hh-core-spin" />
              <span className="hh-core-orb">
                <VantriqMark size={40} frame="#ffffff" notch="#141a52" className="hh-core-mark" />
              </span>
            </div>
          </div>

          <div className="hh-feed" aria-live="off">
            <span className="hh-feed-label">Illustrative activity</span>
            <div key={tick} className="hh-feed-row">
              <span className="hh-feed-ch">{event.channel}</span>
              <span className="hh-feed-text">{event.text}</span>
              <span className="hh-feed-time">{event.time}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="hh-works">
        <span className="hh-works-label">Works inside the tools you already run</span>
        <div className="hh-works-track" aria-label={`Integrations: ${WORKS_WITH.join(", ")}`} role="img">
          <Marquee duration={46}>
            {WORKS_WITH.map((n) => (
              <span key={n} className="hh-works-item">
                {n}
              </span>
            ))}
          </Marquee>
        </div>
      </div>
    </section>
  );
}
