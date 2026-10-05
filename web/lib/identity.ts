import { getAbiItem, type Address } from "viem";
import { net } from "./config";
import { client, indexedRegistry, logsClient, logsInWindows, seedLogs } from "./data";

/** ERC-8004 IdentityRegistry: each identity is an NFT whose tokenURI is a registration file. */
export const identityAbi = [
  { type: "function", name: "register", stateMutability: "nonpayable", inputs: [{ name: "agentURI", type: "string" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "ownerOf", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "address" }] },
  { type: "function", name: "tokenURI", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "string" }] },
  {
    type: "event",
    name: "Registered",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "agentURI", type: "string", indexed: false },
      { name: "owner", type: "address", indexed: true },
    ],
  },
] as const;

export type Identity = { agentId: bigint; name: string };


/** The registration file, stored inline as a data: URI so nothing needs hosting. */
export function registrationURI(name: string) {
  const file = {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name,
    description: "Setoff participant",
  };
  return `data:application/json;base64,${btoa(unescape(encodeURIComponent(JSON.stringify(file))))}`;
}

function parseName(uri: string): string | undefined {
  const m = uri.match(/^data:application\/json(?:;charset=[^;,]+)?;base64,(.*)$/);
  if (!m) return undefined;
  try {
    const name = JSON.parse(decodeURIComponent(escape(atob(m[1]!)))).name;
    return typeof name === "string" && name.trim() ? name.trim().slice(0, 48) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * ERC-8004 names for the given addresses. Scans `Registered` events from Setoff's deploy
 * block (identities made for Setoff come after it), takes each owner's latest identity,
 * and confirms it is still theirs before trusting the name.
 */
export async function loadIdentities(addresses: Address[], head: bigint): Promise<Map<string, Identity>> {
  const out = new Map<string, Identity>();
  if (addresses.length === 0) return out;
  const event = getAbiItem({ abi: identityAbi, name: "Registered" });
  const latest = new Map<string, bigint>();
  const key = `identity:${addresses.map((a) => a.toLowerCase()).sort().join(",")}`;
  if (indexedRegistry) {
    const want = new Set(addresses.map((a) => a.toLowerCase()));
    seedLogs(key, indexedRegistry.to, indexedRegistry.rows.filter((r) => want.has(r.owner.toLowerCase())).map((r) => ({ args: r })));
  }
  const logs = await logsInWindows(key, (fromBlock, toBlock) => logsClient.getLogs({ address: net.identityRegistry, event, args: { owner: addresses }, fromBlock, toBlock }), head);
  for (const l of logs) if (l.args.owner && l.args.agentId !== undefined) latest.set(l.args.owner.toLowerCase(), l.args.agentId);
  await Promise.all(
    [...latest].map(async ([owner, agentId]) => {
      const [current, uri] = await Promise.all([
        client.readContract({ address: net.identityRegistry, abi: identityAbi, functionName: "ownerOf", args: [agentId] }),
        client.readContract({ address: net.identityRegistry, abi: identityAbi, functionName: "tokenURI", args: [agentId] }),
      ]);
      const name = parseName(uri);
      if (name && current.toLowerCase() === owner) out.set(owner, { agentId, name });
    }),
  );
  return out;
}
