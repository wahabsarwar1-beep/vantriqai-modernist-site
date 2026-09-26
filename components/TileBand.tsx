import type { CSSProperties, ReactNode } from "react";
import type { Region } from "@/lib/region";
import Marquee from "@/components/Marquee";

function Tile({ w, h, bg, color, border, padding = 20, children }: { w: number; h: number; bg: string; color?: string; border?: string; padding?: number; children: ReactNode }) {
  const style: CSSProperties = {
    flex: "none",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    borderRadius: h > 200 ? 34 : 26,
    boxShadow: "var(--shadow-md)",
    justifyContent: "flex-end",
    width: w,
    height: h,
    padding,
    background: bg,
    color,
    border,
  };
  return <div style={style}>{children}</div>;
}

function Stat({ value, label, badge, w, h, bg, color, border }: { value: string; label: string; badge?: string; w: number; h: number; bg: string; color?: string; border?: string }) {
  return (
    <Tile w={w} h={h} bg={bg} color={color} border={border}>
      {badge && (
        <span
          style={{
            alignSelf: "flex-start",
            marginBottom: "auto",
            fontFamily: "var(--font-heading)",
            fontWeight: 700,
            fontSize: 10.5,
            letterSpacing: "0.04em",
            padding: "6px 11px",
            borderRadius: 999,
            background: color ? "color-mix(in srgb, currentColor 14%, transparent)" : "var(--color-neutral-100)",
          }}
        >
          {badge}
        </span>
      )}
      <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 0.95, margin: 0, fontSize: h > 200 ? 58 : 38 }}>{value}</p>
      <p style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: h > 200 ? 10 : 9, letterSpacing: "0.1em", textTransform: "uppercase", margin: "7px 0 0", opacity: 0.72 }}>{label}</p>
    </Tile>
  );
}

function Message({ badge, text, w, h, bg, color, border }: { badge: string; text: string; w: number; h: number; bg: string; color?: string; border?: string }) {
  return (
    <Tile w={w} h={h} bg={bg} color={color} border={border}>
      <span style={{ alignSelf: "flex-start", marginBottom: "auto", fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 10.5, letterSpacing: "0.04em", padding: "6px 11px", borderRadius: 999, background: "var(--color-accent-100)", color: "var(--color-accent-700)" }}>
        {badge}
      </span>
      <p style={{ fontSize: h > 200 ? 16 : 14, lineHeight: h > 200 ? "25px" : "21px", margin: 0 }}>{text}</p>
    </Tile>
  );
}

function List({ title, items, w, h }: { title: string; items: string[]; w: number; h: number }) {
  return (
    <Tile w={w} h={h} bg="var(--color-surface)" border="1px solid var(--color-divider)">
      <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: h > 200 ? 10.5 : 10, letterSpacing: "0.12em", textTransform: "uppercase", margin: "0 0 auto", opacity: 0.6 }}>{title}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {items.map((item) => (
          <span key={item} style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 11.5, letterSpacing: "-0.01em", padding: "6px 10px", borderRadius: 999, background: "var(--color-neutral-100)" }}>
            {item}
          </span>
        ))}
      </div>
    </Tile>
  );
}

function FrontRow() {
  return (
    <>
      <Stat w={236} h={236} bg="var(--color-accent-100)" color="var(--color-accent-800)" badge="+391% reply rate" value="1.2s" label="average first reply" />
      <Message w={324} h={236} bg="var(--color-surface)" border="1px solid var(--color-divider)" badge="Agent · 0.9s" text="Yes — in stock. Shall I hold one for you?" />
      <Stat w={236} h={236} bg="var(--color-neutral-900)" color="var(--color-bg)" value="94%" label="handled without a human" />
      <Stat w={236} h={236} bg="var(--color-surface)" border="1px solid var(--color-divider)" value="$18.2K" label="recovered this week" />
      <List w={324} h={236} title="Connected" items={["WhatsApp", "Instagram", "Google Calendar", "Your CRM", "Website"]} />
      <Stat w={236} h={236} bg="var(--color-accent-100)" color="var(--color-accent-800)" value="21×" label="better odds at 5 minutes" />
      <Message w={300} h={236} bg="var(--color-surface)" border="1px solid var(--color-divider)" badge="Customer · 21:40" text="Can I see it tomorrow evening?" />
      <Stat w={236} h={236} bg="var(--color-neutral-100)" value="24/7" label="always answering" />
    </>
  );
}

function BackRow({ region }: { region: Region }) {
  return (
    <>
      <Stat w={172} h={172} bg="var(--color-surface)" border="1px solid var(--color-divider)" value="3m" label="message to booked" />
      <Message w={250} h={172} bg="var(--color-neutral-100)" badge="Lead scored" text="A-grade — written to your CRM" />
      <Stat w={172} h={172} bg="var(--color-accent-100)" color="var(--color-accent-800)" value="10" label="industries live" />
      <Message w={250} h={172} bg="var(--color-surface)" border="1px solid var(--color-divider)" badge="Booking" text="Tomorrow 18:30 · reminder set" />
      <Stat w={172} h={172} bg="var(--color-neutral-900)" color="var(--color-bg)" value="0" label="missed nights" />
      <Stat w={172} h={172} bg="var(--color-neutral-100)" value="68%" label="messages after hours" />
      <Message w={250} h={172} bg="var(--color-neutral-100)" badge="Follow-up" text="Nudged 14 quiet leads this week" />
      <Stat w={172} h={172} bg="var(--color-surface)" border="1px solid var(--color-divider)" value={region.languagesFigure} label={region.languagesLabel} />
    </>
  );
}

export default function TileBand({ region }: { region: Region }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        top: "50%",
        left: "calc(50% - 50vw)",
        width: "100vw",
        transform: "translateY(-50%)",
        zIndex: 0,
        overflow: "hidden",
        padding: "clamp(20px,3vw,34px) 0",
        pointerEvents: "none",
        maskImage: "linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%)",
      }}
    >
      <div style={{ display: "grid", gap: 16, transform: "rotate(-2deg)" }}>
        <div style={{ display: "flex", gap: 16 }}>
          <Marquee duration={64}>
            <div style={{ display: "flex", gap: 16, marginRight: 16 }}>
              <FrontRow />
            </div>
          </Marquee>
        </div>
        <div style={{ opacity: 0.6, filter: "saturate(.9)" }}>
          <Marquee duration={82} reverse>
            <div style={{ display: "flex", gap: 16, marginRight: 16 }}>
              <BackRow region={region} />
            </div>
          </Marquee>
        </div>
      </div>
    </div>
  );
}
