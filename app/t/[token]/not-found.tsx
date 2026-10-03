export default function TableNotFound() {
  return (
    <main className="guest mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-3 px-6 text-center">
      <h1 className="font-heading text-2xl font-bold">This QR code isn&apos;t working</h1>
      <p className="text-[var(--g-muted)]">
        It may be old or damaged. Please ask a member of staff for help, or scan the code on another table.
      </p>
    </main>
  );
}
