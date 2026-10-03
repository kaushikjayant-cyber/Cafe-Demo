-- Core schema. See IMPLEMENTATION.md §4.
-- Money is integer paise [D-07]. Timestamps are timestamptz (UTC). History is soft-archived.

-- PLATFORM -------------------------------------------------------------------

create table public.cafes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'),
  name text not null check (length(name) between 1 and 80),
  logo_path text,
  brand_color text not null default '#0E7A63' check (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  timezone text not null default 'Asia/Kolkata',
  day_starts_at time not null default '04:00',                     -- [D-09]
  gst_mode text not null default 'regular' check (gst_mode in ('none', 'regular')),  -- [D-10]
  gstin text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  legal_name text,
  address text,
  phone text,
  email text,
  fssai_no text,
  invoice_prefix text not null default 'INV' check (invoice_prefix ~ '^[A-Z0-9]{1,4}$'),
  tax_rate_bp int not null default 500 check (tax_rate_bp between 0 and 2800),
  prices_include_tax boolean not null default true,                -- [D-11]
  ordering_paused boolean not null default false,
  pause_message text,
  opening_hours jsonb,                                             -- null = always open
  accept_mode text not null default 'auto_paid' check (accept_mode in ('auto_paid', 'manual_all')),  -- [D-12]
  allow_pay_at_counter boolean not null default true,
  google_review_url text,
  plan text not null default 'growth' check (plan in ('essential', 'growth', 'premium')),
  addons jsonb not null default '{}'::jsonb,                       -- [D-13]
  status text not null default 'trial' check (status in ('trial', 'active', 'grace', 'suspended')),
  amc_valid_until date,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Payment secrets live apart from cafes so no client role can ever select them [D-37].
create table public.cafe_secrets (
  cafe_id uuid primary key references public.cafes (id) on delete cascade,
  razorpay_key_id text,
  razorpay_key_secret_enc text,
  razorpay_webhook_secret_enc text,
  updated_at timestamptz not null default now()
);

create table public.cafe_domains (
  domain text primary key check (domain = lower(domain)),
  cafe_id uuid not null references public.cafes (id) on delete cascade
);

create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

-- PEOPLE -----------------------------------------------------------------------

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes (id) on delete cascade,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  display_name text not null,
  username text not null check (username ~ '^[a-z0-9._-]{3,32}$'),
  role text not null check (role in ('owner', 'manager', 'cashier', 'kitchen')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (cafe_id, username)
);
create index staff_cafe_idx on public.staff (cafe_id);

-- MENU -------------------------------------------------------------------------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes (id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  sort int not null default 0,
  is_visible boolean not null default true,
  archived_at timestamptz
);
create index categories_cafe_idx on public.categories (cafe_id, sort);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes (id) on delete cascade,
  category_id uuid not null references public.categories (id),
  name text not null check (length(name) between 1 and 80),
  description text check (description is null or length(description) <= 300),
  price_paise int not null check (price_paise >= 0),
  image_path text,
  diet text check (diet in ('veg', 'nonveg', 'egg', 'vegan')),
  tags text[] not null default '{}',
  is_available boolean not null default true,
  sold_out_until timestamptz,                                      -- [D-14]
  is_visible boolean not null default true,
  sort int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index menu_items_cafe_idx on public.menu_items (cafe_id, category_id, sort);

create table public.option_groups (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes (id) on delete cascade,
  item_id uuid not null references public.menu_items (id) on delete cascade,
  name text not null,
  min_select int not null default 0 check (min_select >= 0),
  max_select int not null default 1 check (max_select >= 1),
  sort int not null default 0,
  check (min_select <= max_select)
);
create index option_groups_item_idx on public.option_groups (item_id);

create table public.options (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes (id) on delete cascade,
  group_id uuid not null references public.option_groups (id) on delete cascade,
  name text not null,
  price_delta_paise int not null default 0,
  is_available boolean not null default true,
  sort int not null default 0
);
create index options_group_idx on public.options (group_id);

create table public.item_pairings (
  cafe_id uuid not null references public.cafes (id) on delete cascade,
  item_id uuid not null references public.menu_items (id) on delete cascade,
  paired_item_id uuid not null references public.menu_items (id) on delete cascade,
  sort int not null default 0,
  primary key (item_id, paired_item_id),
  check (item_id <> paired_item_id)
);

-- TABLES -----------------------------------------------------------------------

create table public.tables (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes (id) on delete cascade,
  label text not null check (length(label) between 1 and 20),
  token text not null unique check (token ~ '^[a-z0-9]{10}$'),     -- [D-15]
  is_active boolean not null default true,
  sort int not null default 0,
  archived_at timestamptz
);
create index tables_cafe_idx on public.tables (cafe_id);

-- ORDERS -----------------------------------------------------------------------

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes (id) on delete cascade,
  table_id uuid references public.tables (id),
  business_date date not null,
  daily_no int not null,
  source text not null check (source in ('qr', 'staff')),
  customer_uid uuid,
  guest_name text check (guest_name is null or length(guest_name) <= 40),
  idempotency_key uuid not null,                                   -- [D-16]
  status text not null check (status in (
    'pending_payment', 'placed', 'accepted', 'preparing', 'ready',
    'served', 'completed', 'cancelled', 'rejected', 'expired')),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'paid', 'partially_refunded', 'refunded')),
  payment_method text check (payment_method in ('online', 'cash', 'upi_counter', 'card_counter')),
  subtotal_paise int not null check (subtotal_paise >= 0),
  tax_paise int not null check (tax_paise >= 0),
  cgst_paise int not null default 0,
  sgst_paise int not null default 0,
  round_off_paise int not null default 0,
  total_paise int not null check (total_paise >= 0),
  tax_rate_bp int not null,                                        -- [D-17]
  prices_include_tax boolean not null,
  gst_mode text not null,
  invoice_no text,                                                 -- [D-18]
  note text check (note is null or length(note) <= 300),
  cancel_reason text,
  needs_attention boolean not null default false,
  placed_at timestamptz,
  accepted_at timestamptz,
  ready_at timestamptz,
  served_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cafe_id, idempotency_key),
  unique (cafe_id, business_date, daily_no),
  unique (cafe_id, invoice_no)
);
create index orders_cafe_date_idx on public.orders (cafe_id, business_date);
create index orders_cafe_status_idx on public.orders (cafe_id, status);
create index orders_customer_idx on public.orders (customer_uid);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  cafe_id uuid not null references public.cafes (id) on delete cascade,
  item_id uuid references public.menu_items (id),
  name_snapshot text not null,
  unit_price_paise int not null check (unit_price_paise >= 0),
  qty int not null check (qty between 1 and 50),
  options_snapshot jsonb not null default '[]'::jsonb,
  line_total_paise int not null check (line_total_paise >= 0),
  note text check (note is null or length(note) <= 140),
  status text not null default 'active' check (status in ('active', 'voided'))
);
create index order_items_order_idx on public.order_items (order_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  provider text not null default 'razorpay',
  rp_order_id text unique,
  rp_payment_id text unique,
  amount_paise int not null check (amount_paise > 0),
  status text not null default 'created'
    check (status in ('created', 'authorized', 'captured', 'failed', 'refunded')),
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_order_idx on public.payments (order_id);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes (id) on delete cascade,
  payment_id uuid not null references public.payments (id),
  rp_refund_id text unique,
  amount_paise int not null check (amount_paise > 0),
  reason text,
  by_staff_id uuid references public.staff (id),
  created_at timestamptz not null default now()
);

