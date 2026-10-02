import { arc, arcTestnet } from "viem/chains";
import { defineChain, type Address, type Chain } from "viem";

export const USDC: Address = "0x3600000000000000000000000000000000000000";
export const MEMO: Address = "0x5294E9927c3306DcBaDb03fe70b92e01cCede505";
export const MULTICALL3_FROM: Address = "0x522fAf9A91c41c443c66765030741e4AaCe147D0";

export type Network = {
  chain: Chain;
  rpc: string;
  explorer: string;
  setoff: Address;
  deployBlock: bigint;
  eurc: Address;
};

// A local arc-anvil fork of Arc Testnet: real USDC/EURC/Memo/Multicall3From, free funds.
const local: Network = {
  chain: defineChain({ ...arcTestnet, rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } } }),
  rpc: "http://127.0.0.1:8545",
  explorer: "https://explorer.testnet.arc.io",
  setoff: (process.env.SETOFF_ADDRESS ?? "0x0000000000000000000000000000000000000000") as Address,
  deployBlock: BigInt(process.env.SETOFF_DEPLOY_BLOCK ?? "0"),
  eurc: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
};

export const networks = {
  local,
  testnet: {
    // viem's arcTestnet still lists the old arc.network hosts.
    chain: defineChain({ ...arcTestnet, rpcUrls: { default: { http: ["https://rpc.testnet.arc.io"] } } }),
    rpc: "https://rpc.testnet.arc.io",
    explorer: "https://explorer.testnet.arc.io",
    setoff: "0x93084E5f70E48682ceFAF7041Acca4B0635962cE",
    deployBlock: 65085992n,
    eurc: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
  },
  mainnet: {
    chain: arc,
    rpc: "https://rpc.mainnet.arc.io",
    explorer: "https://explorer.arc.io",
    setoff: "0x0000000000000000000000000000000000000000", // set after mainnet deploy
    deployBlock: 0n,
    eurc: "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1",
  },
} satisfies Record<string, Network>;

export function network(): Network {
  const name = (process.env.SETOFF_NETWORK ?? "testnet") as keyof typeof networks;
  const net = networks[name];
  if (!net) throw new Error(`unknown SETOFF_NETWORK ${name}`);
  if (BigInt(net.setoff) === 0n) throw new Error(`Setoff not deployed on ${name} yet`);
  return net;
}

/** Arc RPCs cap eth_getLogs at 10,000 blocks per call. */
export const LOG_RANGE = 10_000n;
