"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Address, EIP1193Provider } from "viem";
import { net } from "@/lib/config";
import { loadSnapshot, type Snapshot } from "@/lib/data";
import * as w from "@/lib/wallet";
import { useInjectedWallets, type WalletOption } from "@/lib/wallets";
import { bytesToHex, type NoteKeys } from "@/lib/private-notes";

const REFRESH_MS = 20_000;
const REMEMBER_KEY = "setoff.wallet";

type AppState = {
  snapshot?: Snapshot;
  error?: string;
  reload: () => void;
  account?: Address;
  wallet?: WalletOption;
  /** False when the wallet is on another chain. */
  onArc: boolean;
  wallets: WalletOption[];
  walletsReady: boolean;
  connectOpen: boolean;
  setConnectOpen: (open: boolean) => void;
  /** Opens the connect dialog. */
  connect: () => void;
  connectWith: (wallet: WalletOption) => Promise<void>;
  switchToArc: () => Promise<void>;
  disconnect: () => void;
  /** This wallet's private-note keys, held in memory for the session only. */
  noteKeys?: NoteKeys;
  /** Free signature → keys. Returns false if they don't match the key this wallet published. */
  unlockNotes: () => Promise<boolean>;
  /** Free signature + one tiny transaction publishing the public key. */
  enableNotes: () => Promise<void>;
};

const Ctx = createContext<AppState | null>(null);

function remember(id?: string) {
  try {
    if (id) localStorage.setItem(REMEMBER_KEY, id);
    else localStorage.removeItem(REMEMBER_KEY);
  } catch {
    // Storage can be unavailable (private mode); reconnect just won't be remembered.
  }
}
function remembered() {
  try {
    return localStorage.getItem(REMEMBER_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Chain snapshot and connected wallet, shared by every page under /app. */
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [error, setError] = useState<string>();
  const [account, setAccount] = useState<Address>();
  const [wallet, setWallet] = useState<WalletOption>();
  const [onArc, setOnArc] = useState(true);
  const [connectOpen, setConnectOpen] = useState(false);
  const [noteKeys, setNoteKeys] = useState<NoteKeys>();
  const { wallets, ready: walletsReady } = useInjectedWallets();

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

  const adopt = useCallback(async (option: WalletOption, addr: Address) => {
    w.setProvider(option.provider);
    setWallet(option);
    setAccount(addr);
    setOnArc((await w.chainId()) === net.chain.id);
    remember(option.id);
  }, []);

  // Reconnect silently to the wallet used last time, if it still authorises this site.
  useEffect(() => {
    if (!walletsReady || account) return;
    const id = remembered();
    const option = wallets.find((x) => x.id === id);
    if (!option) return;
    w.silentAccount(option.provider)
      .then((addr) => addr && adopt(option, addr))
      .catch(() => {});
  }, [walletsReady, wallets, account, adopt]);

  // Follow account and network changes in the connected wallet.
  useEffect(() => {
    const p = wallet?.provider as (EIP1193Provider & { removeListener?: EIP1193Provider["removeListener"] }) | undefined;
    if (!p?.on) return;
    const onAccounts = (accs: string[]) => {
      setNoteKeys(undefined);
      if (accs[0]) setAccount(accs[0] as Address);
      else {
        setAccount(undefined);
        setWallet(undefined);
        remember(undefined);
      }
    };
    const onChain = (id: string) => setOnArc(Number(id) === net.chain.id);
    p.on("accountsChanged", onAccounts as never);
    p.on("chainChanged", onChain as never);
    return () => {
      p.removeListener?.("accountsChanged", onAccounts as never);
      p.removeListener?.("chainChanged", onChain as never);
    };
  }, [wallet]);

  const connectWith = useCallback(
    async (option: WalletOption) => {
      w.setProvider(option.provider);
      const addr = await w.connect();
      await adopt(option, addr);
    },
    [adopt],
  );

  const switchToArc = useCallback(async () => {
    await w.ensureChain();
    setOnArc((await w.chainId()) === net.chain.id);
  }, []);

  const unlockNotes = useCallback(async () => {
    if (!account) return false;
    const keys = await w.deriveNoteKeys(account);
    const published = snapshot?.noteKeys[account.toLowerCase()];
    // A wallet with non-deterministic signatures would derive a different key; refuse it.
    if (published && published.toLowerCase() !== bytesToHex(keys.publicKey)) return false;
    setNoteKeys(keys);
    return true;
  }, [account, snapshot]);

  const enableNotes = useCallback(async () => {
    if (!account) return;
    const keys = await w.deriveNoteKeys(account);
    await w.publishNoteKey(account, keys.publicKey);
    setNoteKeys(keys);
    reload();
  }, [account, reload]);

  const disconnect = useCallback(() => {
    void w.revoke();
    w.setProvider(undefined);
    setNoteKeys(undefined);
    setAccount(undefined);
    setWallet(undefined);
    remember(undefined);
  }, []);

  const connect = useCallback(() => setConnectOpen(true), []);

  return (
    <Ctx.Provider
      value={{
        snapshot,
        error,
        reload,
        account,
        wallet,
        onArc,
        wallets,
        walletsReady,
        connectOpen,
        setConnectOpen,
        connect,
        connectWith,
        switchToArc,
        disconnect,
        noteKeys,
        unlockNotes,
        enableNotes,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppProvider");
  return v;
}
