/**
 * Hand-built SVG diagrams for the docs. Colours come from the theme tokens so they
 * match the site; every diagram has a text equivalent in the surrounding prose.
 */

const T = {
  fg: "var(--foreground)",
  muted: "var(--muted-foreground)",
  border: "var(--border)",
  card: "var(--card)",
  bg: "var(--background)",
  accent: "var(--primary)",
};

function Defs() {
  return (
    <defs>
      <marker id="d-arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto">
        <path d="M0,1 L9,5 L0,9 z" fill={T.muted} />
      </marker>
      <marker id="d-arrow-accent" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto">
        <path d="M0,1 L9,5 L0,9 z" fill={T.accent} />
      </marker>
    </defs>
  );
}

function Box({
  x,
  y,
  w,
  h,
  title,
  sub,
  accent,
  mono,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  sub?: string;
  accent?: boolean;
  mono?: boolean;
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={10} fill={T.card} stroke={accent ? T.accent : T.border} strokeWidth={accent ? 1.5 : 1} />
      <text x={x + 14} y={y + (sub ? 24 : h / 2 + 5)} fontSize={13} fontWeight={600} fill={T.fg}>
        {title}
      </text>
      {sub && (
        <text x={x + 14} y={y + 43} fontSize={11} fill={T.muted} className={mono ? "font-mono" : undefined}>
          {sub}
        </text>
      )}
    </g>
  );
}

function Step({ x, y, n }: { x: number; y: number; n: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={10} fill={T.accent} />
      <text x={x} y={y + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--primary-foreground)">
        {n}
      </text>
    </g>
  );
}

function Label({ x, y, children, anchor = "start" }: { x: number; y: number; children: string; anchor?: "start" | "middle" | "end" }) {
  return (
    <text x={x} y={y} fontSize={11} fill={T.muted} textAnchor={anchor}>
      {children}
    </text>
  );
}

