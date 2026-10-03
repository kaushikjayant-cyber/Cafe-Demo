import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret, maskKey } from "@/lib/crypto";
import { canTransition, isTerminal } from "@/lib/order-state";
import { newTableToken, TABLE_TOKEN_PATTERN } from "@/lib/tokens";

describe("table tokens", () => {
  it("are 10 unambiguous lowercase characters", () => {
    for (let i = 0; i < 200; i++) {
      const token = newTableToken();
      expect(token).toMatch(TABLE_TOKEN_PATTERN);
      expect(token).not.toMatch(/[01ilo]/);
    }
  });

  it("don't repeat", () => {
    const tokens = new Set(Array.from({ length: 2000 }, () => newTableToken()));
    expect(tokens.size).toBe(2000);
  });
});

describe("secret encryption", () => {
  const key = randomBytes(32).toString("base64");

  it("round-trips", () => {
    const sealed = encryptSecret("rzp_secret_value", key);
    expect(sealed).not.toContain("rzp_secret_value");
    expect(decryptSecret(sealed, key)).toBe("rzp_secret_value");
  });

  it("uses a fresh IV each time", () => {
    expect(encryptSecret("same", key)).not.toBe(encryptSecret("same", key));
  });

  it("fails on a wrong key or tampering", () => {
    const sealed = encryptSecret("secret", key);
    expect(() => decryptSecret(sealed, randomBytes(32).toString("base64"))).toThrow();
    const parts = sealed.split(":");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join(":"), key)).toThrow();
  });

  it("rejects short keys", () => {
    expect(() => encryptSecret("x", randomBytes(16).toString("base64"))).toThrow();
  });

  it("masks keys for display", () => {
    expect(maskKey("rzp_live_ABCDEFGH1234")).toBe("rzp_live_****1234");
  });
});

describe("order state machine", () => {
  it("lets the counter run the normal flow", () => {
    expect(canTransition("placed", "accepted", "cashier")).toBe(true);
    expect(canTransition("ready", "served", "cashier")).toBe(true);
  });

  it("limits the kitchen to cooking steps", () => {
    expect(canTransition("accepted", "preparing", "kitchen")).toBe(true);
    expect(canTransition("placed", "accepted", "kitchen")).toBe(false);
    expect(canTransition("ready", "served", "kitchen")).toBe(false);
  });

  it("never leaves a terminal state", () => {
    expect(isTerminal("completed")).toBe(true);
    expect(canTransition("cancelled", "placed", "owner")).toBe(false);
    expect(canTransition("expired", "placed", "service")).toBe(false);
  });
});
