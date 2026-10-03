/** Shown in development until Supabase keys are added to .env.local. */
export function SetupNotice() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 px-4 py-12">
      <h1 className="text-2xl font-semibold">Connect the database</h1>
      <p className="text-muted-foreground">
        Supabase isn&apos;t configured yet. Copy <code>.env.example</code> to <code>.env.local</code>, fill in your
        Supabase project URL and keys, then restart <code>npm run dev</code>.
      </p>
    </main>
  );
}
