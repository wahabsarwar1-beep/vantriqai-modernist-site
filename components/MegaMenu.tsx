"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import type { MenuPanel } from "@/lib/menu";

/**
 * A nav item that opens a panel of grouped links.
 *
 * Opens on hover for a mouse and on click or Enter for everything else, which
 * matters because a hover-only menu is unreachable from a keyboard and on a
 * touchscreen. Escape closes it and puts focus back on the trigger, clicking
 * outside closes it, and moving to another trigger swaps panels rather than
 * stacking them.
 *
 * The trigger is also a link to the section page, so clicking the word
 * "Products" goes to Products rather than only toggling a panel — the thing
 * people expect when a menu label is also a real page.
 */
export default function MegaMenu({
  panel,
  open,
  onOpen,
  onClose,
  active,
  currentSection,
}: {
  panel: MenuPanel;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  active: boolean;
  /** The anchored section the reader is on, so the panel can mark it. */
  currentSection: string | null;
}) {
  const id = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLAnchorElement>(null);
  const [hoverable, setHoverable] = useState(false);

  useEffect(() => {
    setHoverable(window.matchMedia("(hover: hover) and (pointer: fine)").matches);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onClose();
      triggerRef.current?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, onClose]);

  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", display: "flex", alignItems: "center" }}
      onMouseEnter={hoverable ? onOpen : undefined}
      onMouseLeave={hoverable ? onClose : undefined}
      onFocus={onOpen}
      onBlur={(e) => {
        if (!wrapRef.current?.contains(e.relatedTarget as Node)) onClose();
      }}
    >
      <Link
        ref={triggerRef}
        href={panel.href}
        data-navlink=""
        aria-expanded={open}
        aria-controls={id}
        onClick={(e) => {
          // Without a mouse, the first activation opens the panel rather than
          // navigating — otherwise the sub-links are unreachable by touch.
          if (!hoverable && !open) {
            e.preventDefault();
            onOpen();
          }
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontFamily: "var(--font-heading)",
          fontWeight: 800,
          fontSize: 12.5,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
          color: active || open ? "var(--color-accent)" : "var(--color-text)",
        }}
      >
        {panel.label}
        <svg width="8" height="5" viewBox="0 0 10 6" aria-hidden="true" style={{ flex: "none", transform: open ? "rotate(180deg)" : "none", transition: "transform .2s ease" }}>
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </Link>

      <div
        id={id}
        hidden={!open}
        style={{
          position: "absolute",
          top: "calc(100% + 14px)",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 60,
          background: "var(--color-bg)",
          border: "1px solid var(--color-divider)",
          borderRadius: 24,
          boxShadow: "var(--shadow-lg)",
          padding: "clamp(20px,2vw,26px)",
          minWidth: 300,
          maxWidth: "min(92vw, 860px)",
          width: "max-content",
          /* Fits comfortably today at 571px tall. This is so it still does
             after someone adds three more modules on a laptop screen. */
          maxHeight: "calc(100vh - 120px)",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${panel.columns.length}, minmax(180px, 1fr))${panel.feature ? " minmax(210px, 240px)" : ""}`, gap: "0 clamp(18px,2vw,30px)" }}>
          {panel.columns.map((col) => (
            <div key={col.title}>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-accent)", margin: "0 0 12px", minHeight: 14 }}>
                {col.title}
              </p>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 2 }}>
                {col.links.map((l) => {
                  const here = !!currentSection && l.href.endsWith(`#${currentSection}`);
                  return (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="mega-link"
                      aria-current={here ? "location" : undefined}
                      onClick={onClose}
                      style={{
                        display: "block",
                        borderRadius: 12,
                        padding: "8px 10px",
                        color: here ? "var(--color-accent-800)" : "var(--color-text)",
                        background: here ? "var(--color-accent-100)" : undefined,
                        boxShadow: here ? "inset 3px 0 0 var(--color-accent)" : undefined,
                      }}
                    >
                      <span style={{ display: "block", fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 13.5, letterSpacing: "-0.01em", lineHeight: "19px" }}>
                        {l.label}
                      </span>
                      {l.note ? (
                        <span style={{ display: "block", fontSize: 11.5, lineHeight: "16px", marginTop: 2, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>
                          {l.note}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {panel.feature ? (
            <Link
              href={panel.feature.href}
              onClick={onClose}
              className="mega-feature"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                /* Hug the content. A grid item stretches to the tallest
                   column by default, which left this card 300px taller than
                   its text with the call to action stranded at the bottom. */
                alignSelf: "start",
                background: "var(--color-accent-100)",
                border: "1px solid var(--color-accent-200)",
                borderRadius: 18,
                padding: "16px 18px",
                color: "var(--color-accent-800)",
              }}
            >
              <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 14.5, letterSpacing: "-0.01em", lineHeight: "20px" }}>
                {panel.feature.title}
              </span>
              <span style={{ fontSize: 12.5, lineHeight: "19px", color: "color-mix(in srgb, var(--color-text) 70%, transparent)" }}>
                {panel.feature.body}
              </span>
              <span style={{ paddingTop: 4, fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 11.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-accent)" }}>
                {panel.feature.cta} &rarr;
              </span>
            </Link>
          ) : null}
        </div>

        <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--color-divider)" }}>
          <Link
            href={panel.footer.href}
            onClick={onClose}
            style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-accent)" }}
          >
            {panel.footer.label} &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
