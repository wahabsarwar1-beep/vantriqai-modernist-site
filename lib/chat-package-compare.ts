import type { CompareBlock } from "@/lib/chat-blocks";
import { TIERS } from "@/lib/content";
import { availability, packages, PLATFORM_FEATURES } from "@/lib/packages";
import { products } from "@/lib/products";
import type { Region } from "@/lib/region";

/**
 * A package comparison built from the site's own catalogue — the same source
 * as the Pricing page — so the assistant only chooses WHICH packages to show
 * and can never get a cell wrong. Rows that read the same across every chosen
 * package are left out: a chat-sized table should show what changes.
 */
export const PACKAGE_NAMES = TIERS.map((t) => t.name);
const DEFAULT = ["Starter", "Growth", "Scale"];

export function packageCompare(region: Region, names: string[] | undefined, title?: string): CompareBlock {
  const all = packages();
  const pick = (names?.length ? names : DEFAULT)
    .map((n) => all.find((p) => p.name.toLowerCase() === n.trim().toLowerCase()))
    .filter((p, i, arr): p is (typeof all)[number] => !!p && arr.indexOf(p) === i)
    .sort((a, b) => a.index - b.index)
    .slice(0, 4);
  const chosen = pick.length >= 2 ? pick : all.filter((p) => DEFAULT.includes(p.name));

  const rows: CompareBlock["rows"] = [
    { label: "Best for", values: chosen.map((p) => p.audience) },
    { label: "Typical conversations", values: chosen.map((p) => p.usage.typical) },
  ];
  const differs = (values: (string | boolean)[]) => values.some((v) => v !== values[0]);

  for (const f of PLATFORM_FEATURES) {
    const values = chosen.map((p) => p.index >= f.from);
    if (differs(values)) rows.push({ label: f.label, values });
  }
  for (const m of products(region)) {
    const values = chosen.map((p) => {
      const a = availability(m, p.index);
      return a === "included" ? true : a === "addon" ? "Add-on" : false;
    });
    if (differs(values)) rows.push({ label: m.name, values });
  }

  const recommended = chosen.findIndex((p) => p.recommended);
  return {
    type: "compare",
    title: title ?? `${chosen.map((p) => p.name).join(" vs ")}`,
    columns: chosen.map((p) => p.name),
    rows: rows.slice(0, 12),
    highlight: recommended === -1 ? undefined : recommended,
    note: "Escalation Desk, Insights Digest and Vantriq Pulse come with every package. Pricing is quoted in writing after a free discovery call.",
  };
}
