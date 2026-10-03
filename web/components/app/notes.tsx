"use client";

import { useState } from "react";
import { Lock, LockOpen, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { Snapshot } from "@/lib/data";
import type { NoteView } from "@/lib/notes-view";
import { Button } from "@/components/ui/button";
import { errorText } from "@/components/setoff/tx";
import { useApp } from "./state";

export type PrivacyStatus = "ready" | "you" | "them";

export function privacyStatus(snapshot: Snapshot, me: string, other?: string): PrivacyStatus | undefined {
  if (!snapshot.noteKeys[me.toLowerCase()]) return "you";
  if (!other) return undefined;
  return snapshot.noteKeys[other.toLowerCase()] ? "ready" : "them";
}

/** "Keep this note private", with the reason when it isn't possible yet. */
export function PrivateToggle({ status, checked, onChange }: { status?: PrivacyStatus; checked: boolean; onChange: (v: boolean) => void }) {
  const { enableNotes } = useApp();
  const [busy, setBusy] = useState(false);
  const ready = status === "ready";
  const hint =
    status === "ready"
      ? "Only you and the other party can read it. Amounts and names stay public."
      : status === "you"
        ? "Turn on private notes once to use this: a free signature and a tiny transaction."
        : status === "them"
          ? "The other party hasn't turned on private notes yet, so this note will be public."
          : "Enter who it's with to check if a private note is possible.";
  return (
    <label className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${ready ? "border-border" : "border-dashed border-border opacity-80"}`}>
      <input
        type="checkbox"
        className="mt-0.5 size-4 accent-[var(--primary)]"
        disabled={!ready}
        checked={ready && checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="flex flex-col gap-0.5">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <Lock className="size-3.5" aria-hidden /> Keep this note private
        </span>
        <span className="text-xs leading-5 text-muted-foreground">{hint}</span>
        {status === "you" && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-1 self-start"
            disabled={busy}
            onClick={async (e) => {
              e.preventDefault();
              setBusy(true);
              const id = toast.loading("Turning on private notes…");
              try {
                await enableNotes();
                toast.success("Private notes on", { id });
              } catch (err) {
                toast.error(errorText(err), { id });
              } finally {
                setBusy(false);
              }
            }}
          >
            <Lock aria-hidden /> Turn on private notes
          </Button>
        )}
      </span>
    </label>
  );
}

/** Shows a note, or a lock with an unlock action if the viewer is a party. */
export function NoteText({ view, canUnlock, onUnlock }: { view: NoteView; canUnlock?: boolean; onUnlock?: () => void }) {
  if (!view.isPrivate) return <>{view.text ?? "—"}</>;
  if (!view.locked)
    return (
      <span className="inline-flex items-center gap-1.5">
        <LockOpen className="size-3.5 shrink-0 text-primary" aria-label="Private note, unlocked" />
        {view.text}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <Lock className="size-3.5 shrink-0" aria-hidden />
      Private note
      {canUnlock && onUnlock && (
        <button type="button" onClick={onUnlock} className="rounded-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Unlock
        </button>
      )}
    </span>
  );
}

/** Wallet page card: turn private notes on, or unlock them for this session. */
export function PrivateNotesCard({
  enabled,
  unlocked,
  onEnable,
  onUnlock,
  embedded,
}: {
  enabled: boolean;
  unlocked: boolean;
  onEnable: () => Promise<void>;
  onUnlock: () => Promise<boolean>;
  /** Render inside another card (no border/padding of its own). */
  embedded?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    const id = toast.loading(`${label}…`);
    try {
      const ok = await fn();
      if (ok === false) toast.error("Your wallet produced a different key than the one you published. Notes stay locked.", { id });
      else toast.success(`${label} done`, { id });
    } catch (e) {
      toast.error(errorText(e), { id });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="pn" className={embedded ? "flex flex-col gap-3" : "flex flex-col gap-4 rounded-xl border border-border bg-card p-6"}>
      <div className="flex items-center justify-between gap-2">
        <h2 id="pn" className={embedded ? "text-sm font-medium" : "text-base font-medium"}>
          Private notes
        </h2>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs ${enabled ? "border-primary/40 text-primary" : "border-border text-muted-foreground"}`}>
          {enabled ? <ShieldCheck className="size-3.5" aria-hidden /> : <Lock className="size-3.5" aria-hidden />}
          {enabled ? (unlocked ? "On · unlocked" : "On") : "Off"}
        </span>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">
        Invoice notes are encrypted so only you and the other party can read them. Amounts and names stay public, because the contract needs
        them to settle.
      </p>
      {!enabled ? (
        <Button className="self-start" disabled={busy} onClick={() => act("Turn on private notes", onEnable)}>
          <Lock aria-hidden /> Turn on private notes
        </Button>
      ) : !unlocked ? (
        <Button variant="outline" className="self-start" disabled={busy} onClick={() => act("Unlock notes", onUnlock)}>
          <LockOpen aria-hidden /> Unlock my notes
        </Button>
      ) : (
        <p className="text-sm text-primary">Your private notes are readable for this session.</p>
      )}
      <p className="text-xs leading-5 text-muted-foreground">
        {enabled
          ? "Unlocking is a free signature. Your key is derived from it and never stored."
          : "One free signature creates your key, and a tiny transaction publishes the public half so others can encrypt to you."}
      </p>
    </section>
  );
}
