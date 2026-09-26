import type { Metadata } from "next";
import ProductsPage from "@/components/pages/ProductsPage";
import { REGIONS } from "@/lib/region";
import { regionMetadata } from "@/lib/seo";

const region = REGIONS.global;

export const metadata: Metadata = regionMetadata(region, "/products");

export default function Page() {
  return <ProductsPage region={region} />;
}
