-- Owner admin (Phase 4): dashboard analytics, menu photo storage, demo history.

-- With no JWT claims at all the setting is an empty string, and ''::jsonb raises instead of
-- simply answering "no". Treat missing claims as not the service role.
create or replace function public.is_service_role() returns boolean
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
$$;

-- DASHBOARD [D-31] -----------------------------------------------------------------------
-- Everything the owner's dashboard shows, in one round trip. Sales exclude orders that never
-- happened (cancelled, rejected, expired, unpaid online) and subtract refunds. Days are the
-- cafe's business days in its own timezone.

create function public.admin_dashboard(p_cafe uuid, p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_cafe public.cafes;
  v_today date;
  v_from date;
  v_result jsonb;
begin
  if not (public.is_staff_of(p_cafe, array['owner', 'manager']) or public.is_service_role()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_days not between 1 and 366 then
    raise exception 'invalid_range' using errcode = '22023';
  end if;

  select * into v_cafe from public.cafes where id = p_cafe;
  v_today := public.business_date(now(), v_cafe.timezone, v_cafe.day_starts_at);
  -- Reach back far enough to compare today with the same weekday last week.
  v_from := least(v_today - (p_days - 1), v_today - 7);

  with sales as (
    select o.id, o.business_date, o.total_paise, o.table_id, o.payment_method, o.placed_at, o.source,
           o.total_paise - coalesce((
             select sum(r.amount_paise) from public.refunds r join public.payments p on p.id = r.payment_id where p.order_id = o.id
           ), 0) as net
    from public.orders o
    where o.cafe_id = p_cafe
      and o.business_date between v_from and v_today
      and o.status not in ('cancelled', 'rejected', 'expired', 'pending_payment')
  ),
  period as (
    select * from sales where business_date >= v_today - (p_days - 1)
  ),
  items as (
    select oi.item_id, oi.name_snapshot, sum(oi.qty)::int as qty, sum(oi.line_total_paise)::bigint as revenue
    from public.order_items oi join period s on s.id = oi.order_id
    where oi.status = 'active'
    group by oi.item_id, oi.name_snapshot
  )
  select jsonb_build_object(
    'today', v_today,
    'days', p_days,
    'today_stats', (select jsonb_build_object('revenue', coalesce(sum(net), 0), 'orders', count(*)) from sales where business_date = v_today),
    -- Same weekday last week, up to the same time of day, so a morning isn't compared with a whole day.
    'last_week_stats', (select jsonb_build_object('revenue', coalesce(sum(net), 0), 'orders', count(*)) from sales where business_date = v_today - 7 and placed_at <= now() - interval '7 days'),
    'period_stats', (select jsonb_build_object('revenue', coalesce(sum(net), 0), 'orders', count(*)) from period),
    'daily', (
      select jsonb_agg(jsonb_build_object('date', d.day, 'revenue', coalesce(s.revenue, 0), 'orders', coalesce(s.orders, 0)) order by d.day)
      from (select (v_today - g)::date as day from generate_series(0, p_days - 1) g) d
      left join (select business_date, sum(net) as revenue, count(*) as orders from period group by business_date) s on s.business_date = d.day
    ),
    'top_items', (
      select coalesce(jsonb_agg(jsonb_build_object('name', name_snapshot, 'qty', qty, 'revenue', revenue) order by qty desc), '[]'::jsonb)
      from (select * from items order by qty desc limit 8) t
    ),
    -- Visible menu items that sold least (including not at all) in the period.
    'slow_items', (
      select coalesce(jsonb_agg(jsonb_build_object('name', name, 'qty', qty) order by qty, name), '[]'::jsonb)
      from (
        select m.name, coalesce(sum(i.qty), 0)::int as qty
        from public.menu_items m left join items i on i.item_id = m.id
        where m.cafe_id = p_cafe and m.archived_at is null and m.is_visible
        group by m.id, m.name
        order by qty, m.name
        limit 5
      ) t
    ),
    'heatmap', (
      select coalesce(jsonb_agg(jsonb_build_object('dow', dow, 'hour', hour, 'orders', n)), '[]'::jsonb)
      from (
        select extract(isodow from placed_at at time zone v_cafe.timezone)::int as dow,
               extract(hour from placed_at at time zone v_cafe.timezone)::int as hour,
               count(*) as n
        from period where placed_at is not null
        group by 1, 2
      ) h
    ),
    'payment_mix', (
      select coalesce(jsonb_agg(jsonb_build_object('method', method, 'revenue', revenue, 'orders', n) order by revenue desc), '[]'::jsonb)
      from (select coalesce(payment_method, 'unpaid') as method, sum(net) as revenue, count(*) as n from period group by 1) m
    ),
    'tables', (
      select coalesce(jsonb_agg(jsonb_build_object('label', label, 'revenue', revenue, 'orders', n) order by revenue desc), '[]'::jsonb)
      from (
        select coalesce(t.label, 'Counter') as label, sum(s.net) as revenue, count(*) as n
        from period s left join public.tables t on t.id = s.table_id
        group by 1
      ) x
    )
  ) into v_result;
  return v_result;
end;
$$;

-- MENU PHOTOS ------------------------------------------------------------------------
-- Public bucket (menu photos are public anyway). Uploads go through a server action that
-- checks the role and re-encodes the image, using the service role.

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('menu-images', 'menu-images', true, 2097152, array['image/webp'])
    on conflict (id) do nothing;
  end if;
end;
$$;

-- DEMO HISTORY ------------------------------------------------------------------------
-- Realistic past orders for the demo cafe so the dashboard has something to show:
-- weekday/weekend volumes, breakfast/lunch/evening peaks, popular and slow items,
-- a mix of online and counter payments. Only ever touches cafes marked is_demo.

create function public.generate_demo_history(p_cafe uuid, p_days int default 60) returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  v_cafe public.cafes;
  v_today date;
  v_day date;
  v_orders int;
  v_count int := 0;
  v_at timestamptz;
  v_order uuid;
  v_lines int;
  v_sub int;
  v_taxable int;
  v_tax int;
  v_method text;
  v_tables uuid[];
  v_items record;
  v_item_ids uuid[];
  v_item_prices int[];
  v_item_names text[];
  v_item_weights int[];
  v_total_weight int;
  v_pick int;
  v_idx int;
  v_qty int;
  -- Hours weighted towards breakfast, lunch and the evening rush.
  v_hours int[] := array[8,8,9,9,9,10,10,11,11,12,12,13,13,13,14,14,15,16,16,17,17,17,18,18,18,19,19,20,20,21];
begin
  if not public.is_service_role() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_cafe from public.cafes where id = p_cafe;
  if not found or not v_cafe.is_demo then
    raise exception 'not_a_demo_cafe' using errcode = 'P0001';
  end if;

  v_today := public.business_date(now(), v_cafe.timezone, v_cafe.day_starts_at);
  select array_agg(id order by sort) into v_tables from public.tables where cafe_id = p_cafe and archived_at is null;

  -- Popularity: a stable pseudo-random weight per item, with coffee favourites boosted.
  for v_items in
    select id, name, price_paise,
           case
             when name in ('Classic Cold Coffee', 'Cappuccino', 'Masala Chai') then 30
             when name in ('Café Latte', 'Chocolate Brownie', 'Peri Peri Fries', 'Veg Club Sandwich') then 18
             when name in ('Tiramisu', 'Green Tea', 'Iced Americano') then 2
             else 4 + (abs(hashtext(name)) % 9)
           end as weight
    from public.menu_items where cafe_id = p_cafe and archived_at is null
  loop
    v_item_ids := v_item_ids || v_items.id;
    v_item_names := v_item_names || v_items.name;
    v_item_prices := v_item_prices || v_items.price_paise;
    v_item_weights := v_item_weights || v_items.weight;
  end loop;
  select sum(w) into v_total_weight from unnest(v_item_weights) w;

  -- Up to and including today, so "today so far" has orders too.
  for d in reverse p_days..0 loop
    v_day := v_today - d;
    v_orders := case when extract(isodow from v_day) in (6, 7) then 95 else 70 end + (random() * 30)::int;

    -- Draw the day's order times first and walk them in order, so order numbers and
    -- invoice numbers rise with the clock like they do in a real cafe.
    for v_at in
      select ((v_day + make_time(v_hours[1 + floor(random() * array_length(v_hours, 1))::int], floor(random() * 60)::int, floor(random() * 60)::int))
              at time zone v_cafe.timezone) as t
      from generate_series(1, v_orders)
      order by 1
    loop
      continue when v_at > now() - interval '45 minutes'; -- nothing from the future, and the last 45 min stay quiet
      v_order := gen_random_uuid();
      v_method := case when random() < 0.62 then 'online' when random() < 0.7 then 'upi_counter' else 'cash' end;

      insert into public.orders (
        id, cafe_id, table_id, business_date, daily_no, source, idempotency_key, status, payment_status,
        payment_method, subtotal_paise, tax_paise, total_paise, tax_rate_bp, prices_include_tax, gst_mode,
        placed_at, accepted_at, ready_at, served_at, paid_at, created_at
      ) values (
        v_order, p_cafe,
        case when random() < 0.9 then v_tables[1 + floor(random() * array_length(v_tables, 1))::int] end,
        v_day, public.next_daily_no(p_cafe, v_day),
        case when random() < 0.88 then 'qr' else 'staff' end,
        gen_random_uuid(), 'completed', 'paid', v_method, 0, 0, 0, v_cafe.tax_rate_bp, v_cafe.prices_include_tax, v_cafe.gst_mode,
        v_at, v_at + interval '1 minute', v_at + interval '12 minutes', v_at + interval '14 minutes', v_at + interval '40 minutes', v_at
      );

      v_sub := 0;
      v_lines := 1 + floor(random() * random() * 4)::int;
      for l in 1..v_lines loop
        v_pick := floor(random() * v_total_weight)::int;
        v_idx := 1;
        while v_pick >= v_item_weights[v_idx] loop
          v_pick := v_pick - v_item_weights[v_idx];
          v_idx := v_idx + 1;
        end loop;
        v_qty := case when random() < 0.82 then 1 else 2 end;
        insert into public.order_items (order_id, cafe_id, item_id, name_snapshot, unit_price_paise, qty, line_total_paise)
        values (v_order, p_cafe, v_item_ids[v_idx], v_item_names[v_idx], v_item_prices[v_idx], v_qty, v_item_prices[v_idx] * v_qty);
        v_sub := v_sub + v_item_prices[v_idx] * v_qty;
      end loop;

      -- Same GST maths as lib/money.ts (prices include 5% GST, whole rupees: no round off).
      v_taxable := round(v_sub * 10000.0 / (10000 + v_cafe.tax_rate_bp));
      v_tax := v_sub - v_taxable;
      update public.orders set
        subtotal_paise = v_sub, tax_paise = v_tax, cgst_paise = v_tax / 2, sgst_paise = v_tax - v_tax / 2, total_paise = v_sub,
        invoice_no = public.next_invoice_no(p_cafe, public.fy_code(v_day))
      where id = v_order;
      v_count := v_count + 1;
    end loop;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.generate_demo_history(uuid, int) from public, anon, authenticated;
grant execute on function public.generate_demo_history(uuid, int) to service_role;

-- MENU EDITING --------------------------------------------------------------------------
-- Saves an item with its option groups and options in one transaction. Existing groups and
-- options keep their ids (open carts keep working); removed ones are deleted. Orders are
-- unaffected because they store snapshots, not references. Price changes are audited.
--
-- p: { id?, cafe_id, category_id, name, description, price_paise, diet, tags[], is_visible,
--      groups: [{ id?, name, min_select, max_select, options: [{ id?, name, price_delta_paise }] }] }

create function public.save_menu_item(p jsonb) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_cafe uuid := (p ->> 'cafe_id')::uuid;
  v_item uuid := nullif(p ->> 'id', '')::uuid;
  v_before public.menu_items;
  v_group jsonb;
  v_group_id uuid;
  v_option jsonb;
  v_option_id uuid;
  v_keep_groups uuid[] := '{}';
  v_keep_options uuid[];
  g_sort int := 0;
  o_sort int;
begin
  if not public.is_staff_of(v_cafe, array['owner', 'manager']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_item is null then
    insert into public.menu_items (cafe_id, category_id, name, description, price_paise, diet, tags, is_visible, sort)
    values (
      v_cafe, (p ->> 'category_id')::uuid, p ->> 'name', nullif(p ->> 'description', ''), (p ->> 'price_paise')::int,
      nullif(p ->> 'diet', ''), coalesce(array(select jsonb_array_elements_text(p -> 'tags')), '{}'),
      coalesce((p ->> 'is_visible')::boolean, true),
      coalesce((select max(sort) + 1 from public.menu_items where category_id = (p ->> 'category_id')::uuid), 1)
    ) returning id into v_item;
  else
    select * into v_before from public.menu_items where id = v_item and cafe_id = v_cafe and archived_at is null;
    if not found then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    update public.menu_items set
      category_id = (p ->> 'category_id')::uuid,
      name = p ->> 'name',
      description = nullif(p ->> 'description', ''),
      price_paise = (p ->> 'price_paise')::int,
      diet = nullif(p ->> 'diet', ''),
      tags = coalesce(array(select jsonb_array_elements_text(p -> 'tags')), '{}'),
      is_visible = coalesce((p ->> 'is_visible')::boolean, true)
    where id = v_item;

    if v_before.price_paise <> (p ->> 'price_paise')::int then
      insert into public.activity_log (cafe_id, actor_id, action, entity, entity_id, before, after)
      values (v_cafe, auth.uid(), 'price_changed', 'menu_item', v_item::text,
              jsonb_build_object('name', v_before.name, 'price_paise', v_before.price_paise),
              jsonb_build_object('name', p ->> 'name', 'price_paise', (p ->> 'price_paise')::int));
    end if;
  end if;

  for v_group in select * from jsonb_array_elements(coalesce(p -> 'groups', '[]'::jsonb)) loop
    g_sort := g_sort + 1;
    v_group_id := nullif(v_group ->> 'id', '')::uuid;
    if v_group_id is not null and exists (select 1 from public.option_groups where id = v_group_id and item_id = v_item) then
      update public.option_groups set
        name = v_group ->> 'name', min_select = (v_group ->> 'min_select')::int, max_select = (v_group ->> 'max_select')::int, sort = g_sort
      where id = v_group_id;
    else
      insert into public.option_groups (cafe_id, item_id, name, min_select, max_select, sort)
      values (v_cafe, v_item, v_group ->> 'name', (v_group ->> 'min_select')::int, (v_group ->> 'max_select')::int, g_sort)
      returning id into v_group_id;
    end if;
    v_keep_groups := v_keep_groups || v_group_id;

    v_keep_options := '{}';
    o_sort := 0;
    for v_option in select * from jsonb_array_elements(coalesce(v_group -> 'options', '[]'::jsonb)) loop
      o_sort := o_sort + 1;
      if nullif(v_option ->> 'id', '') is not null
         and exists (select 1 from public.options where id = (v_option ->> 'id')::uuid and group_id = v_group_id) then
        update public.options set name = v_option ->> 'name', price_delta_paise = (v_option ->> 'price_delta_paise')::int, sort = o_sort
        where id = (v_option ->> 'id')::uuid;
        v_keep_options := v_keep_options || (v_option ->> 'id')::uuid;
      else
        insert into public.options (cafe_id, group_id, name, price_delta_paise, sort)
        values (v_cafe, v_group_id, v_option ->> 'name', (v_option ->> 'price_delta_paise')::int, o_sort)
        returning id into v_option_id;
        v_keep_options := v_keep_options || v_option_id;
      end if;
    end loop;
    delete from public.options where group_id = v_group_id and not (id = any (v_keep_options));
  end loop;
  delete from public.option_groups where item_id = v_item and not (id = any (v_keep_groups));

  return v_item;
end;
$$;

-- Removes an item from the menu but keeps it for order history and reports.
create function public.archive_menu_item(p_item uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_cafe uuid;
begin
  select cafe_id into v_cafe from public.menu_items where id = p_item;
  if v_cafe is null or not public.is_staff_of(v_cafe, array['owner', 'manager']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.menu_items set archived_at = now(), is_visible = false where id = p_item;
  delete from public.item_pairings where item_id = p_item or paired_item_id = p_item;
  insert into public.activity_log (cafe_id, actor_id, action, entity, entity_id)
  values (v_cafe, auth.uid(), 'item_archived', 'menu_item', p_item::text);
end;
$$;
