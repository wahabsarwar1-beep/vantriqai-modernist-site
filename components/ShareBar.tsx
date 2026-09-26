"use client";

import { useState } from "react";

/** Share the guide: copy the link, or open the network's own share page. */
export default function ShareBar({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  const links = [
    { label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
    { label: "X", href: `https://x.com/intent/post?url=${u}&text=${t}` },
    { label: "WhatsApp", href: `https://wa.me/?text=${t}%20${u}` },
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
  ];

  return (
    <div className="share">
      <span className="share-label">Share this guide</span>
      <button
        type="button"
        className="share-btn"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          } catch {
            /* Clipboard blocked: the address bar still has the link. */
          }
        }}
      >
        {copied ? "Link copied ✓" : "Copy link"}
      </button>
      {links.map((l) => (
        <a key={l.label} className="share-btn" href={l.href} target="_blank" rel="noopener noreferrer">
          {l.label}
        </a>
      ))}
    </div>
  );
}
