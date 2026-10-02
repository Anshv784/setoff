import type { Metadata } from "next";
import { WalletPage } from "@/components/app/pages";

export const metadata: Metadata = { title: "Wallet" };

export default function Page() {
  return <WalletPage />;
}
