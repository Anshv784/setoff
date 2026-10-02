const STEPS = [
  {
    title: "Record what you owe",
    body: "A debtor signs an IOU in USDC or EURC — or posts it themselves through Arc's Memo contract with an invoice note attached.",
  },
  {
    title: "Fund only your net",
    body: "If you owe 10 and are owed 8, you deposit 2. Approve and deposit go in one transaction with Multicall3From.",
  },
  {
    title: "Anyone clears the cycle",
    body: "The pool is public. Any solver picks a fundable set; the contract checks every net position and settles it in one transaction.",
  },
];

const ARC = [
  ["USDC gas", "A full cycle costs about a cent at mainnet fees."],
  ["Sub-second finality", "Cycles can clear every few minutes, not once a day."],
  ["Memo", "Invoice notes and cycle summaries are indexed onchain."],
  ["Multicall3From", "Approve + deposit in one step, sender preserved."],
  ["USDC + EURC", "Each currency nets on its own; they never offset."],
  ["No transfers in settle", "A blocklisted address can't stall everyone else's cycle."],
] as const;

export function HowItWorks() {
  return (
    <section aria-labelledby="how" className="flex flex-col gap-8">
      <h2 id="how" className="text-xl font-semibold">
        How it works
      </h2>
      <ol className="grid gap-4 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex flex-col gap-2 rounded-lg border p-6">
            <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
            <h3 className="text-base font-medium">{s.title}</h3>
            <p className="text-sm leading-6 text-muted-foreground">{s.body}</p>
          </li>
        ))}
      </ol>
      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {ARC.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-1">
            <dt className="text-sm font-medium">{k}</dt>
            <dd className="text-sm text-muted-foreground">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
