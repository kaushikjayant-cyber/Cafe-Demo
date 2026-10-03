-- Helpers, counters and the order state machine. See IMPLEMENTATION.md §4 "Key DB functions".

-- AUTH HELPERS -----------------------------------------------------------------
-- security definer so RLS policies can call them without recursing into staff's own RLS.

create function public.is_service_role() returns boolean
language sql stable as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
$$;

create function public.is_staff_of(p_cafe uuid, p_roles text[] default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff s
    where s.user_id = auth.uid()
      and s.cafe_id = p_cafe
      and s.active
      and (p_roles is null or s.role = any (p_roles))
  )
$$;

create function public.staff_role_in(p_cafe uuid) returns text
language sql stable security definer set search_path = public as $$
  select s.role from public.staff s
  where s.user_id = auth.uid() and s.cafe_id = p_cafe and s.active
$$;

create function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;

-- DATES ------------------------------------------------------------------------

-- Business day: a 01:30 order at a cafe whose day starts at 04:00 belongs to yesterday [D-09].
create function public.business_date(p_at timestamptz, p_tz text, p_day_starts_at time) returns date
language sql immutable as $$
  select ((p_at at time zone p_tz) - (p_day_starts_at - time '00:00'))::date
$$;

-- Indian financial year code: 2026-10-03 -> '2627', 2027-03-31 -> '2627', 2027-04-01 -> '2728'.
create function public.fy_code(p_date date) returns text
language sql immutable as $$
  select case
    when extract(month from p_date) >= 4
      then to_char(p_date, 'YY') || to_char(p_date + interval '1 year', 'YY')
    else to_char(p_date - interval '1 year', 'YY') || to_char(p_date, 'YY')
  end
$$;

-- COUNTERS ---------------------------------------------------------------------
-- The upsert takes a row lock, so concurrent callers get distinct numbers.

create function public.next_daily_no(p_cafe uuid, p_date date) returns int
language sql volatile security definer set search_path = public as $$
  insert into public.daily_counters as c (cafe_id, business_date, last_no)
  values (p_cafe, p_date, 1)
  on conflict (cafe_id, business_date) do update set last_no = c.last_no + 1
  returning last_no
$$;

-- Gap-free per financial year, max 16 chars as GST requires: 'INV/2627/000123' [D-18].
create function public.next_invoice_no(p_cafe uuid, p_fy text) returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_no int;
  v_prefix text;
begin
  insert into public.invoice_counters as c (cafe_id, fy, last_no)
  values (p_cafe, p_fy, 1)
  on conflict (cafe_id, fy) do update set last_no = c.last_no + 1
  returning last_no into v_no;

  select invoice_prefix into v_prefix from public.cafes where id = p_cafe;
  return v_prefix || '/' || p_fy || '/' || lpad(v_no::text, 6, '0');
end;
$$;

-- ORDER STATE MACHINE [D-19] ----------------------------------------------------
-- Mirrored in lib/order-state.ts; tests/db/order-state.test.ts checks they agree.

create function public.order_transition_allowed(p_from text, p_to text, p_role text) returns boolean
language sql immutable as $$
  select case
    when p_role = 'kitchen' then (p_from, p_to) in (
      ('accepted', 'preparing'), ('accepted', 'ready'), ('preparing', 'ready'))
    else (p_from, p_to) in (
      ('pending_payment', 'placed'), ('pending_payment', 'accepted'),
      ('pending_payment', 'expired'), ('pending_payment', 'cancelled'),
      ('placed', 'accepted'), ('placed', 'rejected'), ('placed', 'cancelled'),
      ('accepted', 'preparing'), ('accepted', 'ready'), ('accepted', 'cancelled'),
      ('preparing', 'ready'), ('preparing', 'cancelled'),
      ('ready', 'served'),
      ('served', 'completed'))
  end
$$;

