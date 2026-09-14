-- Booking/Sales-Invoice/PI-এর quoted-price ফর্মুলায় (Price/Lbs × Tube × Cutting ×
-- Thickness / 75000) এতদিন customers.price_per_lbs একটাই রেট ব্যবহার হতো, Material
-- Type (PP vs PE/PE-RLD/Custom) নির্বিশেষে। এখন থেকে দুইটা আলাদা রেট:
--   price_per_lbs_pe — PE, PE-RLD, Custom booking-এ ব্যবহার হবে
--   price_per_lbs_pp — শুধু PP booking-এ ব্যবহার হবে
-- customers.price_per_lbs কলামটা অপরিবর্তিত থাকছে — এটা এখন শুধুই LBS Invoicing
-- (Powder Bill rate)-এর জন্য ডেডিকেটেড, বাগ-ফর্মুলার সাথে আর সম্পর্কিত না।

alter table public.customers
  add column if not exists price_per_lbs_pe numeric(14,2),
  add column if not exists price_per_lbs_pp numeric(14,2);

-- বিদ্যমান price_per_lbs → price_per_lbs_pe (শুধু non-LBS কাস্টমারদের, কারণ
-- lbs_invoicing_enabled কাস্টমারদের price_per_lbs আসলে Powder rate, PE বাগ-রেট না)
update public.customers
set price_per_lbs_pe = price_per_lbs
where price_per_lbs is not null
  and coalesce(lbs_invoicing_enabled, false) = false;

-- rate_history-তে material_type কলাম — কোন historical rate PE-র জন্য, কোনটা PP-র।
-- buyer_id row-গুলোয় (PI buyer rate) প্রযোজ্য না, তাই NULL থাকবে।
alter table public.rate_history
  add column if not exists material_type text;

do $$ begin
  alter table public.rate_history
    add constraint rate_history_material_type_check
    check (material_type is null or material_type in ('pe', 'pp'));
exception when duplicate_object then null;
end $$;

-- বিদ্যমান customer_id row-গুলো (buyer_id বাদে) সবই আসলে PE বাগ-ফর্মুলার রেট ছিল —
-- ব্যতিক্রম: LBS-invoicing কাস্টমারের (Rubel-HAMS) row, ওটা Powder rate, material_type
-- NULL-ই থাকবে (নতুন PE/PP-নির্দিষ্ট কোয়েরি তাই ওটা আর তুলবে না, ঠিক আচরণ)।
update public.rate_history
set material_type = 'pe'
where customer_id is not null
  and material_type is null
  and customer_id not in (select id from public.customers where coalesce(lbs_invoicing_enabled, false) = true);

-- Unique constraint: আগে (customer_id, effective_from) — এখন material_type যোগ করে,
-- যাতে একই তারিখে PE আর PP দুটো আলাদা রেট এন্ট্রি করা যায়।
drop index if exists rate_history_customer_effdate_idx;
create unique index if not exists rate_history_customer_effdate_idx
  on public.rate_history (customer_id, effective_from, material_type) where customer_id is not null;
