-- 60 days of order history for the demo cafe (dashboard charts). Kept out of seed.sql so
-- the database tests stay fast. Runs after seed.sql on `supabase db reset`.
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.generate_demo_history(id, 60) as orders_created from public.cafes where slug = 'demo';
commit;
