import Link from "next/link";
export default function LegalPage({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return <main className="legal-page"><span className="privacy-kicker">VantriqAI · Updated 3 October 2026</span><h1>{title}</h1><p className="legal-intro">{intro}</p><nav aria-label="Privacy information"><Link href="/privacy">Privacy policy</Link><Link href="/cookies">Cookies & storage</Link><Link href="/contact">Contact us</Link></nav><article>{children}</article></main>;
}
