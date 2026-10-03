import type { Metadata } from "next";
import { CreditPage } from "@/components/app/pages";

export const metadata: Metadata = { title: "Credit" };

export default function Page() {
  return <CreditPage />;
}
