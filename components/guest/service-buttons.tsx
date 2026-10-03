"use client";

import { BellRing, Check, ReceiptText } from "lucide-react";
import { useState } from "react";

import { useGuest } from "./guest-provider";

type Kind = "waiter" | "bill";

const DONE_MESSAGE: Record<Kind, string> = {
  waiter: "We've let the staff know. Someone will be with you shortly.",
  bill: "We've asked for your bill. It's on its way.",
};

/** "Call waiter", and "Request bill" once the guest has ordered (§5.8). */
export function ServiceButtons({ canRequestBill }: { canRequestBill: boolean }) {
  const { table, showNotice } = useGuest();
  const [pending, setPending] = useState<Kind | null>(null);
  const [sent, setSent] = useState<Kind[]>([]);

  async function send(type: Kind) {
    setPending(type);
    try {
      const response = await fetch("/api/service-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableToken: table.token, type }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        if (body.code === "NO_ORDER") {
          showNotice(body.message);
          return;
        }
        throw new Error();
      }
      showNotice(DONE_MESSAGE[type]);
      setSent((s) => [...s, type]);
      setTimeout(() => setSent((s) => s.filter((k) => k !== type)), 60_000);
    } catch {
      showNotice("We couldn't reach the staff. Please wave to someone nearby.");
    } finally {
      setPending(null);
    }
  }

  const button = (type: Kind, label: string, Icon: typeof BellRing) => {
    const done = sent.includes(type);
    return (
      <button
        type="button"
        onClick={() => send(type)}
        disabled={pending !== null || done}
        className={`flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-[colors,transform] active:scale-95 ${
          done ? "border-[var(--brand)] text-[var(--brand)]" : "border-[var(--g-line)] bg-[var(--g-surface)]"
        } disabled:cursor-default`}
      >
        {done ? <Check className="anim-pop size-4" /> : <Icon className={`size-4 ${pending === type ? "animate-pulse" : ""}`} />}
        {done ? "Requested" : label}
      </button>
    );
  };

  return (
    <div className="flex gap-2">
      {button("waiter", "Call waiter", BellRing)}
      {canRequestBill && button("bill", "Request bill", ReceiptText)}
    </div>
  );
}
