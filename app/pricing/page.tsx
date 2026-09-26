import type { Metadata } from "next";
import PricingPage from "@/components/pages/PricingPage";
import { REGIONS } from "@/lib/region";
import { regionMetadata } from "@/lib/seo";

const region = REGIONS.pk;

export const metadata: Metadata = regionMetadata(region, "/pricing");

export default function Page() {
  return <PricingPage region={region} />;
}
