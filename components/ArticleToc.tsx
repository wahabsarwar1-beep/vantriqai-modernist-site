"use client";

import { useEffect, useState } from "react";

/**
 * The guide's contents, pinned beside the text, marking the section being
 * read. An IntersectionObserver rather than a scroll handler: it fires only
 * when a heading crosses the band near the top of the screen.
 */
export default function ArticleToc({ items }: { items: { id: string; text: string }[] }) {
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null);

  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: "-90px 0px -65% 0px", threshold: 0 },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [items]);

  return (
    <nav aria-label="On this page" className="toc">
      <p className="toc-title">On this page</p>
      <ol>
        {items.map((i, n) => (
          <li key={i.id}>
            <a href={`#${i.id}`} aria-current={active === i.id ? "location" : undefined} onClick={() => setActive(i.id)}>
              <span className="toc-n">{String(n + 1).padStart(2, "0")}</span>
              {i.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
