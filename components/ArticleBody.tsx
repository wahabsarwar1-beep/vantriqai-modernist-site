import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import type { Block } from "@/lib/resources";

const bodyMuted = { color: "color-mix(in srgb, var(--color-text) 78%, transparent)" };

/**
 * Inline links, written as [label](/path) in the source text.
 *
 * Prose that links to other pages is the whole reason for publishing — a
 * paragraph mentioning the modules should be able to reach them without
 * breaking out of the sentence to do it. Markdown syntax rather than JSX so
 * the article data stays plain serialisable text.
 */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) out.push(<Fragment key={last}>{text.slice(last, match.index)}</Fragment>);
    out.push(
      <Link key={match.index} href={match[2]} style={{ color: "var(--color-accent-700)", textDecoration: "underline", textUnderlineOffset: 3 }}>
        {match[1]}
      </Link>,
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push(<Fragment key={last}>{text.slice(last)}</Fragment>);
  return out;
}

const P = { fontSize: 17, lineHeight: "30px", margin: "0 0 22px", maxWidth: "68ch", ...bodyMuted };

export default function ArticleBody({ body }: { body: Block[] }) {
  return (
    <div>
      {body.map((block, i) => {
        switch (block.t) {
          case "h2":
            return (
              <h2 key={i} data-anim="" style={{ fontSize: "clamp(22px,2.6vw,32px)", lineHeight: 1.1, letterSpacing: "-0.03em", margin: "clamp(34px,4vw,50px) 0 18px", maxWidth: "28ch" }}>
                {block.text}
              </h2>
            );
          case "h3":
            return (
              <h3 key={i} style={{ fontSize: 19, lineHeight: 1.2, letterSpacing: "-0.02em", margin: "30px 0 14px" }}>
                {block.text}
              </h3>
            );
          case "p":
            return <p key={i} style={P}>{inline(block.text)}</p>;
          case "ul":
            return (
              <ul key={i} style={{ ...P, paddingLeft: 0, listStyle: "none", display: "grid", gap: 12 }}>
                {block.items.map((item, j) => (
                  <li key={j} style={{ display: "grid", gridTemplateColumns: "14px 1fr", gap: 12 }}>
                    <span aria-hidden="true" style={{ color: "var(--color-accent)", fontWeight: 800 }}>·</span>
                    <span>{inline(item)}</span>
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} style={{ ...P, paddingLeft: 0, listStyle: "none", display: "grid", gap: 14, counterReset: "step" }}>
                {block.items.map((item, j) => (
                  <li key={j} style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: 12 }}>
                    <span aria-hidden="true" style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 13, color: "var(--color-accent)", fontVariantNumeric: "tabular-nums", paddingTop: 5 }}>
                      {String(j + 1).padStart(2, "0")}
                    </span>
                    <span>{inline(item)}</span>
                  </li>
                ))}
              </ol>
            );
          case "stat":
            return (
              <figure key={i} data-anim="" style={{ margin: "clamp(24px,3vw,34px) 0", padding: "clamp(20px,2.4vw,28px)", background: "var(--color-surface)", border: "1px solid var(--color-divider)", borderRadius: 24, boxShadow: "var(--shadow-sm)", maxWidth: "58ch" }}>
                <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "clamp(30px,3.4vw,46px)", lineHeight: 1, letterSpacing: "-0.04em", margin: 0, fontVariantNumeric: "tabular-nums" }}>
                  {block.fig}
                </p>
                <p style={{ fontSize: 15.5, lineHeight: "26px", margin: "14px 0 16px", ...bodyMuted }}>{block.claim}</p>
                <figcaption style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", paddingTop: 12, borderTop: "1px solid var(--color-divider)", color: "color-mix(in srgb, var(--color-text) 50%, transparent)" }}>
                  {block.src}
                </figcaption>
              </figure>
            );
          case "callout":
            return (
              <aside key={i} data-anim="" style={{ margin: "clamp(24px,3vw,34px) 0", padding: "clamp(18px,2.2vw,24px) clamp(20px,2.4vw,26px)", background: "var(--color-accent-100)", border: "1px dashed var(--color-accent-300)", borderRadius: 20, maxWidth: "62ch" }}>
                <p style={{ fontSize: 15.5, lineHeight: "27px", margin: 0, color: "var(--color-accent-800)" }}>{inline(block.text)}</p>
              </aside>
            );
        }
      })}
    </div>
  );
}
