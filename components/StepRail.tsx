import { JSTEPS } from "@/lib/home-data";

/** "04 — Step by step": five full-width cards on a track that scroll
 *  progress drags sideways while the section is pinned. Motion.tsx drives
 *  [data-hpin-track]; below 900px CSS unpins it into five stacked blocks and
 *  the JS never wires a scroll listener. */
export default function StepRail() {
  return (
    <div
      data-hpin=""
      style={{ position: "relative", height: "380vh", borderTop: "1px solid var(--color-divider)", background: "var(--color-bg)" }}
    >
      <div
        style={{
          position: "sticky",
          top: 0,
          height: "100vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            maxWidth: 1280,
            width: "100%",
            margin: "0 auto",
            padding: "0 clamp(20px,5vw,64px)",
            display: "flex",
            alignItems: "center",
            gap: "12px 16px",
            flexWrap: "wrap",
          }}
        >
          <span className="kicker-pill">04 — Step by step</span>
          <span style={{ flex: 1, height: 1, background: "var(--color-divider)", minWidth: 32 }} />
          <span data-hpin-dots="" style={{ display: "flex", gap: 10 }}>
            {JSTEPS.map((s) => (
              <span
                key={s.n}
                data-hpin-dot=""
                style={{
                  width: 38,
                  height: 28,
                  display: "grid",
                  placeItems: "center",
                  borderRadius: 999,
                  background: "var(--color-neutral-200)",
                  fontFamily: "var(--font-heading)",
                  fontWeight: 800,
                  fontSize: 11,
                  letterSpacing: "0.06em",
                  transition: "background-color .3s ease, color .3s ease",
                }}
              >
                {s.n}
              </span>
            ))}
          </span>
          <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 12, letterSpacing: "0.14em" }}>
            <span data-hpin-count="">01</span>{" "}
            <span style={{ color: "color-mix(in srgb, var(--color-text) 45%, transparent)" }}>/ 05</span>
          </span>
        </div>

        <div
          data-hpin-track=""
          style={{ display: "flex", width: "max-content", marginTop: "clamp(24px,4vw,44px)", willChange: "transform" }}
        >
          {JSTEPS.map((s) => (
            <div
              key={s.n}
              data-hpin-card=""
              style={{ width: "100vw", flex: "none", padding: "0 clamp(20px,5vw,64px)", boxSizing: "border-box" }}
            >
              <div
                style={{
                  maxWidth: 1280,
                  margin: "0 auto",
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(min(290px,100%),1fr))",
                  gap: "clamp(20px,4vw,64px)",
                  alignItems: "start",
                  borderTop: "1px solid var(--color-divider)",
                  paddingTop: "clamp(20px,3vw,34px)",
                }}
              >
                <div>
                  <p
                    style={{
                      fontFamily: "var(--font-heading)",
                      fontWeight: 800,
                      fontSize: "clamp(58px,10vw,140px)",
                      lineHeight: 0.84,
                      letterSpacing: "-0.05em",
                      margin: 0,
                      color: "var(--color-accent)",
                    }}
                  >
                    {s.n}
                  </p>
                  <h2
                    style={{
                      fontSize: "clamp(28px,3.8vw,52px)",
                      lineHeight: 1,
                      letterSpacing: "-0.03em",
                      margin: "14px 0 0",
                      maxWidth: "16ch",
                    }}
                  >
                    {s.title}
                  </h2>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "clamp(20px,3vw,34px)" }}>
                  <p
                    style={{
                      fontSize: 17,
                      lineHeight: "29px",
                      margin: 0,
                      maxWidth: "46ch",
                      color: "color-mix(in srgb, var(--color-text) 78%, transparent)",
                    }}
                  >
                    {s.body}
                  </p>
                  <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 16 }}>
                    <p
                      style={{
                        fontFamily: "var(--font-heading)",
                        fontWeight: 800,
                        fontSize: "clamp(26px,3vw,40px)",
                        lineHeight: 1,
                        letterSpacing: "-0.03em",
                        margin: 0,
                      }}
                    >
                      {s.fig}
                    </p>
                    <p
                      style={{
                        fontFamily: "var(--font-heading)",
                        fontWeight: 800,
                        fontSize: 11,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        margin: "10px 0 0",
                        color: "color-mix(in srgb, var(--color-text) 55%, transparent)",
                      }}
                    >
                      {s.figLabel}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
