"use client";

import { LoaderCircle } from "lucide-react";
import { useActionState, useRef } from "react";

import { signIn, type LoginState } from "@/app/c/[slug]/login/actions";

interface Props {
  tenantKey: string;
  next: string;
  demo: { password: string; accounts: { username: string; displayName: string }[] } | null;
}

export function LoginForm({ tenantKey, next, demo }: Props) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn.bind(null, tenantKey), { error: null });
  const identifierRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  function fill(username: string) {
    if (!demo || !identifierRef.current || !passwordRef.current) return;
    identifierRef.current.value = username;
    passwordRef.current.value = demo.password;
    passwordRef.current.form?.requestSubmit();
  }

  return (
    <>
      <form action={action} className="flex flex-col gap-4 rounded-2xl bg-[var(--g-surface)] p-5 shadow-sm ring-1 ring-[var(--g-line)]">
        <input type="hidden" name="next" value={next} />
        <div>
          <label htmlFor="identifier" className="mb-1.5 block text-sm font-semibold">
            Username or email
          </label>
          <input
            ref={identifierRef}
            id="identifier"
            name="identifier"
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            className="h-12 w-full rounded-lg border border-[var(--g-line)] bg-[var(--g-bg)] px-3 outline-none transition-colors focus:border-[var(--brand)]"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-semibold">
            Password
          </label>
          <input
            ref={passwordRef}
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="h-12 w-full rounded-lg border border-[var(--g-line)] bg-[var(--g-bg)] px-3 outline-none transition-colors focus:border-[var(--brand)]"
          />
        </div>
        {state.error && (
          <p role="alert" className="anim-rise text-sm font-medium text-[var(--g-danger)]">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] font-semibold text-[var(--brand-fg)] transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          {pending && <LoaderCircle className="size-5 animate-spin" />}
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      {demo && (
        <section aria-label="Demo accounts" className="rounded-2xl border border-dashed border-[var(--g-line)] p-4">
          <p className="mb-3 text-sm text-[var(--g-muted)]">Demo cafe: sign in as</p>
          <div className="grid grid-cols-3 gap-2">
            {demo.accounts.map((account) => (
              <button
                key={account.username}
                type="button"
                disabled={pending}
                onClick={() => fill(account.username)}
                className="rounded-xl bg-[var(--g-surface)] px-2 py-3 text-sm font-semibold ring-1 ring-[var(--g-line)] transition-transform hover:ring-[var(--brand)] active:scale-95"
              >
                {account.displayName.replace(/ \(.*\)$/, "")}
                <span className="block text-xs font-normal text-[var(--g-muted)]">{account.username}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
