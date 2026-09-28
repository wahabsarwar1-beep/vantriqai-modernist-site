import type { Region } from "@/lib/region";

/**
 * A small picture of each agent's job, for the home page cards. Reception
 * has its own chat; every other card gets one of these, so no card is text
 * above an empty space. All illustrative, like every product screen on the
 * page. Decorative: the card text says the same thing.
 */
export default function AgentViz({ name, region }: { name: string; region: Region }) {
  const pk = region.key === "pk";
  switch (name) {
    case "Booking":
      return (
        <div className="av av-cal">
          <div className="av-cal-head">
            {["Thu", "Fri", "Sat", "Sun"].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="av-cal-grid">
            {["11:00", "—", "11:00", "12:00", "14:30", "15:00", "18:30", "—", "—", "17:00", "", "16:00"].map((t, i) => (
              <span key={i} data-on={i === 6 ? "" : undefined} data-off={t === "—" ? "" : undefined}>
                {t === "—" ? "" : t}
              </span>
            ))}
          </div>
          <p className="av-toast">✓ Sat 18:30 booked · reminder set</p>
        </div>
      );
    case "Catalogue":
      return (
        <div className="av av-prod">
          <span className="av-prod-img" />
          <div className="av-prod-info">
            <strong>Aurora 3-seater</strong>
            <span>Black leather</span>
            <span className="av-chips">
              <i>2-seat</i>
              <i data-on="">3-seat</i>
              <i>Corner</i>
            </span>
          </div>
          <div className="av-prod-side">
            <span className="av-ok">● 2 in stock</span>
            <span className="av-tag">Held 24 h</span>
          </div>
        </div>
      );
    case "Qualifier":
      return (
        <div className="av av-lead">
          <span className="av-ring" style={{ ["--v" as string]: 86 }}>
            <b>A</b>
          </span>
          <ul>
            <li>✓ Budget confirmed</li>
            <li>✓ Moving this month</li>
            <li>✓ Wants a viewing</li>
          </ul>
          <span className="av-tag av-tag-dark">→ CRM</span>
        </div>
      );
    case "Follow-up":
      return (
        <div className="av av-follow">
          <p className="av-sys">Cart left · 2 days ago</p>
          <p className="av-bub av-bub-us">Still thinking about the sofa? It&rsquo;s held for you until Friday.</p>
          <p className="av-bub av-bub-them">Yes! Can I pay today?</p>
        </div>
      );
    case "Escalation":
      return (
        <div className="av av-hand">
          <p className="av-bub av-bub-them">I was charged twice for my order.</p>
          <div className="av-hand-card">
            <span className="av-avatar">S</span>
            <span>
              <strong>Handed to Sara · Support</strong>
              <span>Full thread and order attached</span>
            </span>
          </div>
        </div>
      );
    case "Outreach":
      return (
        <div className="av av-out">
          <div className="av-out-top">
            <strong>{pk ? "Eid offer" : "Spring offer"}</strong>
            <span>312 past customers</span>
          </div>
          <p className="av-out-msg">&ldquo;Your favourite range is back — 15% off for returning customers this week.&rdquo;</p>
          <div className="av-out-actions">
            <span className="av-btn">Approve &amp; send</span>
            <span className="av-muted">Waiting for you</span>
          </div>
        </div>
      );
    case "Payments":
      return (
        <div className="av av-pay">
          <div>
            <span className="av-muted">Invoice #1042</span>
            <strong>{pk ? "Rs 18,500" : "$240.00"}</strong>
          </div>
          <span className="av-paid">✓ Paid</span>
          <p className="av-sys av-sys-left">Link sent in chat · paid 4 min later</p>
        </div>
      );
    case "Insights":
      return (
        <div className="av av-ins">
          <div className="av-bars">
            {[22, 30, 26, 38, 44, 40, 58, 72, 96, 84, 50, 34].map((h, i) => (
              <i key={i} style={{ height: `${h}%` }} data-peak={i === 8 ? "" : undefined} />
            ))}
          </div>
          <p className="av-find">
            <span>✦</span> Busiest: Saturday 8–10 pm · 31% of leads after hours
          </p>
        </div>
      );
    case "Yours":
      return (
        <div className="av av-flow">
          {["Warranty check", "Your system", "Your rules", "Your approval"].map((s, i, all) => (
            <span key={s} className="av-step" data-last={i === all.length - 1 ? "" : undefined}>
              {i === all.length - 1 ? "✓ " : ""}
              {s}
            </span>
          ))}
        </div>
      );
    default:
      return null;
  }
}