/** Everything in the system and how a bill travels through it. */
export function ArchitectureDiagram() {
  return (
    <svg viewBox="0 0 990 540" className="h-auto w-full min-w-[700px]" role="img" aria-labelledby="arch-t">
      <title id="arch-t">
        Setoff architecture: participants post IOUs through Arc&apos;s Memo contract and deposit through Multicall3From into the Setoff
        contract; an off-chain solver reads the pool and settles cycles through Memo; the dashboard reads events.
      </title>
      <Defs />

      {/* Zones */}
      <text x={20} y={22} fontSize={11} fontWeight={600} fill={T.muted} letterSpacing={1.2}>
        PARTICIPANTS
      </text>
      <rect x={280} y={56} width={480} height={470} rx={18} fill="none" stroke={T.border} strokeDasharray="4 6" />
      <text x={296} y={516} fontSize={11} fontWeight={600} fill={T.muted} letterSpacing={1.2}>
        ARC · ONCHAIN
      </text>
      <text x={800} y={22} fontSize={11} fontWeight={600} fill={T.muted} letterSpacing={1.2}>
        OFF-CHAIN · UNTRUSTED
      </text>

      {/* Participants */}
      <Box x={20} y={100} w={170} h={60} title="Creditor" sub="sends the invoice" />
      <Box x={20} y={300} w={170} h={60} title="Debtor" sub="approves, funds its net" />
      <path d="M105 160 V300" stroke={T.muted} strokeDasharray="4 4" markerEnd="url(#d-arrow)" fill="none" />
      <Step x={105} y={230} n={1} />
      <Label x={122} y={226}>invoice link</Label>
      <Label x={122} y={240}>free signature</Label>

      {/* Arc: transaction extensions */}
      <Box x={300} y={100} w={180} h={60} title="Memo" sub="keeps sender · adds note" />
      <Box x={300} y={300} w={180} h={60} title="Multicall3From" sub="batches, keeps sender" />
      <path d="M190 130 H300" stroke={T.muted} markerEnd="url(#d-arrow)" fill="none" />
      <Step x={245} y={130} n={2} />
      <Label x={245} y={116} anchor="middle">submit + note</Label>
      <path d="M190 330 H300" stroke={T.muted} markerEnd="url(#d-arrow)" fill="none" />
      <Step x={245} y={330} n={3} />
      <Label x={245} y={316} anchor="middle">approve + deposit</Label>

      {/* Setoff contract */}
      <rect x={530} y={90} width={210} height={330} rx={14} fill={T.card} stroke={T.accent} strokeWidth={1.5} />
      <text x={546} y={116} fontSize={14} fontWeight={700} fill={T.fg}>
        Setoff contract
      </text>
      <text x={546} y={134} fontSize={11} fill={T.muted}>
        no owner · no admin key
      </text>
      {[
        { y: 148, t: "IOU pool", s: "pending · settled · cancelled" },
        { y: 236, t: "Deposit ledger", s: "balanceOf[account][token]" },
        { y: 324, t: "settle() verifier", s: "nets sum to 0 · debits ≤ deposits" },
      ].map((c) => (
        <g key={c.t}>
          <rect x={544} y={c.y} width={182} height={72} rx={9} fill={T.bg} stroke={T.border} />
          <text x={558} y={c.y + 30} fontSize={12.5} fontWeight={600} fill={T.fg}>
            {c.t}
          </text>
          <text x={558} y={c.y + 50} fontSize={10.5} fill={T.muted}>
            {c.s}
          </text>
        </g>
      ))}
      <path d="M480 130 C 512 130, 512 184, 544 184" stroke={T.accent} markerEnd="url(#d-arrow-accent)" fill="none" />
      <path d="M480 330 C 512 330, 512 272, 544 272" stroke={T.accent} markerEnd="url(#d-arrow-accent)" fill="none" />

      {/* Tokens and identity */}
      <Box x={300} y={450} w={180} h={60} title="ERC-8004 registry" sub="names for addresses" />
      <Box x={545} y={450} w={180} h={60} title="USDC · EURC" sub="move only on deposit/withdraw" />
      <path d="M635 420 V450" stroke={T.muted} markerEnd="url(#d-arrow)" markerStart="url(#d-arrow)" fill="none" />

      {/* Off-chain */}
      <Box x={800} y={160} w={170} h={64} title="Solver" sub="any wallet · cron job" accent />
      <Box x={800} y={330} w={170} h={64} title="Dashboard" sub="events + ERC-8004 names" />
      <path d="M740 192 H800" stroke={T.muted} strokeDasharray="4 4" markerEnd="url(#d-arrow)" fill="none" />
      <Step x={770} y={192} n={4} />
      <Label x={770} y={178} anchor="middle">read pool</Label>
      <path d="M885 160 V36 H390 V100" stroke={T.accent} strokeWidth={1.5} markerEnd="url(#d-arrow-accent)" fill="none" />
      <Step x={560} y={36} n={5} />
      <text x={578} y={32} fontSize={11} fill={T.fg}>
        memo(settle(ids, parties), cycle summary)
      </text>
      <path d="M740 362 H800" stroke={T.muted} strokeDasharray="4 4" markerEnd="url(#d-arrow)" fill="none" />
      <Step x={770} y={362} n={6} />
      <Label x={770} y={348} anchor="middle">events</Label>
    </svg>
  );
}

