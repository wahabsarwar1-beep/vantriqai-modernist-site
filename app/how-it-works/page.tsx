import type { Metadata } from "next";
import HowItWorksPage from "@/components/pages/HowItWorksPage";
import { REGIONS } from "@/lib/region";
import { regionMetadata } from "@/lib/seo";

const region = REGIONS.pk;

export const metadata: Metadata = regionMetadata(region, "/how-it-works");

export default function Page() {
  return <HowItWorksPage region={region} />;
}
