import { test } from "node:test";
import assert from "node:assert/strict";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { decryptNote, encryptNote, isEncrypted, KEY_MESSAGE, keysFromSignature } from "./private-notes";

const wallet = async () => {
  const a = privateKeyToAccount(generatePrivateKey());
  return { a, keys: keysFromSignature(await a.signMessage({ message: KEY_MESSAGE })) };
};

test("same wallet always derives the same key", async () => {
  const pk = generatePrivateKey();
  const a = privateKeyToAccount(pk);
  const k1 = keysFromSignature(await a.signMessage({ message: KEY_MESSAGE }));
  const k2 = keysFromSignature(await privateKeyToAccount(pk).signMessage({ message: KEY_MESSAGE }));
  assert.deepEqual(k1.publicKey, k2.publicKey);
});

test("debtor and creditor can read; a third party can't", async () => {
  const [d, c, x] = [await wallet(), await wallet(), await wallet()];
  const env = encryptNote("Invoice #1042 — brand refresh ✓", [d.keys.publicKey, c.keys.publicKey]);
  assert.ok(isEncrypted(env));
  assert.ok(!env.includes("1042"));
  assert.equal(decryptNote(env, d.keys), "Invoice #1042 — brand refresh ✓");
  assert.equal(decryptNote(env, c.keys), "Invoice #1042 — brand refresh ✓");
  assert.equal(decryptNote(env, x.keys), undefined);
});

test("tampering is detected", async () => {
  const [d, c] = [await wallet(), await wallet()];
  const env = encryptNote("hello", [d.keys.publicKey, c.keys.publicKey]);
  const bad = env.slice(0, -3) + (env.at(-3) === "A" ? "B" : "A") + env.slice(-2);
  assert.equal(decryptNote(bad, d.keys), undefined);
});

test("plain notes pass through", async () => {
  const d = await wallet();
  assert.equal(decryptNote("public note", d.keys), "public note");
});

test("envelope fits comfortably in a memo", async () => {
  const [d, c] = [await wallet(), await wallet()];
  const env = encryptNote("x".repeat(120), [d.keys.publicKey, c.keys.publicKey]);
  console.log("envelope length for a 120-char note:", env.length);
  assert.ok(env.length < 600);
});
