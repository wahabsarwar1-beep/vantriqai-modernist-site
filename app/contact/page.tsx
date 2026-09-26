import type { Metadata } from "next";
import ContactPage from "@/components/pages/ContactPage";
import { REGIONS } from "@/lib/region";
import { regionMetadata } from "@/lib/seo";

const region = REGIONS.pk;

export const metadata: Metadata = regionMetadata(region, "/contact");

export default function Page() {
  return <ContactPage region={region} />;
}
