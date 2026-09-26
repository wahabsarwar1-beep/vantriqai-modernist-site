import type { Metadata } from "next";
import IndustriesPage from "@/components/pages/IndustriesPage";
import { REGIONS } from "@/lib/region";
import { regionMetadata } from "@/lib/seo";

const region = REGIONS.global;

export const metadata: Metadata = regionMetadata(
  region,
  "/industries",
  "Industries — VantriqAI Global",
  "The same core agent, tuned to the workflow of each sector — retail, real estate, healthcare, education, hospitality and more.",
);

export default function Page() {
  return <IndustriesPage region={region} />;
}
