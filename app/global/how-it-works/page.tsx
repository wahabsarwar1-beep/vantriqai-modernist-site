import type { Metadata } from "next";
import HowItWorksPage from "@/components/pages/HowItWorksPage";
import { REGIONS } from "@/lib/region";
import { regionMetadata } from "@/lib/seo";

const region = REGIONS.global;

export const metadata: Metadata = regionMetadata(
  region,
  "/how-it-works",
  "How it works — VantriqAI Global",
  "From a fifteen-minute discovery call to an agent answering every hour: how a VantriqAI deployment is scoped, built and tuned.",
);

export default function Page() {
  return <HowItWorksPage region={region} />;
}
