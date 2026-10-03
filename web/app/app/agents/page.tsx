import type { Metadata } from "next";
import { AgentsPage } from "@/components/app/pages";

export const metadata: Metadata = { title: "Agents" };

export default function Page() {
  return <AgentsPage />;
}
