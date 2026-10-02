-- স্টক পরিবর্তন এক ধাপে (atomic) — "lost update" বাগ বন্ধ।
--
-- আগে সব জায়গায় কোড আগে স্টক পড়ত (select), তারপর নতুন সংখ্যা লিখত (update quantity = পুরনো ± পরিমাণ)।
-- দুজন একসাথে সেভ করলে দুজনেই একই পুরনো সংখ্যা পড়ে, পরেরজনের লেখা আগেরজনেরটা মুছে দেয় — লেজারে দুটোই
-- থাকে, স্টকে একটা। (২৭/৯/২০২৬: BK-2026-0176 আর BK-2026-0177 একসাথে সেভ → ১৯৮.৩৩ lbs LLDPE হারিয়েছিল।)
--
-- এখন: adjust_*_stock(id, warehouse, delta) — ডাটাবেস নিজেই `quantity = quantity + delta` করে, row না থাকলে
-- তৈরি করে। একই (material/product, warehouse)-এ দুটো row যেন না হয়, তাই unique constraint।

alter table public.raw_material_stock
  add constraint raw_material_stock_material_warehouse_key unique (material_id, warehouse_id);

alter table public.finished_goods_stock
  add constraint finished_goods_stock_product_warehouse_key unique (product_id, warehouse_id);

create or replace function public.adjust_raw_material_stock(
  p_material_id uuid, p_warehouse_id uuid, p_delta numeric
) returns numeric
language sql
as $$
  insert into public.raw_material_stock (material_id, warehouse_id, quantity_lbs, updated_at)
  values (p_material_id, p_warehouse_id, p_delta, now())
  on conflict (material_id, warehouse_id)
  do update set quantity_lbs = public.raw_material_stock.quantity_lbs + excluded.quantity_lbs,
                updated_at = now()
  returning quantity_lbs;
$$;

create or replace function public.adjust_finished_goods_stock(
  p_product_id uuid, p_warehouse_id uuid, p_delta numeric
) returns numeric
language sql
as $$
  insert into public.finished_goods_stock (product_id, warehouse_id, quantity_pcs, updated_at)
  values (p_product_id, p_warehouse_id, p_delta, now())
  on conflict (product_id, warehouse_id)
  do update set quantity_pcs = public.finished_goods_stock.quantity_pcs + excluded.quantity_pcs,
                updated_at = now()
  returning quantity_pcs;
$$;

alter function public.adjust_raw_material_stock(uuid, uuid, numeric) owner to postgres;
alter function public.adjust_finished_goods_stock(uuid, uuid, numeric) owner to postgres;

grant execute on function public.adjust_raw_material_stock(uuid, uuid, numeric) to anon, authenticated, service_role;
grant execute on function public.adjust_finished_goods_stock(uuid, uuid, numeric) to anon, authenticated, service_role;
