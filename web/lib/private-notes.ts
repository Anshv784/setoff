/**
 * Private invoice notes. Amounts and parties stay public onchain; only the note text
 * ("Invoice #1042, brand refresh") is encrypted so just the debtor and creditor can read it.
 *
 * Keys: each wallet signs a fixed message once; the signature is hashed into an X25519
 * key, so nothing is stored. The public half is published through Arc's Memo contract.
 *
 * Envelope: "setoff-enc:v1:" + base64url( ephPub(32) | nonce(24) | wrapA(48) | wrapB(48) | body )
 * The note is sealed once with a random content key; that key is wrapped separately for
 * each party with X25519(ephemeral, party) → HKDF → XChaCha20-Poly1305.
 */
import { x25519 } from "@noble/curves/ed25519.js";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { randomBytes } from "@noble/hashes/utils.js";

export const PREFIX = "setoff-enc:v1:";
export const KEY_MESSAGE =
  "Setoff private notes\n\nSign to unlock the key for your private invoice notes. This is free, sends nothing, and only works on Setoff.";
const INFO = new TextEncoder().encode("setoff-note-wrap-v1");

export type NoteKeys = { secret: Uint8Array; publicKey: Uint8Array };

/** Same wallet + same message → same signature (RFC 6979) → same key, every time. */
export function keysFromSignature(signatureHex: string): NoteKeys {
  const sig = hexToBytes(signatureHex);
  const secret = sha256(new Uint8Array([...new TextEncoder().encode("setoff-note-key-v1"), ...sig]));
  return { secret, publicKey: x25519.getPublicKey(secret) };
}

export const isEncrypted = (note?: string) => !!note?.startsWith(PREFIX);

/** Seal `note` for exactly two readers, in order [debtor, creditor]. */
export function encryptNote(note: string, recipients: [Uint8Array, Uint8Array]): string {
  const eph = x25519.utils.randomSecretKey();
  const ephPub = x25519.getPublicKey(eph);
  const nonce = randomBytes(24);
  const contentKey = randomBytes(32);
  const body = xchacha20poly1305(contentKey, nonce).encrypt(new TextEncoder().encode(note));
  const wraps = recipients.map((pub) => xchacha20poly1305(wrapKey(eph, pub, ephPub), nonce).encrypt(contentKey));
  return PREFIX + toB64url(concat(ephPub, nonce, wraps[0]!, wraps[1]!, body));
}

/** Returns the note if `keys` belongs to one of its two readers, otherwise undefined. */
export function decryptNote(envelope: string, keys: NoteKeys): string | undefined {
  if (!isEncrypted(envelope)) return envelope;
  try {
    const raw = fromB64url(envelope.slice(PREFIX.length));
    const ephPub = raw.slice(0, 32);
    const nonce = raw.slice(32, 56);
    const wraps = [raw.slice(56, 104), raw.slice(104, 152)];
    const body = raw.slice(152);
    const shared = sharedKey(keys.secret, ephPub);
    for (const w of wraps) {
      try {
        const contentKey = xchacha20poly1305(shared, nonce).decrypt(w);
        return new TextDecoder().decode(xchacha20poly1305(contentKey, nonce).decrypt(body));
      } catch {
        // Not this reader's wrap; try the other.
      }
    }
  } catch {
    // Malformed envelope.
  }
  return undefined;
}

function wrapKey(ephSecret: Uint8Array, recipientPub: Uint8Array, ephPub: Uint8Array) {
  return hkdf(sha256, x25519.getSharedSecret(ephSecret, recipientPub), ephPub, INFO, 32);
}
function sharedKey(secret: Uint8Array, ephPub: Uint8Array) {
  return hkdf(sha256, x25519.getSharedSecret(secret, ephPub), ephPub, INFO, 32);
}

function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
function toB64url(b: Uint8Array) {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
export function hexToBytes(hex: string) {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  return Uint8Array.from(h.match(/.{2}/g) ?? [], (b) => parseInt(b, 16));
}
export function bytesToHex(b: Uint8Array): `0x${string}` {
  return `0x${[...b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}
