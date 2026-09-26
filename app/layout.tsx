import type { Metadata } from "next";
import { Sora, Manrope } from "next/font/google";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import CustomCursor from "@/components/CustomCursor";
import BackToTop from "@/components/BackToTop";
import ShopAIChat from "@/components/ShopAIChat";
import RouteWipe from "@/components/RouteWipe";
import SmoothScroll from "@/components/SmoothScroll";
import OrganizationSchema from "@/components/OrganizationSchema";
import { SITE_URL } from "@/lib/region";
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE, SITE_NAME } from "@/lib/seo";
import "./globals.css";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  // Every page sets a relative canonical and its hreflang pair; those only
  // resolve to absolute URLs once there is a base to resolve them against.
  metadataBase: new URL(SITE_URL),
  title: {
    default: DEFAULT_TITLE,
    // Pages export the segment alone ("Pricing") and get the brand appended.
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sora.variable} ${manrope.variable}`}>
      <body>
        <OrganizationSchema />
        <SmoothScroll />
        <RouteWipe />
        <CustomCursor />
        <BackToTop />
        <Nav />
        {children}
        <ShopAIChat />
        <Footer />
      </body>
    </html>
  );
}
