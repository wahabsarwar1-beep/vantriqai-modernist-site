import type { Metadata } from "next";
import HomePage from "@/components/pages/HomePage";
import { REGIONS } from "@/lib/region";
import { regionMetadata } from "@/lib/seo";

const region = REGIONS.global;

export const metadata: Metadata = regionMetadata(
  region,
  "/",
  "VantriqAI Global — Where Business Meets Intelligence",
  "AI agents that reply, qualify and book on WhatsApp, Instagram and your website — 24 hours a day, in seconds, at any volume.",
);

export default function Page() {
  return <HomePage region={region} />;
}
