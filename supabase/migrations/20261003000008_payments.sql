-- Online payments (Phase 3). See IMPLEMENTATION.md §5.4 [D-24].
-- Both the browser's "verify" call and the gateway's webhook call record_online_payment();
-- whichever arrives first records the payment and the other is a no-op.

create function public.record_online_payment(p_rp_order_id text, p_rp_payment_id text, p_amount int, p_raw jsonb default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_payment public.payments;
  v_order public.orders;
  v_cafe public.cafes;
  v_result text;
begin
  if not public.is_service_role() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_payment from public.payments where rp_order_id = p_rp_order_id for update;
  if not found then
    raise exception 'payment_not_found' using errcode = 'P0002';
  end if;
  if v_payment.status = 'captured' then
    return jsonb_build_object('result', 'already_recorded', 'order_id', v_payment.order_id);
  end if;
  if p_amount <> v_payment.amount_paise then
    raise exception 'amount_mismatch' using errcode = 'P0001';
  end if;

  update public.payments set status = 'captured', rp_payment_id = p_rp_payment_id, raw = coalesce(p_raw, raw)
  where id = v_payment.id;

  select * into v_order from public.orders where id = v_payment.order_id for update;
  select * into v_cafe from public.cafes where id = v_order.cafe_id;

  if v_order.payment_status <> 'unpaid' then
    -- Paid twice (e.g. two checkout attempts both succeeded). Keep the money traceable
    -- and put the order in front of staff to refund the extra payment.
    update public.orders set needs_attention = true where id = v_order.id;
    return jsonb_build_object('result', 'double_payment', 'order_id', v_order.id);
  end if;

  if v_order.status in ('expired', 'cancelled', 'rejected') then
    -- Late payment (R9): money arrived after the order was closed. Bring it back to the
    -- counter's New column, flagged, so staff serve it or refund it.
    v_result := 'late_payment';
    update public.orders set
      status = 'placed', placed_at = now(), needs_attention = true
    where id = v_order.id;
  else
    v_result := 'paid';
    if v_order.status = 'pending_payment' then
      update public.orders set
        status = case when v_cafe.accept_mode = 'auto_paid' then 'accepted' else 'placed' end,
        placed_at = now(),
        accepted_at = case when v_cafe.accept_mode = 'auto_paid' then now() end
      where id = v_order.id;
    end if;
  end if;

  update public.orders set
    payment_status = 'paid',
    payment_method = 'online',
    paid_at = now(),
    invoice_no = public.next_invoice_no(
      v_cafe.id, public.fy_code(public.business_date(now(), v_cafe.timezone, v_cafe.day_starts_at))),
    status = case when status = 'served' then 'completed' else status end
  where id = v_order.id
  returning * into v_order;

  return jsonb_build_object('result', v_result, 'order_id', v_order.id, 'status', v_order.status);
end;
$$;

create function public.record_payment_failure(p_rp_order_id text, p_raw jsonb default null) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_service_role() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.payments set status = 'failed', raw = coalesce(p_raw, raw)
  where rp_order_id = p_rp_order_id and status = 'created';
end;
$$;

-- Records a refund that the gateway has accepted and updates the order's payment status.
create function public.record_refund(
  p_payment uuid, p_rp_refund_id text, p_amount int, p_reason text, p_staff uuid
) returns public.orders
language plpgsql volatile security definer set search_path = public as $$
declare
  v_payment public.payments;
  v_order public.orders;
  v_refunded int;
begin
  if not public.is_service_role() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_payment from public.payments where id = p_payment for update;
  if not found or v_payment.status not in ('captured', 'refunded') then
    raise exception 'payment_not_refundable' using errcode = 'P0001';
  end if;

  select coalesce(sum(amount_paise), 0) into v_refunded from public.refunds where payment_id = p_payment;
  if p_amount <= 0 or v_refunded + p_amount > v_payment.amount_paise then
    raise exception 'refund_too_large' using errcode = 'P0001';
  end if;

  insert into public.refunds (cafe_id, payment_id, rp_refund_id, amount_paise, reason, by_staff_id)
  values (v_payment.cafe_id, p_payment, p_rp_refund_id, p_amount, p_reason, p_staff);

  if v_refunded + p_amount = v_payment.amount_paise then
    update public.payments set status = 'refunded' where id = p_payment;
  end if;

  -- What the cafe keeps decides the order's state: refunding the extra charge of a double
  -- payment leaves it simply "paid"; giving everything back makes it "refunded".
  with net as (
    select
      coalesce((select sum(p.amount_paise) from public.payments p where p.order_id = v_payment.order_id and p.status in ('captured', 'refunded')), 0)
      - coalesce((select sum(r.amount_paise) from public.refunds r join public.payments p on p.id = r.payment_id where p.order_id = v_payment.order_id), 0)
        as kept
  )
  update public.orders o set
    payment_status = case
      when net.kept <= 0 then 'refunded'
      when net.kept >= o.total_paise then 'paid'
      else 'partially_refunded'
    end,
    needs_attention = case when net.kept = o.total_paise or net.kept <= 0 then false else o.needs_attention end
  from net
  where o.id = v_payment.order_id
  returning o.* into v_order;
  return v_order;
end;
$$;

revoke execute on function public.record_online_payment(text, text, int, jsonb) from public, anon, authenticated;
revoke execute on function public.record_payment_failure(text, jsonb) from public, anon, authenticated;
revoke execute on function public.record_refund(uuid, text, int, text, uuid) from public, anon, authenticated;
grant execute on function public.record_online_payment(text, text, int, jsonb) to service_role;
grant execute on function public.record_payment_failure(text, jsonb) to service_role;
grant execute on function public.record_refund(uuid, text, int, text, uuid) to service_role;

-- Staff decided to serve a late-paid order (or otherwise dealt with the flag).
create function public.clear_order_attention(p_order uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_cafe uuid;
begin
  select cafe_id into v_cafe from public.orders where id = p_order;
  if v_cafe is null or not public.is_staff_of(v_cafe, array['owner', 'manager', 'cashier']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.orders set needs_attention = false where id = p_order;
end;
$$;

-- Anonymous guest sessions are deleted after 30 days without use (R32; promised in the
-- privacy policy). Orders keep their customer_uid as a plain value, so history is unaffected.
create function public.cleanup_anonymous_users() returns int
language plpgsql volatile security definer set search_path = public, auth as $$
declare
  v_count int;
begin
  delete from auth.users
  where is_anonymous
    and coalesce(last_sign_in_at, created_at) < now() - interval '30 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.cleanup_anonymous_users() from public, anon, authenticated;
grant execute on function public.cleanup_anonymous_users() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('cleanup-anonymous-users', '30 3 * * *', 'select public.cleanup_anonymous_users()');
  end if;
end;
$$;
