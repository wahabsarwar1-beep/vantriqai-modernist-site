"use client";

import { useState } from "react";
import Magnetic from "@/components/Magnetic";
import { waLink } from "@/lib/whatsapp";
import type { Region } from "@/lib/region";

type Status = "idle" | "sending" | "sent" | "error";

export default function ContactForm({ region }: { region: Region }) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "sending") return;

    // Held onto before the await: currentTarget is only valid while the
    // event is being dispatched, and it is null by the time fetch resolves.
    const form = e.currentTarget;
    const data = new FormData(form);
    setStatus("sending");
    setError("");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          business: data.get("business"),
          whatsapp: data.get("whatsapp"),
          notes: data.get("notes"),
          company_website: data.get("company_website"),
          region: region.key,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        // Say what actually went wrong. Telling someone their brief arrived
        // when it didn't is the one outcome worse than an error message.
        setError(body?.error || "Something went wrong at our end.");
        setStatus("error");
        return;
      }

      form.reset();
      setStatus("sent");
    } catch {
      setError("We couldn't reach our server.");
      setStatus("error");
    }
  }

  return (
    <form
      onSubmit={onSubmit}
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
        <input className="input" name="whatsapp" required placeholder={region.phonePlaceholder} style={{ minHeight: 44 }} />
      </div>
      <div className="field">
        <label>What should the agent handle?</label>
        <textarea className="input" name="notes" placeholder="Bookings, catalogue questions, lead qualification…" style={{ minHeight: 110 }} />
      </div>

      {/* Honeypot: hidden from people, irresistible to bots. Anything typed
          here marks the submission as automated. Not display:none, which
          some bots skip — off-screen, unfocusable, hidden from screen
          readers. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}>
        <label>
          Company website
          <input name="company_website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <Magnetic>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={status === "sending"}
          style={{ minHeight: 48, paddingInline: 20, justifyContent: "center" }}
        >
          {status === "sending" ? "Sending…" : "Send the brief"}
        </button>
      </Magnetic>

      <p aria-live="polite" style={{ fontSize: 14.5, lineHeight: "24px", margin: 0, minHeight: status === "idle" ? 0 : 24, color: status === "error" ? "var(--color-text)" : "var(--color-accent-700)" }}>
        {status === "sent" && "Thanks — your brief is with the team. We'll reply within one business day."}
        {status === "error" && (
          <>
            {error} Please message us on{" "}
            <a href={waLink()} target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-accent)", textDecoration: "underline" }}>
              WhatsApp
            </a>{" "}
            so your brief isn&rsquo;t lost.
          </>
        )}
      </p>
    </form>
  );
}
