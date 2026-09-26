import type { Metadata } from "next";
import { notFound } from "next/navigation";
import IndustryPage from "@/components/pages/IndustryPage";
import { getIndustry, INDUSTRY_SLUGS } from "@/lib/industries";
import { REGIONS } from "@/lib/region";
import { industryMetadata } from "@/lib/seo";

const region = REGIONS.pk;

export const dynamicParams = false;

export function generateStaticParams() {
  return INDUSTRY_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const industry = getIndustry(region, slug);
  return industry ? industryMetadata(region, slug, industry.seoTitle, industry.seoDescription) : {};
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const industry = getIndustry(region, slug);
  if (!industry) notFound();
  return <IndustryPage region={region} industry={industry} />;
}