/** States an IOU can be in. */
export function LifecycleDiagram() {
  const state = (x: number, y: number, label: string, sub: string, accent?: boolean) => (
    <g>
      <rect x={x} y={y} width={170} height={58} rx={29} fill={T.card} stroke={accent ? T.accent : T.border} strokeWidth={accent ? 1.5 : 1} />
      <text x={x + 85} y={y + 25} textAnchor="middle" fontSize={13} fontWeight={600} fill={T.fg}>
        {label}
      </text>
      <text x={x + 85} y={y + 42} textAnchor="middle" fontSize={10.5} fill={T.muted}>
        {sub}
      </text>
    </g>
  );
  return (
    <svg viewBox="0 0 900 290" className="h-auto w-full min-w-[640px]" role="img" aria-labelledby="life-t">
      <title id="life-t">IOU lifecycle: submitted IOUs are pending; a pending IOU is settled in a cycle, cancelled by either party, or expires at its deadline.</title>
      <Defs />
      {state(20, 116, "Draft", "invoice link, off-chain")}
      {state(290, 116, "Pending", "in the public pool", true)}
      {state(680, 20, "Settled", "in cycle N", true)}
      {state(680, 116, "Cancelled", "by debtor or creditor")}
      {state(680, 212, "Expired", "deadline passed")}
      <path d="M190 145 H290" stroke={T.muted} markerEnd="url(#d-arrow)" fill="none" />
      <Label x={240} y={133} anchor="middle">submit()</Label>
      <Label x={240} y={168} anchor="middle">signed or by debtor</Label>
      <path d="M460 132 C 560 132, 580 49, 680 49" stroke={T.accent} strokeWidth={1.5} markerEnd="url(#d-arrow-accent)" fill="none" />
      <Label x={560} y={78} anchor="middle">settle()</Label>
      <path d="M460 145 H680" stroke={T.muted} markerEnd="url(#d-arrow)" fill="none" />
      <Label x={570} y={138} anchor="middle">cancel()</Label>
      <path d="M460 158 C 560 158, 580 241, 680 241" stroke={T.muted} strokeDasharray="4 4" markerEnd="url(#d-arrow)" fill="none" />
      <Label x={560} y={222} anchor="middle">time passes</Label>
    </svg>
  );
}

/** One settlement cycle across the solver, Memo and the contract. */
export function CycleDiagram() {
  const lanes = [
    { y: 30, name: "Solver" },
    { y: 130, name: "Memo" },
    { y: 230, name: "Setoff" },
  ];
  const card = (x: number, lane: number, n: number, title: string, sub: string, accent?: boolean) => {
    const y = lanes[lane]!.y + 14;
    return (
      <g>
        <rect x={x} y={y} width={176} height={62} rx={10} fill={T.card} stroke={accent ? T.accent : T.border} strokeWidth={accent ? 1.5 : 1} />
        <Step x={x + 18} y={y + 20} n={n} />
        <text x={x + 36} y={y + 24} fontSize={12} fontWeight={600} fill={T.fg}>
          {title}
        </text>
        <text x={x + 14} y={y + 47} fontSize={10.5} fill={T.muted}>
          {sub}
        </text>
      </g>
    );
  };
  return (
    <svg viewBox="0 0 1020 340" className="h-auto w-full min-w-[700px]" role="img" aria-labelledby="cyc-t">
      <title id="cyc-t">
        A cycle: the solver reads the pool, picks a fundable set, and sends settle through Memo; Setoff checks and settles every IOU, then
        debits net debtors and credits net creditors atomically.
      </title>
      <Defs />
      {lanes.map((l) => (
        <g key={l.name}>
          <rect x={0} y={l.y} width={1020} height={90} rx={12} fill="none" stroke={T.border} />
          <text x={16} y={l.y + 50} fontSize={12} fontWeight={600} fill={T.muted}>
            {l.name}
          </text>
        </g>
      ))}
      {card(86, 0, 1, "Read the pool", "IOU logs + deposits")}
      {card(276, 0, 2, "Pick a fundable set", "greedy, ~93% of optimal")}
      {card(466, 1, 3, "memo(…)", "cycle summary attached")}
      {card(656, 2, 4, "Apply each IOU", "pending? unexpired? net ±")}
      {card(836, 2, 5, "Fund the nets", "debit ≤ deposit · credit", true)}
      <path d="M262 75 H276" stroke={T.muted} markerEnd="url(#d-arrow)" fill="none" />
      <path d="M452 75 C 470 75, 466 130, 554 144" stroke={T.muted} markerEnd="url(#d-arrow)" fill="none" />
      <path d="M642 175 C 660 175, 656 230, 744 244" stroke={T.accent} strokeWidth={1.5} markerEnd="url(#d-arrow-accent)" fill="none" />
      <text x={652} y={208} fontSize={10.5} fill={T.fg}>
        settle(ids, parties)
      </text>
      <path d="M832 275 H836" stroke={T.muted} markerEnd="url(#d-arrow)" fill="none" />
      <text x={86} y={336} fontSize={11} fill={T.muted}>
        All or nothing: if any net debtor is short, the whole cycle reverts and nothing changes.
      </text>
    </svg>
  );
}

