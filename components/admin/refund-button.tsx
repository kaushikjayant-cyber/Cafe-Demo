"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Refund the latest online payment of an order (owner/manager; checked again on the server). */
export function RefundButton({ orderId, label }: { orderId: string; label: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"idle" | "confirm" | "busy">("idle");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function refund() {
    setStep("busy");
    setMessage(null);
    try {
      const response = await fetch("/api/staff/refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, reason: reason.trim() || "Refunded by the cafe" }),
      });
      const body = await response.json();
      setMessage(response.ok ? "Refund sent. It usually reaches the guest in 5 to 7 working days." : body.message ?? "The refund didn't go through.");
      if (response.ok) router.refresh();
    } catch {
      setMessage("No connection. The refund wasn't sent.");
    } finally {
      setStep("idle");
    }
  }

  return (
    <div className="flex flex-col gap-2 print:hidden">
      {step === "idle" ? (
        <button type="button" onClick={() => setStep("confirm")} className="h-10 rounded-xl px-4 text-sm font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50">
          {label}
        </button>
      ) : (
        <div className="anim-rise flex flex-col gap-2 rounded-xl bg-red-50 p-3 ring-1 ring-red-200">
          <label htmlFor="refund-reason" className="text-sm font-medium text-red-900">
            Reason (the guest&apos;s bank statement won&apos;t show it; it&apos;s for your records)
          </label>
          <input
            id="refund-reason"
            value={reason}
            maxLength={200}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Item unavailable"
            className="h-10 rounded-lg bg-white px-3 text-sm ring-1 ring-red-200"
          />
          <div className="flex gap-2">
            <button type="button" disabled={step === "busy"} onClick={refund} className="flex h-10 items-center gap-2 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-60">
              {step === "busy" && <LoaderCircle className="size-4 animate-spin" />}
              Refund now
            </button>
            <button type="button" onClick={() => setStep("idle")} className="h-10 rounded-lg px-3 text-sm ring-1 ring-red-200">
              Back
            </button>
          </div>
        </div>
      )}
      {message && <p className="text-sm">{message}</p>}
    </div>
  );
}
