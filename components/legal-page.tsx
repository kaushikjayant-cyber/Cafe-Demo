import Link from "next/link";

import { LEGAL_PAGES, LEGAL_TITLES, legalContent, type LegalCafe, type LegalPage } from "@/lib/legal";

/** A cafe's policy page, with links to the others. `hrefFor` builds links for the current route. */
export function LegalPageView({ cafe, page, hrefFor, backHref }: { cafe: LegalCafe; page: LegalPage; hrefFor: (p: LegalPage) => string; backHref?: string }) {
  const sections = legalContent(page, cafe);
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-5 py-8">
      <header className="flex flex-col gap-1">
        {backHref && (
          <Link href={backHref} className="mb-2 text-sm font-medium text-[var(--brand,#0E7A63)]">
            ← Back to the menu
          </Link>
        )}
        <p className="text-sm text-[var(--g-muted)]">{cafe.name}</p>
        <h1 className="font-heading text-3xl font-bold">{LEGAL_TITLES[page]}</h1>
      </header>
      <div className="flex flex-col gap-5 leading-relaxed">
        {sections.map((section, i) => (
          <section key={i} className="flex flex-col gap-2">
            {section.heading && <h2 className="font-heading text-lg font-bold">{section.heading}</h2>}
            {section.paragraphs.map((text) => (
              <p key={text} className="text-[var(--g-ink)]">
                {text}
              </p>
            ))}
          </section>
        ))}
      </div>
      <nav aria-label="Policies" className="flex flex-wrap gap-x-4 gap-y-2 border-t border-[var(--g-line)] pt-4 text-sm">
        {LEGAL_PAGES.map((p) => (
          <Link key={p} href={hrefFor(p)} aria-current={p === page ? "page" : undefined} className={p === page ? "font-semibold" : "text-[var(--g-muted)] underline-offset-4 hover:underline"}>
            {LEGAL_TITLES[p]}
          </Link>
        ))}
      </nav>
    </main>
  );
}

/** Small footer of policy links for guest pages. */
export function LegalLinks({ hrefFor }: { hrefFor: (p: LegalPage) => string }) {
  return (
    <nav aria-label="Policies" className="flex flex-wrap justify-center gap-x-4 gap-y-1 px-4 py-6 text-xs text-[var(--g-muted)]">
      {LEGAL_PAGES.map((p) => (
        <Link key={p} href={hrefFor(p)} className="underline-offset-4 hover:underline">
          {LEGAL_TITLES[p]}
        </Link>
      ))}
    </nav>
  );
}
