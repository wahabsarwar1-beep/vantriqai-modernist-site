"use client";

import { useState } from "react";

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
  gap: 7,
  fontFamily: "var(--font-heading)",
  fontWeight: 800,
  fontSize: 11,
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
  color: "color-mix(in srgb, var(--color-text) 62%, transparent)",
};

const inputStyle = {
  textTransform: "none" as const,
  letterSpacing: "normal",
  fontFamily: "var(--font-body)",
  fontWeight: 400,
  minHeight: 44,
  borderWidth: 2,
  background: "var(--color-bg)",
};

export default function ContactForm() {
  const [sent, setSent] = useState(false);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSent(true);
      }}
      style={{
        background: "var(--color-surface)",
        border: "2px solid var(--color-divider)",
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
      <button
        className="btn btn-primary"
        type="submit"
        style={{ minHeight: 52, justifySelf: "start", paddingInline: 22, fontSize: 15, justifyContent: "flex-start" }}
      >
        Send brief
      </button>
      {sent && (
        <p style={{ fontSize: 14.5, lineHeight: "25px", color: "var(--color-accent-700)", margin: 0 }}>
          Thanks — we&rsquo;ll reply within one business day.
        </p>
      )}
    </form>
  );
}
