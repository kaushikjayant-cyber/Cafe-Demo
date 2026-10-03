"use client";

import { CreditCard, Landmark, ShieldCheck, Smartphone, X } from "lucide-react";
import { useState } from "react";

import { formatINR } from "@/lib/money";

interface Props {
  cafeName: string;
  amountPaise: number;
  dailyNo: number;
  onOutcome: (outcome: "success" | "fail" | "closed") => void;
  onCancel: () => void;
}

const METHODS = [
  { key: "upi", label: "UPI", icon: Smartphone },
  { key: "card", label: "Card", icon: CreditCard },
  { key: "netbanking", label: "Netbanking", icon: Landmark },
] as const;

/**
 * Stands in for Razorpay Checkout in the demo. Clearly labelled as a test: no money moves.
 * The three outcomes exercise the real server paths: verify, failure, and webhook-only.
 */
export function SimulatedCheckout({ cafeName, amountPaise, dailyNo, onOutcome, onCancel }: Props) {
  const [method, setMethod] = useState<(typeof METHODS)[number]["key"]>("upi");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="sim-pay-title">
      <button type="button" aria-label="Cancel payment" className="anim-fade-in absolute inset-0 bg-black/55" onClick={onCancel} />
      <div className="anim-sheet-up relative w-full max-w-md overflow-hidden rounded-t-3xl bg-white text-[#14171a] shadow-2xl sm:rounded-3xl">
        <div className="flex items-start justify-between bg-[#0b2a4a] px-5 pt-5 pb-6 text-white">
          <div>
            <p className="text-xs tracking-wide text-white/70 uppercase">Test payment · no real money</p>
            <h2 id="sim-pay-title" className="mt-1 text-lg font-semibold">
              {cafeName}
            </h2>
            <p className="text-sm text-white/80">Order #{dailyNo}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold tabular-nums">{formatINR(amountPaise)}</p>
            <button type="button" onClick={onCancel} aria-label="Close" className="mt-1 inline-grid size-8 place-items-center rounded-full hover:bg-white/10">
              <X className="size-5" />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4 p-5">
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Payment method">
            {METHODS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={method === key}
                onClick={() => setMethod(key)}
                className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-sm font-medium transition-colors ${
                  method === key ? "border-[#2b6cb0] bg-[#ebf4ff] text-[#1a4f8a]" : "border-[#dde3ea]"
                }`}
              >
                <Icon className="size-5" />
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => onOutcome("success")}
            autoFocus
            className="h-14 rounded-xl bg-[#2b6cb0] text-lg font-semibold text-white transition-transform active:scale-[0.98]"
          >
            Pay {formatINR(amountPaise)}
          </button>

          <details className="rounded-xl bg-[#f4f6f8] px-4 py-3 text-sm">
            <summary className="cursor-pointer font-medium text-[#4a5561]">Test other outcomes</summary>
            <div className="mt-3 flex flex-col gap-2">
              <button type="button" onClick={() => onOutcome("fail")} className="rounded-lg bg-white px-3 py-2.5 text-left ring-1 ring-[#dde3ea]">
                <span className="font-medium text-red-700">Payment declined</span>
                <span className="block text-xs text-[#6b7680]">The bank refuses. You can retry or pay at the counter.</span>
              </button>
              <button type="button" onClick={() => onOutcome("closed")} className="rounded-lg bg-white px-3 py-2.5 text-left ring-1 ring-[#dde3ea]">
                <span className="font-medium">Pay, then close the app</span>
                <span className="block text-xs text-[#6b7680]">Money goes through but the phone never comes back. The gateway&apos;s webhook still completes the order.</span>
              </button>
            </div>
          </details>

          <p className="flex items-center justify-center gap-1.5 text-xs text-[#6b7680]">
            <ShieldCheck className="size-4" /> Simulated gateway for the demo. Real cafes use Razorpay.
          </p>
        </div>
      </div>
    </div>
  );
}
