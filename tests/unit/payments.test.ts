import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { isLegalPage, LEGAL_PAGES, legalContent } from "@/lib/legal";
import { checkoutSignature, verifyCheckoutSignature, verifyWebhookSignature } from "@/lib/payments/signatures";

describe("Razorpay signatures", () => {
  const secret = "test_secret_123";

  it("matches Razorpay's documented checkout formula: HMAC-SHA256(order_id|payment_id)", () => {
    const expected = createHmac("sha256", secret).update("order_ABC|pay_XYZ").digest("hex");
    expect(checkoutSignature("order_ABC", "pay_XYZ", secret)).toBe(expected);
    expect(verifyCheckoutSignature("order_ABC", "pay_XYZ", expected, secret)).toBe(true);
  });

  it("rejects a signature for a different order, payment or secret", () => {
    const signature = checkoutSignature("order_ABC", "pay_XYZ", secret);
    expect(verifyCheckoutSignature("order_OTHER", "pay_XYZ", signature, secret)).toBe(false);
    expect(verifyCheckoutSignature("order_ABC", "pay_OTHER", signature, secret)).toBe(false);
    expect(verifyCheckoutSignature("order_ABC", "pay_XYZ", signature, "wrong")).toBe(false);
  });

  it("rejects malformed signatures without throwing", () => {
    expect(verifyCheckoutSignature("order_ABC", "pay_XYZ", "", secret)).toBe(false);
    expect(verifyCheckoutSignature("order_ABC", "pay_XYZ", "not-hex!", secret)).toBe(false);
    expect(verifyCheckoutSignature("order_ABC", "pay_XYZ", "ab", secret)).toBe(false);
  });

  it("verifies webhooks over the exact raw body", () => {
    const body = '{"event":"payment.captured","payload":{}}';
    const signature = createHmac("sha256", "whsec").update(body).digest("hex");
    expect(verifyWebhookSignature(body, signature, "whsec")).toBe(true);
    // Re-serialising the JSON changes the bytes, so it must not verify.
    expect(verifyWebhookSignature(JSON.stringify(JSON.parse(body), null, 1), signature, "whsec")).toBe(false);
  });
});

describe("legal pages", () => {
  const cafe = { name: "Blue Bean", legal_name: "Blue Bean Foods LLP", address: "4 MG Road, Pune 411001", phone: "+91 90000 00000", email: "hi@bluebean.in", gstin: null };

  it("fills every policy with the cafe's details", () => {
    for (const page of LEGAL_PAGES) {
      const text = legalContent(page, cafe).flatMap((s) => s.paragraphs).join(" ");
      expect(text.length).toBeGreaterThan(80);
      expect(text).not.toMatch(/undefined|null/);
    }
    expect(legalContent("terms", cafe).flatMap((s) => s.paragraphs).join(" ")).toContain("courts at Pune");
    expect(legalContent("contact", cafe)[0].paragraphs).toContain("Phone: +91 90000 00000");
  });

  it("copes with a cafe that has no contact details yet", () => {
    const bare = { name: "New Cafe", legal_name: null, address: null, phone: null, email: null, gstin: null };
    expect(legalContent("refunds", bare).flatMap((s) => s.paragraphs).join(" ")).toContain("Contact us by the counter");
  });

  it("only accepts known page names", () => {
    expect(isLegalPage("refunds")).toBe(true);
    expect(isLegalPage("../secrets")).toBe(false);
  });
});
