"use client";

import { KeyRound, LoaderCircle, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { addStaff, resetStaffPassword, setStaffActive, setStaffRole } from "@/app/c/[slug]/admin/staff/actions";

interface Member {
  id: string;
  name: string;
  username: string;
  role: "owner" | "manager" | "cashier" | "kitchen";
  active: boolean;
}

const ROLE_INFO: Record<Member["role"], string> = {
  owner: "Everything, including staff and settings",
  manager: "Dashboard, orders, menu, tables, refunds",
  cashier: "Counter board, payments, stock, staff orders",
  kitchen: "Kitchen screen and stock",
};

const field = "h-10 w-full rounded-lg bg-[var(--g-bg)] px-3 text-sm ring-1 ring-[var(--g-line)] outline-none focus:ring-2 focus:ring-[var(--brand)]";

export function StaffManager({ tenantKey, me, members }: { tenantKey: string; me: string; members: Member[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [form, setForm] = useState({ displayName: "", username: "", role: "cashier", password: "" });

  function act(task: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await task();
      setMessage(result.ok ? { ok: true, text: success } : { ok: false, text: result.error ?? "That didn't save." });
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section aria-label="Team" className="flex flex-col gap-3">
        {message && (
          <p role="status" className={`anim-rise rounded-xl px-4 py-2.5 text-sm ring-1 ${message.ok ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-red-50 text-red-800 ring-red-200"}`}>
            {message.text}
          </p>
        )}
        <ul className="flex flex-col divide-y divide-[var(--g-line)] overflow-hidden rounded-2xl bg-[var(--g-surface)] ring-1 ring-[var(--g-line)]">
          {members.map((m) => (
            <li key={m.id} className={`flex flex-col gap-3 px-4 py-4 ${m.active ? "" : "bg-[var(--g-bg)]"}`}>
              <div className="flex flex-wrap items-center gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--g-soft)] font-semibold">{m.name.slice(0, 1)}</div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {m.name} {m.id === me && <span className="text-xs text-[var(--g-muted)]">(you)</span>}
                    {!m.active && <span className="ml-2 rounded-full bg-[var(--g-soft)] px-2 py-0.5 text-xs text-[var(--g-muted)]">Turned off</span>}
                  </p>
                  <p className="text-sm text-[var(--g-muted)]">
                    <span className="font-mono">{m.username}</span> · {ROLE_INFO[m.role]}
                  </p>
                </div>
                {m.role === "owner" ? (
                  <span className="rounded-full bg-[var(--brand)] px-3 py-1 text-xs font-semibold text-[var(--brand-fg)]">Owner</span>
                ) : (
                  <select
                    aria-label={`Role for ${m.name}`}
                    value={m.role}
                    disabled={pending}
                    onChange={(e) => act(() => setStaffRole(tenantKey, m.id, e.target.value), `${m.name} is now a ${e.target.value}.`)}
                    className="h-9 rounded-lg bg-[var(--g-bg)] px-2 text-sm ring-1 ring-[var(--g-line)]"
                  >
                    <option value="manager">Manager</option>
                    <option value="cashier">Counter</option>
                    <option value="kitchen">Kitchen</option>
                  </select>
                )}
              </div>
              {m.role !== "owner" && (
                <div className="flex flex-wrap gap-2 pl-13">
                  {resetting === m.id ? (
                    <form
                      className="flex flex-wrap gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const value = new FormData(e.currentTarget).get("password") as string;
                        setResetting(null);
                        act(() => resetStaffPassword(tenantKey, m.id, value), `New password set for ${m.name}. Tell them in person.`);
                      }}
                    >
                      <input name="password" type="text" autoComplete="off" autoFocus minLength={8} placeholder="New password (8+ characters)" aria-label="New password" className={`${field} w-64`} />
                      <button type="submit" className="h-10 rounded-lg bg-[var(--brand)] px-3 text-sm font-semibold text-[var(--brand-fg)]">
                        Set password
                      </button>
                      <button type="button" onClick={() => setResetting(null)} className="h-10 rounded-lg px-3 text-sm ring-1 ring-[var(--g-line)]">
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <>
                      <button type="button" onClick={() => setResetting(m.id)} className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-[var(--g-muted)] hover:bg-[var(--g-bg)] hover:text-[var(--g-ink)]">
                        <KeyRound className="size-3.5" /> Reset password
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => act(() => setStaffActive(tenantKey, m.id, !m.active), m.active ? `${m.name} can no longer sign in.` : `${m.name} can sign in again.`)}
                        className={`h-8 rounded-lg px-2 text-xs font-medium ${m.active ? "text-red-700 hover:bg-red-50" : "text-emerald-700 hover:bg-emerald-50"}`}
                      >
                        {m.active ? "Turn off login" : "Turn login back on"}
                      </button>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <form
        className="flex flex-col gap-3 rounded-2xl bg-[var(--g-surface)] p-5 ring-1 ring-[var(--g-line)]"
        onSubmit={(e) => {
          e.preventDefault();
          act(async () => {
            const result = await addStaff(tenantKey, { ...form, role: form.role as "cashier" });
            if (result.ok) setForm({ displayName: "", username: "", role: "cashier", password: "" });
            return result;
          }, `${form.displayName || "They"} can now sign in as “${form.username.toLowerCase()}”.`);
        }}
      >
        <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
          <UserPlus className="size-5" /> Add a team member
        </h2>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Name
          <input id="staff-name" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} className={field} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Username <span className="font-normal text-[var(--g-muted)]">(what they type to sign in)</span>
          <input id="staff-username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} autoCapitalize="none" spellCheck={false} placeholder="e.g. ravi" className={field} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Role
          <select id="staff-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={field}>
            <option value="cashier">Counter · {ROLE_INFO.cashier}</option>
            <option value="kitchen">Kitchen · {ROLE_INFO.kitchen}</option>
            <option value="manager">Manager · {ROLE_INFO.manager}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Password <span className="font-normal text-[var(--g-muted)]">(8+ characters; tell them in person)</span>
          <input id="staff-password" type="text" autoComplete="off" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={field} />
        </label>
        <button type="submit" disabled={pending} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] font-semibold text-[var(--brand-fg)] disabled:opacity-60">
          {pending && <LoaderCircle className="size-4 animate-spin" />}
          Create login
        </button>
      </form>
    </div>
  );
}
