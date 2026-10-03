-- Atomic order creation [D-16, D-22]. The API route validates the cart and computes the
-- bill (lib/money.ts); this function stores order + items in one transaction, assigns the
-- daily number, and makes retries with the same idempotency key return the first order.

create function public.place_order(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_cafe public.cafes;
  v_order public.orders;
  v_key uuid := (p ->> 'idempotency_key')::uuid;
  v_status text := p ->> 'status';
  v_line jsonb;
begin
  if not public.is_service_role() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_status not in ('placed', 'pending_payment', 'accepted') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  select * into v_cafe from public.cafes where id = (p ->> 'cafe_id')::uuid;
  if not found then
    raise exception 'cafe_not_found' using errcode = 'P0002';
  end if;

  select * into v_order from public.orders where cafe_id = v_cafe.id and idempotency_key = v_key;
  if found then
    return jsonb_build_object('order_id', v_order.id, 'daily_no', v_order.daily_no,
                              'status', v_order.status, 'duplicate', true);
  end if;

  begin
    insert into public.orders (
      cafe_id, table_id, business_date, daily_no, source, customer_uid, guest_name,
      idempotency_key, status, payment_status, payment_method,
      subtotal_paise, tax_paise, cgst_paise, sgst_paise, round_off_paise, total_paise,
      tax_rate_bp, prices_include_tax, gst_mode, note, placed_at, accepted_at
    ) values (
      v_cafe.id,
      (p ->> 'table_id')::uuid,
      public.business_date(now(), v_cafe.timezone, v_cafe.day_starts_at),
      public.next_daily_no(v_cafe.id, public.business_date(now(), v_cafe.timezone, v_cafe.day_starts_at)),
      p ->> 'source',
      (p ->> 'customer_uid')::uuid,
      nullif(p ->> 'guest_name', ''),
      v_key,
      v_status,
      'unpaid',
      p ->> 'payment_method',
      (p ->> 'subtotal_paise')::int,
      (p ->> 'tax_paise')::int,
      (p ->> 'cgst_paise')::int,
      (p ->> 'sgst_paise')::int,
      (p ->> 'round_off_paise')::int,
      (p ->> 'total_paise')::int,
      v_cafe.tax_rate_bp,
      v_cafe.prices_include_tax,
      v_cafe.gst_mode,
      nullif(p ->> 'note', ''),
      case when v_status in ('placed', 'accepted') then now() end,
      case when v_status = 'accepted' then now() end
    ) returning * into v_order;
  exception when unique_violation then
    -- A concurrent retry with the same key won the race.
    select * into v_order from public.orders where cafe_id = v_cafe.id and idempotency_key = v_key;
    if found then
      return jsonb_build_object('order_id', v_order.id, 'daily_no', v_order.daily_no,
                                'status', v_order.status, 'duplicate', true);
    end if;
    raise;
  end;

  for v_line in select * from jsonb_array_elements(p -> 'lines') loop
    insert into public.order_items (
      order_id, cafe_id, item_id, name_snapshot, unit_price_paise, qty,
      options_snapshot, line_total_paise, note
    ) values (
      v_order.id, v_cafe.id,
      (v_line ->> 'item_id')::uuid,
      v_line ->> 'name',
      (v_line ->> 'unit_price_paise')::int,
      (v_line ->> 'qty')::int,
      coalesce(v_line -> 'options', '[]'::jsonb),
      (v_line ->> 'line_total_paise')::int,
      nullif(v_line ->> 'note', '')
    );
  end loop;

  return jsonb_build_object('order_id', v_order.id, 'daily_no', v_order.daily_no,
                            'status', v_order.status, 'duplicate', false);
end;
$$;

revoke execute on function public.place_order(jsonb) from public, anon, authenticated;
grant execute on function public.place_order(jsonb) to service_role;
