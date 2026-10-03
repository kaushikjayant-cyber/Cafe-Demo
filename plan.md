# Cafe Ordering System: Demo Template Plan

> Engineering/build spec lives in [IMPLEMENTATION.md](IMPLEMENTATION.md).

> Living document. Every decision we make goes here so context is never lost.
> Status legend: ✅ Decided · 🟡 Proposed (needs your confirmation) · ❓ Open question

---

## 1. Goal

Build a **white-label, sellable demo** of a QR-based cafe ordering system. It is a generic template, not built for one cafe, so we can show it to any cafe owner, rebrand it in minutes (name, logo, colors, menu), and sell it.

The demo has to **sell itself in 5 minutes**. The owner should scan a QR code with their own phone, place an order, watch it appear instantly on the cashier screen, and then see it show up in the owner analytics.

---

## 2. User Roles

| Role | Device | Login | Purpose |
|---|---|---|---|
| **Customer** | Own phone (scans table QR) | ❌ None | Browse menu, order, pay, track, review |
| **Cashier / Staff** | Tablet / PC at counter | ✅ PIN or password | Manage live orders, mark items out of stock, handle cash payments |
| **Kitchen** (optional screen) | Tablet in kitchen | ✅ Shares the staff login | See what to prepare, mark items ready |
| **Owner / Admin** | Laptop / phone | ✅ Password | Billing, analytics, menu management, reviews, settings |

---

## 3. Core Features (from your requirements) ✅

### 3.1 QR Table Ordering (Customer)
- Each table gets a unique QR code, e.g. `/t/12`, so the order is tagged with **Table 12** automatically
- Mobile-first menu with categories, item photos, prices, descriptions
- **Out-of-stock items show greyed out ("Sold out")** and update live, with no refresh needed
- Cart, then checkout, then payment
- **Live order status tracker**: Placed → Accepted → Preparing → Ready → Served
- Can add more items to the same table's running bill ("Order more")

### 3.2 Menu Control (Cashier)
- One-tap **In stock / Out of stock** toggle per item, pushed live to every customer's phone
- Edit price, temporarily hide items
- (The owner can also do full menu CRUD: add/remove items, categories, photos)

### 3.3 Payment System
- **Pay online** (UPI / card via a payment gateway) **or** **Pay at counter** (cash, which the cashier marks as paid)
- Digital receipt / invoice shown after payment (with GST breakdown)
- Demo uses the gateway's **test mode**, so no real money moves

### 3.4 Owner Panel
- **Billing**: all orders and invoices, filter by date, export to CSV/PDF
- **Analytics dashboard**:
  - Today's revenue, order count, average order value
  - **Most-demanded items** (top sellers) and least-selling items
  - Peak hours heatmap (which hours and days are busiest)
  - Revenue trend chart (daily / weekly / monthly)
  - Table-wise performance
- Menu management (full CRUD)
- Table and QR management (add tables, **download printable QR codes**)
- Staff management (create cashier logins)

### 3.5 Review System
- After an order is served or paid, the customer is prompted: **overall rating (1–5 ★) + optional comment**
- Optional **per-item thumbs up / down**
- Owner panel: reviews list, average rating, **low-rating alerts** (≤ 2★ highlighted), and ratings per item

---

## 4. Additional Feature Ideas (my suggestions) 🟡

These make the demo look premium. Tick which ones we keep.

### High impact, low effort ✅ ALL INCLUDED IN v1
- [x] **Demo launcher page**: one landing page with buttons "Open as Customer / Cashier / Kitchen / Owner" plus a QR you can scan live. *The single most important thing for selling.*
- [x] **Branding settings**: cafe name, logo, theme color, currency, tax %, all from the admin panel. Proves it's a template.
- [x] **Real-time sound + notification** on the cashier screen when a new order arrives
- [x] **Call Waiter / Request Bill** button for customers
- [x] **Veg / Non-veg / Vegan / Spicy tags** and a search bar on the menu
- [x] **Item customisations / add-ons**: size (S/M/L), extra shot, milk type, sugar level. Essential for a cafe.
- [x] **Special instructions** note per item ("less sugar")
- [x] **Seeded demo data**: 30+ items and ~2 months of fake orders, so the analytics look alive
- [x] **Reset demo** button that restores the seed data after a client presentation

### Medium effort (v1.5)
- [ ] **Kitchen Display System (KDS)**: separate screen with order tickets, timers, and "Ready" button
- [ ] **Coupons / discount codes**
- [ ] **Tips** at checkout
- [ ] **Split bill** among friends at a table
- [ ] **Multi-language menu** (English + Hindi / regional)
- [ ] **PWA** (installable on the staff tablet like an app)
- [ ] **Dark mode**
- [ ] **Printable KOT / bill** (thermal printer friendly layout)

### Bigger features (v2, upsell to clients)
- [ ] **Loyalty points** via phone-number based customer profiles
- [ ] **Inventory tracking** (auto out-of-stock when ingredients run out)
- [ ] **Takeaway / pre-order** (order ahead without a table)
- [ ] **WhatsApp / SMS receipt**
- [ ] **AI insights** ("Cold coffee sales drop 40% on rainy days, consider a promo")
- [ ] **Multi-branch support** (one owner, several outlets)

---

