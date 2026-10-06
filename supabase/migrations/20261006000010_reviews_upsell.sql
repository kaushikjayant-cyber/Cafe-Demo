-- Reviews & upsell (Phase 5): guest reviews with live low-rating alerts, and the nightly
-- cache behind "Goes well with", best-seller badges and the cart suggestion (§5.9, §5.10).

-- REVIEWS ---------------------------------------------------------------------------------
-- A low rating stays on the counter board until someone has dealt with it.
alter table public.reviews
  add column handled_at timestamptz,
  add column handled_by uuid references public.staff (id);

-- What a guest can review: an order that happened (served, completed or paid). Guests
-- can't write reviews directly; the server checks the phone owns the order, then calls this.
-- p_items: [{ item_id, liked }] for the 👍/👎 per item; items not in the order are ignored.
create function public.submit_review(p_order uuid, p_customer uuid, p_rating int, p_comment text, p_items jsonb default '[]')
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_order public.orders;
  v_review uuid;
begin
  if not public.is_service_role() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order for update;
  if v_order is null or v_order.customer_uid is distinct from p_customer then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if not (v_order.status in ('served', 'completed') or v_order.payment_status = 'paid') then
    raise exception 'not_reviewable' using errcode = '22023';
  end if;
  if p_rating not between 1 and 5 then
    raise exception 'invalid_rating' using errcode = '22023';
  end if;

  insert into public.reviews (cafe_id, order_id, rating, comment)
  values (v_order.cafe_id, p_order, p_rating, nullif(left(btrim(coalesce(p_comment, '')), 500), ''))
  on conflict (order_id) do nothing
  returning id into v_review;
  if v_review is null then
    raise exception 'already_reviewed' using errcode = '23505';
  end if;

  insert into public.review_items (review_id, cafe_id, item_id, liked)
  select distinct on (oi.item_id) v_review, v_order.cafe_id, oi.item_id, (x ->> 'liked')::boolean
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x
  join public.order_items oi on oi.order_id = p_order and oi.item_id = (x ->> 'item_id')::uuid
  where x ? 'liked' and jsonb_typeof(x -> 'liked') = 'boolean';

  return v_review;
end;
$$;
revoke execute on function public.submit_review(uuid, uuid, int, text, jsonb) from public, anon, authenticated;
grant execute on function public.submit_review(uuid, uuid, int, text, jsonb) to service_role;

