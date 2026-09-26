import type { Metadata } from "next";
import ProductsPage from "@/components/pages/ProductsPage";
import { REGIONS } from "@/lib/region";
import { regionMetadata } from "@/lib/seo";

const region = REGIONS.global;

export const metadata: Metadata = regionMetadata(
  region,
  "/products",
  "Products — VantriqAI Global",
  "Three channels, eight capabilities, two ways to deploy. Start with one module and add as volume grows.",
);

export default function Page() {
  return <ProductsPage region={region} />;
}
