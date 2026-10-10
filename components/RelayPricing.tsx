import { RELAY_PLANS } from "@/lib/relay";
import Link from "next/link";
import "./relay.css";

export default function RelayPricing() {
  return <section id="relay" className="relay-pricing anchor-target">
    <div className="relay-heading">
      <div>
        <p className="relay-eyebrow"><span /> Incoming call-center seat</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/vantriq-relay-logo.svg" alt="Vantriq Relay — AI inbound call-center agent" width="720" height="148" className="relay-lockup" />
      </div>
      <span className="relay-scope">Pakistan only · incoming calls</span>
    </div>
    <p className="relay-lede">Your incoming business calls, answered by an AI call-center agent. One seat handles one call at a time during your agreed 8-hour shift, on 22 days each month in Pakistan time.</p>
    <div className="relay-plan-grid">
      {RELAY_PLANS.map((p,i)=><article key={p.name} className={`relay-plan${i===1?" relay-plan-highlight":""}`}>
        <div className="relay-plan-top"><span>0{i+1}</span><span>{i===1?"More call time":"AI seat plan"}</span></div>
        <h3>{p.name}</h3>
        <p className="relay-amount"><small>PKR</small> {p.monthly.toLocaleString("en-US")}</p>
        <p className="relay-month">per month, excluding applicable taxes</p>
        <div className="relay-minutes"><strong>{p.minutes.toLocaleString("en-US")}</strong><span>connected minutes included</span></div>
        <ul><li>One AI seat · one simultaneous call</li><li>8-hour shift · 22 agreed days/month</li><li>Incoming calls from Pakistan</li></ul>
      </article>)}
    </div>
    <div className="relay-fees"><p><span>One-time setup</span><strong>PKR 60,000</strong></p><p><span>Extra connected minutes</span><strong>PKR 40 / minute</strong></p><p><span>Availability each month</span><strong>176 scheduled hours</strong></p></div>
    <div className="relay-notes"><p><strong>Shift hours cover availability.</strong> Time connected on calls uses the minute allowance. Unused minutes expire each month. WhatsApp conversations and voice-note allowances are separate.</p><p>Additional seats, shift hours and billable transfers require a separate quote. Carrier routing and number availability are confirmed before activation. Your accepted quotation governs your schedule and fees. The minute rate may change on 30 days’ written notice if exchange rates or provider prices move more than 5%.</p></div>
    <p><a href="/pricing/VantriqAI-Pricing-2026-Pakistan.pdf" download>Download Pakistan pricing brochure ↓</a></p>
    <Link href="/products/vantriq-relay" className="btn btn-secondary">Explore Vantriq Relay <span aria-hidden="true">↗</span></Link>
  </section>;
}
