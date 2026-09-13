import type { ReactNode } from "react";

export default function Marquee({
  children,
  duration = 34,
  reverse = false,
}: {
  children: ReactNode;
  duration?: number;
  reverse?: boolean;
}) {
  return (
    <div style={{ display: "flex", width: "max-content", animation: `${reverse ? "marquee-rev" : "marquee"} ${duration}s linear infinite` }}>
      <div style={{ display: "flex", alignItems: "center" }}>{children}</div>
      <div aria-hidden="true" style={{ display: "flex", alignItems: "center" }}>
        {children}
      </div>
    </div>
  );
}
