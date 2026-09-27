/**
 * Hero pictures for the modules that are not a conversation: a Pulse
 * dashboard, an Echo survey and Human Support's handover console.
 *
 * Every figure and name in them is illustrative — the hero labels it so, like
 * the chat cards on the other module pages. Decorative: the page text says
 * everything these show, so they are hidden from assistive technology.
 */

type Kind = "pulse" | "echo" | "human";

/* This period against the last, as two lines — the like-for-like view. */
const NOW = [18, 22, 20, 27, 31, 29, 36, 34, 41, 45, 43, 52];
const PREV = [16, 19, 21, 22, 24, 26, 25, 29, 30, 33, 32, 36];
const line = (v: number[]) => v.map((y, i) => `${i === 0 ? "M" : "L"}${(i / (v.length - 1)) * 300} ${70 - y}`).join(" ");

/* A week of hours, busiest in the evening and at the weekend. */
const HEAT = Array.from({ length: 7 * 12 }, (_, i) => {
  const d = Math.floor(i / 12);
  const h = i % 12;
  const evening = h >= 8 && h <= 10 ? 0.45 : h >= 4 && h <= 6 ? 0.25 : 0.08;
  const weekend = d >= 5 ? 0.25 : 0;
  return Math.min(1, 0.1 + evening + weekend + ((i * 37) % 11) / 60);
});

function Pulse() {
  return (
    <div className="mv mv-pulse">
      <div className="mv-head">
        <span className="mv-live" />
        <strong>Pulse</strong>
        <span className="mv-muted">This month · vs last month to date</span>
      </div>
      <div className="mv-kpis">
        {[
          ["Conversations", "1,284", "+12%"],
          ["New leads", "96", "+8%"],
          ["Win rate", "31%", "+4 pts"],
          ["Time to close", "2.4 d", "−0.6 d"],
        ].map(([k, v, d], i) => (
          <div key={k} className="mv-kpi" style={{ animationDelay: `${i * 90}ms` }}>
            <span>{k}</span>
            <strong>{v}</strong>
            <em>{d}</em>
          </div>
        ))}
      </div>
      <svg className="mv-chart" viewBox="0 0 300 74" preserveAspectRatio="none">
        <defs>
          <linearGradient id="mvFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#7f9bf2" stopOpacity=".45" />
            <stop offset="1" stopColor="#7f9bf2" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${line(NOW)} L300 74 L0 74Z`} fill="url(#mvFill)" />
        <path d={line(PREV)} fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        <path className="mv-line" d={line(NOW)} fill="none" stroke="#a9bbf7" strokeWidth="2.2" vectorEffect="non-scaling-stroke" pathLength={1} />
      </svg>
      <div className="mv-heat">
        {HEAT.map((o, i) => (
          <i key={i} style={{ opacity: o }} />
        ))}
      </div>
      <p className="mv-finding">
        <span>✦</span> Busiest slot: Saturday, 8–10 pm
      </p>
    </div>
  );
}

const FACES = ["😞", "🙁", "😐", "🙂", "😍"];

function Echo() {
  return (
    <div className="mv mv-echo">
      <div className="mv-head">
        <strong>Noor Clinic</strong>
        <span className="mv-lang">
          <b>EN</b>
          <span>اردو</span>
        </span>
      </div>
      <p className="mv-step">Question 1 of 3</p>
      <p className="mv-q">How satisfied were you with your visit today?</p>
      <div className="mv-faces">
        {FACES.map((f, i) => (
          <span key={f} data-on={i === 4 ? "" : undefined}>
            {f}
          </span>
        ))}
      </div>
      <p className="mv-q">How likely are you to recommend us to a friend?</p>
      <div className="mv-nps">
        {Array.from({ length: 11 }, (_, i) => (
          <span key={i} data-on={i === 9 ? "" : undefined}>
            {i}
          </span>
        ))}
      </div>
      <div className="mv-bar">
        <i />
      </div>
      <div className="mv-float mv-score">
        <span>CSAT</span>
        <strong>92%</strong>
        <span>NPS</span>
        <strong>+48</strong>
      </div>
    </div>
  );
}

function Human() {
  return (
    <div className="mv mv-human">
      <div className="mv-head">
        <span className="mv-avatar">S</span>
        <strong>Sara took over</strong>
        <span className="mv-muted">WhatsApp · 15:47</span>
      </div>
      <p className="mv-msg">I was charged twice for order #4471. Please sort this out.</p>
      <div className="mv-assist">
        <p className="mv-assist-k">
          <span className="mv-spark">✦</span> AI agent assist
        </p>
        <ul>
          <li>Paid twice on the 12th — same amount, 2 minutes apart</li>
          <li>Loyal customer · 6 previous orders</li>
          <li>Wants a refund, not store credit</li>
        </ul>
        <p className="mv-assist-k">Suggested reply</p>
        <p className="mv-draft">
          So sorry about that — I can see the duplicate payment. I have started the refund for the second charge; you will have it within 3 working days.
          <span className="mv-caret" />
        </p>
        <div className="mv-actions">
          <span className="mv-send">Send</span>
          <span>Edit</span>
          <span>Start refund</span>
        </div>
      </div>
    </div>
  );
}

export default function ModuleVisual({ kind }: { kind: Kind }) {
  return <div aria-hidden="true">{kind === "pulse" ? <Pulse /> : kind === "echo" ? <Echo /> : <Human />}</div>;
}