/** Three bills, before and after netting. */
export function NettingDiagram() {
  const pos = { A: { x: 120, y: 60 }, B: { x: 220, y: 230 }, C: { x: 20, y: 230 } } as const;
  const node = (k: keyof typeof pos, net: string, ox: number) => (
    <g>
      <circle cx={pos[k].x + ox} cy={pos[k].y} r={22} fill={T.card} stroke={T.border} strokeWidth={1.5} />
      <text x={pos[k].x + ox} y={pos[k].y + 5} textAnchor="middle" fontSize={13} fontWeight={600} fill={T.fg}>
        {k}
      </text>
      {net && (
        <text x={pos[k].x + ox} y={pos[k].y + 42} textAnchor="middle" fontSize={11} fill={T.muted} className="font-mono">
          {net}
        </text>
      )}
    </g>
  );
  const ox = 440;
  return (
    <svg viewBox="0 0 720 300" className="h-auto w-full min-w-[560px]" role="img" aria-labelledby="net-t">
      <title id="net-t">A owes B 10, B owes C 9, C owes A 8. Netted: A pays 2; B and C each receive 1.</title>
      <Defs />
      <text x={20} y={20} fontSize={11} fontWeight={600} fill={T.muted} letterSpacing={1.2}>
        BEFORE · 3 PAYMENTS · 27 MOVED
      </text>
      <path d="M140 80 L205 205" stroke={T.muted} markerEnd="url(#d-arrow)" fill="none" />
      <text x={185} y={135} fontSize={12} fill={T.fg} className="font-mono">10</text>
      <path d="M196 232 H46" stroke={T.muted} markerEnd="url(#d-arrow)" fill="none" />
      <text x={120} y={252} textAnchor="middle" fontSize={12} fill={T.fg} className="font-mono">9</text>
      <path d="M36 207 L100 82" stroke={T.muted} markerEnd="url(#d-arrow)" fill="none" />
      <text x={52} y={135} fontSize={12} fill={T.fg} className="font-mono">8</text>
      {node("A", "", 0)}
      {node("B", "", 0)}
      {node("C", "", 0)}

      <text x={ox + 20} y={20} fontSize={11} fontWeight={600} fill={T.accent} letterSpacing={1.2}>
        AFTER ONE CYCLE · 2 MOVED
      </text>
      <circle cx={ox + 120} cy={160} r={26} fill={T.card} stroke={T.accent} strokeWidth={1.5} />
      <text x={ox + 120} y={164} textAnchor="middle" fontSize={11} fontWeight={600} fill={T.fg}>
        Setoff
      </text>
      <path d={`M${ox + 120} 84 V132`} stroke={T.accent} strokeWidth={2} markerEnd="url(#d-arrow-accent)" fill="none" />
      <path d={`M${ox + 140} 178 L${ox + 202} 214`} stroke={T.accent} strokeWidth={1.5} markerEnd="url(#d-arrow-accent)" fill="none" />
      <path d={`M${ox + 100} 178 L${ox + 38} 214`} stroke={T.accent} strokeWidth={1.5} markerEnd="url(#d-arrow-accent)" fill="none" />
      {node("A", "pays 2", ox)}
      {node("B", "+1", ox)}
      {node("C", "+1", ox)}
    </svg>
  );
}
