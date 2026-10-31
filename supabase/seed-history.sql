-- 60 days of order history for the demo cafe (dashboard charts), with reviews and the upsell
-- cache. Kept out of seed.sql so the database tests stay fast. Runs after seed.sql on
-- `supabase db reset`. The owner panel's "Reset demo" and the nightly job do the same.
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.generate_demo_history(id, 60) as orders_created from public.cafes where slug = 'demo';
select public.generate_demo_reviews(id) as reviews_created from public.cafes where slug = 'demo';
select public.refresh_insights(id) from public.cafes where slug = 'demo';
commit;
