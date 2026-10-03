"use client";

import {
  createWalletClient,
  custom,
  encodeFunctionData,
  erc20Abi,
  keccak256,
  numberToHex,
  parseUnits,
  toHex,
  type Address,
  type EIP1193Provider,
  type Hex,
} from "viem";
import { memoAbi } from "./memoAbi";
import { setoffAbi } from "./setoffAbi";
import { MEMO, net } from "./config";
import { client, NOTE_KEY_ID } from "./data";
import { bytesToHex, KEY_MESSAGE, keysFromSignature } from "./private-notes";
import { iouDomain, iouTypes, type Invoice, type IOU } from "./invoice";
import { identityAbi, registrationURI } from "./identity";

export const MULTICALL3_FROM: Address = "0x522fAf9A91c41c443c66765030741e4AaCe147D0";
const aggregate3Abi = [
  {
    type: "function",
    name: "aggregate3",
    stateMutability: "payable",
    inputs: [
      {
        name: "calls",
        type: "tuple[]",
        components: [
          { name: "target", type: "address" },
          { name: "allowFailure", type: "bool" },
          { name: "callData", type: "bytes" },
        ],
      },
    ],
    outputs: [
      {
        name: "returnData",
        type: "tuple[]",
        components: [
          { name: "success", type: "bool" },
          { name: "returnData", type: "bytes" },
        ],
      },
    ],
  },
] as const;

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

export function hasWallet() {
  return typeof window !== "undefined" && !!window.ethereum;
}

/** The wallet the user picked in the connect dialog; falls back to the injected default. */
let selected: EIP1193Provider | undefined;
export const setProvider = (p: EIP1193Provider | undefined) => {
  selected = p;
};
export const currentProvider = () => selected ?? (typeof window !== "undefined" ? window.ethereum : undefined);

function provider() {
  const p = currentProvider();
  if (!p) throw new Error("No wallet found. Install MetaMask or another browser wallet.");
  return p;
}

export async function chainId(): Promise<number> {
  return Number(await provider().request({ method: "eth_chainId" }));
}

/** Already-authorised account, without prompting (for reconnect on reload). */
export async function silentAccount(p: EIP1193Provider): Promise<Address | undefined> {
  const accounts = (await p.request({ method: "eth_accounts" })) as Address[];
  return accounts[0];
}

/** Best effort: wallets that support it forget this site's permission. */
export async function revoke() {
  try {
    await provider().request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] } as never);
  } catch {
    // Not supported everywhere; local disconnect still applies.
  }
}

export async function ensureChain() {
  const p = provider();
  const id = numberToHex(net.chain.id);
  try {
    await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: id }] });
  } catch (e) {
    // 4902: chain not added yet.
    if ((e as { code?: number }).code !== 4902) throw e;
    await p.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: id,
          chainName: net.name,
          nativeCurrency: net.chain.nativeCurrency,
          rpcUrls: [net.rpc],
          blockExplorerUrls: [net.explorer],
        },
      ],
    });
  }
}

export async function connect(): Promise<Address> {
  const [account] = await provider().request({ method: "eth_requestAccounts" });
  if (!account) throw new Error("Wallet returned no account");
  await ensureChain();
  return account;
}

async function wallet(account: Address) {
  await ensureChain();
  return createWalletClient({ account, chain: net.chain, transport: custom(provider()) });
}

async function confirm(hash: Hex) {
  const r = await client.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error("Transaction reverted");
  return hash;
}

/** Approve + deposit in one transaction via Arc's Multicall3From (keeps you as msg.sender). */
export async function deposit(account: Address, token: Address, amount: string) {
  const value = parseUnits(amount, 6);
  const w = await wallet(account);
  const hash = await w.writeContract({
    address: MULTICALL3_FROM,
    abi: aggregate3Abi,
    functionName: "aggregate3",
    args: [
      [
        { target: token, allowFailure: false, callData: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [net.setoff, value] }) },
        { target: net.setoff, allowFailure: false, callData: encodeFunctionData({ abi: setoffAbi, functionName: "deposit", args: [token, value] }) },
      ],
    ],
  });
  return confirm(hash);
}

export async function withdraw(account: Address, token: Address, amount: bigint) {
  const w = await wallet(account);
  return confirm(await w.writeContract({ address: net.setoff, abi: setoffAbi, functionName: "withdraw", args: [token, amount] }));
}

export async function cancel(account: Address, id: Hex) {
  const w = await wallet(account);
  return confirm(await w.writeContract({ address: net.setoff, abi: setoffAbi, functionName: "cancel", args: [id] }));
}

/** Record an IOU you owe. Goes through Arc's Memo contract so the note is stored onchain with it. */
export async function recordIOU(
  account: Address,
  input: { creditor: Address; token: Address; amount: string; days: number; note: string },
) {
  const { timestamp } = await client.getBlock();
  const nonce = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
  const ref = keccak256(toHex(`${account}:${input.creditor}:${nonce}`));
  const iou = {
    debtor: account,
    creditor: input.creditor,
    token: input.token,
    amount: parseUnits(input.amount, 6),
    deadline: timestamp + BigInt(input.days) * 86_400n,
    nonce,
    ref,
  };
  const data = encodeFunctionData({ abi: setoffAbi, functionName: "submit", args: [iou, "0x"] });
  const w = await wallet(account);
  return confirm(
    await w.writeContract({ address: MEMO, abi: memoAbi, functionName: "memo", args: [net.setoff, data, ref, toHex(input.note)] }),
  );
}

