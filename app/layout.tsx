import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import Nav from "@/components/Nav";
import ScrollReveal from "@/components/ScrollReveal";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "600", "800"],
});

export const metadata: Metadata = {
  title: "VentriqAI — WhatsApp AI agents for Pakistani SMEs",
  description:
    "AI agents that reply, qualify, and book — 24 hours a day. On WhatsApp, Instagram, and your website, in seconds, at any volume.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={archivo.variable}>
      <body>
        <Nav />
        {children}
        <ScrollReveal />
      </body>
    </html>
  );
}
