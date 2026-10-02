import type { Metadata } from "next";
import { C, Callout, Code, DocTitle, H2, P, Table } from "@/components/docs/ui";
import { net } from "@/lib/config";

export const metadata: Metadata = { title: "Run & deploy" };

export default function Page() {
  return (
    <>
      <DocTitle eyebrow="Developers" title="Run & deploy" lead="Run the whole stack on your machine in two commands, with Arc's real contracts and free funds." />
      <H2 id="local">Run it locally</H2>
      <P>
        You need <a className="text-primary hover:underline" href="https://docs.arc.io/arc/tutorials/install-arc-foundry" target="_blank" rel="noreferrer">Arc Foundry</a>{" "}
        (<C>arc-forge</C>, <C>arc-cast</C>, <C>arc-anvil</C>) and Node 20+.
      </P>
      <Code lang="bash">{`
git clone --recursive https://github.com/Anshv784/setoff && cd setoff
./scripts/local.sh                    # fork Arc Testnet, deploy, seed 25 bills, settle a cycle
cd web && npm install && npm run dev  # http://localhost:3000
`}</Code>
      <P>
        <C>local.sh</C> runs <C>arc-anvil</C> as a fork of Arc Testnet, so Arc&apos;s real USDC, EURC, Memo, Multicall3From and ERC-8004 registry
        exist locally. It writes throwaway keys to <C>.local.env</C>, including a funded test wallet to import into your browser wallet (RPC{" "}
        <C>http://127.0.0.1:8545</C>, chain id <C>5042002</C>).
      </P>
      <Code lang="bash">{`
cd solver && set -a && . ../.local.env && set +a
npm run demo:seed -- 20   # 20 more bills; net debtors fund their shortfall
npm run solve             # settle the next cycle
`}</Code>
      <H2 id="tests">Tests</H2>
      <Code lang="bash">{`
cd contracts && arc-forge test   # 22 tests: unit, fuzz, invariants
cd solver && npm test            # 8 tests, including the brute-force comparison
`}</Code>
      <H2 id="deploy">Deploy</H2>
      <Code lang="bash">{`
cd contracts
arc-forge script script/Deploy.s.sol --rpc-url arc --broadcast --private-key $PK
`}</Code>
      <P>
        Then set the address and deploy block in <C>solver/src/config.ts</C> and <C>web/lib/config.ts</C>, build the site with{" "}
        <C>NEXT_PUBLIC_SETOFF_NETWORK=mainnet</C>, and run the solver on a schedule.
      </P>
      <H2 id="addresses">Addresses</H2>
      <Table
        head={["Contract", "Address"]}
        rows={[
          [`Setoff (${net.name})`, <C key="s">{net.setoff}</C>],
          ["USDC", <C key="u">0x3600000000000000000000000000000000000000</C>],
          ["EURC", <C key="e">{net.eurc}</C>],
          ["Memo", <C key="m">0x5294E9927c3306DcBaDb03fe70b92e01cCede505</C>],
          ["Multicall3From", <C key="c">0x522fAf9A91c41c443c66765030741e4AaCe147D0</C>],
          ["ERC-8004 IdentityRegistry", <C key="i">{net.identityRegistry}</C>],
        ]}
      />
      <Callout title="Network switch">
        One setting chooses the network for the site: <C>NEXT_PUBLIC_SETOFF_NETWORK</C> = <C>local</C>, <C>testnet</C> or <C>mainnet</C>.
      </Callout>
    </>
  );
}
