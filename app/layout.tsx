import type { Metadata } from "next";
import { Sora, Manrope } from "next/font/google";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import CustomCursor from "@/components/CustomCursor";
import BackToTop from "@/components/BackToTop";
import ShopAIChat from "@/components/ShopAIChat";
import RouteWipe from "@/components/RouteWipe";
import SmoothScroll from "@/components/SmoothScroll";
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
  title: "VantriqAI — Where Business Meets Intelligence",
  description: "VantriqAI — Where Business Meets Intelligence",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sora.variable} ${manrope.variable}`}>
      <body>
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
