"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GlobeMark, PakistanFlag } from "@/components/RegionMark";
import { REGIONS, pathInRegion, regionFromPathname, type Region } from "@/lib/region";

const ORDER: Region[] = [REGIONS.pk, REGIONS.global];

const mark = (region: Region, size: number) =>
  region.key === "pk" ? <PakistanFlag size={size} /> : <GlobeMark size={size} />;

/**
 * Currency and region, as a two-segment control.
 *
 * It links to the same page in the other region rather than to that region's
 * home, so switching currency on Packages leaves you on Packages. Real links,
 * not a client-side swap: each region's pages are separately indexed, and a
 * crawler should be able to walk between them.
 *
 * The bar version is marks only. Spelling out "PKR" and "US$" cost about
 * 40px, and the nav had no 40px to give — it was wrapping the WhatsApp button
 * onto a second line on every laptop between 1024 and 1366. The marks carry
 * the meaning, and each link's title and accessible name still say it in
 * words. The panel version (`full`) has room, so it says both.
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
        const label = `${r.label} site — prices in ${r.currency}`;
        return (
          <Link
            key={r.key}
            href={pathInRegion(pathname, r)}
            aria-current={active ? "true" : undefined}
            aria-label={label}
            title={label}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              minHeight: full ? 44 : 28,
              padding: full ? "0 14px" : "0 9px",
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
            {/* The globe follows currentColor, but the flag is full colour
                whatever the state, so the unselected one is dimmed — otherwise
                the only thing telling them apart is the pill behind. */}
            <span style={{ display: "inline-flex", opacity: active ? 1 : 0.5, transition: "opacity .2s ease" }}>
              {mark(r, full ? 20 : 17)}
            </span>
            {full ? <span>{r.currency}</span> : null}
            {full ? <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>{r.label}</span> : null}
          </Link>
        );
      })}
    </div>
  );
}
