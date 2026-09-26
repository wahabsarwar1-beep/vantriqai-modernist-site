"use client";

import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import ColumnIcon from "@/components/ColumnIcon";
import ProductMark from "@/components/ProductMark";
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
const HOVER_QUERY = "(hover: hover) and (pointer: fine)";

/**
 * Whether this is a device that hovers.
 *
 * useSyncExternalStore rather than setState in an effect: the media query is
 * external state, this is the API meant for reading it, and it answers false
 * on the server so the first tap on a touchscreen opens the panel instead of
 * navigating away from it.
 */
function useHoverable() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(HOVER_QUERY);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(HOVER_QUERY).matches,
    () => false,
  );
}

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
  const hoverable = useHoverable();

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
      style={{ display: "flex", alignItems: "center" }}
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

      {/* Positioned against the nav, not the trigger: the nav is full width
          and sticky, so the panel centres on the viewport and follows the bar
          as it shrinks. Centred on the trigger, a 1120px panel ran off the
          left edge at 1260 and 1440.

          top is 100% with the gap as padding, so the pointer never crosses
          dead space on its way from the word to the panel — a 14px margin
          there closes the menu mid-reach. */}
      <div
        id={id}
        hidden={!open}
        style={{
          position: "absolute",
          top: "100%",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 60,
          paddingTop: 12,
          width: "min(94vw, 1120px)",
          maxWidth: "94vw",
        }}
      >
      <div
        style={{
          background: "var(--color-bg)",
          border: "1px solid var(--color-divider)",
          borderRadius: 24,
          boxShadow: "var(--shadow-lg)",
          padding: "clamp(20px,2vw,26px)",
          maxHeight: "calc(100vh - 120px)",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `${panel.hero ? "minmax(230px, 270px) " : ""}repeat(${panel.columns.length}, minmax(168px, 1fr))${panel.feature ? " minmax(200px, 230px)" : ""}`,
            gap: "0 clamp(16px,1.8vw,28px)",
            alignItems: "start",
          }}
        >
          {panel.hero ? (
            <Link
              href={panel.hero.href}
              onClick={onClose}
              className="mega-hero"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                padding: "18px 20px",
                borderRadius: 20,
                color: "var(--color-text)",
                /* The one tinted surface in the panel: the wash from the hero,
                   flattened, so the menu opens with the site's colour rather
                   than a wall of grey text. */
                background:
                  "linear-gradient(145deg, color-mix(in srgb, var(--color-accent) 16%, var(--color-bg)) 0%, color-mix(in srgb, var(--color-accent-2) 13%, var(--color-bg)) 100%)",
                border: "1px solid var(--color-accent-200)",
              }}
            >
              <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 17, letterSpacing: "-0.02em", lineHeight: "23px" }}>
                {panel.hero.title}
              </span>
              <span style={{ fontSize: 13, lineHeight: "20px", color: "color-mix(in srgb, var(--color-text) 74%, transparent)" }}>
                {panel.hero.body}
              </span>
              <span style={{ paddingTop: 4, fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 11.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-accent)" }}>
                {panel.hero.cta} &rarr;
              </span>
            </Link>
          ) : null}
          {panel.columns.map((col) => (
            <div key={col.title}>
              <p style={{ display: "flex", alignItems: "center", gap: 9, fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-accent)", margin: "0 0 12px", minHeight: 26 }}>
                {col.icon ? <ColumnIcon id={col.icon} /> : null}
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
                      <span style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                        {l.mark ? <ProductMark id={l.mark} size={28} /> : null}
                        <span style={{ display: "block" }}>
                          <span style={{ display: "block", fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 13.5, letterSpacing: "-0.01em", lineHeight: "19px" }}>
                            {l.label}
                          </span>
                          {l.note ? (
                            <span style={{ display: "block", fontSize: 11.5, lineHeight: "16px", marginTop: 2, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>
                              {l.note}
                            </span>
                          ) : null}
                        </span>
                      </span>
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
              {panel.feature.kicker ? (
                <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 9.5, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--color-accent)" }}>
                  {panel.feature.kicker}
                </span>
              ) : null}
              <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 14.5, letterSpacing: "-0.01em", lineHeight: "20px" }}>
                {panel.feature.title}
              </span>
              <span style={{ fontSize: 12.5, lineHeight: "19px", color: "color-mix(in srgb, var(--color-text) 70%, transparent)" }}>
                {panel.feature.body}
              </span>
              {panel.feature.bullets?.length ? (
                <span style={{ display: "grid", gap: 5, marginTop: 2 }}>
                  {panel.feature.bullets.map((bl) => (
                    <span key={bl} style={{ display: "grid", gridTemplateColumns: "11px 1fr", gap: 7, fontSize: 12, lineHeight: "17px", color: "color-mix(in srgb, var(--color-text) 72%, transparent)" }}>
                      <span aria-hidden="true" style={{ color: "var(--color-accent)" }}>&#8226;</span>
                      <span>{bl}</span>
                    </span>
                  ))}
                </span>
              ) : null}
              {/* A filled button, not another underlined link: this is the one
                  thing in the panel we want clicked. */}
              <span
                style={{
                  marginTop: 6,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  minHeight: 38,
                  padding: "0 14px",
                  borderRadius: 999,
                  background: "var(--color-accent)",
                  color: "var(--color-bg)",
                  fontFamily: "var(--font-heading)",
                  fontWeight: 800,
                  fontSize: 11.5,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
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
    </div>
  );
}
