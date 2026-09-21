/**
 * The response gap, drawn rather than described: one tick per hour of the
 * published average, against the single tick an agent needs.
 *
 * The bar is the argument on this whole site, so it is worth showing at the
 * top rather than making someone scroll to a statistic. The ticks are inert
 * marks with an accessible summary underneath, so a screen reader gets the
 * sentence and not 42 empty spans.
 */
export default function ResponseGapStrip() {
  const HOURS = 42;

  return (
    /* No top margin: the strip is its own row in the hero grid, so the
       grid's gap already sets the distance above it. */
    <div data-anim="" style={{ maxWidth: 560 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 55%, transparent)", flex: "none" }}>
          The response gap
        </span>
        <span aria-hidden="true" style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
        <span style={{ fontSize: 11, lineHeight: "16px", color: "color-mix(in srgb, var(--color-text) 45%, transparent)", flex: "none" }}>
          Source: Harvard Business Review, 2011
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, marginBottom: 10 }}>
        <span style={{ fontSize: 14.5, lineHeight: "22px", color: "color-mix(in srgb, var(--color-text) 78%, transparent)" }}>
          Typical first reply to an enquiry
        </span>
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "clamp(20px,2.4vw,26px)", letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", flex: "none" }}>
          42 hrs
        </span>
      </div>

      {/* space-between rather than a fixed gap: 42 ticks at 2px wide need only
          84px of the row, so the same markup holds together from 320px up. */}
      <div aria-hidden="true" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", height: 26, marginBottom: 16 }}>
        {Array.from({ length: HOURS }, (_, i) => (
          <span key={i} style={{ width: 2, height: "100%", borderRadius: 1, background: "var(--color-neutral-300)" }} />
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span aria-hidden="true" style={{ width: 4, height: 26, borderRadius: 2, background: "var(--color-accent)", flex: "none" }} />
        <p style={{ margin: 0, fontSize: 14.5, lineHeight: "22px", color: "var(--color-accent-800)" }}>
          One tick. That&rsquo;s your VantriqAI agent — <strong style={{ fontFamily: "var(--font-heading)", fontWeight: 800 }}>1.2 seconds</strong>.
        </p>
      </div>
    </div>
  );
}
