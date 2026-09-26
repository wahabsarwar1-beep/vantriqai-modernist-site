import type { Metadata } from "next";
import IndustriesPage from "@/components/pages/IndustriesPage";
import { REGIONS } from "@/lib/region";
import { regionMetadata } from "@/lib/seo";

const region = REGIONS.pk;

export const metadata: Metadata = regionMetadata(region, "/industries");

export default function Page() {
  return <IndustriesPage region={region} />;
}