export async function balances(account: Address, tokens: Address[]) {
  const [deposits, held] = await Promise.all([
    Promise.all(tokens.map((t) => client.readContract({ address: net.setoff, abi: setoffAbi, functionName: "balanceOf", args: [account, t] }))),
    Promise.all(tokens.map((t) => client.readContract({ address: t, abi: erc20Abi, functionName: "balanceOf", args: [account] }))),
  ]);
  return tokens.map((token, i) => ({ token, deposit: deposits[i]!, wallet: held[i]! }));
}

/** Debtor approves an invoice: an EIP-712 signature, free and gasless. */
export async function signInvoice(account: Address, iou: IOU): Promise<Hex> {
  const w = await wallet(account);
  return w.signTypedData({ account, domain: iouDomain(), types: iouTypes, primaryType: "IOU", message: iou });
}

/**
 * Post a debtor-signed IOU to the pool. Anyone can do it — usually the creditor — and it
 * goes through Memo so the invoice note is stored onchain with it.
 */
export async function postInvoice(account: Address, inv: Invoice) {
  if (!inv.sig) throw new Error("Invoice is not approved yet");
  const data = encodeFunctionData({ abi: setoffAbi, functionName: "submit", args: [inv.iou, inv.sig] });
  const args = [net.setoff, data, inv.iou.ref, toHex(inv.note)] as const;
  await client.simulateContract({ account, address: MEMO, abi: memoAbi, functionName: "memo", args });
  const w = await wallet(account);
  return confirm(await w.writeContract({ address: MEMO, abi: memoAbi, functionName: "memo", args }));
}

export async function iouStatus(iou: IOU) {
  const id = await client.readContract({ address: net.setoff, abi: setoffAbi, functionName: "hashIOU", args: [iou] });
  const [, status, cycle, paid] = await client.readContract({ address: net.setoff, abi: setoffAbi, functionName: "getIOU", args: [id] });
  return { id, status: (["none", "pending", "settled", "cancelled", "disputed"] as const)[status] ?? "none", cycle, paid };
}

/** Register an ERC-8004 identity so the dashboard shows a name instead of an address. */
export async function registerName(account: Address, name: string) {
  const w = await wallet(account);
  return confirm(
    await w.writeContract({ address: net.identityRegistry, abi: identityAbi, functionName: "register", args: [registrationURI(name)] }),
  );
}

/** Derive this wallet's private-note keys from a free signature over a fixed message. */
export async function deriveNoteKeys(account: Address) {
  const w = await wallet(account);
  const signature = await w.signMessage({ account, message: KEY_MESSAGE });
  return keysFromSignature(signature);
}

/**
 * Publish the public half through Memo so others can encrypt notes to you. Memo needs a
 * call to wrap, so it wraps a harmless read of Setoff's token list.
 */
export async function publishNoteKey(account: Address, publicKey: Uint8Array) {
  const data = encodeFunctionData({ abi: setoffAbi, functionName: "tokens" });
  const w = await wallet(account);
  return confirm(
    await w.writeContract({ address: MEMO, abi: memoAbi, functionName: "memo", args: [net.setoff, data, NOTE_KEY_ID, bytesToHex(publicKey)] }),
  );
}

// ---------------------------------------------------------------- disputes & credit

/** Freeze an open bill while you and the other party agree on what's owed. */
export async function disputeBill(account: Address, id: Hex) {
  const w = await wallet(account);
  return confirm(await w.writeContract({ address: net.setoff, abi: setoffAbi, functionName: "dispute", args: [id] }));
}

/** Propose what's still owed on a disputed bill; when both sides match, it reopens (0 cancels). */
export async function offerAmount(account: Address, id: Hex, remaining: bigint) {
  const w = await wallet(account);
  return confirm(await w.writeContract({ address: net.setoff, abi: setoffAbi, functionName: "offer", args: [id, remaining] }));
}

/** Let `borrower` overdraw up to `limit` in cycles, funded from your deposit. 0 stops new draws. */
export async function setCreditLine(account: Address, borrower: Address, token: Address, limit: bigint) {
  const w = await wallet(account);
  return confirm(await w.writeContract({ address: net.setoff, abi: setoffAbi, functionName: "setCreditLine", args: [borrower, token, limit] }));
}

/** Repay a lender from your Setoff balance. */
export async function repayCredit(account: Address, lender: Address, token: Address, amount: bigint) {
  const w = await wallet(account);
  return confirm(await w.writeContract({ address: net.setoff, abi: setoffAbi, functionName: "repay", args: [lender, token, amount] }));
}

/** Opt in (minRate > 0) or out (0) of converting your leftover `sell` into `buy` in cycles. */
export async function setFxPreference(account: Address, sell: Address, buy: Address, minRate: bigint) {
  const w = await wallet(account);
  return confirm(await w.writeContract({ address: net.setoff, abi: setoffAbi, functionName: "setFxPreference", args: [sell, buy, minRate] }));
}

/** Reference USDC per EURC (ECB rate via frankfurter.dev), or null if unavailable. */
export async function referenceRate(): Promise<number | null> {
  try {
    const r = (await (await fetch("https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD")).json()) as { rates?: { USD?: number } };
    return r.rates?.USD ?? null;
  } catch {
    return null;
  }
}
