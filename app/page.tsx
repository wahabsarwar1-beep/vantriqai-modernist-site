import type { Metadata } from "next";
import HomePage from "@/components/pages/HomePage";
import { REGIONS } from "@/lib/region";
import { regionMetadata } from "@/lib/seo";

const region = REGIONS.pk;

export const metadata: Metadata = regionMetadata(region, "/");

export default function Page() {
  return <HomePage region={region} />;
}
