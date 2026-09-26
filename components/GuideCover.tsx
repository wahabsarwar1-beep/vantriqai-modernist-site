import type { CSSProperties } from "react";
import type { Resource } from "@/lib/resources";

/** A guide's cover art: its word on its two colours, over the site's grid. */
export default function GuideCover({ resource, large = false }: { resource: Resource; large?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`gcover${large ? " gcover-lg" : ""}`}
      style={{ "--ga": resource.cover.a, "--gb": resource.cover.b } as CSSProperties}
    >
      <span className="gcover-grid" />
      <span className="gcover-orb" />
      <span className="gcover-topic">{resource.topic}</span>
      <span className="gcover-word">{resource.cover.word}</span>
    </div>
  );
}