## 5. Tech Stack ✅

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 15 (App Router) + TypeScript** | One codebase for all 4 panels plus the API; easy deploy |
| Styling / UI | **Tailwind CSS + shadcn/ui** | Fast, modern, polished look |
| Database | **Supabase (PostgreSQL)** | Free tier, hosted |
| Real-time | **Supabase Realtime** | Live orders, live stock toggles, live status, all built in |
| Auth | **Supabase Auth** (staff/owner only) | Customers need no login |
| Images | **Supabase Storage** | Menu photos, cafe logo |
| Payments | **Razorpay** (test mode for demo, live keys per cafe) | India: UPI, cards, netbanking |
| Charts | **Recharts** | Analytics dashboard |
| QR codes | **`qrcode` npm package** | Generate printable table QRs |
| Hosting | **Render** (app, Singapore region) + **Supabase** (DB, Mumbai region) + **Cloudflare** (DNS), all under **your** accounts | See §12 for costs, §14 for setup |

**Multi-tenant from day one** ✅ (confirmed): one deployment and one database serve **all** your client cafes. Every table carries a `cafe_id`, and each cafe gets its own subdomain (`bluebean.yourbrand.in`). Supabase Row-Level Security keeps each cafe's data separate.
- Why: hosting cost stays almost flat as you add cafes (see §12), one bug fix or update reaches every client at once, and no client ever holds a copy of the code (see §13).
- Cost: about 10–15% more work up front than a single-cafe app. It's much cheaper to build in now than to retrofit later.

---

## 6. Data Model (draft)

> Every table below (except `cafes`) has a `cafe_id` column (multi-tenant).

```
cafes           (id, slug/subdomain, name, logo_url, theme_color, currency,
                 tax_percent, gstin, razorpay_key_id, razorpay_secret_enc,
                 plan: essential|growth|premium, addons jsonb,   -- feature flags per cafe
                 plan_status: active|suspended, amc_valid_until, created_at)
categories      (id, cafe_id, name, sort_order, is_active)
menu_items      (id, cafe_id, category_id, name, description, price, image_url,
                 tags[], is_available, is_hidden, sort_order)
item_options    (id, item_id, group_name, option_name, extra_price)  -- size, milk, add-ons
tables          (id, cafe_id, number, label, qr_token, is_active)
orders          (id, cafe_id, table_id, order_no, status, subtotal, tax, discount, tip, total,
                 payment_status, payment_method, created_at)
order_items     (id, order_id, item_id, name_snapshot, qty, unit_price, options_json, note)
payments        (id, order_id, provider, provider_order_id, provider_payment_id,
                 amount, status, created_at)
reviews         (id, cafe_id, order_id, rating, comment, created_at)
item_reviews    (id, review_id, item_id, liked boolean)
staff           (id, cafe_id, user_id, name, role: owner|cashier|kitchen)
service_requests(id, cafe_id, table_id, type: waiter|bill, status, created_at)
super_admins    (user_id)   -- you: manage all cafes from one place
```

**Order status flow:** `placed → accepted → preparing → ready → served → completed` (or `cancelled`)
**Payment status:** `unpaid → paid` (online or cash) · `refunded`
**Razorpay flow:** server creates the Razorpay order → customer pays in the Checkout popup → server **verifies the signature** and a **webhook** confirms it. The browser is never trusted to mark an order paid.

---

## 7. App Routes / Screens

```
/                        Demo launcher (role switcher + live QR), demo only
/t/[tableToken]          Customer menu (QR lands here)
/t/[tableToken]/cart     Cart + checkout
/t/[tableToken]/order/[id]  Live order tracking + receipt + review
/staff                   Cashier dashboard (live orders board, stock toggles)
/kitchen                 Kitchen display
/admin                   Owner dashboard (analytics)
/admin/orders            Billing / order history
/admin/menu              Menu management
/admin/tables            Tables + QR download
/admin/reviews           Reviews
/admin/settings          Branding, tax, payment settings
/login                   Staff / owner login
/super                   YOUR panel: create cafes, suspend/activate, AMC dates, health
```

The cafe is picked from the subdomain (`bluebean.yourbrand.in`), or from a custom domain mapped to a cafe.

---

## 8. Build Phases

| Phase | Scope | Outcome |
|---|---|---|
| **0. Setup** | Next.js project, Supabase, multi-tenant schema + RLS, seed data | Skeleton runs |
| **1. Customer flow** | QR menu, tags/search, add-ons, notes, cart, place order, status tracking | Customer can order |
| **2. Cashier panel** | Live orders board, status updates, stock toggle, sound alert, waiter/bill requests | Real-time loop works ✨ |
| **3. Payments** | Razorpay test mode + webhook + pay at counter + GST receipt | Full order-to-pay flow |
| **4. Owner panel** | Analytics, billing + CSV export, menu CRUD, tables/QR, branding settings | Owner value shown |
| **5. Reviews** | Post-order review + admin reviews page + low-rating alerts | Feedback loop |
| **6. Polish** | Demo launcher, reset demo, 2-month seed data, animations, mobile QA | **Sellable demo** 🎯 |
| **7. Productise** | Super-admin panel, subdomain routing, onboarding checklist, backups | **Ready for first client** |
| **8. Extras** | v1.5 / v2 items from §4 as paid upgrades | Upsell revenue |

---

## 9. Open Questions ❓

1. **Kitchen screen (KDS)**: in v1, or does the cashier handle everything? *Default: v1.5.*
2. **Accounts**: create them using the order in §14.4.
3. **Design vibe**: modern minimal, warm / cozy cafe, or premium dark?
4. **Your brand name + domain** (e.g. `cafeqr.in`), used for client subdomains.

---

## 10. Decision Log

