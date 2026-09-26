import type { Metadata } from "next";
import ContactPage from "@/components/pages/ContactPage";
import { REGIONS } from "@/lib/region";
import { regionMetadata } from "@/lib/seo";

const region = REGIONS.global;

export const metadata: Metadata = regionMetadata(
  region,
  "/contact",
  "Contact — VantriqAI Global",
  "Message us on WhatsApp and watch the agent answer, or send a brief and we will come back with a fixed quote.",
);

export default function Page() {
  return <ContactPage region={region} />;
}
