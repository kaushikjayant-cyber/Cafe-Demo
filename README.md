# Cafe QR ordering platform

Multi-tenant QR table ordering for cafes: guests scan, order and pay from the table; the
counter and kitchen see orders live; owners get billing, analytics and reviews.

- **Business decisions, pricing, costs:** [plan.md](plan.md)
- **Engineering spec (decisions D-xx, edge cases R-xx, phases):** [IMPLEMENTATION.md](IMPLEMENTATION.md)

## Stack

Next.js 16 (App Router, `proxy.ts`), TypeScript, Tailwind v4 + shadcn/ui, Supabase
(Postgres + RLS, Auth, Realtime, Storage), Razorpay. Hosted on Render.

## Getting started

Needs **Node 22+** (`nvm use 22`) and **Docker Desktop** running.

```bash
npm install
npx supabase start           # local Supabase in Docker; applies migrations + seed
npm run dev                  # http://localhost:3000/c/demo
```

Environment files:

| File | Used by | Points at |
|---|---|---|
| `.env.development.local` | `npm run dev` | **Local** Docker Supabase (keys from `npx supabase status -o env`) |
| `.env.local` | `npm run build/start`, the CLI | **Cloud** Supabase project |

Local Studio (database browser): <http://127.0.0.1:54323>. Reset the local DB to a clean
migrated + seeded state with `npx supabase db reset`, then recreate the demo logins with
`npm run seed:staff` (a reset also wipes auth users).

### Demo cafe screens

| Screen | URL (local) | Login |
|---|---|---|
| Guest menu (table T1) | `/t/bbtable001` | none |
| Counter board | `/c/demo/staff` | `counter` |
| New order (staff) | `/c/demo/staff/new` | `counter` |
| Kitchen display | `/c/demo/kitchen` | `kitchen` |
| Stock | `/c/demo/staff/stock` | any staff |

Demo password: see `lib/demo.ts` (demo cafe only; the login page offers one-tap demo sign-in).

### Setting up Supabase

1. Create a project at supabase.com (region: **Mumbai**).
2. Copy the project URL, publishable key and secret key into `.env.local`.
3. Push the schema and the demo cafe:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push --include-seed
```

4. In **Authentication → Sign In / Providers**, turn on **Allow anonymous sign-ins** (guests use them).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm test` | Unit tests plus database tests (migrations, RLS, SQL functions) in PGlite, no Docker needed |
| `npm run typecheck` | Generate route types and type-check |
| `npm run lint` | ESLint |
| `npm run build` | Production build |

## Layout

```
app/c/[slug]/      cafe pages (subdomains are rewritten here by proxy.ts)
app/t/[token]/     QR table links (Phase 1)
lib/money.ts       paise and GST maths
lib/tenant.ts      host/path → cafe routing
lib/order-state.ts order state machine (mirrors SQL)
supabase/migrations/  schema, functions, RLS, jobs: the only way the schema changes
supabase/seed.sql  demo cafe "Brew & Bloom"
tests/unit/        pure logic
tests/db/          real migrations in PGlite with a Supabase shim
```
