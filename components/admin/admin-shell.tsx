"use client";

import { BarChart3, ClipboardList, LogOut, Menu as MenuIcon, QrCode, ReceiptText, Settings, UsersRound, UtensilsCrossed, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { signOut } from "@/app/c/[slug]/login/actions";
import type { StaffRole } from "@/lib/order-state";
import { tenantHref } from "@/lib/tenant";

const NAV: { path: string; label: string; icon: typeof BarChart3; ownerOnly?: boolean }[] = [
  { path: "/admin", label: "Dashboard", icon: BarChart3 },
  { path: "/admin/orders", label: "Orders & bills", icon: ReceiptText },
  { path: "/admin/menu", label: "Menu", icon: UtensilsCrossed },
  { path: "/admin/tables", label: "Tables & QR", icon: QrCode },
  { path: "/admin/staff", label: "Staff", icon: UsersRound, ownerOnly: true },
  { path: "/admin/settings", label: "Settings", icon: Settings, ownerOnly: true },
];

interface Props {
  tenantKey: string;
  base: string;
  cafeName: string;
  staff: { displayName: string; role: StaffRole };
  children: ReactNode;
}

export function AdminShell({ tenantKey, base, cafeName, staff, children }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const links = NAV.filter((item) => !item.ownerOnly || staff.role === "owner");
  const active = (path: string) => {
    const href = tenantHref(base, path);
    return path === "/admin" ? pathname === href : pathname.startsWith(href);
  };

  const nav = (
    <nav aria-label="Admin" className="flex flex-col gap-1">
      {links.map(({ path, label, icon: Icon }) => (
        <Link
          key={path}
          href={tenantHref(base, path)}
          onClick={() => setOpen(false)}
          aria-current={active(path) ? "page" : undefined}
          className={`flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${
            active(path) ? "bg-[var(--brand)] text-[var(--brand-fg)]" : "text-[var(--g-muted)] hover:bg-[var(--g-soft)] hover:text-[var(--g-ink)]"
          }`}
        >
          <Icon className="size-4" />
          {label}
        </Link>
      ))}
      <div className="my-2 border-t border-[var(--g-line)]" />
      <Link href={tenantHref(base, "/staff")} className="flex h-10 items-center gap-3 rounded-xl px-3 text-sm text-[var(--g-muted)] hover:bg-[var(--g-soft)]">
        <ClipboardList className="size-4" /> Counter
      </Link>
    </nav>
  );

  const account = (
    <form action={signOut.bind(null, tenantKey)} className="flex items-center gap-2 border-t border-[var(--g-line)] pt-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{staff.displayName}</p>
        <p className="text-xs text-[var(--g-muted)] capitalize">{staff.role}</p>
      </div>
      <button type="submit" title="Sign out" className="grid size-9 place-items-center rounded-lg text-[var(--g-muted)] hover:bg-[var(--g-soft)]">
        <LogOut className="size-4" />
      </button>
    </form>
  );

  return (
    <div className="flex min-h-dvh flex-1">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r border-[var(--g-line)] bg-[var(--g-surface)] p-4 lg:flex print:hidden">
        <div className="px-1 pt-1">
          <p className="font-heading text-lg leading-tight font-bold">{cafeName}</p>
          <p className="text-xs text-[var(--g-muted)]">Owner panel</p>
        </div>
        <div className="flex-1">{nav}</div>
        {account}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--g-line)] bg-[var(--g-surface)]/95 px-4 py-2.5 backdrop-blur lg:hidden print:hidden">
          <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" className="grid size-10 place-items-center rounded-xl hover:bg-[var(--g-soft)]">
            <MenuIcon className="size-5" />
          </button>
          <p className="truncate font-heading font-bold">{cafeName}</p>
        </header>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <button type="button" aria-label="Close menu" className="anim-fade-in absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
            <div className="anim-slide-in-right absolute inset-y-0 left-0 flex w-72 flex-col gap-6 bg-[var(--g-surface)] p-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <p className="font-heading text-lg font-bold">{cafeName}</p>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="grid size-9 place-items-center rounded-lg hover:bg-[var(--g-soft)]">
                  <X className="size-5" />
                </button>
              </div>
              <div className="flex-1">{nav}</div>
              {account}
            </div>
          </div>
        )}
        <main className="flex min-w-0 flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8 print:p-0">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-[var(--g-muted)]">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
