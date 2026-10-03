import type { Metadata } from "next";
import { SettingsPage } from "@/components/app/pages";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return <SettingsPage />;
}
