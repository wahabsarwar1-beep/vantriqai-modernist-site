import type { Metadata } from "next";
import { Manrope, Sora } from "next/font/google";
import Nav from "@/components/Nav";
import Motion from "@/components/Motion";
import RouteWipe from "@/components/RouteWipe";
import ShopAIChat from "@/components/ShopAIChat";
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
  title: "VantriqAI — WhatsApp AI agents for Pakistani SMEs",
  description:
    "AI agents that reply, qualify, and book — 24 hours a day. On WhatsApp, Instagram, and your website, in seconds, at any volume.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sora.variable} ${manrope.variable}`}>
      <body>
        <SmoothScroll />
        <RouteWipe />
        <Nav />
        {children}
        <Motion />
        <ShopAIChat />
      </body>
    </html>
  );
}
