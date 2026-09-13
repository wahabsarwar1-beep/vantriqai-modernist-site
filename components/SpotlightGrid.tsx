"use client";

import { createContext, useContext, useState, type CSSProperties, type ReactNode } from "react";

const HoveredContext = createContext<number | null>(null);
const SetHoveredContext = createContext<(i: number | null) => void>(() => {});

export default function SpotlightGrid({ gridStyle, children }: { gridStyle: CSSProperties; children: ReactNode }) {
  const [hovered, setHovered] = useState<number | null>(null);
  return (
    <div data-spot="" style={gridStyle}>
      <HoveredContext.Provider value={hovered}>
        <SetHoveredContext.Provider value={setHovered}>{children}</SetHoveredContext.Provider>
      </HoveredContext.Provider>
    </div>
  );
}

export function SpotlightItem({
  index,
  className,
  style,
  children,
}: {
  index: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const hovered = useContext(HoveredContext);
  const setHovered = useContext(SetHoveredContext);
  const on = hovered === index;
  const dim = hovered !== null && hovered !== index;

  return (
    <div
      data-spot-item=""
      data-on={on ? "" : undefined}
      data-dim={dim ? "" : undefined}
      className={className}
      style={style}
      onMouseEnter={() => setHovered(index)}
      onMouseLeave={() => setHovered(null)}
    >
      {children}
    </div>
  );
}
