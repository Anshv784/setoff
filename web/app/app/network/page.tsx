import type { Metadata } from "next";
import { NetworkPage } from "@/components/app/pages";

export const metadata: Metadata = { title: "Network" };

export default function Page() {
  return <NetworkPage />;
}
