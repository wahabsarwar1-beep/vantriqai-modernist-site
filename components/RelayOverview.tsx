import Link from "next/link";
import "./relay.css";

export default function RelayOverview() {
  return <section id="relay" className="relay-pricing anchor-target" aria-labelledby="relay-overview-title">
    <div className="relay-heading">
      <div>
        <p className="relay-eyebrow"><span /> Your AI incoming call agent</p>
        <h2 id="relay-overview-title" className="sr-only">Vantriq Relay</h2>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/vantriq-relay-logo.svg?v=headset-20261010" alt="Vantriq Relay" width="720" height="148" className="relay-lockup" />
      </div>
      <span className="relay-scope">Call Center-Voice Agents</span>
    </div>
    <p className="relay-lede">An AI call-centre agent for your Pakistani business number. Relay answers local incoming calls, handles enquiries, books appointments and hands over to your team where configured.</p>
    <div className="relay-plan-grid">
      {[
        ["01", "Answer", "Give callers a helpful first response", "Your approved business information, tone and languages, tested before activation."],
        ["02", "Act", "Turn an enquiry into the next step", "Connect your calendar and CRM for bookings, lead capture and call notes within the agreed scope."],
        ["03", "Hand over", "Keep your team in the conversation", "Agree when a caller should reach a person, with carrier routing confirmed before enabling transfers."],
      ].map(([n, title, heading, body]) => <article key={n} className="relay-plan">
        <div className="relay-plan-top"><span>{n}</span><span>Incoming call journey</span></div>
        <h3>{title}</h3><h4 className="relay-feature-heading">{heading}</h4><p className="relay-feature-body">{body}</p>
      </article>)}
    </div>
    <div className="relay-notes"><p><strong>Built around your call flow.</strong> We agree the answering shift, simultaneous-call capacity and connected-minute allowance in your written quotation. A standard seat handles one call at a time.</p><p><strong>Local service, clear scope.</strong> Pakistani numbers and callers in Pakistan. Carrier compatibility and number routing are checked before activation. Outgoing calls and international callers are outside the current service.</p></div>
    <div className="relay-actions"><Link href="/contact" className="btn btn-primary">Request a quote <span aria-hidden="true">↗</span></Link><Link href="/products/vantriq-relay" className="btn btn-secondary">Explore Vantriq Relay <span aria-hidden="true">→</span></Link></div>
  </section>;
}
