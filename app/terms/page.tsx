import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/LegalPage";
import terms from "@/lib/terms.json";

export const metadata: Metadata = { title: "Terms & service information", alternates: { canonical: "/terms" } };

/**
 * The terms live in lib/terms.json, not in this file, because the CRM prints
 * the same text into every scope sign-off a client signs: the CRM carries a
 * byte-identical copy (deploy/crm/vantriq-backend/src/content/terms.json) and
 * its tests fail if the two differ. Change the JSON, bump `version`, and copy
 * it across — never edit the wording here.
 */
type Section = { id: string; heading: string; paragraphs?: string[]; bullets?: string[]; after?: string[] };

export default function Page() {
  const sections = terms.sections as Section[];
  return <LegalPage title={terms.title} intro={terms.intro}>
    <p><strong>Version {terms.version}</strong> · updated {terms.updated}</p>
    {sections.map((s) => (
      <section key={s.id} id={s.id}>
        <h2>{s.heading}</h2>
        {(s.paragraphs || []).map((p, i) => <p key={i}>{p}</p>)}
        {s.bullets && <ul>{s.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>}
        {(s.after || []).map((p, i) => <p key={i}>{p}</p>)}
      </section>
    ))}
    <h2>Related</h2>
    <p>Our <Link href="/privacy">Privacy policy</Link> and <Link href="/cookies">Cookies & storage notice</Link> explain how the public website uses data. To ask about these terms, your scope, billing or privacy, use our <Link href="/contact">contact page</Link>.</p>
  </LegalPage>;
}
