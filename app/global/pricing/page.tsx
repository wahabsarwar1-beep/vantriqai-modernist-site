import type { Metadata } from "next";
import PricingPage from "@/components/pages/PricingPage";
import { REGIONS } from "@/lib/region";
import { regionMetadata } from "@/lib/seo";

const region = REGIONS.global;

export const metadata: Metadata = regionMetadata(
  region,
  "/pricing",
  "Packages — VantriqAI Global",
  "Six tiers and one clear path as you grow. A one-time setup fee plus a simple monthly plan, quoted after we scope your workflow.",
);

export default function Page() {
  return <PricingPage region={region} />;
}
