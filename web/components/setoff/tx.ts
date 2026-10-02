"use client";

import { useState } from "react";
import { toast } from "sonner";
import { net } from "@/lib/config";

export function errorText(e: unknown) {
  const err = e as { shortMessage?: string; message?: string; code?: number };
  if (err.code === 4001) return "Request rejected in wallet";
  return err.shortMessage ?? err.message ?? "Something went wrong";
}

/** Runs a wallet action with loading/success/error toasts and one-at-a-time busy state. */
export function useTx(onDone?: () => void) {
  const [busy, setBusy] = useState<string>();
  async function run(label: string, fn: () => Promise<string>): Promise<boolean> {
    setBusy(label);
    const id = toast.loading(`${label}…`);
    try {
      const hash = await fn();
      toast.success(`${label} confirmed`, {
        id,
        action: net.local ? undefined : { label: "View", onClick: () => window.open(`${net.explorer}/tx/${hash}`, "_blank") },
      });
      onDone?.();
      return true;
    } catch (e) {
      toast.error(errorText(e), { id });
      return false;
    } finally {
      setBusy(undefined);
    }
  }
  return { busy, run };
}
