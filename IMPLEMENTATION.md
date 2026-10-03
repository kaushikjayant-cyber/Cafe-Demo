# Implementation Plan: QR Cafe Ordering Platform

> The build spec. `plan.md` holds the business decisions (why); this file holds the engineering decisions (what and how).
> Every decision is marked **[D-xx]** so it can be referenced in code comments and commits.
> Status: ✅ decided · 🔁 default chosen (change if you disagree)

---

## 0. Scope at a Glance

**One multi-tenant web app** that serves every cafe. Each cafe has four faces:

| Surface | Who | Route | Login |
|---|---|---|---|
| Customer menu & ordering | Guests (scan QR) | `/t/[token]` | Silent anonymous session |
| Counter (cashier) | Staff | `/staff` | Username + password |
| Kitchen display | Staff | `/kitchen` | Username + password |
| Owner admin | Owner | `/admin/*` | Email + password |
| Platform super-admin | You | `/super/*` | Email + password + super role |
| Demo launcher | Prospects | `/` on the platform domain | none |

**v1 feature list** (everything below is built in v1 unless marked v1.5/v2):
- QR table ordering, menu with photos/tags/search, item options and add-ons, notes
- Live "sold out" (with "sold out for today" auto-reset), pause ordering, opening hours
- Cart → checkout → **Pay now (Razorpay)** or **Pay at counter**
- Live order tracking for the guest
- Call waiter / request bill
- Staff-assisted ordering (waiter orders for a guest who doesn't scan)
- Counter board with sound alert, accept/reject, status flow, mark paid (cash/UPI), stock toggles
- Basic kitchen display 🔁 **[D-01]** (cheap, since it's a filtered view of the same live data; makes Premium sellable)
- Owner: analytics, billing/invoices + CSV export, menu CRUD, option groups, tables + printable QR, staff, reviews, branding, settings
- Reviews: rating + comment + per-item thumbs, instant low-rating alert, Google review link
- Upsell: "Goes well with" (manual + auto), best-seller badges
- GST-correct bills, sequential invoice numbers
- Super-admin: create cafe, plan/add-on flags, suspend, AMC date
- Demo: launcher, seeded demo cafe with 60 days of history, reset demo
- Per-cafe legal pages (needed for Razorpay KYC)

**v1.5:** coupons, tips, split bill, thermal printing, multi-language, daily closing summary email, PWA install.
**v2:** loyalty, takeaway, WhatsApp, inventory, multi-branch, AI insights.

---

## 1. Tech Stack ✅ [D-02]

| Concern | Choice | Notes |
|---|---|---|
| Language | TypeScript (strict) | |
| Framework | **Next.js (latest stable at init), App Router** | Pages + API routes in one app (no separate backend) |
| Package manager | npm (pnpm not installed on the dev machine; no functional difference) | |
| Styling | Tailwind CSS v4 + shadcn/ui | Per-cafe theme via CSS variables |
| DB / Auth / Realtime / Storage | **Supabase** (`@supabase/supabase-js`, `@supabase/ssr`) | Postgres with RLS |
| Validation | Zod | Every API input, every env var |
| Client state | Zustand (cart only) | Persisted to localStorage |
| Server state | TanStack Query on admin/staff pages | Refetch on reconnect |
| Payments | `razorpay` Node SDK + Checkout.js | |
| Charts | Recharts | |
| QR | `qrcode` | SVG output, crisp when printed |
| Images | `sharp` (server re-encode to WebP) | |
| Dates | `date-fns` + `date-fns-tz` | All business logic in the cafe's timezone |
| Errors | Sentry (free) | |
| Tests | Vitest (unit), Playwright (e2e) | |
| Hosting | Render (Starter for prod, Free while testing) | Singapore region |
| DB region | Supabase Mumbai (`ap-south-1`) | |

---

## 2. Repository Layout

```
/app
  /(platform)/            → platform-domain pages: demo launcher, marketing
  /c/[slug]/...           → path-based tenant fallback (free-tier URL)   [D-05]
  /t/[token]/             → customer menu, cart, order tracking
  /staff/                 → counter board, staff ordering, stock toggles
  /kitchen/               → kitchen display
  /admin/                 → owner panel
  /super/                 → platform super-admin
  /legal/[page]/          → per-cafe terms, privacy, refund, contact
  /api/
    orders/               → create, cancel
    payments/razorpay/    → create-order, verify
    webhooks/razorpay/[cafeId]/
    service-requests/
    reviews/
    health/
/lib
  /money.ts               → paise math, GST, rounding (pure, unit-tested)
  /order-state.ts         → state machine (pure, unit-tested)
  /tenant.ts              → resolve cafe from host/path
  /supabase/              → server, browser, admin (service-role) clients
  /razorpay.ts
  /crypto.ts              → AES-256-GCM for stored secrets
  /rate-limit.ts
  /env.ts                 → Zod-validated env
/components               → ui (shadcn), menu, cart, board, charts
/supabase
  /migrations/            → SQL, the only way the schema changes
  /seed/                  → demo cafe + 60-day order generator
/tests                    → unit + e2e
```

---

## 3. Multi-Tenancy

### 3.1 Resolving the cafe ✅ [D-03]
`proxy.ts` (Next.js 16 renamed `middleware` to `proxy`) resolves the cafe on every request, in this order:
1. **Custom domain** (`order.bluebean.in`) → look up `cafe_domains`.
2. **Subdomain** (`bluebean.yourbrand.in`) → `cafes.slug`.
3. **Path fallback** (`/c/bluebean/...`) → for the free-tier `*.onrender.com` URL. [D-05]
4. **Table token** (`/t/<token>`) → the token itself identifies the cafe, so QR links work on any host.

The resolved `cafe_id` is passed in a request header. Results are cached in memory for 60 s (one Render instance).
- If no cafe matches, show a 404 "This cafe isn't on <Platform> yet".
- Reserved slugs (`www`, `api`, `app`, `admin`, `super`, `static`, `assets`, `mail`, `staff`, `kitchen`) are blocked at creation. `demo` is **not** reserved: it is the demo cafe. Source of truth: `lib/tenant.ts`.

### 3.2 Isolation ✅ [D-04]
- Every tenant table has `cafe_id uuid not null` plus an index starting with `cafe_id`.
- **RLS is on for every table.** Policies:
  - Staff can read and write rows where `cafe_id` is in their `staff` memberships, limited by role (see §6).
  - Anonymous guests can read only **public menu data** of **active** cafes, and **only their own** orders (`orders.customer_uid = auth.uid()`).
  - Guests **never insert directly**. Every guest write goes through an API route that validates and uses the service-role client. [D-06]
- The service-role key exists only on the server (`lib/supabase/admin.ts`, `import 'server-only'`).
- Each RLS policy gets a test that checks cafe A's staff can't read cafe B's orders.

---

## 4. Data Model

> Money is stored as **integer paise** everywhere ✅ [D-07]. Timestamps are `timestamptz` in UTC. Soft-delete via `archived_at`, because history must keep working.

```sql
-- PLATFORM ---------------------------------------------------------------
cafes (
  id uuid pk, slug text unique not null,              -- immutable after go-live [D-08]
  name text, logo_path text, brand_color text,         -- hex; foreground auto-picked for contrast
  timezone text default 'Asia/Kolkata',
  day_starts_at time default '04:00',                  -- business day for late-night cafes [D-09]
  gst_mode text check in ('none','regular') default 'regular',   [D-10]
  gstin text null, legal_name text, address text, phone text, email text, fssai_no text null,
  tax_rate_bp int default 500,                          -- basis points: 500 = 5%
  prices_include_tax bool default true,                 [D-11]
  ordering_paused bool default false, pause_message text,
  opening_hours jsonb,                                  -- {mon:[["08:00","23:00"]], ...}
  accept_mode text check in ('auto_paid','manual_all') default 'auto_paid',  [D-12]
  allow_pay_at_counter bool default true,
  google_review_url text null,
  plan text check in ('essential','growth','premium') default 'growth',
  addons jsonb default '{}',                            -- feature flags [D-13]
  status text check in ('trial','active','grace','suspended') default 'trial',
  amc_valid_until date,
  is_demo bool default false,
  -- Razorpay keys live in a separate `cafe_secrets` table with no client access at all [D-37]
  created_at, updated_at
)
cafe_domains (domain text pk, cafe_id)
platform_admins (user_id pk)

-- PEOPLE -------------------------------------------------------------------
staff (id, cafe_id, user_id unique, display_name, username,
       role check in ('owner','manager','cashier','kitchen'), active bool, created_at)

-- MENU ---------------------------------------------------------------------
categories (id, cafe_id, name, sort, is_visible, archived_at)
menu_items (id, cafe_id, category_id, name, description, price_paise int check >= 0,
            image_path, diet check in ('veg','nonveg','egg','vegan') null,
            tags text[],                                 -- spicy, bestseller-manual, new, jain...
            is_available bool default true,
            sold_out_until timestamptz null,             -- "sold out for today" [D-14]
            is_visible bool default true, sort, archived_at)
option_groups (id, cafe_id, item_id, name, min_select int default 0, max_select int default 1, sort)
options (id, cafe_id, group_id, name, price_delta_paise int default 0, is_available bool, sort)
item_pairings (cafe_id, item_id, paired_item_id, sort)  -- manual "goes well with"

-- TABLES -------------------------------------------------------------------
tables (id, cafe_id, label text,                         -- "T5", "Patio 2"
        token text unique,                               -- random 10 chars, used in QR [D-15]
        is_active bool, archived_at)

-- ORDERS -------------------------------------------------------------------
orders (
  id uuid pk, cafe_id, table_id null,                   -- null = staff counter order
  business_date date,                                   -- per day_starts_at
  daily_no int,                                         -- "#42", unique (cafe_id, business_date, daily_no)
  source check in ('qr','staff'),
  customer_uid uuid null,                               -- Supabase anon user
  guest_name text null,                                 -- optional, for calling out
  idempotency_key uuid,                                 -- unique (cafe_id, idempotency_key) [D-16]
  status check in ('pending_payment','placed','accepted','preparing','ready','served','completed','cancelled','rejected','expired'),
  payment_status check in ('unpaid','paid','partially_refunded','refunded'),
  payment_method check in ('online','cash','upi_counter','card_counter') null,
  subtotal_paise, tax_paise, cgst_paise, sgst_paise, round_off_paise, total_paise,
  tax_rate_bp, prices_include_tax,                      -- snapshot [D-17]
  invoice_no text null,                                 -- assigned on payment [D-18]
  note text, cancel_reason text,
  needs_attention bool default false,                   -- e.g. late payment on expired order
  placed_at, accepted_at, ready_at, served_at, paid_at, created_at, updated_at
)
order_items (id, order_id, cafe_id, item_id, name_snapshot, unit_price_paise,
             qty int check 1..50, options_snapshot jsonb, line_total_paise, note,
             status check in ('active','voided'))
payments (id, cafe_id, order_id, provider 'razorpay', rp_order_id unique, rp_payment_id unique null,
          amount_paise, status check in ('created','authorized','captured','failed','refunded'),
          raw jsonb, created_at)
refunds (id, cafe_id, payment_id, rp_refund_id, amount_paise, reason, by_staff_id, created_at)
invoice_counters (cafe_id, fy text, last_no int, pk(cafe_id, fy))   -- fy = '2526'
daily_counters (cafe_id, business_date, last_no int, pk(...))

-- SERVICE, FEEDBACK & AUDIT --------------------------------------------------
service_requests (id, cafe_id, table_id, type check in ('waiter','bill'), status ('open','done'),
                  customer_uid, created_at, done_at, done_by)
reviews (id, cafe_id, order_id unique, rating int 1..5, comment text check len<=500,
         is_hidden bool default false, created_at)
review_items (review_id, item_id, liked bool)
activity_log (id, cafe_id, actor_id, action, entity, entity_id, before jsonb, after jsonb, created_at)
```

**Key DB functions** (SQL, `security definer`, called only from the server):
- `next_daily_no(cafe_id, business_date)`: row-locked counter, so no duplicate `#42`.
- `next_invoice_no(cafe_id, fy)`: row-locked and gap-free → `BB/2526/000123` (≤ 16 chars, GST rule). [D-18]
- `transition_order(order_id, from, to, actor)`: enforces the state machine and rejects stale transitions (two cashiers tapping at once). [D-19]
- `reset_demo_cafe()`: wipes and reseeds only `is_demo = true` cafes.

**Indexes:** `orders(cafe_id, business_date)`, `orders(cafe_id, status)`, `orders(customer_uid)`, `order_items(order_id)`, `menu_items(cafe_id, category_id)`.

---

## 5. Core Flows

### 5.1 Guest opens the menu
1. Guest scans the QR → `https://<slug>.<domain>/t/<token>`.
2. The server resolves the table, the cafe, and the cafe's status.
   - Cafe suspended → "Online ordering is unavailable. Please order at the counter." (The menu is still shown, read-only.)
   - Table inactive or archived → "This table isn't active. Please ask staff."
   - Outside opening hours or `ordering_paused` → menu visible, ordering disabled, message shown.
3. The menu is server-rendered and cached per cafe; menu edits invalidate it via `revalidateTag('menu:<cafe>')`. Target: **< 2 s on 4G**, **< 150 KB JS** on customer routes. [D-20]
4. In the background, the client calls `supabase.auth.signInAnonymously()` once (the session is persisted) and subscribes to `menu:<cafe>` changes (stock toggles). ✅ [D-21]
5. Sold-out items render greyed out and can't be added. An item is available when `is_available && (sold_out_until is null || now() > sold_out_until)`.

### 5.2 Cart
- Zustand store keyed by `cafe_id:table_id`, persisted in localStorage for 6 hours.
- Each line has: item, selected options, qty, note. A line's key is a hash of item + options, so identical lines merge.
- The client validates option groups (`min_select`/`max_select`); the server validates them again.
- **A cart item goes out of stock (realtime):** the line is flagged "Sold out, remove to continue". Checkout is blocked until it's removed.
- **Scanning a different table** keeps the cart but moves it to the new table, with a toast "Ordering for Table 7 now".

### 5.3 Place order ✅ [D-22]
`POST /api/orders` with `{ tableToken, lines[], note, guestName?, payChoice: 'online'|'counter', idempotencyKey }`

The server:
1. Rate limit: max **5 orders / 10 min per guest**, **20 / 10 min per table**. [D-23]
2. Check the cafe is active, open and not paused; the table is active; and `counter` is allowed if chosen.
3. Load current prices and availability from the DB. **Never trust client prices.**
   - If an item is now unavailable → `409 {code:'ITEM_UNAVAILABLE', items}`.
   - If any price changed → `409 {code:'PRICE_CHANGED', cart}`. The client shows "Prices updated" and asks the guest to confirm again.
4. Compute totals with `lib/money.ts` (§5.6).
5. Insert the order + items in **one transaction**:
   - `idempotencyKey` is unique, so a retry returns the existing order (covers double taps and flaky networks).
   - Status: `payChoice='online'` → `pending_payment`; `counter` → `placed`.
6. Respond with `{ orderId, status, next: 'pay' | 'track' }`.

**Prank orders (someone outside photographs a QR):**
- Default `accept_mode = 'auto_paid'`: paid orders go straight to the kitchen; unpaid ones wait in a "New, needs OK" column. [D-12]
- The owner can switch to `manual_all`.

### 5.4 Online payment (Razorpay) ✅ [D-24]
1. `POST /api/payments/razorpay/create-order {orderId}`. The server creates a Razorpay order with the **DB total**, `receipt = orderId`, using the cafe's decrypted keys, and inserts `payments(status='created')`.
2. The client opens Checkout.js (UPI intent, cards, netbanking) with the cafe's name and logo.
3. **Success handler** → `POST /api/payments/razorpay/verify`. The server:
   - verifies the HMAC signature;
   - **fetches the payment from the Razorpay API and checks `amount` and `order_id`**;
   - marks the payment `captured` and the order `paid`;
   - assigns the invoice number;
   - moves the order `pending_payment → placed` (and to `accepted` if `auto_paid`).
4. **Webhook** `POST /api/webhooks/razorpay/[cafeId]` (`payment.captured`, `payment.failed`, `refund.processed`):
   - verifies the signature with the cafe's webhook secret;
   - runs the **same idempotent `markPaid()`**, so whichever of verify or webhook arrives first wins and the other is a no-op;
   - always returns 200 quickly.
5. Auto-capture must be **ON** in each cafe's Razorpay settings (part of the onboarding checklist).

**Edge cases:**

| Case | Handling |
|---|---|
| Guest closes the tab mid-payment | The webhook still marks it paid, and the order appears on the board. |
| Payment fails | The guest sees "Payment failed" with **Retry** or **Pay at counter** (switches to `placed`, unpaid). |
| Order unpaid for 15 min in `pending_payment` | A scheduled job marks it `expired`. It never reaches the kitchen. |
| **Payment captured after expiry** (late UPI) | Mark it paid, set `needs_attention = true`, and show a red banner on the board: "Late payment for expired order, serve or refund". |
| Paid twice (two payments on one order) | The second payment is flagged `needs_attention`; the owner refunds it from admin. |
| Razorpay is down | "Pay at counter" is always offered as a fallback (unless the cafe disabled it). |
| Amount tampering | Impossible: the amount comes from the DB, and step 3 cross-checks it with the Razorpay API. |
| Demo cafe | Uses **test keys**, with a "Demo mode: no real money" ribbon. |

### 5.5 Counter board (`/staff`)
- Columns: **New** (needs OK) · **Preparing** · **Ready** · **Served, unpaid**. Each card shows the table, `#no`, items + options + notes, age timer, and a paid/unpaid badge.
- Actions: Accept / Reject (with reason) · Ready · Served · **Mark paid** (cash / UPI at counter / card) · Cancel · Move table · Void item (sold out after ordering).
- **Start shift** button (required) unlocks audio (browser autoplay rule) and requests a Wake Lock so the screen stays on. [D-25]
- **New-order alert:** chime that repeats every 20 s until acknowledged, plus a flashing card and a tab title like `(3) New orders`. It sounds only in the visible tab, so two open tabs don't double-ring.
- **Connection handling:** [D-26]
  - Subscribe to `orders`/`service_requests` for this cafe.
  - On any disconnect, show a red "Offline, reconnecting…" bar.
  - On reconnect, **refetch everything** (never trust missed events). There's also a 30 s background refetch as a safety net.
- Concurrency: every status change calls `transition_order(from,to)`. If another device already moved the order, the UI refreshes with the toast "Already updated by another device".
- **Stock panel:** search + toggles per item and per option. A toggle offers "Sold out for today" (until the next business day starts) or "Until I turn it back on".
- **Pause ordering** switch with a preset message ("Kitchen is busy, back in 15 minutes").
- **Staff-assisted ordering:** "New order" → pick a table (or "Counter/takeaway") → the same menu UI in staff mode → placed as `source='staff'`, auto-accepted.

### 5.6 Money, GST & bills ✅ [D-27]
- All math is in integer paise in `lib/money.ts` (pure, 100% unit-tested).
- `line_total = (unit_price + Σ option_deltas) × qty`
- **Prices include tax** (`prices_include_tax = true`, the default, which is how Indian cafes usually print menus):
  - `taxable = round(subtotal × 10000 / (10000 + rate_bp))`
  - `tax = subtotal − taxable`
- **Prices exclude tax:** `tax = round(subtotal × rate_bp / 10000)`.
- `cgst = floor(tax / 2)`, `sgst = tax − cgst`.
- `total` is rounded to the nearest rupee and shown as a **"Round off"** line, the standard on Indian bills.
- `gst_mode = 'none'` (unregistered or composition cafe): no tax lines, the bill is titled **"Bill of Supply"**, and no GSTIN is shown. A composition cafe **must not** collect GST from customers. [D-10]
- **No service charge** in v1. Indian consumer guidelines (CCPA, 2022) bar adding it automatically. [D-28]
- **Invoice number** is assigned when the order is **paid** (not when placed), so cancellations don't leave gaps. It resets each financial year (1 April). [D-18]
- The bill/receipt page shows the cafe's legal name, address, GSTIN, FSSAI no., invoice no., date/time (cafe TZ), items, taxable value, CGST/SGST, round off and total. It has a print-friendly layout and is shareable as a link.

### 5.7 Guest order tracking
- `/t/<token>/order/<id>` is readable only by its `customer_uid` (RLS), and updates live through realtime.
- Timeline: Placed → Accepted → Preparing → Ready → Served. It also shows the order `#no`.
- **Cancel** is allowed only while the order is `placed` and not yet accepted. Paid orders can't be self-cancelled; the guest asks staff, and the owner refunds.
- If the guest loses the session (cleared browser), tracking is lost, but the order is safe on the board.
- "My orders at this table" lists this device's orders in the current business day, with "Pay remaining" for unpaid ones (one Razorpay order covering several unpaid orders).

### 5.8 Service requests
- **Call waiter** / **Request bill**: limited to 1 per type per table every 2 min.
- They appear as a banner on the board with a chime, and staff tap **Done**.

### 5.9 Reviews
- The guest is prompted once an order is `served`, or right after paying.
- One review per order (unique). Rating 1–5, optional comment (≤ 500 chars), optional 👍/👎 per item.
- **Rating ≤ 2** → an instant red alert on the board and in admin ("Table 5 rated 2★: 'coffee was cold'"), so staff can fix it while the guest is still there.
- After **any** rating, show "Enjoyed it? Review us on Google" if `google_review_url` is set. The link is shown to everyone; **never** only to happy guests, because Google forbids review gating. [D-29]
- The owner can hide abusive reviews (they're still counted in stats, marked hidden).

### 5.10 Upsell
- Item detail sheet shows **"Goes well with"**: manual `item_pairings` first, filled up with auto pairs = items most often in the same order over the last 60 days (min 5 co-occurrences). Computed nightly into a cache table.
- **Best-seller** badge: top 5 items by quantity in the last 30 days (computed nightly).
- Cart footer: one suggestion ("Add a brownie for ₹120?") taken from the pairings of the items in the cart.
- Combos in v1 are ordinary items in a "Combos" category. No bundle-pricing engine. [D-30]

### 5.11 Owner analytics (`/admin`)
All figures exclude cancelled, rejected and expired orders, subtract refunds, and use the cafe's timezone and business day. [D-31]
- **KPI tiles:** today's sales, orders, average order value, compared with the same weekday last week.
- **Revenue trend:** daily / weekly / monthly.
- **Top and bottom items:** by quantity and revenue, plus 👍 ratio.
- **Peak hours heatmap:** weekday × hour.
- **Table performance:** orders and revenue per table.
- **Payment mix:** online vs counter.
- **Ratings:** average and distribution, plus the latest reviews.
- **Billing:** order and invoice list with filters (date, status, payment method), invoice view, and **CSV export** in a GST-ready format for the accountant.
- At ~100 orders/day, live SQL queries via RPC functions are fast enough. No warehouse is needed.

### 5.12 Admin management
- **Menu:** categories (drag to sort), items (photo upload: ≤ 5 MB in, re-encoded to WebP ≤ 1200 px plus a 400 px thumbnail), option groups, pairings, visibility, archive (never hard-delete).
- **Tables:** add, rename, deactivate, and **download printable QR cards** (A6 PDF/SVG with cafe logo, table label and "Scan to order"). Can regenerate a token if a QR is misused; this invalidates the old one.
- **Staff:** create cashier/kitchen/manager accounts (username + password), reset passwords, deactivate (sessions revoked).
- **Settings:** branding (logo, colour with a contrast check), hours, pause message, GST mode/rate/GSTIN, tax-inclusive toggle, accept mode, pay-at-counter toggle, Google review link, Razorpay keys (write-only; shows only `rzp_live_****abcd`).
- **Data export:** everything as CSV, available at any time and even while suspended. [D-32]

### 5.13 Super-admin (`/super`)
- **Create cafe wizard:** slug, name, owner email (sends a set-password link), plan, add-ons, AMC date. Seeds default categories.
- **List view:** status, plan, AMC due, last order time (a health signal).
- **Actions:** suspend / reactivate, extend AMC, toggle flags, mark `is_demo`.
- **Status rules:**
  - `grace` shows the owner a renewal banner 15 days before `amc_valid_until`.
  - `suspended` blocks guest ordering, but the owner can still log in and export.
  - Status changes are **manual only**: no hidden automatic shutdown. [D-33]

### 5.14 Demo
- Platform root `/` is the demo launcher: product pitch, a **live QR** to the demo cafe's table, and buttons to open the Customer / Counter / Kitchen / Owner views. The demo staff logins are auto-filled.
- **Demo cafe:** placeholder name "Brew & Bloom", 35 items with photos, 12 tables.
- **Seed generator:** 60 days of orders with realistic patterns (weekday/weekend curves, lunch and evening peaks, item popularity skew, ~8% counter payments, ratings mostly 4–5 with a few lows).
- **Reset demo:** a button in the demo admin plus an automatic nightly reset (pg_cron). It's rate-limited and touches only `is_demo` cafes.

### 5.15 Legal pages per cafe ✅ [D-34]
Razorpay KYC requires the merchant's website to have **Contact, Terms, Privacy, and Refund & Cancellation** pages. These are generated from templates filled with the cafe's legal name, address, phone and email, at `/legal/*`, and linked in the menu footer.

---

## 6. Auth & Permissions ✅ [D-35]

| Action | Guest (anon) | Kitchen | Cashier | Manager | Owner | Super |
|---|---|---|---|---|---|---|
| View menu, place/track own order | ✓ | | | | | |
| See board, change order status | | ✓ (kitchen states only) | ✓ | ✓ | ✓ | |
| Mark paid, reject, cancel unpaid | | | ✓ | ✓ | ✓ | |
| Stock toggles, pause ordering | | ✓ | ✓ | ✓ | ✓ | |
| Refunds, void paid item | | | | ✓ | ✓ | |
| Menu CRUD, tables, prices | | | | ✓ | ✓ | |
| Staff management, settings, Razorpay keys | | | | | ✓ | |
| Analytics, billing export | | | | ✓ | ✓ | |
| Create/suspend cafes, flags | | | | | | ✓ |

- **Owner** logs in with email + password. **Staff** log in with a **username + password**: the account is created via the admin API using a synthetic email `username@<slug>.staff.<platform-domain>` (a domain we own), with `email_confirm: true`. [D-36]
- Sessions are long-lived on counter tablets (refresh tokens). Deactivating staff revokes their sessions.
- Owner password reset uses Supabase email (low volume is fine). Staff passwords are reset by the owner.
- **Anonymous guests:** `signInAnonymously()`. A monthly job deletes anonymous users older than 30 days. Anonymous sessions are rate-limited by Supabase; Turnstile CAPTCHA is available behind a flag if abuse appears. [D-21]

---

## 7. Security Checklist ✅

- [ ] RLS enabled on every table, with tests
- [ ] Service-role key server-only (`server-only` import guard)
- [ ] Zod validation on every API body/query; reject unknown fields
- [ ] Prices, totals, tax and availability always computed server-side
- [ ] Razorpay signature verification + API amount cross-check + webhook signature
- [ ] Cafe Razorpay secrets encrypted with AES-256-GCM (`APP_ENCRYPTION_KEY`), never sent to the browser [D-37]
- [ ] Rate limits: in-memory (single Render instance) [D-23]; move to Postgres/Upstash when scaling to more than 1 instance
- [ ] Origin check on state-changing API routes
- [ ] Uploads: type sniffing, size limit, re-encode with sharp (strips EXIF/scripts)
- [ ] No `dangerouslySetInnerHTML` with user content; CSP headers
- [ ] Table tokens random (not `table-5`); can be regenerated
- [ ] `activity_log` for price changes, stock toggles, refunds, voids, settings, staff changes
- [ ] Personal data minimal: no phone or email needed to order (DPDP-friendly); optional guest name only
- [ ] Secrets in Render env vars, never in git; `.env.example` documents them

---

## 8. Reliability: What Can Go Wrong (and the decision)

| # | Scenario | Decision |
|---|---|---|
| R1 | Guest double-taps "Place order" / network retry | Idempotency key + disabled button [D-16] |
| R2 | Price changed while the item was in the cart | 409 + "Prices updated", guest re-confirms |
| R3 | Item sold out while in the cart | Realtime flag + server 409; checkout blocked until removed |
| R4 | Item sold out **after** a paid order | Cashier voids the item → owner/manager partial refund, or offers a swap |
| R5 | Two cashiers update the same order | `transition_order(from,to)` compare-and-set [D-19] |
| R6 | Counter tablet loses Wi-Fi | Orders are safe in the DB; red offline bar; full refetch on reconnect; any staff phone can open the board |
| R7 | Cafe Wi-Fi down for guests | The menu is light enough for mobile data; customer pages don't depend on cafe Wi-Fi |
| R8 | Guest closes the browser mid-payment | Webhook completes it [D-24] |
| R9 | Late payment on an expired order | `needs_attention` banner: serve or refund |
| R10 | Razorpay outage | Pay at counter fallback |
| R11 | Render deploy during service | Render zero-downtime deploys; deploy off-peak (after 11 pm IST) |
| R12 | Render instance crash | Auto-restart; UptimeRobot alerts you within 5 min |
| R13 | Supabase free-tier idle pause | Prod is used daily; the demo nightly reset keeps it active too |
| R14 | Supabase free tier has no backups | **Daily GitHub Action `pg_dump` → encrypted artifact in a private repo, 30-day retention**; quarterly restore drill [D-38] |
| R15 | Free-tier transfer limit (5 GB) | WebP thumbnails, lazy loading, long cache headers; move images to Cloudflare R2 if nearing the limit |
| R16 | Late-night cafe crosses midnight | `day_starts_at` business day [D-09] |
| R17 | Financial-year rollover | Invoice counter keyed by FY [D-18] |
| R18 | Tax rate or price changed mid-day | Snapshots on each order [D-17] |
| R19 | Table renamed/removed with history | Soft archive; old orders keep `table_id` |
| R20 | Item deleted with history | Soft archive; `name_snapshot` on order items |
| R21 | QR printed before the real domain exists | **Never print client QRs on the `onrender.com` URL.** Domain first, then print. QR format `https://<slug>.<domain>/t/<token>` is permanent [D-08] |
| R22 | Prank orders | `auto_paid` accept mode, rate limits, token regeneration [D-12] |
| R23 | Kitchen overwhelmed | Pause ordering switch with message |
| R24 | Guest at a closed cafe | Opening hours: menu visible, ordering off |
| R25 | Phone muted / tablet sleeps | Wake Lock, repeating chime, flashing card, title badge [D-25] |
| R26 | Same guest at two tables / two cafes | Cart keyed by cafe+table |
| R27 | Huge menu (200+ items) | Sticky category tabs, search, lazy images, item list virtualised over 150 items |
| R28 | Old phones | Support Android Chrome 90+, iOS Safari 15+; no app; graceful without JS for reading the menu |
| R29 | Owner loses password / leaves | Super-admin can reset the owner; ownership transfer via super |
| R30 | AMC unpaid | Manual suspend after grace; ordering off, export still on [D-33] |
| R31 | Demo data leaking into stats | `is_demo` excluded from platform stats; demo reset scoped by flag |
| R32 | Anonymous user build-up | Monthly cleanup job |
| R33 | Clock/timezone bugs | Store UTC; compute business dates in the DB with the cafe TZ; tests around midnight IST and 31 Mar → 1 Apr |
| R34 | Rounding disputes | One function, unit-tested, "Round off" line shown |

---

## 9. Performance Budgets 🔁 [D-20]
- Customer menu: LCP < 2 s on Fast 4G (Moto G class); JS < 150 KB gzipped; first menu images ≤ 60 KB each.
- Board: new order visible < 2 s after placing.
- API p95 < 400 ms (Render Singapore ↔ Supabase Mumbai ≈ 40–60 ms per round trip, so batch queries and use RPCs).

---

## 10. Design System 🔁 [D-39]
- **Default look:** clean and modern with a warm accent. Each cafe's brand colour drives the accent, with the text colour picked automatically for contrast (WCAG AA).
- **Customer UI:** mobile-first, large photos, 44 px tap targets, sticky category bar, bottom cart bar, veg/non-veg dots (Indian convention: green square/dot, red/brown triangle).
- **Staff UI:** tablet landscape first, big cards, colour-coded ages (green < 10 min, amber 10–20, red > 20).
- **Admin UI:** desktop-first, responsive down to phone (owners check sales on their phone).
- Light/dark: customer pages light by default (food photos); staff/admin follow the system setting.
- Strings live in one dictionary file, ready for the multi-language add-on.

---

## 11. Environments & Config

| Env | Host | DB | Razorpay |
|---|---|---|---|
| Local | `localhost:3000` (path tenant `/c/demo`) | Supabase `dev` (free) or local Supabase CLI | test |
| Test/demo (pre-client) | Render Free `*.onrender.com` | Supabase `prod` (free) | test |
| Production | Render Starter + `*.yourbrand.in` | Supabase `prod` (free → Pro at ~5 cafes) | live per cafe |

**Env vars** (validated by `lib/env.ts`):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (Supabase's new key names)
- `APP_ENCRYPTION_KEY` (32 bytes, base64)
- `PLATFORM_NAME`, `PLATFORM_DOMAIN`, `TENANT_MODE=subdomain|path`
- `DEMO_RAZORPAY_KEY_ID`, `DEMO_RAZORPAY_KEY_SECRET`
- `SENTRY_DSN`, `CRON_SECRET`

**Scheduled jobs:**
- Every 5 min: expire `pending_payment` orders older than 15 min.
- Nightly: recompute best-sellers and pairings; reset the demo.
- Monthly: anonymous user cleanup.
- Daily: backup.

Jobs run with **pg_cron** inside Supabase, except backups (GitHub Action). [D-40]

---

## 12. Testing Strategy

| Layer | What |
|---|---|
| Unit (Vitest) | `money.ts` (inclusive/exclusive tax, rounding, option deltas), `order-state.ts`, business-date calc, tenant resolver |
| DB tests | RLS isolation (cafe A vs B, guest vs other guest), counters under concurrency, `transition_order` |
| API integration | Order creation (409 paths, idempotency, rate limit), payment verify + webhook idempotency, late payment |
| E2E (Playwright) | Guest scan → order → pay (Razorpay test) → board shows it → accept → ready → served → review; staff order; stock toggle reflects live; pause ordering |
| Manual QA | Real Android + iPhone on 4G, tablet on the counter for 2 h (sleep, sound, reconnect), printed QR scan test |
| Load (k6) | 100 concurrent menu loads + 20 orders/min for 10 min, which is about 10× a 100-orders/day cafe's peak |

---

## 13. Build Phases & Acceptance Criteria

| Phase | Deliverables | Done when |
|---|---|---|
| **0. Foundation** (~2–3 days) | Next.js init, Tailwind/shadcn, env validation, Supabase project + migrations for the whole §4 schema, RLS, DB functions, tenant middleware (subdomain + path), auth scaffolding, `money.ts` + tests, seed script (demo cafe menu) | `npm test` green; `/c/demo` renders the cafe name from the DB; RLS tests pass |
| **1. Guest ordering** (~4 days) | Menu page (categories, search, tags, sold-out), item sheet with options, cart, checkout (pay at counter), order API with all 409 paths, tracking page, anonymous auth, realtime menu | A guest can order and track; sold-out toggled in SQL appears live |
| **2. Counter + kitchen** (~4 days) | Staff login, board with realtime + sound + wake lock + reconnect, transitions, mark paid, stock panel, pause, service requests, staff-assisted ordering, kitchen display | Full loop on two devices; disconnect test passes |
| **3. Payments & bills** (~3 days) | Razorpay create/verify/webhook, expiry job, late-payment handling, refunds, invoice numbering, GST bill page, legal pages | E2E with Razorpay test mode incl. closed-tab and failure cases |
| **4. Owner admin** (~5 days) | Dashboard + charts, billing + CSV, menu CRUD + images, tables + QR PDF, staff mgmt, settings (branding, GST, hours, keys) | The owner can run the cafe without SQL |
| **5. Reviews & upsell** (~2 days) | Review flow, low-rating alert, Google link, pairings (manual + nightly auto), best-sellers, cart suggestion | Low rating pops on the board live |
| **6. Demo polish** (~3 days) | Launcher, 60-day seed generator, reset demo, animations, empty states, phone QA, performance budget | Pitch-ready demo on Render Free |
| **7. Productise** (~3 days) | Super-admin, plan/add-on gating, suspension/grace banners, backups Action, Sentry, UptimeRobot, onboarding checklist doc | First client can be onboarded in < 2 h |

**Total: about 26–29 working days** of focused build. Phases 0–2 already make a convincing live demo.

**Feature gating by plan** (`lib/features.ts`, checked on both server and UI) [D-13]:
- **Essential:** core ordering, payments, bills, daily summary, staff ordering
- **Growth:** + branding, analytics, reviews, service requests, upsell, exports
- **Premium:** + kitchen display + v1.5 items as they ship
- `cafes.addons` can switch on any single feature regardless of plan.

---

## 14. Decisions Index

| ID | Decision |
|---|---|
| D-01 | Basic kitchen display ships in v1 🔁 |
| D-02 | Stack: Next.js + Supabase + Tailwind/shadcn + Razorpay on Render |
| D-03 | Tenant resolution order: custom domain → subdomain → `/c/slug` → table token |
| D-04 | `cafe_id` on every table + RLS everywhere |
| D-05 | Path fallback `/c/[slug]` for the free-tier URL |
| D-06 | Guests never write directly to the DB; only via validated API routes |
| D-07 | Money in integer paise |
| D-08 | Slug immutable after go-live; QR URLs permanent |
| D-09 | Business day starts at a configurable time (default 04:00) |
| D-10 | `gst_mode` none/regular; "Bill of Supply" when none |
| D-11 | Prices include tax by default |
| D-12 | Default accept mode: paid orders auto-accepted, unpaid need cashier OK |
| D-13 | Plan + add-on feature flags per cafe |
| D-14 | "Sold out for today" via `sold_out_until`, no cron needed |
| D-15 | Random table tokens, can be regenerated |
| D-16 | Idempotency key on order creation |
| D-17 | Price/tax snapshots on orders |
| D-18 | Gap-free invoice numbers per financial year, assigned on payment |
| D-19 | DB-enforced order state machine with compare-and-set |
| D-20 | Performance budgets for customer pages |
| D-21 | Supabase anonymous auth for guests (RLS on their own orders) |
| D-22 | Order API validates everything server-side and returns typed 409s |
| D-23 | In-memory rate limits (single instance) |
| D-24 | Razorpay verify + webhook, both idempotent; amount cross-checked via API |
| D-25 | Start-shift button for audio + wake lock |
| D-26 | Full refetch on realtime reconnect + 30 s safety poll |
| D-27 | GST math rules (inclusive formula, CGST/SGST split, round off) |
| D-28 | No service charge |
| D-29 | Google review link shown to all raters (no gating) |
| D-30 | Combos are plain items in v1 |
| D-31 | Analytics exclude cancelled/expired, subtract refunds, use the business day |
| D-32 | Data export always available, even when suspended |
| D-33 | Suspension is manual and transparent |
| D-34 | Per-cafe legal pages for Razorpay KYC |
| D-35 | Role permission matrix (§6) |
| D-36 | Staff log in by username (synthetic email on our domain) |
| D-37 | Razorpay secrets encrypted at rest (AES-256-GCM) |
| D-38 | Own daily `pg_dump` backups while on Supabase Free |
| D-39 | Design defaults 🔁 |
| D-40 | Scheduled jobs on pg_cron; backups on GitHub Actions |

### Still needs your input (defaults are used until you decide)
1. **Platform brand name + domain**: placeholder `PLATFORM_NAME` env var until decided.
2. **Design style**: default per D-39.
3. **Kitchen display in v1**: default yes (D-01).

---

## 15. Build Log

### Phase 0: Foundation (2026-10-03)
**Done**
- Next.js 16.3 + TypeScript + Tailwind v4 + shadcn/ui; env validated with Zod (`lib/env.ts`, `lib/env.server.ts`)
- Migrations: full §4 schema, composite cross-tenant foreign keys, RLS on every table, SQL functions (counters, state machine, availability RPCs, expiry job), pg_cron schedule (skipped where pg_cron is missing)
- `proxy.ts` tenant routing (subdomain / `/c/slug` / custom domain / table token) with header-spoofing protection
- Supabase clients: user (RLS), admin (service role, server-only), browser, proxy session refresh
- `lib/money.ts`, `lib/order-state.ts`, `lib/business-date.ts`, `lib/tenant.ts`, `lib/crypto.ts`, `lib/tokens.ts`
- Demo cafe seed: Brew & Bloom, 36 items, coffee options, pairings, 12 tables (tokens `bbtable001`–`bbtable012`)
- **72 tests passing**: unit tests, plus DB tests that run the real migrations in **PGlite** with a Supabase shim (`tests/db/`). They cover RLS isolation, secrets, column-level grants, the state machine (SQL ↔ TS parity), counters under concurrency, and dates (SQL ↔ TS parity).

**Changes from the spec**
- npm instead of pnpm; `proxy.ts` instead of `middleware.ts` (Next 16)
- Secrets moved to `cafe_secrets` (no policies, so it's service-role only)
- Guests can't read `cafes` directly (plan and AMC data are private). Guest pages get cafe info server-side; live "ordering paused" updates for guests come in Phase 1 via Realtime broadcast.

**Waiting on**
- A Supabase project (free) to run `/c/demo` against a real database. Every other Phase 0 check passes locally.

**Update (same day)**
- Node 22 is now required: supabase-js needs native WebSocket. Installed with nvm-windows; `engines.node >= 22`, `.node-version` = 22.
- Local development uses **Supabase in Docker** (`npx supabase start`). All migrations and the seed apply cleanly on real Supabase Postgres, including pg_cron and the realtime publication. `npm run dev` reads `.env.development.local` (local stack); `.env.local` holds the cloud project.
- ✅ Phase 0 exit check met: `/c/demo` renders "Brew & Bloom" from the database. RLS verified against real Supabase as well: a guest gets 36 menu items, 0 cafes, 0 table tokens, 0 secrets, and is blocked from the counters.
- Cloud project: keys verified. Schema push waits for `SUPABASE_ACCESS_TOKEN`; anonymous sign-ins still need switching on in the dashboard.

### Phase 1: Guest ordering (2026-10-03)
**Done**
- `/t/[token]`: menu with sticky category tabs (scroll-spy), search, veg filter, Indian veg/non-veg marks, tags, sold-out state, "Customisable" hint, and an in-progress order banner
- Item sheet: option groups (radio/checkbox with min/max), required-choice defaults, per-item note, quantity, live price
- Cart (`zustand`, persisted, hydrated after mount): per-cafe, moves with the guest across tables, expires after 6 h, keeps the idempotency key across retries
- `/t/[token]/cart`: live price/sold-out reconciliation, typed 409 handling, GST-correct bill preview, optional guest name and kitchen note, pay at counter
- `POST /api/orders`: same-origin check, anonymous session required, Zod strict schema, server-side pricing (`lib/orders/validate.ts`), opening hours / pause / suspension / inactive table checks, rate limits, idempotency (retries don't count towards limits), atomic `place_order` RPC
- `/t/[token]/order/[id]`: live tracking via Realtime with reconnect catch-up, cancel while `placed` (`POST /api/orders/[id]/cancel`, CAS-protected)
- Live menu: Realtime updates for stock and price, full refresh on reconnect or tab focus
- Friendly error page for guest routes when the database is unreachable
- **97 tests** (+25): cart pricing rejections, schema strictness, opening hours across midnight, contrast, rate limiter, `place_order` atomicity, idempotency and permissions, FK-ambiguity guard

**Verified in the browser (local Supabase)**: customised order → Order #1 → status changes pushed live to the guest; sold-out pushed live to an open menu; API rejects sold-out items, tampered prices, client-sent totals, unknown tables, cross-site and session-less requests; duplicate submit returns the same order; rate limit after 5 orders/10 min; cancel refused once the kitchen has started.

**Changes from the spec**
- Migration `…006` drops the single-column FKs that duplicated the composite cross-tenant FKs (they made Supabase API embeds ambiguous, PGRST201). A test guards against reintroducing them.
- Guests are signed in anonymously **only when they place their first order**, not when they open the menu, so browsing creates no auth users.
- "Ordering paused" reaches guests on page focus/refresh and is enforced by the API; push-based updates come with the counter panel (Phase 2).

### Motion pass (2026-10-03)
CSS-only animations (no library, keeping the customer JS budget), all in `app/globals.css` under "Motion", all switched off for `prefers-reduced-motion`. Entry animations use `backwards` fill, so nothing stays hidden or overrides state styles (e.g. sold-out dimming) once they finish.
- Item sheet slides up/down with a fading backdrop (unmounts after the exit animation)
- Menu rows rise in with a 35 ms stagger (first 12); category highlight is one pill that slides between tabs (positioned from the DOM, no re-renders)
- Cart bar slides up; item count pops on change; ADD pops into the stepper; press feedback on buttons
- Cart page slides in from the right; removed lines slide out; total pops when it changes; spinner while placing
- Tracker: self-drawing tick for a just-placed order, status headline cross-fades, reached steps pop, connector lines fill, current step pulses
- Toasts slide down from the top
