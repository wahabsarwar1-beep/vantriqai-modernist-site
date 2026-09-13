"use client";

import { useState } from "react";
import Magnetic from "@/components/Magnetic";

export default function ContactForm() {
  const [sent, setSent] = useState(false);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSent(true);
      }}
      data-anim=""
      style={{
        border: "1px solid var(--color-divider)",
        padding: "clamp(24px,3vw,36px)",
        display: "grid",
        gap: 18,
        background: "var(--color-bg)",
      }}
    >
      <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-accent)", margin: 0 }}>
        Send a brief
      </p>
      <div className="field">
        <label>Name</label>
        <input className="input" name="name" required placeholder="Your name" style={{ minHeight: 44 }} />
      </div>
      <div className="field">
        <label>Business</label>
        <input className="input" name="business" placeholder="Company name" style={{ minHeight: 44 }} />
      </div>
      <div className="field">
        <label>WhatsApp number</label>
        <input className="input" name="whatsapp" required placeholder="+92 341 1120049" style={{ minHeight: 44 }} />
      </div>
      <div className="field">
        <label>What should the agent handle?</label>
        <textarea className="input" name="notes" placeholder="Bookings, catalogue questions, lead qualification…" style={{ minHeight: 110 }} />
      </div>
      <Magnetic>
        <button type="submit" className="btn btn-primary" style={{ minHeight: 48, paddingInline: 20, justifyContent: "center" }}>
          Send the brief
        </button>
      </Magnetic>
      {sent && (
        <p style={{ fontSize: 14.5, lineHeight: "24px", color: "var(--color-accent-700)", margin: 0 }}>
          Thanks — we&rsquo;ll reply within one business day.
        </p>
      )}
    </form>
  );
}
