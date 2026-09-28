"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import ColumnIcon from "@/components/ColumnIcon";
import ProductMark from "@/components/ProductMark";
import MenuGlyph from "@/components/MenuGlyph";
import { NAV_LINKS } from "@/lib/nav-links";
import type { MenuPanel } from "@/lib/menu";
import { navHref, type Region } from "@/lib/region";
import { waLink } from "@/lib/whatsapp";

/**
 * The phone and tablet menu: a full-screen sheet carrying the same panels as
 * the desktop mega menus — the launch card, the grouped columns with their
 * marks, tiers and New flags, the closing card — as one accordion per item.
 *
 * It is portalled to <body>. The capsule has a backdrop-filter, which makes
 * it the containing block for anything fixed inside it, so a sheet rendered
 * there could never cover the screen. The capsule itself stays above the
 * sheet, so the logo and the close button never move.
 */

const subscribe = () => () => {};

export default function MobileMenu({
  open,
  onClose,
  panels,
  region,
  pathname,
  currentSection,
}: {
  open: boolean;
  onClose: () => void;
  panels: MenuPanel[];
  region: Region;
  pathname: string;
  currentSection: string | null;
}) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const baseId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const panelFor = (label: string) => panels.find((p) => p.label === label);

  /* The section you are in starts expanded, so the menu opens where you are. */
  const currentLabel =
    NAV_LINKS.find((l) => {
      const href = navHref(region, l);
      return pathname === href || pathname.startsWith(`${href}/`);
    })?.label ?? null;
  const [expanded, setExpanded] = useState<string | null>(currentLabel);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("mm-lock", open);
    if (!open) return;
    sheetRef.current?.scrollTo(0, 0);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      root.classList.remove("mm-lock");
    };
  }, [open, onClose]);

  if (!mounted) return null;

  const isHere = (href: string) => href === pathname || (!!currentSection && href.endsWith(`#${currentSection}`));

  return createPortal(
    <div
      className="mm"
      data-open={open ? "" : undefined}
      role="dialog"
      aria-modal="true"
      aria-label="Site menu"
      inert={!open}
      onClick={(e) => {
        // Any link inside closes the sheet; the route change does the rest.
        if ((e.target as HTMLElement).closest("a")) onClose();
      }}
    >
      <div aria-hidden="true" className="mm-aurora" />
      <div className="mm-scroll" ref={sheetRef}>
        <p className="mm-kicker">Menu</p>
        <ul className="mm-list">
          {NAV_LINKS.map((link, i) => {
            const href = navHref(region, link);
            const mega = panelFor(link.label);
            const current = currentLabel === link.label;
            const n = String(i + 1).padStart(2, "0");

            if (!mega) {
              return (
                <li key={link.href} className="mm-item" style={{ "--i": i } as React.CSSProperties}>
                  <Link href={href} className="mm-row" aria-current={current ? "page" : undefined}>
                    <span className="mm-row-n">{n}</span>
                    <span className="mm-row-label">{link.label}</span>
                    <span aria-hidden="true" className="mm-row-go">→</span>
                  </Link>
                </li>
              );
            }

            const isOpen = expanded === link.label;
            const panelId = `${baseId}-${i}`;
            /* Industries splits one list over two desktop columns, the second
               titled with a blank; on a phone they are one list again. */
            const columns = mega.columns.reduce<typeof mega.columns>((acc, col) => {
              if (!col.title.trim() && acc.length) acc[acc.length - 1] = { ...acc[acc.length - 1], links: [...acc[acc.length - 1].links, ...col.links] };
              else acc.push(col);
              return acc;
            }, []);

            return (
              <li key={link.href} className="mm-item" data-open={isOpen ? "" : undefined} style={{ "--i": i } as React.CSSProperties}>
                <button
                  type="button"
                  className="mm-row"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  data-current={current ? "" : undefined}
                  onClick={() => setExpanded(isOpen ? null : link.label)}
                >
                  <span className="mm-row-n">{n}</span>
                  <span className="mm-row-label">{link.label}</span>
                  <span aria-hidden="true" className="mm-row-plus" />
                </button>

                <div id={panelId} className="mm-panel" inert={!isOpen}>
                  <div className="mm-panel-inner">
                    {mega.hero ? (
                      <Link href={mega.hero.href} className="mm-hero">
                        {mega.hero.kicker ? <span className="mm-hero-k">{mega.hero.kicker}</span> : null}
                        <strong>{mega.hero.title}</strong>
                        <span className="mm-hero-body">{mega.hero.body}</span>
                        <span className="mm-hero-cta">{mega.hero.cta} →</span>
                      </Link>
                    ) : null}

                    {columns.map((col) => (
                      <div key={col.title} className="mm-col">
                        <p className="mm-col-title">
                          {col.icon ? <ColumnIcon id={col.icon} /> : null}
                          {col.title}
                        </p>
                        <div className="mm-links">
                          {col.links.map((l) => (
                            <Link key={l.href} href={l.href} className="mm-link" aria-current={isHere(l.href) ? "page" : undefined}>
                              {l.mark ? (
                                <ProductMark id={l.mark} size={34} />
                              ) : l.glyph ? (
                                <MenuGlyph id={l.glyph} size={34} />
                              ) : (
                                <span aria-hidden="true" className="mm-link-tile">
                                  {l.label.replace(/[^A-Za-z]/g, "").slice(0, 1)}
                                </span>
                              )}
                              <span className="mm-link-text">
                                <span className="mm-link-label">
                                  {l.label}
                                  {l.isNew ? <span className="mega-new">New</span> : null}
                                </span>
                                {l.note ? <span className="mm-link-note">{l.note}</span> : null}
                              </span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    ))}

                    {mega.feature ? (
                      <Link href={mega.feature.href} className="mm-feature">
                        {mega.feature.kicker ? <span className="mm-hero-k">{mega.feature.kicker}</span> : null}
                        <strong>{mega.feature.title}</strong>
                        <span className="mm-hero-body">{mega.feature.body}</span>
                        <span className="mm-feature-cta">{mega.feature.cta} →</span>
                      </Link>
                    ) : null}

                    <Link href={mega.footer.href} className="mm-all">
                      {mega.footer.label} <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mm-dock">
        <a className="mm-dock-primary" href={waLink()} target="_blank" rel="noopener">
          <span aria-hidden="true" className="bn-cta-dot" />
          Try the agent on WhatsApp
        </a>
        <Link className="mm-dock-ghost" href={navHref(region, { href: "/contact" })}>
          Send a brief
        </Link>
      </div>
    </div>,
    document.body,
  );
}