| Date | Decision | Status |
|---|---|---|
| 2026-10-03 | Product is a generic, rebrandable demo template, not for one specific cafe | ✅ |
| 2026-10-03 | QR per table → customer orders without login | ✅ |
| 2026-10-03 | Cashier controls stock availability live | ✅ |
| 2026-10-03 | Payment system included (online + counter) | ✅ |
| 2026-10-03 | Separate owner panel: billing, top items, analytics | ✅ |
| 2026-10-03 | Customer review system included | ✅ |
| 2026-10-03 | Market: **India**, ₹, GST (default 5%, configurable) | ✅ |
| 2026-10-03 | Payment gateway: **Razorpay** | ✅ |
| 2026-10-03 | **All "high impact, low effort" suggestions included in v1** | ✅ |
| 2026-10-03 | Stack: Next.js + Supabase + Tailwind/shadcn + Razorpay, hosted on **Render**, DNS on Cloudflare | ✅ |
| 2026-10-03 | Business model: **one-time purchase + yearly AMC**; you host and maintain everything | ✅ |
| 2026-10-03 | Multi-tenant architecture (one deployment, many cafes) | ✅ + super-admin panel |
| 2026-10-03 | Each cafe uses **its own Razorpay account** (money settles directly to them) | ✅ (legal requirement) |
| 2026-10-03 | Hosting: **Render** (Singapore) instead of Vercel: cheaper, commercial use allowed, wildcard subdomains | ✅ |
| 2026-10-03 | Database: **one** Supabase production project (Mumbai) for all cafes, plus one free dev project | ✅ |
| 2026-10-03 | The sales demo is just another cafe (`demo.yourbrand.in`) inside production; "Reset demo" only touches that cafe | ✅ |
| 2026-10-03 | DNS on **Cloudflare** (free); domain from a registrar with fair renewal prices | ✅ |

---

## 11. Final Delivery: How a Cafe Gets the Product

**What the cafe receives:**
1. **A web address:** `bluebean.yourbrand.in` (free for you), or their own domain like `order.bluebeancafe.in` pointed at your server.
2. **Logins:** one owner account, plus cashier and kitchen accounts. No app install needed; everything runs in a browser (it can also be installed on the tablet as a PWA).
3. **Printed QR stickers / table tents** for every table, generated from the admin panel.
4. **A 1-hour training session** plus a short PDF / video guide.
5. **Their data**: they can always export orders and reports as CSV.

**What they do NOT receive:** source code, server access, or database access.

