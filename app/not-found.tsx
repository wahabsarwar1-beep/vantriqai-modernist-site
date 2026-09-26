import type { Metadata } from "next";
import NotFoundStage from "@/components/NotFoundStage";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

export default function NotFound() {
  return <NotFoundStage />;
}
