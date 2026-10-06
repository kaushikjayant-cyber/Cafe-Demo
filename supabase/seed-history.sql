-- 60 days of order history for the demo cafe (dashboard charts). Kept out of seed.sql so
-- the database tests stay fast. Runs after seed.sql on `supabase db reset`.
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.generate_demo_history(id, 60) as orders_created from public.cafes where slug = 'demo';

-- Reviews on about a third of the demo orders, mostly happy. Old low ratings are already
-- handled, so the counter doesn't open on a wall of alerts.
with picked as (
  select o.id, o.cafe_id, o.placed_at, random() as r
  from public.orders o join public.cafes c on c.id = o.cafe_id
  where c.slug = 'demo' and o.status = 'completed' and random() < 0.33
)
insert into public.reviews (cafe_id, order_id, rating, comment, created_at, handled_at)
select cafe_id, id,
  case when r < 0.55 then 5 when r < 0.82 then 4 when r < 0.92 then 3 when r < 0.97 then 2 else 1 end,
  case when r < 0.12 then (array['Lovely coffee, will come back.', 'Great vibe and quick service.', 'Best cold coffee in Indiranagar!', 'Brownie was perfect.'])[1 + floor(random() * 4)::int]
       when r >= 0.92 then (array['Coffee was cold.', 'Took too long to arrive.', 'Sandwich was soggy.'])[1 + floor(random() * 3)::int]
  end,
  placed_at + interval '40 minutes', placed_at + interval '50 minutes'
from picked;

-- Per-item thumbs on about half the demo reviews, following the overall rating, so the
-- owner's "Most loved" / "Needs a look" lists have something to show.
insert into public.review_items (review_id, cafe_id, item_id, liked)
select distinct on (r.id, oi.item_id) r.id, r.cafe_id, oi.item_id,
  case when r.rating >= 4 then random() < 0.92 when r.rating = 3 then random() < 0.6 else random() < 0.15 end
from public.reviews r
join public.cafes c on c.id = r.cafe_id and c.slug = 'demo'
join public.order_items oi on oi.order_id = r.order_id and oi.item_id is not null
where random() < 0.5
on conflict do nothing;

select public.refresh_insights(id) from public.cafes where slug = 'demo';
commit;
