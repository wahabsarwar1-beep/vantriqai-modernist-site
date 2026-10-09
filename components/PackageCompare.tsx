import Link from "next/link";
import { PLATFORM_FEATURES, availability, packages, type Availability } from "@/lib/packages";
import { productSlug, products } from "@/lib/products";
import { hrefIn, type Region } from "@/lib/region";

/**
 * Every package side by side: modules, platform features and capacity.
 *
 * Nothing here is typed by hand. Module rows read each module's "From <tier>"
 * line, feature rows read PLATFORM_FEATURES, and capacity reads the USAGE
 * table — so the comparison, the package pages and the Products page cannot
 * disagree. A real <table> with row and column headers, so a screen reader
 * announces "Growth, Voice Agent: included" rather than a grid of ticks.
 */

type Cell = Availability | { text: string };
type Row = { label: string; href?: string; cells: Cell[] };

function CellView({ cell }: { cell: Cell }) {
  if (typeof cell === "object") return <span className="cmp-text">{cell.text}</span>;
  if (cell === "included")
    return (
      <span className="cmp-yes">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
        <span className="sr-only">Included</span>
      </span>
    );
  if (cell === "addon") return <span className="cmp-addon">Add-on</span>;
  return (
    <span className="cmp-no">
      <span aria-hidden="true">—</span>
      <span className="sr-only">Not included</span>
    </span>
  );
}

export default function PackageCompare({ region }: { region: Region }) {
  const pkgs = packages();
  const all = products(region);

  const moduleRows = (kicker: string): Row[] =>
    all
      .filter((p) => p.kicker === kicker)
      .map((p) => ({
        label: p.name,
        href: hrefIn(region, `/products/${productSlug(p.name)}`),
        cells: pkgs.map((k) => availability(p, k.index)),
      }));

  const groups: { title: string; rows: Row[] }[] = [
    { title: "Channels", rows: moduleRows("Channel") },
    { title: "Capabilities", rows: moduleRows("Capability") },
    {
      title: "Platform",
      rows: PLATFORM_FEATURES.map((f) => ({
        label: f.label,
        cells: pkgs.map((k) => (k.index >= f.from ? "included" : "none")),
      })),
    },
    { title: "Insight & people", rows: moduleRows("Insight") },
    { title: "Deployment", rows: moduleRows("Deployment") },
    {
      title: "Capacity",
      rows: [
        { label: "Sized for", cells: pkgs.map((k) => ({ text: k.usage.typical })) },
        { label: "Sessions included a month", cells: pkgs.map((k) => ({ text: k.usage.sessions })) },
        { label: "Sessions a day, on average", cells: pkgs.map((k) => ({ text: k.usage.perday })) },
        { label: "Headroom over typical use", cells: pkgs.map((k) => ({ text: k.usage.head })) },
        { label: "Overage beyond the allowance", cells: pkgs.map((k) => ({ text: k.usage[region.overageKey] })) },
        { label: "Voice-note minutes included a month", cells: pkgs.map((k) => ({ text: k.usage.voice })) },
        { label: "Voice-note minutes beyond the allowance", cells: pkgs.map((k) => ({ text: k.usage[region.voiceOverKey] })) },
      ],
    },
  ];

  return (
    <div className="cmp-wrap">
      <p className="scroll-hint cmp-hint" aria-hidden="true">
        Swipe the table to see every package &rarr;
      </p>
      <div className="cmp-scroll">
        <table className="cmp">
          <caption className="sr-only">What each VantriqAI package includes: modules, platform features and capacity.</caption>
          <thead>
            <tr>
              <th scope="col" className="cmp-corner">
                Package
              </th>
              {pkgs.map((k) => (
                <th key={k.slug} scope="col" data-rec={k.recommended ? "" : undefined}>
                  <Link href={hrefIn(region, `/pricing/${k.slug}`)} className="cmp-head">
                    {k.recommended ? <span className="cmp-rec">Recommended</span> : null}
                    <strong>{k.name}</strong>
                    <span>{k.audience}</span>
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.title}>
              <tr className="cmp-group">
                <th scope="rowgroup" colSpan={pkgs.length + 1}>
                  <span>{g.title}</span>
                </th>
              </tr>
              {g.rows.map((r) => (
                <tr key={r.label}>
                  <th scope="row">{r.href ? <Link href={r.href}>{r.label}</Link> : r.label}</th>
                  {r.cells.map((c, i) => (
                    <td key={pkgs[i].slug} data-rec={pkgs[i].recommended ? "" : undefined}>
                      <CellView cell={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  );
}
