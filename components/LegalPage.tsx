import Link from "next/link";
import PageHero from "@/components/PageHero";
export default function LegalPage({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <main className="legal-page">
      <PageHero kicker="Legal & trust" heading={title} body={intro} maxWidthCh="19ch" orbit={
        <aside className="legal-hero-card">
          <span className="tag tag-accent">Your choices matter</span>
          <h2>Clear information.<br /><span>Control in your hands.</span></h2>
          <p>Optional analytics start only with your permission. Change your choice at any time using the footer.</p>
          <span className="legal-updated">Updated 3 October 2026</span>
        </aside>
      } />
      <div className="legal-content">
        <nav aria-label="Legal information">
          <Link className={`btn ${title === "Privacy policy" ? "btn-primary" : "btn-secondary"}`} aria-current={title === "Privacy policy" ? "page" : undefined} href="/privacy">Privacy policy</Link>
          <Link className={`btn ${title === "Cookies & browser storage" ? "btn-primary" : "btn-secondary"}`} aria-current={title === "Cookies & browser storage" ? "page" : undefined} href="/cookies">Cookies & storage</Link>
          <Link className={`btn ${title === "Terms & service information" ? "btn-primary" : "btn-secondary"}`} aria-current={title === "Terms & service information" ? "page" : undefined} href="/terms">Terms & service information</Link>
          <Link className="btn btn-ghost" href="/contact">Contact us ↗</Link>
        </nav>
        <article>{children}</article>
      </div>
    </main>
  );
}
