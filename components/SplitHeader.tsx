import type { ReactNode } from "react";

type SplitHeaderProps = {
  kicker: ReactNode;
  children: ReactNode;
};

/** The two-column ruled section header used throughout the Modernist pages:
 *  a kicker in the narrow left column, content in the wide right column. */
export default function SplitHeader({ kicker, children }: SplitHeaderProps) {
  return (
    <div className="split-header">
      <p
        style={{
          fontFamily: "var(--font-heading)",
          fontWeight: 800,
          fontSize: 12,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--color-accent)",
          margin: 0,
        }}
      >
        {kicker}
      </p>
      <div>{children}</div>
    </div>
  );
}