**Your onboarding checklist per new cafe (about 1–2 hours once the product is ready):**
1. In `/super`, create the cafe (name, subdomain, logo, colours, GSTIN, tax %).
2. Upload their menu, categories, add-ons and photos (or let the owner do it).
3. Create their tables and print the QRs.
4. **The cafe creates its own Razorpay account** (KYC in the cafe's name: PAN, GST, bank account), then gives you the API keys, or enters them in settings. You test with ₹1.
5. Create staff logins and run the training.
6. Go live and watch the first day of orders.

> ⚠️ **Razorpay must be in the cafe's name.** Collecting their customers' money into your account would make you an unlicensed payment aggregator under RBI rules, and it's a GST/accounting mess. Money goes straight to the cafe; you never touch it.

---

## 12. Costs (moderate cafe ≈ 100 orders/day ≈ 3,000/month)

**Load check:** 100 orders/day is very light. The database grows by only a few MB a month, and peak load is maybe 20–30 phones connected at lunch. That fits comfortably in the smallest paid tiers.
*Prices are approximate as of late 2026 at ~₹88/$. Check them when you sign up.*

### Your fixed running costs (paid by you)

| Item | Demo stage (no clients yet) | Production (real clients) |
|---|---|---|
| Render (app hosting) | Starter: **$7/mo ≈ ₹620/mo** (the free tier sleeps, which is bad for pitches) | Starter **$7/mo**; move to Standard **$25/mo** at ~15–20 cafes |
| Supabase (DB, realtime, auth, storage) | Free: **₹0** (pauses after 7 days idle, no backups) | Pro: **$25/mo ≈ ₹2,200/mo** (daily backups, no pausing) |
| Your brand domain (`.in` / `.com`) | ₹600–1,200 **per year** | same, plus free subdomains for every client |
| SSL certificate | Free (automatic) | Free |
| **Total** | **≈ ₹700/mo** | **≈ ₹2,900/mo total, shared across ALL your cafes** |

**With multi-tenant hosting:**
- 1 cafe: ~₹2,900/mo
- 5 cafes: ~₹600/mo per cafe
- 20 cafes: ~₹250/mo per cafe (after moving to Render Standard)

Single-tenant (a separate Supabase project per cafe) would add about $10/mo (≈ ₹900) for **every** cafe.

### The cafe's own costs (not yours)

| Item | Cost |
|---|---|
| Razorpay | No setup fee. **~2% per online payment**, deducted before settlement (check current UPI rates). Example: ₹300 avg × 100 orders = ₹30,000/day; if all paid online, ~₹600/day in fees. "Pay at counter" via their own UPI QR avoids this. |
| Custom domain (optional) | ₹600–1,200/year |
| Tablet for the cashier screen | One-time, ₹10,000–15,000 (or use an existing phone/laptop) |
| QR printing | ₹20–50 per table tent |

### Suggested pricing to the cafe (a rough guide only; research local competitors)

| Item | Suggested range |
|---|---|
| One-time setup + licence | ₹25,000 – ₹60,000 |
| **AMC (hosting + maintenance + support)** | ₹1,000 – ₹2,500/month, or ₹10,000 – ₹25,000/year |
| New features / customisations | Quoted separately |

With 10 cafes on a ₹1,500/mo AMC, you'd earn about ₹15,000/mo against about ₹2,900/mo in hosting costs.

---

## 13. Keeping the Maintenance With You (legitimate, contract-backed)

The goal: the cafe **can't easily switch to another developer**, while you stay **fair and legally safe**.

**Built into the setup:**
1. **You host everything.** The Render, Supabase, Cloudflare, GitHub and domain accounts are all in **your** name. The cafe gets a login, not a server.
2. **No source code handover.** You sell a **licence to use** the software, not ownership of it. The code lives only in your private GitHub repo.
3. **Shared multi-tenant platform.** Their cafe is a row in your platform, not a standalone app. Another developer has nothing they can take over.
4. **Subdomain on your domain** by default. If they want a custom domain, they point its DNS at your server; you still control the hosting.
5. **Super-admin panel** (`/super`): you can activate, suspend or extend each cafe's licence/AMC (`plan_status`, `amc_valid_until`), and the app shows a gentle "AMC renewal due" banner before expiry.
6. **Updates only through you.** New features (KDS, loyalty, WhatsApp receipts) are paid upgrades from your roadmap.

**In the written agreement (get a simple contract drafted, ~1–2 pages):**
- The software and code are your intellectual property. The cafe gets a **non-exclusive, non-transferable licence**.
- Hosting, updates and support are provided **only under an active AMC**.
- What happens if the AMC isn't renewed: e.g. a 15-day grace period, then the service is paused.
- **The data belongs to the cafe.** They can export it as CSV anytime. You act as a data processor (India's DPDP Act 2023).
- Uptime / support response promise (e.g. "issues answered within 24 hours").

**⚠️ What NOT to do** (these create legal risk and destroy your reputation in a small local market):
- ❌ Hidden kill switches or secret backdoors. Suspension must be a clause in the contract the cafe signed.
- ❌ Holding their data hostage. Always allow export.
- ❌ Routing their payments through your Razorpay account.

Lock-in through **hosting + licence + contract** is the standard, respected model (it's how Petpooja, Shopify and others work). Cafes accept it because they never have to think about servers.

---

## 14. Accounts, Domain, Database & Hosting: Setup Guide

### 14.1 Hosting choice: why Render

| Option | Cost | Pros | Cons | Verdict |
|---|---|---|---|---|
| **Render** (Starter) | $7/mo | Commercial use OK, no sleeping, Singapore region, wildcard subdomains, deploys automatically from GitHub | 512 MB RAM (enough for this app) | ✅ **Chosen** |
| Render (Free) | $0 | Free | Sleeps after 15 min idle, and the first visit then takes ~50 s. That would kill a live pitch. | Only for experiments |
| Vercel Hobby | $0 | Best fit for Next.js | **Commercial use not allowed** | ❌ |
| Vercel Pro | $20/mo | Excellent, Mumbai region | ~3× the cost of Render | Later, if you want |
| Railway | ~$5+/mo, usage-based | Simple | The bill can vary month to month | OK alternative |
| VPS (DigitalOcean Bangalore / Hetzner) + Coolify | $5–6/mo | Cheapest at scale | **You** handle security patches, backups and downtime | Only at 30+ cafes |

**Why the server stays light:** live updates (new orders, stock toggles) go **directly from the browser to Supabase Realtime**. The Render server only serves pages and handles API calls like creating orders and verifying Razorpay payments. A small instance comfortably handles many cafes at ~100 orders/day each.

### 14.2 Database: how it's managed

```
Supabase organisation (yours)
├── cafe-platform-prod   (Pro, Mumbai)   ← ALL real cafes + the demo cafe
│     ├── cafes: demo, bluebean, chai-point, ...
│     └── Storage bucket: menu-images/<cafe_id>/...
└── cafe-platform-dev    (Free, Mumbai)  ← you develop & test here
```

- **One production database for all cafes.** Every row has a `cafe_id`, and Row-Level Security stops one cafe from ever seeing another's data.
- **Schema changes go through code**, using Supabase CLI migration files in `supabase/migrations/` kept in git. You test them on dev, then apply them to prod. Never edit the prod schema by hand in the dashboard.
- **Backups:** Pro includes daily backups (7 days). We'll also add a free weekly GitHub Action that takes a `pg_dump` copy you keep yourself.
- **Images:** one storage bucket, with a folder per cafe.
- **Secrets** (each cafe's Razorpay secret) are stored encrypted, and only the server can read them.

### 14.3 Domain: buying and setting it up

**1. Choose a name.** Pick a short, brandable product name, e.g. `tableorder.in`, `scanserve.in`, `cafeqr.in`. Search availability on the registrar's site.

**2. Pick a registrar.** Compare the **renewal** price, not the first-year offer.

| Registrar | Good for | Note |
|---|---|---|
| **Cloudflare Registrar** | `.com` (~$10.5/yr at cost, same price on renewal) | Doesn't sell every TLD (check `.in` support) |
| **Porkbun / Namecheap** | `.in` or `.com` | Fair renewals, free WHOIS privacy |
| GoDaddy / Hostinger | n/a | Cheap first year, **expensive renewals** and upsells. Avoid. |

**Recommendation:** buy `.com` on Cloudflare, or `.in` on Porkbun/Namecheap. In both cases use **Cloudflare for DNS** (free).

**3. When buying:** turn on auto-renew and WHOIS privacy, and **skip every add-on** (hosting, email, SSL; you don't need them).

**4. DNS setup (Cloudflare):**

| Type | Name | Points to | Purpose |
|---|---|---|---|
| CNAME | `@` / `www` | `your-app.onrender.com` | Your marketing / landing page |
| CNAME | `*` | `your-app.onrender.com` | **Every cafe subdomain at once** (`bluebean.`, `demo.`, …) |
| CNAME | `_acme-challenge` | value Render gives you | Lets Render issue the wildcard SSL certificate |
| MX/TXT | — | Zoho / Google | Business email |

Keep the Render records **"DNS only" (grey cloud)** in Cloudflare so Render can issue SSL certificates.

**5. Adding a new cafe needs no DNS change.** Create the cafe in `/super` with slug `bluebean`, and `bluebean.yourbrand.in` works immediately because of the wildcard record.

**6. Cafe wants its own domain** (paid add-on): they add a CNAME `order.theircafe.in → your-app.onrender.com`, and you add that domain in Render and map it to their cafe in `/super`. Check Render's custom-domain limit for your plan.

### 14.4 Accounts: what to create, in order

**Golden rules:**
- Sign up for **everything** with one **business email**, not a personal one.
- Store all logins in a **password manager** (Bitwarden is free).
- Turn on **2FA** everywhere with an authenticator app, and save the recovery codes in the password manager.

| # | Account | When | Cost | Notes |
|---|---|---|---|---|
| 1 | **Bitwarden** | Now | Free | Password vault |
| 2 | **GitHub** | Now | Free | **Private** repo `cafe-platform` |
| 3 | **Supabase** | Now | Free | Create the `dev` project (Mumbai) |
| 4 | **Razorpay** | Now | Free | Your own account, **test mode only**, for the demo (no KYC needed for test keys) |
| 5 | **Domain + Cloudflare** | Before the first pitch | ~₹600–1,200/yr | §14.3 |
| 6 | **Render** | Before the first pitch | $7/mo | Connect GitHub, region **Singapore** |
| 7 | **Business email** (`hello@yourbrand.in`) | Before the first pitch | Zoho Mail: free / ~₹60/mo | Looks professional to cafes. You can then move the accounts above onto this email. |
| 8 | **Supabase Pro + `prod` project** | When the first cafe signs | $25/mo | Before this, the demo can run on a free project (it pauses only after 7 idle days) |
| 9 | **UptimeRobot** | At launch | Free | Emails you if the site goes down |
| 10 | **Sentry** | At launch | Free tier | Emails you when the app throws errors |

**Paying for Render and Supabase from India:** they bill in USD, so use a card with **international transactions enabled**. Indian RBI auto-debit rules sometimes block recurring foreign charges. If a payment fails, approve the e-mandate in your bank app, or use a card that supports it, so your servers don't get suspended.

### 14.5 How code reaches production

```
Your laptop (local dev) ──git push──▶ GitHub (private)
        │                              │
        ▼                              ▼ auto-deploy on push to `main`
 Supabase dev project            Render (prod) ──▶ Supabase prod project
                                       ▲
                     *.yourbrand.in ───┘ (Cloudflare DNS)
```

- Work on a branch, test locally against **dev**, merge to `main`, and Render deploys automatically (~2–3 minutes).
- DB changes: `supabase db push` to dev, test, then push to prod.
- Every cafe gets the update at the same moment, because there's only one app.

### 14.6 Monthly owner routine (≈ 30 min)
- Check Render and Supabase usage and billing.
- Check UptimeRobot and Sentry alerts.
- Confirm the backups exist.
- In `/super`, look at AMC renewals due in the next 30 days.

---

## 15. Pricing & Packages ✅ (client-facing sheet: `pricing.html`, published as a private artifact)

> **Revised 2026-10-03 after competitor research (§18).** Prices cut by roughly 50–60% to sit at or below the market.

### 15.1 Plans

| Plan | One-time setup | Maintenance (AMC) | Year-1 total (yearly AMC) | Key differences |
|---|---|---|---|---|
| **Essential** | ₹15,000 | ₹1,000/mo or ₹10,000/yr | ₹25,000 | 10 tables, 2 staff, core ordering + payments + GST bills + staff-assisted ordering |
| **Growth** ⭐ | ₹20,000 | ₹1,000/mo or ₹10,000/yr | ₹30,000 | 25 tables, 5 staff, branding, analytics, reviews + Google link, upsell suggestions, call waiter |
| **Premium** | ₹30,000 | ₹1,000/mo or ₹10,000/yr | ₹40,000 | Unlimited, plus KDS, coupons, tips/split, printer, custom domain, 4-hr support |
| **Growth, no setup** | ₹0 | ₹2,499/mo for a 12-month minimum, then ₹1,000/mo | ₹29,988 | For owners who won't pay upfront (matches the SaaS competitors' model) |

> Updated 2026-10-03 at the user's request: setup ₹15k / ₹20k / ₹30k, and the **same ₹1,000/month maintenance for every plan**.

### 15.1a What the ₹1,000/month covers (and what it costs you)

| Included in ₹1,000/mo | Your actual cost per cafe | Notes |
|---|---|---|
| App server (Render) | ~₹60–125 | ₹620/mo Starter shared across ~5–10 cafes |
| Database, realtime, file storage, daily backups (Supabase Pro) | ~₹110–440 | ₹2,200/mo shared across 5–20 cafes |
| Web address `cafe.yourbrand.in` + SSL | ~₹5–20 | Your one domain (₹600–1,200/yr) is shared by all cafes; SSL is free |
| Uptime and error monitoring | ₹0 | Free tiers |
| Bug fixes, security updates, platform improvements | Your time | |
| WhatsApp support (same day) + content-change hours | Your time | 1 / 2 / 4 hrs per plan |
| **Total hard cost** | **~₹200–600/mo** | **Profit ~₹400–800 per cafe per month**, more as you add cafes |

**NOT included** (charged separately or paid by the cafe directly): the cafe's **own** custom domain (~₹800–1,200/yr, at cost), Razorpay fees (~2%, deducted by Razorpay), WhatsApp/SMS message charges, hardware, new features.

Yearly AMC = 10× monthly (2 months free). **2-year price lock** on AMC.

### 15.2 Add-ons (one-time + monthly where noted)

| Add-on | Price | In Premium? |
|---|---|---|
| Kitchen display screen | ₹4,999 | ✅ |
| Thermal printer KOT & bills | ₹3,999 | ✅ |
| Coupons & discount codes | ₹2,999 | ✅ |
| Tips & split bill | ₹2,999 | ✅ |
| Custom domain setup | ₹999 + domain at cost | ✅ |
| Extra menu language | ₹1,999 each | — |
| Loyalty points | ₹7,999 + ₹299/mo | — |
| Takeaway & pre-order | ₹7,999 + ₹199/mo | — |
| WhatsApp bills & updates | ₹4,999 + messages at cost | — |
| Inventory tracking | ₹9,999 + ₹299/mo | — |
| Smart sales insights (AI) | ₹499/mo | — |
| Additional branch | ₹7,999 + ₹699/mo | — |
| Menu entered for you (≤ 80 items) | ₹1,499 | — |

### 15.3 Change requests

| Type | Price |
|---|---|
| Content changes within plan hours (1 / 2 / 4 hrs per month) | Free |
| Extra hours | ₹600/hr |
| Small tweak (≤ 1 day) | ₹1,500–3,500 |
| New custom feature | Fixed quote after written scope, ₹4,000 per day |
| Urgent / out-of-hours | +50% |
| Plan upgrade | Pay the setup difference |

**Rule:** never start custom work without a written scope and a fixed price, agreed on WhatsApp/email at minimum.

### 15.4 Internal economics (NOT for clients)
- Your hosting cost per cafe: about ₹250–600/mo (§12), so the margin is about 40–80% at ₹1,000/mo.
- A Growth client in year 1 brings about **₹30,000**, against about ₹7,000 of hosting. Profit comes from **volume and recurring AMC**, so aim for 10+ cafes.
- **Founding offer:** 30–40% off setup for the first 3 cafes, in exchange for a testimonial, photos, and permission to use them as a case study.
- **Floor:** don't go below ₹10,000 setup / ₹800 per month. Discount the setup, never the AMC.
- **GST:** registration is mandatory once your service turnover crosses ₹20 lakh/yr. Below that, quote "exclusive of GST" and don't charge it. Confirm with a CA.
- **Implementation:** `cafes.plan` + `cafes.addons` act as feature flags. You toggle them in `/super`, so selling an add-on is a switch, not a deployment. Premium-only features (KDS, coupons, tips/split, printer) must be built before the first Premium sale; until then, sell Essential and Growth.

---

## 16. Testing on Free Tiers Only ✅ (pay nothing until the first client)

| Need | Free option | Limitation & workaround |
|---|---|---|
| App hosting | **Render Free** | Sleeps after 15 min idle (~50 s to wake). **Open the demo link 2–3 min before every pitch**, or add a free UptimeRobot ping every 10 min (one service fits in Render's 750 free hrs/month). |
| Database | **Supabase Free** (2 projects: `dev` + `demo`) | Pauses after 7 days without activity. The uptime ping keeps it active, or restore it from the dashboard. No backups (fine for test data). |
| Domain | none: use `your-app.onrender.com` | No wildcard subdomains, so the app must also accept the cafe from the **path**: `/c/demo/...`. Build this fallback in Phase 0. |
| Payments | **Razorpay test mode** | Test UPI / cards only. Looks identical to the real thing in a demo. |
| Code | **GitHub Free** (private repo) | — |
| Monitoring | UptimeRobot + Sentry free | — |
| **Total** | **₹0** | |

**Switch to paid only when the first client pays the 50% advance.** The advance covers about a year of hosting. Upgrade checklist:
1. Buy the domain, then set up Cloudflare DNS and the wildcard record (§14.3).
2. Render Free → **Starter ($7)**.
3. Supabase: create `prod` on **Pro ($25)** and run the migrations. Recreate the demo cafe there.
4. Zoho business email.
5. The client's Razorpay live keys.
6. Re-run the go-live checklist (§11).

---

## 17. Decision Log (continued)

| Date | Decision | Status |
|---|---|---|
| 2026-10-03 | 3 plans (Essential / Growth / Premium) + add-ons + change-request rates (§15) | ✅ |
| 2026-10-03 | Features gated per cafe by `plan` + `addons` flags | ✅ |
| 2026-10-03 | Testing and demo run on free tiers only; pay when the first client signs (§16) | ✅ |
| 2026-10-03 | Tenant resolved from subdomain, **with `/c/<slug>` path fallback** for the free-tier URL | ✅ |
| 2026-10-03 | Support is **WhatsApp only (no calls)**. Mon–Sat 10–7 with a **same-day reply** on Essential and Growth; Premium stays 7 days with a 4-hour reply | ✅ |
| 2026-10-03 | **Prices cut ~50–60%** after competitor research. Added a ₹0-setup Growth option at ₹1,799/mo and a 2-year price lock (§15) | ✅ |
| 2026-10-03 | New v1 differentiators: staff-assisted ordering, "goes well with" upsells, instant low-rating alert + Google review link (§18) | ✅ |
| 2026-10-03 | Setup set to ₹15k / ₹20k / ₹30k; maintenance a flat **₹1,000/mo** (₹10,000/yr) for all plans; no-setup option ₹2,499/mo × 12 | ✅ |
| 2026-10-03 | Launching with **one cafe**: Render Starter (only paid service) + Supabase **Free** for prod + own daily backups; ≈ ₹705/mo. Supabase Pro only at ~5 cafes (§19) | ✅ |
| 2026-10-03 | **No separate frontend/backend hosting.** One Next.js app (pages + API routes) on Render Starter on the free Hobby workspace (no Render Professional). Supabase is the backend (DB, auth, realtime). Not Vercel Hobby: commercial use not allowed | ✅ |
| 2026-10-03 | Engineering spec written: **IMPLEMENTATION.md** (decisions D-01…D-40, edge cases R1…R34, phases 0–7, ~26–29 build days). Kitchen display basic version in v1 (default) | ✅ |

---

## 18. Competitor Research (Oct 2026)

> Sources are mostly vendor blogs and comparison sites, so treat the numbers as ranges, not exact quotes. Call 2–3 vendors as a "cafe owner" for real quotes before you pitch.

### 18.1 What's out there

| Product | Model / price (approx.) | Strengths | Weaknesses we can exploit |
|---|---|---|---|
| **Petpooja** | ₹10k–40k/yr base; with QR ordering, KDS and inventory ≈ ₹25k–40k/yr per outlet + GST. One blog reports far higher full-POS totals | Market leader, full POS, Zomato/Swiggy integration | Opaque pricing (talk to sales), paid add-on modules, reported renewal hikes, heavy for a small cafe |
| **DotPe** | Free to start, **~2–3% commission** on online orders | Free entry, broad ecosystem | Commission grows with sales; pricing is hard to pin down |
| **TMBill** | ~₹999/mo | Full POS, browser-based | Generic, a POS first and QR ordering second |
| **MenuManager / similar Indian QR SaaS** | ₹799–1,500/mo, zero commission | Cheap, self-serve | DIY setup, generic look, ticket support |
| **QR Seva / Applova** | Free menu; ~₹199/mo | Free, many languages | Mostly menus only, weak ordering/payment |
| **MenuTiger, Menubly, OddMenu** | ~₹750–3,200/mo | Polished | Foreign, so UPI/GST support is uncertain |

**Market price band for QR ordering in India: about ₹800–1,500/month, zero commission.** Our new pricing sits inside it: about ₹999/mo plus a modest setup that pays for the done-for-you onboarding.

### 18.2 What customers dislike about QR ordering (and our answer)

| Complaint | Our answer |
|---|---|
| PDF menus, pinch-zoom, slow loading | Fast, mobile-native menu with photos; target under 2 s on 4G; lightweight images |
| "Download our app" | Never. Browser only. |
| Older guests can't or won't scan | **Staff-assisted ordering**: the waiter orders on the same system from a phone (v1) |
| Feels cold, kills the conversation | Call-waiter button, and QR is optional, not forced |
| **Bill size drops ~10%** (guests don't scroll the whole menu) | **"Goes well with" suggestions**, combos, best-seller badges, photo-first layout |
| Privacy worries | No login, and no phone number needed to order |
| Weak cafe Wi-Fi | Small page size; the menu works on mobile data |

### 18.3 Our differentiators (pitch these)
1. **Zero commission, published prices.** Beats DotPe and opaque Petpooja quotes.
2. **2-year price lock.** Directly answers renewal-hike complaints.
3. **Done-for-you setup**: menu entry, QR cards, staff training. Self-serve SaaS doesn't do this.
4. **Hybrid ordering**: QR **plus** staff ordering into one system.
5. **Upsell engine** to win back the bill-size drop.
6. **Live rescue**: a low rating alerts the owner while the guest is still seated. Every guest also gets a Google review link. (Ask everyone, never only happy guests; Google prohibits review gating.)
7. **Fully branded**: the cafe's logo and colours, with no vendor ads.
8. **Local human support on WhatsApp**, same day.
9. **No hardware needed.**
10. **₹0-setup option** for owners who compare us with monthly SaaS.

### 18.4 Feature additions from this research
- **v1:** staff-assisted ordering, "goes well with" suggestions + combos + best-seller badges, instant low-rating alert, Google review link after rating, menu performance budget (< 2 s).
- **v1.5:** **daily closing summary** for the owner (sales, orders, top item); email is free, WhatsApp is a paid add-on.
- **v2 idea:** a "repeat my last order" option for regulars (ties into loyalty).

**Sources:** [Capterra: Petpooja pricing](https://www.capterra.com/p/172163/Petpooja-Restaurant-Management-Platform/pricing/) · [Servyn: Petpooja price guide](https://servyn.in/guides/petpooja-software-price-comparison/) · [DineOpen: Petpooja pricing 2026](https://www.dineopen.com/blog/petpooja-pricing-plans-2026.html) · [QR Seva: 8 services compared](https://www.qrseva.com/blog/best-qr-menu-software-india-compared) · [MenuManager: QR ordering in India](https://menumanager.in/qr-ordering-system/) · [TMBill for cafes](https://www.tmbill.com/cafe-management-software) · [Restrofi: Petpooja alternatives](https://restrofi.com/blog/restaurant-pos-alternatives-india) · [CTV: QR code backlash](https://ottawa.ctvnews.ca/restaurants-reintroducing-paper-menus-amid-qr-code-backlash-1.6913501) · [Yahoo: people hate QR menus](https://tech.yahoo.com/business/articles/people-hate-qr-code-menus-164525439.html) · [Tasting Table: QR menus](https://www.tastingtable.com/2114356/restaurant-change-boomers-hate-qr-code-menus)

---

## 19. Launch With ONE Cafe: Setup & Profit ✅ (overrides §12 / §14 until you have ~5 cafes)

With only one cafe, nothing is shared, so every rupee of hosting comes out of that one cafe's ₹1,000/month. Supabase Pro alone (₹2,200/mo) would make maintenance **loss-making**, so we run lean.

### 19.1 Lean production setup (1–4 cafes)

| Item | Choice | Cost / month | Why it's safe for one cafe |
|---|---|---|---|
| App server | **Render Starter** | ₹620 | Must not sleep: a real cafe can't have the first customer wait 50 s. The **only** paid service. |
| Database, realtime, auth, storage | **Supabase Free** (the `prod` project) | ₹0 | 100 orders/day ≈ a few MB a month vs a 500 MB limit. A cafe open daily never hits the 7-day idle pause. Realtime limits (200 connections) are far above need. |
| Backups | **Our own free daily backup** (GitHub Action → `pg_dump` → private storage) | ₹0 | Supabase Free has no backups, so we add our own. **Must be set up before go-live.** |
| Menu images | Compressed WebP (~30–60 KB each), lazy-loaded | ₹0 | Keeps us under Supabase Free's 5 GB/month transfer limit. If usage nears the limit, move images to Cloudflare R2 (free, no transfer fees). |
| Domain | Your brand domain (one `.in` / `.com`) | ~₹85 (₹1,000/yr) | The cafe gets `cafename.yourbrand.in` |
| DNS / SSL | Cloudflare + Render | ₹0 | |
| Email | Zoho Mail free plan | ₹0 | |
| Monitoring | UptimeRobot + Sentry free | ₹0 | |
| **Total** | | **≈ ₹705/month (≈ ₹8,440/year)** | |

`dev` stays on the second free Supabase project. The demo cafe lives inside `prod` as just another cafe.

**Upgrade triggers:** move to Supabase Pro (+₹2,200/mo) at **~5 cafes**, or earlier if the database passes 400 MB, transfer passes 4 GB/month, or a client needs guaranteed backups. Move Render to Standard at ~15–20 cafes.

❌ **Not recommended:** Render Free + a "keep-awake" pinger for a paying client. It saves ₹620/mo but risks a slow or failed page in front of the cafe's customers.

### 19.2 Your profit with ONE cafe (Growth plan, maintenance paid monthly)

**Year 1**

| | Amount |
|---|---|
| Setup fee | + ₹20,000 |
| Maintenance (₹1,000 × 12) | + ₹12,000 |
| **Revenue** | **₹32,000** |
| Render Starter (12 months) | − ₹7,440 |
| Domain (1 year) | − ₹1,000 |
| QR table cards (~15 tables × ₹50) | − ₹750 |
| **Costs** | **− ₹9,190** |
| **Profit, year 1** | **≈ ₹22,800** (about ₹1,900/month) |

**Year 2 onward (maintenance only):** ₹12,000 − ₹8,440 = **≈ ₹3,560/year (about ₹300/month)**.

> **Key point:** with one cafe, the **setup fee is your real profit**. Maintenance only just covers the server. The business starts paying properly from cafe #2, because each extra cafe adds ₹12,000/yr of maintenance at almost **zero** extra hosting cost.

If the cafe pays maintenance **yearly** (₹10,000), year-1 profit is about ₹20,800 and year-2 about ₹1,560. For a single cafe, **prefer monthly billing**, or keep yearly billing but treat it as cash upfront.

Other plans, year 1 with one cafe: Essential ≈ **₹17,800** · Premium ≈ **₹32,800**.

### 19.3 How profit grows with more cafes (all Growth, year 1, monthly maintenance)

| Cafes | Revenue | Hosting + domain | QR cards | **Profit (year 1)** | **Profit (year 2+, yearly)** |
|---|---|---|---|---|---|
| 1 | ₹32,000 | ₹8,440 | ₹750 | **₹22,810** | ₹3,560 |
| 2 | ₹64,000 | ₹8,440 | ₹1,500 | **₹54,060** | ₹15,560 |
| 3 | ₹96,000 | ₹8,440 | ₹2,250 | **₹85,310** | ₹27,560 |
| 5 (Supabase Pro added) | ₹1,60,000 | ₹34,840 | ₹3,750 | **₹1,21,410** | ₹25,160 |
| 10 | ₹3,20,000 | ₹34,840 | ₹7,500 | **₹2,77,660** | ₹85,160 |

*Year 2+ = maintenance revenue minus hosting only. Add-ons and change requests come on top. All figures are before your own income tax. You don't charge GST until your turnover crosses ₹20 lakh (confirm with a CA).*

### 19.4 Ways to earn more from the one cafe
- **Sell 1–2 add-ons** at signing (menu entry ₹1,499, extra language ₹1,999, coupons ₹2,999), since they're nearly pure profit.
- **Paid change requests** beyond their monthly hours (₹600/hr).
- **Use them as your case study.** A testimonial and "live at Cafe X" is what sells cafe #2 and #3, which is where the real profit is.
- Year-2 maintenance is thin, so **reach 3 cafes within the first 6–12 months**.
