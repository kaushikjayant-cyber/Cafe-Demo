-- Tenant isolation [D-04] and guest access [D-06, D-21]. See IMPLEMENTATION.md §3.2 and §6.
--
-- Write model:
--   * Guests never write directly; API routes validate and write with the service role.
--   * Owners/managers edit menu, tables and settings through RLS.
--   * Counter/kitchen actions go through narrow security-definer RPCs (see functions migration).

-- CROSS-TENANT INTEGRITY ---------------------------------------------------------
-- Composite keys make it impossible to attach a row to a parent from another cafe.

alter table public.categories add unique (id, cafe_id);
alter table public.menu_items add unique (id, cafe_id);
alter table public.option_groups add unique (id, cafe_id);
alter table public.tables add unique (id, cafe_id);
alter table public.orders add unique (id, cafe_id);
alter table public.payments add unique (id, cafe_id);

alter table public.menu_items
  add foreign key (category_id, cafe_id) references public.categories (id, cafe_id);
alter table public.option_groups
  add foreign key (item_id, cafe_id) references public.menu_items (id, cafe_id) on delete cascade;
alter table public.options
  add foreign key (group_id, cafe_id) references public.option_groups (id, cafe_id) on delete cascade;
alter table public.item_pairings
  add foreign key (item_id, cafe_id) references public.menu_items (id, cafe_id) on delete cascade,
  add foreign key (paired_item_id, cafe_id) references public.menu_items (id, cafe_id) on delete cascade;
alter table public.orders
  add foreign key (table_id, cafe_id) references public.tables (id, cafe_id);
alter table public.order_items
  add foreign key (order_id, cafe_id) references public.orders (id, cafe_id) on delete cascade;
alter table public.payments
  add foreign key (order_id, cafe_id) references public.orders (id, cafe_id) on delete cascade;
alter table public.refunds
  add foreign key (payment_id, cafe_id) references public.payments (id, cafe_id);
alter table public.service_requests
  add foreign key (table_id, cafe_id) references public.tables (id, cafe_id);
alter table public.reviews
  add foreign key (order_id, cafe_id) references public.orders (id, cafe_id) on delete cascade;

-- ENABLE RLS EVERYWHERE ------------------------------------------------------------

alter table public.cafes enable row level security;
alter table public.cafe_secrets enable row level security;
alter table public.cafe_domains enable row level security;
alter table public.platform_admins enable row level security;
alter table public.staff enable row level security;
alter table public.categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.option_groups enable row level security;
alter table public.options enable row level security;
alter table public.item_pairings enable row level security;
alter table public.tables enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.refunds enable row level security;
alter table public.invoice_counters enable row level security;
alter table public.daily_counters enable row level security;
alter table public.service_requests enable row level security;
alter table public.reviews enable row level security;
alter table public.review_items enable row level security;
alter table public.activity_log enable row level security;

-- cafe_secrets, cafe_domains, platform_admins, invoice_counters, daily_counters:
-- RLS on and no policies, so only the service role can touch them.

-- CAFES ------------------------------------------------------------------------------

create policy cafes_select on public.cafes for select to authenticated
  using (public.is_staff_of(id) or public.is_platform_admin());

-- Owners may edit their own settings; plan, flags, status and AMC are not in the grant,
-- so only the platform (service role) can change them.
revoke insert, update, delete on public.cafes from anon, authenticated;
grant update (
  name, logo_path, brand_color, day_starts_at, gst_mode, gstin, legal_name, address, phone,
  email, fssai_no, invoice_prefix, tax_rate_bp, prices_include_tax, ordering_paused,
  pause_message, opening_hours, accept_mode, allow_pay_at_counter, google_review_url
) on public.cafes to authenticated;

create policy cafes_owner_update on public.cafes for update to authenticated
  using (public.is_staff_of(id, array['owner']))
  with check (public.is_staff_of(id, array['owner']));

-- STAFF ------------------------------------------------------------------------------

create policy staff_select on public.staff for select to authenticated
  using (user_id = auth.uid() or public.is_staff_of(cafe_id, array['owner', 'manager']));

