"use client";

import { ExternalLink, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { addTable, addTables, removeTable, renameTable, replaceTableQr, setTableActive } from "@/app/c/[slug]/admin/tables/actions";

export interface AdminTable {
  id: string;
  label: string;
  active: boolean;
  url: string;
  qr: string; // SVG markup generated on the server from our own URL
}

export function TablesManager({ tenantKey, tables }: { tenantKey: string; tables: AdminTable[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; kind: "replace" | "remove" } | null>(null);

  function act(task: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    setConfirm(null);
    startTransition(async () => {
      const result = await task();
      if (!result.ok) setError(result.error ?? "That didn't save.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const value = name;
            setName("");
            act(() => addTable(tenantKey, value));
          }}
        >
          <input id="new-table" value={name} onChange={(e) => setName(e.target.value)} placeholder="Table name, e.g. Patio 2" className="h-10 w-56 rounded-xl bg-[var(--g-surface)] px-3 text-sm ring-1 ring-[var(--g-line)] focus:ring-[var(--brand)]" />
          <button type="submit" disabled={!name.trim() || pending} className="flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold ring-1 ring-[var(--g-line)] disabled:opacity-50">
            <Plus className="size-4" /> Add table
          </button>
        </form>
        <button type="button" disabled={pending} onClick={() => act(() => addTables(tenantKey, 5))} className="h-10 rounded-xl px-3 text-sm text-[var(--g-muted)] ring-1 ring-[var(--g-line)] hover:text-[var(--g-ink)]">
          + 5 numbered tables
        </button>
        <span className="ml-auto text-sm text-[var(--g-muted)]">{tables.length} tables</span>
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-800 ring-1 ring-red-200">
          {error}
        </p>
      )}

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {tables.map((t) => (
          <li key={t.id} className={`anim-rise flex flex-col gap-3 rounded-2xl bg-[var(--g-surface)] p-4 ring-1 ring-[var(--g-line)] ${t.active ? "" : "opacity-60"}`}>
            <div className="flex items-start gap-3">
              {/* The SVG is produced by the qrcode library on our server from our own URL. */}
              <div className="size-24 shrink-0 rounded-lg bg-white p-1 ring-1 ring-[var(--g-line)] [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: t.qr }} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                {renaming === t.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const value = new FormData(e.currentTarget).get("label") as string;
                      setRenaming(null);
                      act(() => renameTable(tenantKey, t.id, value));
                    }}
                  >
                    <input name="label" defaultValue={t.label} autoFocus aria-label="Table name" className="h-9 w-full rounded-lg bg-[var(--g-bg)] px-2 font-heading text-lg font-bold ring-1 ring-[var(--brand)]" />
                  </form>
                ) : (
                  <p className="font-heading text-xl font-bold">{t.label}</p>
                )}
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={t.active} onChange={(e) => act(() => setTableActive(tenantKey, t.id, e.target.checked))} className="size-4 accent-[var(--brand)]" />
                  Taking orders
                </label>
                <a href={t.url} target="_blank" rel="noopener" className="flex items-center gap-1 text-xs text-[var(--g-muted)] hover:text-[var(--g-ink)]">
                  Open guest menu <ExternalLink className="size-3" />
                </a>
              </div>
            </div>

            {confirm?.id === t.id ? (
              <div className="anim-rise flex flex-col gap-2 rounded-xl bg-[var(--g-bg)] p-3 text-sm ring-1 ring-[var(--g-line)]">
                <p>
                  {confirm.kind === "replace"
                    ? `The printed QR code on ${t.label} will stop working. You'll need to print a new card.`
                    : `Remove ${t.label}? Its QR code stops working; past orders are kept.`}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => act(() => (confirm.kind === "replace" ? replaceTableQr(tenantKey, t.id) : removeTable(tenantKey, t.id)))}
                    className="h-9 rounded-lg bg-red-700 px-3 font-semibold text-white"
                  >
                    {confirm.kind === "replace" ? "Replace QR code" : "Remove table"}
                  </button>
                  <button type="button" onClick={() => setConfirm(null)} className="h-9 rounded-lg px-3 ring-1 ring-[var(--g-line)]">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-1 border-t border-[var(--g-line)] pt-3">
                <SmallButton onClick={() => setRenaming(t.id)} icon={Pencil}>
                  Rename
                </SmallButton>
                <SmallButton onClick={() => setConfirm({ id: t.id, kind: "replace" })} icon={RefreshCw}>
                  New QR
                </SmallButton>
                <SmallButton onClick={() => setConfirm({ id: t.id, kind: "remove" })} icon={Trash2}>
                  Remove
                </SmallButton>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SmallButton({ onClick, icon: Icon, children }: { onClick: () => void; icon: typeof Pencil; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-[var(--g-muted)] hover:bg-[var(--g-bg)] hover:text-[var(--g-ink)]">
      <Icon className="size-3.5" />
      {children}
    </button>
  );
}
