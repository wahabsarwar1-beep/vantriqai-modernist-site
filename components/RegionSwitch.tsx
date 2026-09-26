"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { REGIONS, pathInRegion, regionFromPathname, type Region } from "@/lib/region";

const ORDER: Region[] = [REGIONS.pk, REGIONS.global];

/**
 * Currency and region, as a two-segment control.
 *
 * It links to the same page in the other region rather than to that region's
 * home, so switching currency on Packages leaves you on Packages. Real links,
 * not a client-side swap: each region's pages are separately indexed, and a
 * crawler should be able to walk between them.
 */
export default function RegionSwitch({ full = false }: { full?: boolean }) {
  const pathname = usePathname();
  const current = regionFromPathname(pathname);

  return (
    <div
      role="group"
      aria-label="Currency and region"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        padding: 2,
        borderRadius: 999,
        border: "1px solid var(--color-divider)",
        background: "color-mix(in srgb, var(--color-surface) 70%, transparent)",
        flex: "none",
      }}
    >
      {ORDER.map((r) => {
        const active = r.key === current.key;
        return (
          <Link
            key={r.key}
            href={pathInRegion(pathname, r)}
            aria-current={active ? "true" : undefined}
            title={`${r.label} site — prices in ${r.currency}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              /* 32px of height inside a 36px bar on desktop; the mobile panel
                 passes full so the row is a 44px target like the links. */
              minHeight: full ? 44 : 30,
              padding: full ? "0 16px" : "0 11px",
              borderRadius: 999,
              fontFamily: "var(--font-heading)",
              fontWeight: 800,
              fontSize: 11,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              background: active ? "var(--color-accent)" : "transparent",
              color: active ? "var(--color-bg)" : "color-mix(in srgb, var(--color-text) 62%, transparent)",
              transition: "background-color .2s ease, color .2s ease",
            }}
          >
            {r.currency}
            {full ? <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>{r.label}</span> : null}
          </Link>
        );
      })}
    </div>
  );
}
