import { arc, arcTestnet } from "viem/chains";
import { defineChain, type Address, type Chain } from "viem";
import testnetLabels from "./labels.testnet.json";

export const USDC: Address = "0x3600000000000000000000000000000000000000";
export const MEMO: Address = "0x5294E9927c3306DcBaDb03fe70b92e01cCede505";

type Network = {
  name: string;
  chain: Chain;
  rpc: string;
  explorer: string;
  setoff: Address;
  deployBlock: bigint;
  eurc: Address;
  labels: Record<string, string>;
  identityRegistry: Address;
  /** Local fork: transactions exist only on this machine, so there is no explorer to link to. */
  local?: boolean;
};

const networks: Record<string, Network> = {
  // `scripts/local.sh` runs an arc-anvil fork of Arc Testnet and writes these to web/.env.local.
  local: {
    name: "Local fork",
    chain: defineChain({ ...arcTestnet, rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } } }),
    rpc: "http://127.0.0.1:8545",
    explorer: "https://explorer.testnet.arc.io",
    setoff: (process.env.NEXT_PUBLIC_SETOFF_ADDRESS ?? "0x0000000000000000000000000000000000000000") as Address,
    deployBlock: BigInt(process.env.NEXT_PUBLIC_SETOFF_DEPLOY_BLOCK ?? "0"),
    eurc: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
    labels: JSON.parse(process.env.NEXT_PUBLIC_SETOFF_LABELS ?? "{}"),
    identityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    local: true,
  },
  testnet: {
    name: "Arc Testnet",
    chain: defineChain({ ...arcTestnet, rpcUrls: { default: { http: ["https://rpc.testnet.arc.io"] } } }),
    rpc: "https://rpc.testnet.arc.io",
    explorer: "https://explorer.testnet.arc.io",
    setoff: "0x78eDa3AB8eF56c4E9D96458b72f26a3a216298Ac",
    deployBlock: 65240552n,
    eurc: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
    labels: testnetLabels,
    identityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  },
  mainnet: {
    name: "Arc Mainnet",
    chain: arc,
    rpc: "https://rpc.mainnet.arc.io",
    explorer: "https://explorer.arc.io",
    setoff: "0x0000000000000000000000000000000000000000",
    deployBlock: 0n,
    eurc: "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1",
    labels: {},
    identityRegistry: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
  },
};

export const net: Network = networks[process.env.NEXT_PUBLIC_SETOFF_NETWORK ?? "testnet"]!;

export const tokenSymbol = (token: string) => (token.toLowerCase() === USDC.toLowerCase() ? "USDC" : "EURC");
/** ERC-8004 names, filled in by `loadSnapshot`. They take precedence over demo labels. */
export const identities = new Map<string, { agentId: bigint; name: string }>();

export function labelOf(address: string): { name: string; agentId?: bigint } | undefined {
  const id = identities.get(address.toLowerCase());
  if (id) return id;
  const demo = net.labels[address.toLowerCase()];
  return demo ? { name: demo } : undefined;
}
