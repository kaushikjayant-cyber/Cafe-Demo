// AES-256-GCM for secrets stored in the database, e.g. each cafe's Razorpay key secret [D-37].
// Format: v1:<iv>:<auth tag>:<ciphertext>, each base64url.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

function parseKey(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) throw new Error("encryption key must be 32 bytes (base64-encoded)");
  return key;
}

export function encryptSecret(plaintext: string, keyBase64: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", parseKey(keyBase64), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), ciphertext]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(":");
}

export function decryptSecret(payload: string, keyBase64: string): string {
  const [version, iv, tag, ciphertext] = payload.split(":");
  if (version !== VERSION || !iv || !tag || ciphertext === undefined) {
    throw new Error("unrecognised encrypted secret format");
  }
  const decipher = createDecipheriv("aes-256-gcm", parseKey(keyBase64), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

/** Last four characters only, for showing a stored key in settings: rzp_live_****abcd. */
export function maskKey(key: string): string {
  const prefix = key.match(/^rzp_(live|test)_/)?.[0] ?? "";
  return `${prefix}****${key.slice(-4)}`;
}
