"use client";

import { ChefHat, ClipboardList, LogOut, PackageCheck, Pause, Play, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { signOut } from "@/app/c/[slug]/login/actions";
import type { StaffRole } from "@/lib/order-state";
import { CAFE_STATUS_EVENT, cafeChannel } from "@/lib/realtime";
import { getBrowserClient, subscribeWhenReady } from "@/lib/supabase/browser";
import { tenantHref } from "@/lib/tenant";

import type { Connection } from "./use-live-orders";

export interface ShellCafe {
  id: string;
  name: string;
  orderingPaused: boolean;
  pauseMessage: string | null;
}

interface Props {
  tenantKey: string;
  base: string;
  cafe: ShellCafe;
  staff: { displayName: string; role: StaffRole };
  connection?: Connection;
  children: ReactNode;
}

const NAV: { path: string; label: string; icon: typeof ClipboardList; roles: StaffRole[] }[] = [
  { path: "/staff", label: "Orders", icon: ClipboardList, roles: ["owner", "manager", "cashier"] },
  { path: "/staff/new", label: "New order", icon: Plus, roles: ["owner", "manager", "cashier"] },
  { path: "/kitchen", label: "Kitchen", icon: ChefHat, roles: ["owner", "manager", "cashier", "kitchen"] },
  { path: "/staff/stock", label: "Stock", icon: PackageCheck, roles: ["owner", "manager", "cashier", "kitchen"] },
];

const PAUSE_MESSAGES = [
  "We're very busy right now. Please check back in 15 minutes.",
  "The kitchen is closing soon and isn't taking new orders.",
  "Please order at the counter for now.",
];

export function StaffShell({ tenantKey, base, cafe, staff, connection, children }: Props) {
  const pathname = usePathname();
  const [paused, setPaused] = useState(cafe.orderingPaused);
  const [choosing, setChoosing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Another device paused or resumed ordering.
  useEffect(
    () =>
      subscribeWhenReady((supabase) =>
        supabase
          .channel(`shell:${cafe.id}`)
          .on<{ ordering_paused: boolean }>(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "cafes", filter: `id=eq.${cafe.id}` },
            ({ new: row }) => setPaused(row.ordering_paused),
          )
          .subscribe(),
      ),
    [cafe.id],
  );

  async function setOrdering(pause: boolean, message: string | null) {
    setSaving(true);
    const supabase = getBrowserClient();
    const { error } = await supabase.rpc("set_ordering_paused", { p_cafe: cafe.id, p_paused: pause, p_message: message });
    if (!error) {
      setPaused(pause);
      // Tell guests' open menus to refresh their status.
      const channel = supabase.channel(cafeChannel(cafe.id));
      await channel.httpSend(CAFE_STATUS_EVENT, {}).catch(() => {});
      void supabase.removeChannel(channel);
    }
    setSaving(false);
    setChoosing(false);
  }

  const links = NAV.filter((item) => item.roles.includes(staff.role));
  const isActive = (path: string) => {
    const href = tenantHref(base, path);
    return path === "/staff" ? pathname === href : pathname.startsWith(href);
  };

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-[var(--g-line)] bg-[var(--g-surface)]/95 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-heading text-lg font-bold">{cafe.name}</span>
            {connection && <ConnectionDot connection={connection} />}
          </div>

          <nav className="no-scrollbar order-last flex w-full gap-1 overflow-x-auto md:order-none md:w-auto" aria-label="Staff">
            {links.map(({ path, label, icon: Icon }) => (
              <Link
                key={path}
                href={tenantHref(base, path)}
                aria-current={isActive(path) ? "page" : undefined}
                className={`flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors ${
                  isActive(path)
                    ? "bg-[var(--brand)] text-[var(--brand-fg)]"
                    : "text-[var(--g-muted)] hover:bg-[var(--g-soft)] hover:text-[var(--g-ink)]"
                }`}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                disabled={saving}
                onClick={() => (paused ? setOrdering(false, null) : setChoosing((v) => !v))}
                className={`flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors ${
                  paused ? "bg-amber-100 text-amber-900 ring-1 ring-amber-300" : "ring-1 ring-[var(--g-line)] hover:bg-[var(--g-soft)]"
                }`}
              >
                {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
                {paused ? "Resume orders" : "Pause orders"}
              </button>
              {choosing && !paused && (
                <div className="anim-rise absolute right-0 z-40 mt-2 w-72 rounded-2xl bg-[var(--g-surface)] p-2 shadow-xl ring-1 ring-[var(--g-line)]">
                  <p className="px-2 py-1.5 text-xs font-medium text-[var(--g-muted)]">Guests will see:</p>
                  {PAUSE_MESSAGES.map((message) => (
                    <button
                      key={message}
                      type="button"
                      onClick={() => setOrdering(true, message)}
                      className="block w-full rounded-xl px-3 py-2.5 text-left text-sm hover:bg-[var(--g-soft)]"
                    >
                      {message}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <form action={signOut.bind(null, tenantKey)}>
              <button
                type="submit"
                title={`Signed in as ${staff.displayName}. Sign out`}
                className="flex h-10 items-center gap-2 rounded-xl px-3 text-sm text-[var(--g-muted)] hover:bg-[var(--g-soft)]"
              >
                <span className="hidden max-w-32 truncate sm:inline">{staff.displayName}</span>
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </div>
        {paused && (
          <p className="anim-fade-in bg-amber-50 px-4 py-1.5 text-center text-sm font-medium text-amber-900">
            Guests can&apos;t order from the QR menu while orders are paused.
          </p>
        )}
      </header>
      {children}
    </div>
  );
}

function ConnectionDot({ connection }: { connection: Connection }) {
  const text = connection === "live" ? "Live" : connection === "connecting" ? "Connecting" : "Offline, reconnecting";
  const color = connection === "live" ? "bg-emerald-500" : connection === "connecting" ? "bg-amber-400" : "bg-red-500";
  return (
    <span
      role="status"
      className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
        connection === "offline" ? "bg-red-50 text-red-700" : "text-[var(--g-muted)]"
      }`}
    >
      <span
        className={`size-2 rounded-full ${color} ${connection === "live" ? "anim-ring-pulse" : ""}`}
        style={{ "--brand": "#10b981" } as React.CSSProperties}
      />
      {text}
    </span>
  );
}
