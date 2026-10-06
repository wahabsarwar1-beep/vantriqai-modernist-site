import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = { title: "Data deletion", alternates: { canonical: "/data-deletion" } };

export default function Page() {
  return <LegalPage title="Data deletion" intro="How to have the information we hold about you deleted, including conversations with our assistant on Instagram, Facebook Messenger, WhatsApp and this website.">
<h2>What we hold</h2><p>If you messaged VantriqAI, we may hold the messages you sent and our replies, the identifier the platform assigned you (for Instagram or Messenger) or your phone number (for WhatsApp), your profile name, and any details you gave us, such as your business, email or phone number. The <Link href="/privacy">privacy policy</Link> explains why.</p>
<h2>How to ask for deletion</h2><p>Use whichever is easiest:</p>
<ul>
<li>Send the message <strong>“Delete my data”</strong> in the same Instagram, Messenger or WhatsApp conversation you used with us, so we can identify the records without asking for anything else.</li>
<li>Or write to us through the <Link href="/contact">contact page</Link>, saying which channel you used and the name or number you used it with.</li>
</ul>
<h2>What happens next</h2><p>The team deletes your conversation history and customer record from our systems and confirms in the same channel once it is done. We may keep a minimal record only where the law requires it, for example an invoice issued to a business customer, and will tell you if that applies. Deleting the data we hold does not delete messages from your own Instagram, Messenger or WhatsApp app; you can remove those there.</p>
<h2>Removing our access on Facebook or Instagram</h2><p>You can also stop messaging us and block or restrict our account in the Instagram or Messenger app at any time. That stops new messages reaching us; use the steps above to delete what we already hold.</p>
</LegalPage>;
}
