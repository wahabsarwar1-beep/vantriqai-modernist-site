import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ModulePage from "@/components/pages/ModulePage";
import { getModule, MODULE_SLUGS } from "@/lib/modules";
import { REGIONS } from "@/lib/region";
import { moduleMetadata } from "@/lib/seo";

const region = REGIONS.global;

export const dynamicParams = false;

export function generateStaticParams() {
  return MODULE_SLUGS(region).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const m = getModule(region, slug);
  return m ? moduleMetadata(region, slug, m.name, m.body) : {};
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = getModule(region, slug);
  if (!m) notFound();
  return <ModulePage region={region} module={m} />;
}
