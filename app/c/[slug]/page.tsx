import { notFound } from "next/navigation";

import { SetupNotice } from "@/components/setup-notice";
import { getCafeByTenantKey } from "@/lib/data/cafes";
import { isSupabaseConfigured } from "@/lib/env";

// Placeholder cafe home for Phase 0: proves tenant routing and the database connection.
// The real menu arrives in Phase 1 at /t/[token].
export default async function CafeHome({ params }: PageProps<"/c/[slug]">) {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const { slug } = await params;
  const cafe = await getCafeByTenantKey(slug);
  if (!cafe) notFound();

  return (
    <main
      className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-2 px-4 py-12"
      style={{ ["--brand" as string]: cafe.brand_color }}
    >
      <p className="text-sm font-medium uppercase tracking-wide text-[var(--brand)]">
        {cafe.is_demo ? "Demo cafe" : "Welcome"}
      </p>
      <h1 className="text-4xl font-semibold tracking-tight">{cafe.name}</h1>
      {cafe.address && <p className="text-muted-foreground">{cafe.address}</p>}
    </main>
  );
}
