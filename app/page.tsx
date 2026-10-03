import Link from "next/link";

import { platformName } from "@/lib/env";

// Platform home. Becomes the demo launcher in Phase 6.
export default function PlatformHome() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 px-4 py-12">
      <h1 className="text-4xl font-semibold tracking-tight">{platformName()}</h1>
      <p className="text-muted-foreground">QR table ordering for cafes. Scan, order and pay from the table.</p>
      <Link href="/c/demo" className="font-medium underline underline-offset-4">
        Open the demo cafe
      </Link>
    </main>
  );
}
