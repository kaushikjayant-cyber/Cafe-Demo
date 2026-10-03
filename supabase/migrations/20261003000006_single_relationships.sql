-- The composite (id, cafe_id) foreign keys added in the RLS migration already enforce
-- everything the single-column ones did, plus same-cafe integrity. Keeping both gives
-- PostgREST two relationships between the same tables, and embedded selects like
-- menu_items(option_groups(...)) fail with PGRST201. Drop the redundant single-column keys.

alter table public.menu_items drop constraint if exists menu_items_category_id_fkey;
alter table public.option_groups drop constraint if exists option_groups_item_id_fkey;
alter table public.options drop constraint if exists options_group_id_fkey;
alter table public.item_pairings drop constraint if exists item_pairings_item_id_fkey;
alter table public.item_pairings drop constraint if exists item_pairings_paired_item_id_fkey;
alter table public.orders drop constraint if exists orders_table_id_fkey;
alter table public.order_items drop constraint if exists order_items_order_id_fkey;
alter table public.payments drop constraint if exists payments_order_id_fkey;
alter table public.refunds drop constraint if exists refunds_payment_id_fkey;
alter table public.service_requests drop constraint if exists service_requests_table_id_fkey;
alter table public.reviews drop constraint if exists reviews_order_id_fkey;