-- Compare-and-set: fails with 'stale_transition' if another device already moved the order.
create function public.transition_order(p_order uuid, p_from text, p_to text, p_reason text default null)
returns public.orders
language plpgsql volatile security definer set search_path = public as $$
declare
  v_order public.orders;
  v_role text;
begin
  select * into v_order from public.orders where id = p_order;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  if public.is_service_role() then
    v_role := 'service';
  else
    v_role := public.staff_role_in(v_order.cafe_id);
    if v_role is null then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  if not public.order_transition_allowed(p_from, p_to, v_role) then
    raise exception 'transition_not_allowed' using errcode = 'P0001';
  end if;

  -- Cancelling money already taken needs someone who can refund.
  if p_to = 'cancelled' and v_order.payment_status <> 'unpaid'
     and v_role not in ('owner', 'manager', 'service') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.orders set
    status = p_to,
    cancel_reason = case when p_to in ('cancelled', 'rejected') then p_reason else cancel_reason end,
    placed_at = case when p_to = 'placed' then now() else placed_at end,
    accepted_at = case when p_to = 'accepted' then now() else accepted_at end,
    ready_at = case when p_to = 'ready' then now() else ready_at end,
    served_at = case when p_to = 'served' then now() else served_at end
  where id = p_order and status = p_from
  returning * into v_order;

  if not found then
    raise exception 'stale_transition' using errcode = 'P0001';
  end if;
  return v_order;
end;
$$;

-- STAFF ACTIONS THAT EVERY ROLE MAY TAKE -----------------------------------------
-- Column-level edits are owner/manager only (RLS); these narrow RPCs open just what the
-- counter and kitchen need.

create function public.set_item_availability(p_item uuid, p_available boolean, p_until timestamptz default null)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_cafe uuid;
begin
  select cafe_id into v_cafe from public.menu_items where id = p_item;
  if v_cafe is null or not public.is_staff_of(v_cafe) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.menu_items
    set is_available = p_available,
        sold_out_until = case when p_available then null else p_until end
  where id = p_item;
end;
$$;

create function public.set_option_availability(p_option uuid, p_available boolean)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_cafe uuid;
begin
  select cafe_id into v_cafe from public.options where id = p_option;
  if v_cafe is null or not public.is_staff_of(v_cafe) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.options set is_available = p_available where id = p_option;
end;
$$;

create function public.set_ordering_paused(p_cafe uuid, p_paused boolean, p_message text default null)
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_staff_of(p_cafe) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.cafes
    set ordering_paused = p_paused,
        pause_message = case when p_paused then p_message else null end
  where id = p_cafe;
end;
$$;

-- An item is orderable when switched on and any "sold out for today" window has passed [D-14].
create function public.item_is_available(p_available boolean, p_sold_out_until timestamptz)
returns boolean
language sql stable as $$
  select p_available or (p_sold_out_until is not null and now() >= p_sold_out_until)
$$;

-- JOBS -------------------------------------------------------------------------

-- Online orders left unpaid for 15 minutes never reach the kitchen (R9).
create function public.expire_stale_payments() returns int
language sql volatile security definer set search_path = public as $$
  with expired as (
    update public.orders set status = 'expired'
    where status = 'pending_payment' and created_at < now() - interval '15 minutes'
    returning 1
  )
  select count(*)::int from expired
$$;

-- Internal functions must not be callable from the browser. Supabase grants EXECUTE to
-- anon/authenticated by default, so revoking from PUBLIC alone is not enough.
revoke execute on function public.next_daily_no(uuid, date) from public, anon, authenticated;
revoke execute on function public.next_invoice_no(uuid, text) from public, anon, authenticated;
revoke execute on function public.expire_stale_payments() from public, anon, authenticated;
grant execute on function public.next_daily_no(uuid, date) to service_role;
grant execute on function public.next_invoice_no(uuid, text) to service_role;
grant execute on function public.expire_stale_payments() to service_role;
