"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * "Which package fits?" — three questions, one recommendation, and the reason
 * for it. The package is the highest that any single answer requires: volume
 * sets a floor, and each channel or need can only raise it. Every threshold
 * is passed in from lib/packages and lib/products, so the finder can never
 * recommend a package that does not carry what was asked for.
 */

export type FinderPackage = {
  slug: string;
  name: string;
  audience: string;
  typical: string;
  href: string;
  /** The package below this one, if any — its contents come included. */
  previous?: string;
  highlights: string[];
};
export type FinderOption = { key: string; label: string; from: number };

const VOLUMES = [100, 300, 600, 1000, 1500, 2500, 4000, 6000, 8000, 12000, 15000, 25000];
/** Slider stops labelled under the track: the ends and two package boundaries. */
const MARKS = [0, 4, 8, 11];
const volumeTier =(v: number) => (v <= 600 ? 0 : v <= 1500 ? 1 : v <= 4000 ? 2 : v <= 8000 ? 3 : v <= 15000 ? 4 : 5);
const fmt = (v: number) => (v >= 25000 ? "25,000+" : v.toLocaleString("en-US"));

export default function PackageFinder({
  packages,
  channels,
  needs,
  contactHref,
}: {
  packages: FinderPackage[];
  channels: FinderOption[];
  needs: FinderOption[];
  contactHref: string;
}) {
  const [vol, setVol] = useState(3);
  const [picked, setPicked] = useState<Set<string>>(new Set([channels[0]?.key]));

  const toggle = (key: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const volume = VOLUMES[vol];
  const drivers = [
    { tier: volumeTier(volume), why: `${fmt(volume)} conversations a month` },
    ...[...channels, ...needs].filter((o) => picked.has(o.key)).map((o) => ({ tier: o.from, why: o.label })),
  ];
  const tier = Math.max(...drivers.map((d) => d.tier));
  const rec = packages[tier];
  const deciding = drivers.filter((d) => d.tier === tier);

  return (
    <div className="finder">
      <div className="finder-form">
        <fieldset className="finder-q">
          <legend>
            <span className="finder-n">01</span>How many customer conversations a month?
          </legend>
          <div className="finder-vol">
            <output htmlFor="finder-volume" className="finder-vol-fig">
              {fmt(volume)}
            </output>
            <span className="finder-vol-unit">a month</span>
          </div>
          <input
            id="finder-volume"
            type="range"
            min={0}
            max={VOLUMES.length - 1}
            step={1}
            value={vol}
            onChange={(e) => setVol(Number(e.target.value))}
            aria-valuetext={`${fmt(volume)} conversations a month`}
            className="finder-range"
            style={{ ["--p" as string]: vol / (VOLUMES.length - 1) }}
          />
          <div className="finder-scale" aria-hidden="true">
            {MARKS.map((i) => (
              <span key={i} style={{ ["--p" as string]: i / (VOLUMES.length - 1) }}>
                {fmt(VOLUMES[i])}
              </span>
            ))}
          </div>
        </fieldset>

        <fieldset className="finder-q">
          <legend>
            <span className="finder-n">02</span>Where do customers reach you?
          </legend>
          <div className="finder-chips">
            {channels.map((c) => (
              <button key={c.key} type="button" aria-pressed={picked.has(c.key)} onClick={() => toggle(c.key)} className="finder-chip">
                {c.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="finder-q">
          <legend>
            <span className="finder-n">03</span>Anything else you need?
          </legend>
          <div className="finder-chips">
            {needs.map((c) => (
              <button key={c.key} type="button" aria-pressed={picked.has(c.key)} onClick={() => toggle(c.key)} className="finder-chip">
                {c.label}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="finder-result" aria-live="polite">
        <p className="finder-result-k">Your starting point</p>
        <p className="finder-result-name" key={rec.slug}>
          {rec.name}
        </p>
        <p className="finder-result-aud">
          {rec.audience} · sized for {rec.typical}
        </p>
        <span aria-hidden="true" className="pkg-meter">
          {packages.map((p, i) => (
            <i key={p.slug} data-on={i <= tier ? "" : undefined} />
          ))}
        </span>
        <p className="finder-why-k">Why {rec.name}</p>
        <ul className="finder-why">
          {deciding.map((d) => (
            <li key={d.why}>{d.why}</li>
          ))}
        </ul>
        <p className="finder-why-k">{rec.previous ? `Everything in ${rec.previous}, plus` : `What's in ${rec.name}`}</p>
        <ul className="finder-inc" key={`inc-${rec.slug}`}>
          {rec.highlights.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
        <div className="finder-actions">
          <Link href={rec.href} className="btn hh-btn-primary">
            See {rec.name} <span aria-hidden="true">→</span>
          </Link>
          <Link href={contactHref} className="btn hh-btn-ghost">
            Confirm it in writing
          </Link>
        </div>
        <p className="finder-note">A starting point, not a quote — we confirm the package against your real message history.</p>
      </div>
    </div>
  );
}
