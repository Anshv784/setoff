"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Address } from "viem";
import { toast } from "sonner";
import { loadSnapshot, type Snapshot } from "@/lib/data";
import { connect as connectWallet } from "@/lib/wallet";
import { errorText } from "@/components/setoff/tx";

const REFRESH_MS = 20_000;

type AppState = {
  snapshot?: Snapshot;
  error?: string;
  reload: () => void;
  account?: Address;
  connect: () => void;
};

const Ctx = createContext<AppState | null>(null);

/** Chain snapshot and connected wallet, shared by every page under /app. */
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [error, setError] = useState<string>();
  const [account, setAccount] = useState<Address>();

  const reload = useCallback(() => {
    loadSnapshot()
      .then((s) => {
        setSnapshot(s);
        setError(undefined);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    reload();
    const t = setInterval(reload, REFRESH_MS);
    return () => clearInterval(t);
  }, [reload]);

  // Follow account switches in the wallet without a reload.
  useEffect(() => {
    const eth = typeof window !== "undefined" ? window.ethereum : undefined;
    if (!eth?.on) return;
    const onAccounts = (accs: string[]) => setAccount(accs[0] as Address | undefined);
    eth.on("accountsChanged", onAccounts as never);
    return () => eth.removeListener?.("accountsChanged", onAccounts as never);
  }, []);

  const connect = useCallback(() => {
    connectWallet()
      .then(setAccount)
      .catch((e) => toast.error(errorText(e)));
  }, []);

  return <Ctx.Provider value={{ snapshot, error, reload, account, connect }}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppProvider");
  return v;
}
