-- Demo polish (Phase 6): one call that puts the demo cafe back to a fresh, busy state, with
-- 60 days of history ending now. Used by the owner panel's "Reset demo" button and nightly.
-- Only ever touches cafes with is_demo = true [R31].

-- Reviews on about a third of a demo cafe's completed orders, mostly happy, with per-item
-- thumbs that follow the rating. Old low ratings are already handled, so the counter
-- doesn't open on a wall of alerts. (Was inline in seed-history.sql.)
create function public.generate_demo_reviews(p_cafe uuid) returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  v_count int;
begin
  if not exists (select 1 from public.cafes where id = p_cafe and is_demo) then
    raise exception 'not_a_demo_cafe' using errcode = 'P0001';
  end if;

  with picked as (
    select o.id, o.placed_at, random() as r
    from public.orders o
    where o.cafe_id = p_cafe and o.status = 'completed' and o.placed_at < now() - interval '2 hours' and random() < 0.33
  ), inserted as (
    insert into public.reviews (cafe_id, order_id, rating, comment, created_at, handled_at)
    select p_cafe, id,
      case when r < 0.55 then 5 when r < 0.82 then 4 when r < 0.92 then 3 when r < 0.97 then 2 else 1 end,
      case when r < 0.12 then (array['Lovely coffee, will come back.', 'Great vibe and quick service.', 'Best cold coffee in Indiranagar!', 'Brownie was perfect.'])[1 + floor(random() * 4)::int]
           when r >= 0.92 then (array['Coffee was cold.', 'Took too long to arrive.', 'Sandwich was soggy.'])[1 + floor(random() * 3)::int]
      end,
      placed_at + interval '40 minutes', placed_at + interval '50 minutes'
    from picked
    on conflict (order_id) do nothing
    returning id
  )
  select count(*) into v_count from inserted;

  insert into public.review_items (review_id, cafe_id, item_id, liked)
  select distinct on (r.id, oi.item_id) r.id, p_cafe, oi.item_id,
    case when r.rating >= 4 then random() < 0.92 when r.rating = 3 then random() < 0.6 else random() < 0.15 end
  from public.reviews r
  join public.order_items oi on oi.order_id = r.order_id and oi.item_id is not null
  where r.cafe_id = p_cafe and random() < 0.5
  on conflict do nothing;

  return v_count;
end;
$$;
revoke execute on function public.generate_demo_reviews(uuid) from public, anon, authenticated;
grant execute on function public.generate_demo_reviews(uuid) to service_role;

-- Wipe a demo cafe's activity and regenerate it. Menu items, tables, staff and settings stay
-- (they're the demo's setup), but anything a visitor switched off is switched back on.
-- p_min_gap: refuse if the last reset was more recent than this (button spam).
create function public.reset_demo_cafe(p_cafe uuid, p_min_gap interval default interval '2 minutes') returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  v_orders int;
begin
  perform 1 from public.cafes where id = p_cafe and is_demo for update; -- one reset at a time
  if not found then
    raise exception 'not_a_demo_cafe' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.activity_log
    where cafe_id = p_cafe and action = 'demo_reset' and created_at > now() - p_min_gap
  ) then
    raise exception 'reset_too_soon' using errcode = 'P0001';
  end if;

  -- Refunds point at payments without a cascade, so they go first.
  delete from public.refunds where cafe_id = p_cafe;
  delete from public.reviews where cafe_id = p_cafe;
  delete from public.service_requests where cafe_id = p_cafe;
  delete from public.orders where cafe_id = p_cafe;
  delete from public.daily_counters where cafe_id = p_cafe;
  delete from public.invoice_counters where cafe_id = p_cafe;
  delete from public.activity_log where cafe_id = p_cafe;

  update public.menu_items set is_available = true, sold_out_until = null where cafe_id = p_cafe;
  update public.options set is_available = true where cafe_id = p_cafe;
  update public.tables set is_active = true where cafe_id = p_cafe and archived_at is null;
  update public.cafes set ordering_paused = false, pause_message = null where id = p_cafe;

  v_orders := public.generate_demo_history(p_cafe, 60);
  perform public.generate_demo_reviews(p_cafe);
  perform public.refresh_insights(p_cafe);

  insert into public.activity_log (cafe_id, action, entity, entity_id, after)
  values (p_cafe, 'demo_reset', 'cafe', p_cafe, jsonb_build_object('orders', v_orders));
  return v_orders;
end;
$$;
revoke execute on function public.reset_demo_cafe(uuid, interval) from public, anon, authenticated;
grant execute on function public.reset_demo_cafe(uuid, interval) to service_role;

-- Nightly: every demo cafe starts the day fresh, with history up to today. Also keeps a
-- free-tier Supabase project from pausing for inactivity [R13].
create function public.reset_all_demo_cafes() returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  v_cafe uuid;
  v_count int := 0;
begin
  -- The nightly job has no JWT claims; generate_demo_history checks for the service role.
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  for v_cafe in select id from public.cafes where is_demo loop
    perform public.reset_demo_cafe(v_cafe, interval '0');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.reset_all_demo_cafes() from public, anon, authenticated;
grant execute on function public.reset_all_demo_cafes() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('reset-demo-cafes', '30 23 * * *', 'select public.reset_all_demo_cafes()'); -- 05:00 IST, after the 04:00 business-day start
  end if;
end;
$$;
