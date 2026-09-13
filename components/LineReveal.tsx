import type { ReactNode } from "react";

export default function LineReveal({ children }: { children: ReactNode }) {
  return (
    <span style={{ display: "block", overflow: "hidden", paddingBottom: "0.16em", marginBottom: "-0.12em" }}>
      <span data-line="" style={{ display: "block" }}>
        {children}
      </span>
    </span>
  );
}