-- Staff mark a low-rating alert as dealt with.
create function public.handle_review(p_review uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_cafe uuid;
  v_staff uuid;
begin
  select cafe_id into v_cafe from public.reviews where id = p_review;
  if v_cafe is null or not public.is_staff_of(v_cafe, array['owner', 'manager', 'cashier']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select id into v_staff from public.staff where cafe_id = v_cafe and user_id = auth.uid();
  update public.reviews set handled_at = coalesce(handled_at, now()), handled_by = coalesce(handled_by, v_staff) where id = p_review;
end;
$$;
revoke execute on function public.handle_review(uuid) from public, anon;
grant execute on function public.handle_review(uuid) to authenticated;

-- UPSELL CACHE ----------------------------------------------------------------------------
-- Computed nightly; guests read it (it holds nothing but item ids and counts).
create table public.item_insights (
  cafe_id uuid not null references public.cafes (id) on delete cascade,
  item_id uuid not null,
  is_bestseller boolean not null default false,
  sold_30d int not null default 0,
  primary key (cafe_id, item_id),
  foreign key (item_id, cafe_id) references public.menu_items (id, cafe_id) on delete cascade
);

create table public.auto_pairings (
  cafe_id uuid not null references public.cafes (id) on delete cascade,
  item_id uuid not null,
  paired_item_id uuid not null,
  together int not null,
  primary key (cafe_id, item_id, paired_item_id),
  foreign key (item_id, cafe_id) references public.menu_items (id, cafe_id) on delete cascade,
  foreign key (paired_item_id, cafe_id) references public.menu_items (id, cafe_id) on delete cascade
);

alter table public.item_insights enable row level security;
alter table public.auto_pairings enable row level security;
create policy item_insights_read on public.item_insights for select to anon, authenticated using (true);
create policy auto_pairings_read on public.auto_pairings for select to anon, authenticated using (true);
revoke insert, update, delete on public.item_insights, public.auto_pairings from anon, authenticated;

-- Best-sellers: top 5 items by quantity over the last 30 days. Auto pairs: items ordered
-- together at least 5 times in the last 60 days. Only orders that really happened count.
-- p_cafe null = every cafe (the nightly job, which runs without JWT claims; EXECUTE is
-- only granted to the service role, like expire_stale_payments).
create function public.refresh_insights(p_cafe uuid default null) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  delete from public.item_insights where p_cafe is null or cafe_id = p_cafe;
  insert into public.item_insights (cafe_id, item_id, sold_30d, is_bestseller)
  select cafe_id, item_id, qty, rank <= 5
  from (
    select oi.cafe_id, oi.item_id, sum(oi.qty)::int as qty,
           row_number() over (partition by oi.cafe_id order by sum(oi.qty) desc, oi.item_id) as rank
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    join public.menu_items m on m.id = oi.item_id and m.archived_at is null
    where (p_cafe is null or oi.cafe_id = p_cafe)
      and oi.status = 'active'
      and o.created_at >= now() - interval '30 days'
      and o.status not in ('cancelled', 'rejected', 'expired', 'pending_payment')
    group by oi.cafe_id, oi.item_id
  ) ranked;

  delete from public.auto_pairings where p_cafe is null or cafe_id = p_cafe;
  insert into public.auto_pairings (cafe_id, item_id, paired_item_id, together)
  select a.cafe_id, a.item_id, b.item_id, count(distinct a.order_id)::int
  from public.order_items a
  join public.order_items b on b.order_id = a.order_id and b.item_id <> a.item_id and b.status = 'active'
  join public.orders o on o.id = a.order_id
  join public.menu_items ma on ma.id = a.item_id and ma.archived_at is null
  join public.menu_items mb on mb.id = b.item_id and mb.archived_at is null
  where (p_cafe is null or a.cafe_id = p_cafe)
    and a.status = 'active'
    and o.created_at >= now() - interval '60 days'
    and o.status not in ('cancelled', 'rejected', 'expired', 'pending_payment')
  group by a.cafe_id, a.item_id, b.item_id
  having count(distinct a.order_id) >= 5;
end;
$$;
revoke execute on function public.refresh_insights(uuid) from public, anon, authenticated;
grant execute on function public.refresh_insights(uuid) to service_role;

-- Manual "Goes well with" for one item, replaced as a whole from the item editor.
create function public.set_item_pairings(p_item uuid, p_paired uuid[]) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_cafe uuid;
begin
  select cafe_id into v_cafe from public.menu_items where id = p_item;
  if v_cafe is null or not public.is_staff_of(v_cafe, array['owner', 'manager']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(array_length(p_paired, 1), 0) > 3 then
    raise exception 'too_many_pairings' using errcode = '22023';
  end if;
  delete from public.item_pairings where item_id = p_item;
  -- Only items of the same cafe; the composite keys would refuse others anyway.
  insert into public.item_pairings (cafe_id, item_id, paired_item_id, sort)
  select v_cafe, p_item, m.id, x.ord
  from unnest(p_paired) with ordinality x(id, ord)
  join public.menu_items m on m.id = x.id and m.cafe_id = v_cafe and m.id <> p_item;
end;
$$;
revoke execute on function public.set_item_pairings(uuid, uuid[]) from public, anon;
grant execute on function public.set_item_pairings(uuid, uuid[]) to authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('refresh-insights', '30 22 * * *', 'select public.refresh_insights()'); -- 04:00 IST
  end if;
end;
$$;
