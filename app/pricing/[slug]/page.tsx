import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PackagePage from "@/components/pages/PackagePage";
import { getPackage, PACKAGE_SLUGS } from "@/lib/packages";
import { REGIONS } from "@/lib/region";
import { packageMetadata } from "@/lib/seo";

const region = REGIONS.pk;

export const dynamicParams = false;

export function generateStaticParams() {
  return PACKAGE_SLUGS().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const pkg = getPackage(slug);
  return pkg ? packageMetadata(region, slug, pkg.name, pkg.audience, pkg.lede) : {};
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pkg = getPackage(slug);
  if (!pkg) notFound();
  return <PackagePage region={region} pkg={pkg} />;
}
