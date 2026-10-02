"use client";

import { useEffect, useState } from "react";
import type { EIP1193Provider } from "viem";

/** A wallet announced via EIP-6963 (multi-wallet discovery). */
export type WalletOption = { id: string; name: string; icon?: string; rdns?: string; provider: EIP1193Provider };

type Announce = CustomEvent<{ info: { uuid: string; name: string; icon: string; rdns: string }; provider: EIP1193Provider }>;

export function useInjectedWallets() {
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const found = new Map<string, WalletOption>();
    const onAnnounce = (e: Event) => {
      const { info, provider } = (e as Announce).detail;
      found.set(info.rdns || info.uuid, { id: info.rdns || info.uuid, name: info.name, icon: info.icon, rdns: info.rdns, provider });
      setWallets([...found.values()]);
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    // Wallets that predate EIP-6963 only expose window.ethereum.
    const t = setTimeout(() => {
      if (found.size === 0 && window.ethereum) {
        found.set("injected", { id: "injected", name: "Browser wallet", provider: window.ethereum });
        setWallets([...found.values()]);
      }
      setReady(true);
    }, 400);
    return () => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      clearTimeout(t);
    };
  }, []);
  return { wallets, ready };
}
