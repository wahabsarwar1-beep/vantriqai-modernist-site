import type { ReactNode } from "react";
import Kicker from "@/components/Kicker";

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
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 clamp(20px,5vw,64px)" }}>
      <section style={{ padding: "clamp(36px,4.6vw,62px) 0 clamp(28px,4vw,50px)", position: "relative" }}>
        <div aria-hidden="true" data-hero-texture="" style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: "calc(100vw + 24px)", marginLeft: "calc(-50vw - 12px)", zIndex: 0, pointerEvents: "none" }} />
        <div className="stack-mobile" style={{ position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: "minmax(min(420px,100%),1.6fr) minmax(min(150px,100%),0.4fr)", gap: "clamp(28px,4vw,56px)", alignItems: "center" }}>
          <div>
            <Kicker label={kicker} marginBottom="clamp(24px,4vw,44px)" />
            <h1 style={{ fontSize: "clamp(30px,4.4vw,58px)", lineHeight: 1, letterSpacing: "-0.03em", margin: 0, maxWidth: maxWidthCh, overflowWrap: "break-word" }}>{heading}</h1>
            <p data-anim="" style={{ fontSize: 18, lineHeight: "30px", maxWidth: "52ch", margin: "32px 0 0" }}>{body}</p>
          </div>
          {orbit}
        </div>
      </section>
    </div>
  );
}
