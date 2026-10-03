-- Counter and kitchen actions (Phase 2). See IMPLEMENTATION.md §5.5.

-- MARK PAID ----------------------------------------------------------------------
-- Takes payment at the counter (or records an online one), assigns the gap-free GST
-- invoice number at that moment [D-18], and completes an order that was already served.

create function public.mark_order_paid(p_order uuid, p_method text) returns public.orders
language plpgsql volatile security definer set search_path = public as $$
declare
  v_order public.orders;
  v_cafe public.cafes;
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
  end if;
  if v_role is null or v_role not in ('owner', 'manager', 'cashier', 'service') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_method not in ('cash', 'upi_counter', 'card_counter', 'online') then
    raise exception 'invalid_method' using errcode = '22023';
  end if;
  if v_order.status in ('cancelled', 'rejected', 'expired') then
    raise exception 'order_closed' using errcode = 'P0001';
  end if;
  if v_order.payment_status <> 'unpaid' then
    raise exception 'already_paid' using errcode = 'P0001';
  end if;

  select * into v_cafe from public.cafes where id = v_order.cafe_id;

  update public.orders set
    payment_status = 'paid',
    payment_method = p_method,
    paid_at = now(),
    invoice_no = public.next_invoice_no(
      v_cafe.id, public.fy_code(public.business_date(now(), v_cafe.timezone, v_cafe.day_starts_at))),
    status = case when status = 'served' then 'completed' else status end
  where id = p_order and payment_status = 'unpaid'
  returning * into v_order;

  if not found then
    raise exception 'already_paid' using errcode = 'P0001';
  end if;
  return v_order;
end;
$$;

-- Serving an order that is already paid finishes it, so it leaves the board.
create or replace function public.transition_order(p_order uuid, p_from text, p_to text, p_reason text default null)
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

  if p_to = 'cancelled' and v_order.payment_status <> 'unpaid'
     and v_role not in ('owner', 'manager', 'service') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.orders set
    status = case when p_to = 'served' and payment_status = 'paid' then 'completed' else p_to end,
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

-- SOLD OUT FOR TODAY [D-14] ----------------------------------------------------------
-- Comes back automatically when the cafe's next business day starts.

create function public.next_business_day_start(p_cafe uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select ((public.business_date(now(), c.timezone, c.day_starts_at) + 1) + c.day_starts_at) at time zone c.timezone
  from public.cafes c where c.id = p_cafe
$$;

create function public.set_item_sold_out_today(p_item uuid) returns timestamptz
language plpgsql volatile security definer set search_path = public as $$
declare
  v_cafe uuid;
  v_until timestamptz;
begin
  select cafe_id into v_cafe from public.menu_items where id = p_item;
  if v_cafe is null or not public.is_staff_of(v_cafe) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_until := public.next_business_day_start(v_cafe);
  update public.menu_items set is_available = false, sold_out_until = v_until where id = p_item;
  return v_until;
end;
$$;

-- SERVICE REQUESTS ---------------------------------------------------------------------

create function public.resolve_service_request(p_request uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_request public.service_requests;
  v_staff uuid;
begin
  select * into v_request from public.service_requests where id = p_request;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select id into v_staff from public.staff
  where user_id = auth.uid() and cafe_id = v_request.cafe_id and active;
  if v_staff is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.service_requests set status = 'done', done_at = now(), done_by = v_staff
  where id = p_request and status = 'open';
end;
$$;


-- "We're out of oat milk": switch an option off (or on) on every item at once.
create function public.set_option_availability_by_name(p_cafe uuid, p_name text, p_available boolean)
returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  v_count int;
begin
  if not public.is_staff_of(p_cafe) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.options set is_available = p_available
  where cafe_id = p_cafe and lower(name) = lower(p_name) and is_available <> p_available;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