-- MENU (public read, owner/manager write) -----------------------------------------------

create policy categories_read on public.categories for select to anon, authenticated
  using ((is_visible and archived_at is null) or public.is_staff_of(cafe_id));
create policy categories_write on public.categories for all to authenticated
  using (public.is_staff_of(cafe_id, array['owner', 'manager']))
  with check (public.is_staff_of(cafe_id, array['owner', 'manager']));

create policy menu_items_read on public.menu_items for select to anon, authenticated
  using ((is_visible and archived_at is null) or public.is_staff_of(cafe_id));
create policy menu_items_write on public.menu_items for all to authenticated
  using (public.is_staff_of(cafe_id, array['owner', 'manager']))
  with check (public.is_staff_of(cafe_id, array['owner', 'manager']));

create policy option_groups_read on public.option_groups for select to anon, authenticated
  using (true);
create policy option_groups_write on public.option_groups for all to authenticated
  using (public.is_staff_of(cafe_id, array['owner', 'manager']))
  with check (public.is_staff_of(cafe_id, array['owner', 'manager']));

create policy options_read on public.options for select to anon, authenticated
  using (true);
create policy options_write on public.options for all to authenticated
  using (public.is_staff_of(cafe_id, array['owner', 'manager']))
  with check (public.is_staff_of(cafe_id, array['owner', 'manager']));

create policy item_pairings_read on public.item_pairings for select to anon, authenticated
  using (true);
create policy item_pairings_write on public.item_pairings for all to authenticated
  using (public.is_staff_of(cafe_id, array['owner', 'manager']))
  with check (public.is_staff_of(cafe_id, array['owner', 'manager']));

-- TABLES (tokens are not public: guests reach a table only through its QR link) ------

create policy tables_read on public.tables for select to authenticated
  using (public.is_staff_of(cafe_id));
create policy tables_write on public.tables for all to authenticated
  using (public.is_staff_of(cafe_id, array['owner', 'manager']))
  with check (public.is_staff_of(cafe_id, array['owner', 'manager']));

-- ORDERS (read-only through RLS; every write goes through the server or an RPC) ------

create policy orders_read on public.orders for select to authenticated
  using (customer_uid = auth.uid() or public.is_staff_of(cafe_id));

create policy order_items_read on public.order_items for select to authenticated
  using (
    public.is_staff_of(cafe_id)
    or exists (select 1 from public.orders o where o.id = order_id and o.customer_uid = auth.uid())
  );

create policy payments_read on public.payments for select to authenticated
  using (public.is_staff_of(cafe_id, array['owner', 'manager', 'cashier']));

create policy refunds_read on public.refunds for select to authenticated
  using (public.is_staff_of(cafe_id, array['owner', 'manager', 'cashier']));

-- SERVICE REQUESTS -----------------------------------------------------------------------

create policy service_requests_read on public.service_requests for select to authenticated
  using (customer_uid = auth.uid() or public.is_staff_of(cafe_id));

-- REVIEWS --------------------------------------------------------------------------------

create policy reviews_read on public.reviews for select to authenticated
  using (public.is_staff_of(cafe_id));

revoke insert, update, delete on public.reviews from anon, authenticated;
grant update (is_hidden) on public.reviews to authenticated;
create policy reviews_hide on public.reviews for update to authenticated
  using (public.is_staff_of(cafe_id, array['owner', 'manager']))
  with check (public.is_staff_of(cafe_id, array['owner', 'manager']));

create policy review_items_read on public.review_items for select to authenticated
  using (public.is_staff_of(cafe_id));

-- AUDIT --------------------------------------------------------------------------------

create policy activity_log_read on public.activity_log for select to authenticated
  using (public.is_staff_of(cafe_id, array['owner', 'manager']));

-- REALTIME -----------------------------------------------------------------------------
-- Supabase Realtime respects the select policies above. The publication only exists on
-- Supabase, so this is skipped in local PGlite tests.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.menu_items, public.options, public.cafes, public.orders,
      public.order_items, public.service_requests, public.reviews;
  end if;
end;
$$;
