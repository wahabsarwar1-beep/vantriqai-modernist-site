import type { ReactNode } from "react";

/**
 * The opening stage of every inner page: the home page's dark aurora, so a
 * visitor clicking through from the home page stays in the same world.
 *
 * Headings keep passing `var(--color-accent)` for their highlighted words;
 * the stage re-points that variable at the light cobalt inside the h1 only,
 * where the brand cobalt would sit too dark on the ground. The chat card on
 * the right keeps the real brand colour.
 */
export default function PageHero({
  kicker,
  heading,
  body,
  orbit,
  maxWidthCh = "18ch",
}: {
  kicker: string;
  heading: ReactNode;
  body: string;
  orbit: ReactNode;
  maxWidthCh?: string;
}) {
  return (
    <section className="ph">
      <div aria-hidden="true" className="hh-aurora" />
      <div aria-hidden="true" className="hh-grid" />
      <div className="hero-split ph-inner">
        <div>
          <p className="hh-eyebrow">
            <span aria-hidden="true" className="ph-dot" />
            {kicker}
          </p>
          <h1 className="ph-title" style={{ maxWidth: maxWidthCh }}>
            {heading}
          </h1>
          <p data-anim="" className="ph-body">
            {body}
          </p>
        </div>
        <div className="ph-orbit">{orbit}</div>
      </div>
    </section>
  );
}
