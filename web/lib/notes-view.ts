import type { Address } from "viem";
import type { IOURow, Snapshot } from "./data";
import { decryptNote, encryptNote, hexToBytes, isEncrypted, type NoteKeys } from "./private-notes";

export type NoteView = { text?: string; isPrivate: boolean; locked: boolean };

/** What the viewer can see of an IOU's note. */
export function readNote(i: IOURow, me?: string, keys?: NoteKeys): NoteView {
  if (!i.note) return { isPrivate: false, locked: false };
  if (!isEncrypted(i.note)) return { text: i.note, isPrivate: false, locked: false };
  const party = !!me && [i.debtor, i.creditor].some((a) => a.toLowerCase() === me.toLowerCase());
  const text = party && keys ? decryptNote(i.note, keys) : undefined;
  return { text, isPrivate: true, locked: !text };
}

/** Both parties' published keys, or undefined if either hasn't enabled private notes. */
export function recipientKeys(snapshot: Snapshot, debtor: Address, creditor: Address): [Uint8Array, Uint8Array] | undefined {
  const d = snapshot.noteKeys[debtor.toLowerCase()];
  const c = snapshot.noteKeys[creditor.toLowerCase()];
  return d && c ? [hexToBytes(d), hexToBytes(c)] : undefined;
}

export function sealNote(snapshot: Snapshot, debtor: Address, creditor: Address, note: string) {
  const keys = recipientKeys(snapshot, debtor, creditor);
  return keys ? encryptNote(note, keys) : undefined;
}
