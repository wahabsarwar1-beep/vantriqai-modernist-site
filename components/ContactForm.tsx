"use client";

import { useState } from "react";

import { waLink } from "@/lib/whatsapp";

const INDUSTRIES = [
  "E-commerce & Retail",
  "Real Estate",
  "Healthcare",
  "Education",
  "Hospitality",
  "Legal & Consulting",
  "Travel & Tourism",
  "HR & Operations",
  "Marketing Agencies",
  "Logistics",
  "Something else",
];

const labelStyle = {
  display: "grid",
  gap: 8,
  fontFamily: "var(--font-heading)",
  fontWeight: 600,
  fontSize: 13,
  letterSpacing: "normal",
  color: "color-mix(in srgb, var(--color-text) 62%, transparent)",
};

// Geometry and colour come from .input in globals.css; this only resets the
// label's own type so it isn't inherited by the control inside it.
const inputStyle = {
  textTransform: "none" as const,
  letterSpacing: "normal",
  fontFamily: "var(--font-body)",
  fontWeight: 400,
};

export default function ContactForm() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "sending") return;

    const form = e.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    setStatus("sending");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(String(res.status));
      form.reset();
      setStatus("sent");
    } catch {
      // Never claim success we didn't get — the brief is the only thing this
      // page exists to capture, so a failed send has to offer the fallback.
      setStatus("error");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-divider)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-sm)",
        padding: "clamp(26px,3vw,40px) clamp(22px,2.6vw,36px) clamp(30px,3vw,40px)",
        display: "grid",
        gap: 18,
      }}
    >
      <h2 style={{ fontSize: 26, lineHeight: 1.08, letterSpacing: "-0.025em", margin: 0 }}>Send a brief</h2>
      <p style={{ fontSize: 14.5, lineHeight: "25px", color: "color-mix(in srgb, var(--color-text) 78%, transparent)", margin: 0 }}>
        Tell us how customers message you today and we&rsquo;ll come back with a scope.
      </p>
      <label className="field" style={labelStyle}>
        Name
        <input className="input" name="name" required placeholder="Your name" style={inputStyle} />
      </label>
      <label className="field" style={labelStyle}>
        Business
        <input className="input" name="business" placeholder="Company name" style={inputStyle} />
      </label>
      <label className="field" style={labelStyle}>
        WhatsApp or email
        <input className="input" name="contact" required placeholder="03XX XXXXXXX or you@company.com" style={inputStyle} />
      </label>
      <label className="field" style={labelStyle}>
        Industry
        <select className="input" name="industry" style={{ ...inputStyle, appearance: "none" }}>
          {INDUSTRIES.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </label>
      <label className="field" style={labelStyle}>
        What should the agent handle?
        <textarea
          className="input"
          name="notes"
          rows={4}
          placeholder="Booking, catalogue questions, order tracking…"
          style={{ ...inputStyle, resize: "vertical", lineHeight: "24px", paddingTop: 12 }}
        />
      </label>
      {/* Spam trap: off-screen rather than display:none, which bots skip.
          Hidden from assistive tech and the tab order, so only a script fills it. */}
      <input
        type="text"
        name="company_website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }}
      />
      <button
        className="btn btn-primary"
        type="submit"
        disabled={status === "sending"}
        style={{
          minHeight: 52,
          justifySelf: "start",
          paddingInline: 24,
          fontSize: 15,
          opacity: status === "sending" ? 0.6 : 1,
          cursor: status === "sending" ? "wait" : undefined,
        }}
      >
        {status === "sending" ? "Sending…" : "Send brief"}
      </button>
      <p aria-live="polite" style={{ fontSize: 14.5, lineHeight: "25px", margin: 0, minHeight: status === "idle" ? 0 : undefined }}>
        {status === "sent" && (
          <span style={{ color: "var(--color-accent-700)" }}>Thanks — we&rsquo;ll reply within one business day.</span>
        )}
        {status === "error" && (
          <span style={{ color: "var(--color-accent-700)" }}>
            That didn&rsquo;t send.{" "}
            <a href={waLink()} target="_blank" rel="noopener" style={{ color: "inherit" }}>
              Message us on WhatsApp
            </a>{" "}
            instead and we&rsquo;ll pick it up from there.
          </span>
        )}
      </p>
    </form>
  );
}
