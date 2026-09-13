import type { ReactNode } from "react";

export default function HeroOrbitCard({
  children,
  label,
  delay = 0,
  spinDuration = 11,
  orbitDuration = 6,
  reverse = false,
}: {
  children: ReactNode;
  label: string;
  delay?: number;
  spinDuration?: number;
  orbitDuration?: number;
  reverse?: boolean;
}) {
  return (
    <div
      style={{
        position: "relative",
        justifySelf: "center",
        width: "min(90%,280px)",
        aspectRatio: 1,
        borderRadius: 58,
        background: "var(--color-accent-100)",
        border: "1px solid var(--color-accent-200)",
        boxShadow: "var(--shadow-lg)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "9%",
        padding: "14% 0",
        animation: "cardpulse 4s ease-in-out infinite",
        animationDelay: `${delay}s`,
        overflow: "hidden",
      }}
    >
      <span aria-hidden="true" style={{ position: "absolute", inset: "9%", borderRadius: "50%", border: "1.5px dashed var(--color-accent-300)", animation: `spinslow ${spinDuration}s linear infinite` }} />
      <span aria-hidden="true" style={{ position: "absolute", inset: 0, animation: `${reverse ? "orbitspinrev" : "orbitspin"} ${orbitDuration}s linear infinite` }}>
        <span style={{ position: "absolute", top: "3%", left: "50%", width: 10, height: 10, marginLeft: -5, borderRadius: "50%", background: "var(--color-accent)", boxShadow: "0 0 0 5px color-mix(in srgb, var(--color-accent) 16%, transparent)" }} />
      </span>
      {children}
      <span style={{ position: "relative", fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-accent-700)" }}>{label}</span>
    </div>
  );
}