create table public.invoice_counters (
  cafe_id uuid not null references public.cafes (id) on delete cascade,
  fy text not null check (fy ~ '^[0-9]{4}$'),
  last_no int not null default 0,
  primary key (cafe_id, fy)
);

create table public.daily_counters (
  cafe_id uuid not null references public.cafes (id) on delete cascade,
  business_date date not null,
  last_no int not null default 0,
  primary key (cafe_id, business_date)
);

-- SERVICE, FEEDBACK & AUDIT ----------------------------------------------------

create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes (id) on delete cascade,
  table_id uuid not null references public.tables (id),
  type text not null check (type in ('waiter', 'bill')),
  status text not null default 'open' check (status in ('open', 'done')),
  customer_uid uuid,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  done_by uuid references public.staff (id)
);
create index service_requests_cafe_idx on public.service_requests (cafe_id, status);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes (id) on delete cascade,
  order_id uuid not null unique references public.orders (id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text check (comment is null or length(comment) <= 500),
  is_hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index reviews_cafe_idx on public.reviews (cafe_id, created_at);

create table public.review_items (
  review_id uuid not null references public.reviews (id) on delete cascade,
  cafe_id uuid not null references public.cafes (id) on delete cascade,
  item_id uuid not null references public.menu_items (id),
  liked boolean not null,
  primary key (review_id, item_id)
);

create table public.activity_log (
  id bigint generated always as identity primary key,
  cafe_id uuid not null references public.cafes (id) on delete cascade,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index activity_log_cafe_idx on public.activity_log (cafe_id, created_at);

-- updated_at bookkeeping -------------------------------------------------------

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger cafes_touch before update on public.cafes
  for each row execute function public.touch_updated_at();
create trigger menu_items_touch before update on public.menu_items
  for each row execute function public.touch_updated_at();
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();
create trigger payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();
