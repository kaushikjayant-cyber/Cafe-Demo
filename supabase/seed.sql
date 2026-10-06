-- Demo cafe "Brew & Bloom" (slug: demo). Menu, options, tables and pairings.
-- 60 days of order history is generated separately in Phase 6.
-- Safe to re-run: the demo cafe is deleted and rebuilt.

do $$
declare
  v_cafe uuid;
  v_cat uuid;
  v_item uuid;
  v_group uuid;
  r record;
  c record;
  i int;
begin
  delete from public.cafes where slug = 'demo';

  insert into public.cafes (
    slug, name, brand_color, gst_mode, gstin, legal_name, address, phone, email,
    fssai_no, invoice_prefix, tax_rate_bp, prices_include_tax, plan, status, is_demo,
    google_review_url
  ) values (
    'demo', 'Brew & Bloom', '#1C1917', 'regular', '29ABCDE1234F1Z5',
    'Brew & Bloom Cafe (Demo)', '12, 100 Feet Road, Indiranagar, Bengaluru 560038',
    '+91 98765 43210', 'hello@brewandbloom.example', '11223344556677', 'BB', 500, true,
    'premium', 'active', true, 'https://www.google.com/search?q=Brew+%26+Bloom'
  ) returning id into v_cafe;

  -- Categories and items: (category, sort, name, description, price in rupees, diet, tags)
  create temp table seed_items (
    cat text, cat_sort int, name text, descr text, rupees int, diet text, tags text[],
    seq int generated always as identity
  ) on commit drop;

  insert into seed_items (cat, cat_sort, name, descr, rupees, diet, tags) values
    ('Hot Coffee', 1, 'Espresso', 'A short, intense double shot.', 120, 'veg', '{}'),
    ('Hot Coffee', 1, 'Americano', 'Espresso topped with hot water.', 150, 'veg', '{}'),
    ('Hot Coffee', 1, 'Cappuccino', 'Espresso, steamed milk, thick foam.', 180, 'veg', '{}'),
    ('Hot Coffee', 1, 'Café Latte', 'Smooth espresso with lots of steamed milk.', 190, 'veg', '{}'),
    ('Hot Coffee', 1, 'Flat White', 'Ristretto with velvety micro-foam.', 200, 'veg', '{}'),
    ('Hot Coffee', 1, 'Mocha', 'Espresso, dark chocolate and milk.', 220, 'veg', '{}'),
    ('Hot Coffee', 1, 'Hazelnut Latte', 'Latte with house hazelnut syrup.', 230, 'veg', '{new}'),
    ('Cold Coffee', 2, 'Classic Cold Coffee', 'Blended, creamy and sweet. A café favourite.', 190, 'veg', '{}'),
    ('Cold Coffee', 2, 'Iced Americano', 'Espresso over ice and water.', 170, 'veg', '{}'),
    ('Cold Coffee', 2, 'Iced Latte', 'Espresso and cold milk over ice.', 210, 'veg', '{}'),
    ('Cold Coffee', 2, 'Cold Brew', 'Steeped for 18 hours. Low acid, bold.', 220, 'veg', '{}'),
    ('Cold Coffee', 2, 'Vietnamese Iced Coffee', 'Strong coffee with condensed milk.', 240, 'veg', '{}'),
    ('Cold Coffee', 2, 'Caramel Frappé', 'Blended ice coffee with caramel and cream.', 250, 'veg', '{}'),
    ('Tea & More', 3, 'Masala Chai', 'Kadak chai with ginger and cardamom.', 80, 'veg', '{}'),
    ('Tea & More', 3, 'Ginger Lemon Honey Tea', 'Soothing, caffeine-free.', 120, 'vegan', '{}'),
    ('Tea & More', 3, 'Green Tea', 'Light and fresh.', 110, 'vegan', '{}'),
    ('Tea & More', 3, 'Hot Chocolate', 'Rich Belgian chocolate and milk.', 200, 'veg', '{}'),
    ('Shakes & Coolers', 4, 'Oreo Shake', 'Thick shake with crushed Oreos.', 220, 'veg', '{}'),
    ('Shakes & Coolers', 4, 'Strawberry Shake', 'Made with real strawberries.', 210, 'veg', '{}'),
    ('Shakes & Coolers', 4, 'Fresh Lime Soda', 'Sweet, salted or mixed.', 110, 'vegan', '{}'),
    ('Shakes & Coolers', 4, 'Watermelon Cooler', 'Fresh watermelon with mint.', 150, 'vegan', '{}'),
    ('Bites', 5, 'Veg Club Sandwich', 'Triple-decker with veggies and cheese.', 220, 'veg', '{}'),
    ('Bites', 5, 'Chicken Tikka Sandwich', 'Smoky tikka, onions and mint mayo.', 260, 'nonveg', '{spicy}'),
    ('Bites', 5, 'Paneer Tikka Wrap', 'Grilled paneer, peppers, green chutney.', 230, 'veg', '{spicy}'),
    ('Bites', 5, 'Peri Peri Fries', 'Crispy fries with peri peri spice.', 160, 'vegan', '{spicy}'),
    ('Bites', 5, 'Cheesy Garlic Bread', 'Four slices, baked with mozzarella.', 150, 'veg', '{}'),
    ('Bites', 5, 'Masala Omelette Toast', 'Two-egg masala omelette on toast.', 180, 'egg', '{}'),
    ('Bites', 5, 'Crispy Chicken Burger', 'Fried chicken, lettuce, house sauce.', 250, 'nonveg', '{}'),
    ('Desserts', 6, 'Chocolate Brownie', 'Warm, fudgy, walnut brownie.', 140, 'egg', '{}'),
    ('Desserts', 6, 'Blueberry Cheesecake', 'Baked New York style.', 240, 'egg', '{}'),
    ('Desserts', 6, 'Tiramisu', 'Coffee-soaked layers and mascarpone.', 260, 'egg', '{}'),
    ('Desserts', 6, 'Choco Chip Cookie', 'Big, chewy, freshly baked.', 90, 'egg', '{}'),
    ('Desserts', 6, 'Banana Walnut Muffin', 'Moist, lightly spiced.', 120, 'egg', '{}'),
    ('Combos', 7, 'Cappuccino + Brownie', 'Our most loved pairing.', 290, 'egg', '{}'),
    ('Combos', 7, 'Club Sandwich + Cold Coffee', 'Lunch sorted.', 380, 'veg', '{}'),
    ('Combos', 7, 'Chai + Omelette Toast', 'The classic breakfast.', 230, 'egg', '{}');

  for c in select distinct cat, cat_sort from seed_items order by cat_sort loop
    insert into public.categories (cafe_id, name, sort)
    values (v_cafe, c.cat, c.cat_sort) returning id into v_cat;

    i := 0;
    for r in select * from seed_items s where s.cat = c.cat order by s.seq loop
      i := i + 1;
      insert into public.menu_items (cafe_id, category_id, name, description, price_paise, diet, tags, sort)
      values (v_cafe, v_cat, r.name, r.descr, r.rupees * 100, r.diet, r.tags, i);
    end loop;
  end loop;

  -- Coffee options: size, milk, sugar, extras. Espresso and Americano have no milk.
  for v_item in
    select m.id from public.menu_items m join public.categories k on k.id = m.category_id
    where m.cafe_id = v_cafe and k.name in ('Hot Coffee', 'Cold Coffee') and m.name <> 'Espresso'
  loop
    insert into public.option_groups (cafe_id, item_id, name, min_select, max_select, sort)
    values (v_cafe, v_item, 'Size', 1, 1, 1) returning id into v_group;
    insert into public.options (cafe_id, group_id, name, price_delta_paise, sort) values
      (v_cafe, v_group, 'Regular', 0, 1),
      (v_cafe, v_group, 'Large', 4000, 2);

    if (select name from public.menu_items where id = v_item) not in ('Americano', 'Iced Americano', 'Cold Brew') then
      insert into public.option_groups (cafe_id, item_id, name, min_select, max_select, sort)
      values (v_cafe, v_item, 'Milk', 1, 1, 2) returning id into v_group;
      insert into public.options (cafe_id, group_id, name, price_delta_paise, sort) values
        (v_cafe, v_group, 'Regular milk', 0, 1),
        (v_cafe, v_group, 'Oat milk', 5000, 2),
        (v_cafe, v_group, 'Almond milk', 6000, 3);
    end if;

    insert into public.option_groups (cafe_id, item_id, name, min_select, max_select, sort)
    values (v_cafe, v_item, 'Sugar', 1, 1, 3) returning id into v_group;
    insert into public.options (cafe_id, group_id, name, price_delta_paise, sort) values
      (v_cafe, v_group, 'Normal', 0, 1),
      (v_cafe, v_group, 'Less sugar', 0, 2),
      (v_cafe, v_group, 'No sugar', 0, 3);

    insert into public.option_groups (cafe_id, item_id, name, min_select, max_select, sort)
    values (v_cafe, v_item, 'Extras', 0, 3, 4) returning id into v_group;
    insert into public.options (cafe_id, group_id, name, price_delta_paise, sort) values
      (v_cafe, v_group, 'Extra shot', 4000, 1),
      (v_cafe, v_group, 'Hazelnut syrup', 3000, 2),
      (v_cafe, v_group, 'Caramel syrup', 3000, 3),
      (v_cafe, v_group, 'Whipped cream', 3000, 4);
  end loop;

  -- Espresso: just an extra shot.
  insert into public.option_groups (cafe_id, item_id, name, min_select, max_select, sort)
  select v_cafe, id, 'Extras', 0, 1, 1 from public.menu_items where cafe_id = v_cafe and name = 'Espresso'
  returning id into v_group;
  insert into public.options (cafe_id, group_id, name, price_delta_paise) values
    (v_cafe, v_group, 'Extra shot', 4000);

  -- Chai sugar.
  insert into public.option_groups (cafe_id, item_id, name, min_select, max_select, sort)
  select v_cafe, id, 'Sugar', 1, 1, 1 from public.menu_items where cafe_id = v_cafe and name = 'Masala Chai'
  returning id into v_group;
  insert into public.options (cafe_id, group_id, name, sort) values
    (v_cafe, v_group, 'Normal', 1), (v_cafe, v_group, 'Less sugar', 2), (v_cafe, v_group, 'No sugar', 3);

  -- Fries dips.
  insert into public.option_groups (cafe_id, item_id, name, min_select, max_select, sort)
  select v_cafe, id, 'Dips', 0, 2, 1 from public.menu_items where cafe_id = v_cafe and name = 'Peri Peri Fries'
  returning id into v_group;
  insert into public.options (cafe_id, group_id, name, price_delta_paise, sort) values
    (v_cafe, v_group, 'Cheese dip', 4000, 1), (v_cafe, v_group, 'Garlic mayo', 2000, 2);

  -- "Goes well with" pairings.
  insert into public.item_pairings (cafe_id, item_id, paired_item_id, sort)
  select v_cafe, a.id, b.id, p.sort
  from (values
    ('Cappuccino', 'Chocolate Brownie', 1),
    ('Café Latte', 'Choco Chip Cookie', 1),
    ('Classic Cold Coffee', 'Peri Peri Fries', 1),
    ('Classic Cold Coffee', 'Veg Club Sandwich', 2),
    ('Masala Chai', 'Banana Walnut Muffin', 1),
    ('Cold Brew', 'Blueberry Cheesecake', 1)
  ) as p(item, paired, sort)
  join public.menu_items a on a.cafe_id = v_cafe and a.name = p.item
  join public.menu_items b on b.cafe_id = v_cafe and b.name = p.paired;

  -- Twelve tables with stable tokens so the demo QR codes never change.
  for i in 1..12 loop
    insert into public.tables (cafe_id, label, token, sort)
    values (v_cafe, 'T' || i, 'bbtable' || lpad(i::text, 3, '0'), i);
  end loop;
end;
$$;
