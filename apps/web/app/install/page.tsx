import type { Metadata } from "next";
import { InstallPageClient } from "./install-page-client";

export const metadata: Metadata = {
  title: "Install StairDoc | PWA",
  description: "Install StairDoc on your device for the best mobile experience.",
};

export default function InstallPage() {
  return <InstallPageClient />;
}
