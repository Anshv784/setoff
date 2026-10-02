import { keccak256, parseUnits, toHex, type Address, type Hex } from "viem";
import { net } from "./config";

/** The IOU struct exactly as `Setoff.IOU` / its EIP-712 type. */
export type IOU = {
  debtor: Address;
  creditor: Address;
  token: Address;
  amount: bigint;
  deadline: bigint;
  nonce: bigint;
  ref: Hex;
};

/** An invoice travels as a link: the IOU, its note, and once approved, the debtor's signature. */
export type Invoice = { iou: IOU; note: string; sig?: Hex };

export const iouTypes = {
  IOU: [
    { name: "debtor", type: "address" },
    { name: "creditor", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint128" },
    { name: "deadline", type: "uint64" },
    { name: "nonce", type: "uint256" },
    { name: "ref", type: "bytes32" },
  ],
} as const;

export const iouDomain = () => ({ name: "Setoff", version: "1", chainId: net.chain.id, verifyingContract: net.setoff });

export function newIOU(input: {
  debtor: Address;
  creditor: Address;
  token: Address;
  amount: string;
  days: number;
  now: bigint;
}): IOU {
  const nonce = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
  return {
    debtor: input.debtor,
    creditor: input.creditor,
    token: input.token,
    amount: parseUnits(input.amount, 6),
    deadline: input.now + BigInt(input.days) * 86_400n,
    nonce,
    ref: keccak256(toHex(`${input.debtor}:${input.creditor}:${nonce}`)),
  };
}

const b64url = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));

export function encodeInvoice(inv: Invoice): string {
  const { iou } = inv;
  return b64url(
    JSON.stringify({
      d: iou.debtor,
      c: iou.creditor,
      t: iou.token,
      a: iou.amount.toString(),
      e: iou.deadline.toString(),
      n: iou.nonce.toString(),
      r: iou.ref,
      m: inv.note,
      s: inv.sig,
      x: net.setoff, // bind the link to one deployment
    }),
  );
}

export function decodeInvoice(param: string): Invoice {
  const o = JSON.parse(unb64url(param));
  if (String(o.x).toLowerCase() !== net.setoff.toLowerCase()) throw new Error("This invoice is for a different Setoff deployment");
  return {
    iou: {
      debtor: o.d,
      creditor: o.c,
      token: o.t,
      amount: BigInt(o.a),
      deadline: BigInt(o.e),
      nonce: BigInt(o.n),
      ref: o.r,
    },
    note: String(o.m ?? ""),
    sig: o.s,
  };
}

export const invoiceUrl = (inv: Invoice) => `${window.location.origin}${window.location.pathname}?invoice=${encodeInvoice(inv)}`;
