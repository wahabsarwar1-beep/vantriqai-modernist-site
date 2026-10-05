"use client";

import { useMemo, useState } from "react";
import {
  bookingDays,
  bookingMessage,
  leadMessage,
  leadProblem,
  type ActionsBlock,
  type BookingBlock,
  type CardsBlock,
  type ChatBlock,
  type CompareBlock,
  type LeadDetails,
  type LeadFormBlock,
} from "@/lib/chat-blocks";
import { linkForName, namedLink } from "@/lib/chat-links";
import { packageCompare } from "@/lib/chat-package-compare";
import type { Region } from "@/lib/region";

type Send = (text: string) => void;

function Compare({ block }: { block: CompareBlock }) {
  return (
    <figure className="vq-compare">
      {block.title && <figcaption className="vq-block-title">{block.title}</figcaption>}
      <div className="vq-compare-scroll" tabIndex={0} role="region" aria-label={block.title ?? "Comparison"}>
        <table>
          <thead>
            <tr>
              <th scope="col"><span className="vq-sr">Feature</span></th>
              {block.columns.map((c, i) => (
                <th key={i} scope="col" data-highlight={block.highlight === i || undefined}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r}>
                <th scope="row">{row.label}</th>
                {row.values.map((v, i) => (
                  <td key={i} data-highlight={block.highlight === i || undefined}>
                    {v === true ? (
                      <span className="vq-yes" aria-label="Yes">✓</span>
                    ) : v === false ? (
                      <span className="vq-no" aria-label="No">—</span>
                    ) : (
                      v
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {block.note && <p className="vq-compare-note">{block.note}</p>}
    </figure>
  );
}

function Cards({ block, region }: { block: CardsBlock; region: Region }) {
  return (
    <div className="vq-cards-wrap">
      {block.title && <p className="vq-block-title">{block.title}</p>}
      <ul className="vq-cards">
        {block.items.map((item, i) => {
          const link = linkForName(region, item.name);
          const body = (
            <>
              <span className="vq-card-top">
                <span className="vq-card-name">{item.name}</span>
                {(item.tag || link) && <span className="vq-card-tag">{item.tag ?? link?.kind}</span>}
              </span>
              <span className="vq-card-text">{item.text}</span>
              {link && <span className="vq-card-more" aria-hidden="true">Learn more →</span>}
            </>
          );
          return (
            <li key={i}>
              {link ? (
                <a className="vq-card" href={link.href}>
                  {body}
                </a>
              ) : (
                <div className="vq-card">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Actions({ block, region, send, disabled }: { block: ActionsBlock; region: Region; send: Send; disabled: boolean }) {
  return (
    <div className="vq-actions">
      {block.items.map((item, i) => {
        if ("link" in item) {
          const { href, external } = namedLink(region, item.link);
          return (
            <a key={i} className="vq-action" href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
              {item.label}
            </a>
          );
        }
        return (
          <button key={i} type="button" className="vq-action" disabled={disabled} onClick={() => send(item.message)}>
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function LeadForm({ block, send, disabled }: { block: LeadFormBlock; send: Send; disabled: boolean }) {
  const [d, setD] = useState<LeadDetails>({ name: "", business: "", whatsapp: "", email: "" });
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const set = (k: keyof LeadDetails) => (e: React.ChangeEvent<HTMLInputElement>) => setD((p) => ({ ...p, [k]: e.target.value }));

  if (sent) return <p className="vq-form-done">Details sent ✓</p>;

  return (
    <form
      className="vq-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const p = leadProblem(d);
        setProblem(p);
        if (p) return;
        setSent(true);
        send(leadMessage(d));
      }}
    >
      <p className="vq-block-title">{block.title ?? "Where should the team reach you?"}</p>
      <label>
        <span>Your name</span>
        <input value={d.name} onChange={set("name")} autoComplete="name" required />
      </label>
      <label>
        <span>Business</span>
        <input value={d.business} onChange={set("business")} autoComplete="organization" />
      </label>
      <label>
        <span>WhatsApp number</span>
        <input value={d.whatsapp} onChange={set("whatsapp")} autoComplete="tel" inputMode="tel" placeholder="+92 3xx xxxxxxx" />
      </label>
      <label>
        <span>Email <em>(optional if WhatsApp given)</em></span>
        <input value={d.email} onChange={set("email")} autoComplete="email" inputMode="email" type="email" />
      </label>
      {problem && (
        <p className="vq-form-error" role="alert">
          {problem}
        </p>
      )}
      <button type="submit" className="vq-primary" disabled={disabled}>
        Send my details
      </button>
    </form>
  );
}

function Booking({ block, send, disabled }: { block: BookingBlock; send: Send; disabled: boolean }) {
  const days = useMemo(() => bookingDays(), []);
  const [dayKey, setDayKey] = useState(days[0]?.key);
  const [picked, setPicked] = useState<string | null>(null);
  const day = days.find((d) => d.key === dayKey);
  if (!days.length) return null;

  return (
    <div className="vq-booking">
      <p className="vq-block-title">{block.title ?? "Pick a time for your 15-minute call"}</p>
      <div className="vq-days" role="tablist" aria-label="Day">
        {days.map((d) => (
          <button
            key={d.key}
            type="button"
            role="tab"
            aria-selected={d.key === dayKey}
            className="vq-day"
            onClick={() => setDayKey(d.key)}
            disabled={!!picked}
          >
            {d.label}
          </button>
        ))}
      </div>
      <div className="vq-slots" role="tabpanel">
        {day?.slots.map((s) => (
          <button
            key={s.startIso}
            type="button"
            className="vq-slot"
            aria-pressed={picked === s.startIso}
            disabled={disabled || !!picked}
            onClick={() => {
              setPicked(s.startIso);
              send(bookingMessage(day, s));
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
      <p className="vq-compare-note">Pakistan time (UTC+05:00). The assistant confirms once it&apos;s in the calendar.</p>
    </div>
  );
}

/** Every block in a reply except suggestions, which the widget shows by the input. */
export default function ChatBlocks({
  blocks,
  region,
  send,
  busy,
}: {
  blocks: ChatBlock[];
  region: Region;
  send: Send;
  busy: boolean;
}) {
  return (
    <>
      {blocks.map((block, i) => {
        switch (block.type) {
          case "compare":
            return <Compare key={i} block={block} />;
          case "package_compare":
            return <Compare key={i} block={packageCompare(region, block.packages, block.title)} />;
          case "cards":
            return <Cards key={i} block={block} region={region} />;
          case "actions":
            return <Actions key={i} block={block} region={region} send={send} disabled={busy} />;
          case "lead_form":
            return <LeadForm key={i} block={block} send={send} disabled={busy} />;
          case "booking":
            return <Booking key={i} block={block} send={send} disabled={busy} />;
          default:
            return null;
        }
      })}
    </>
  );
}
