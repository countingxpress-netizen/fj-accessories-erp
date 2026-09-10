-- Wastage / Scrap বিক্রি Lbs অথবা Kg — যেকোনো এককে হতে পারে।
--   unit          — 'lbs' | 'kg' (ব্যবহারকারী যে এককে দিয়েছে)
--   quantity      — ঐ এককে পরিমাণ (তালিকা/DayBook-এ দেখানো)
--   rate          — ঐ এককে দর
--   amount        — quantity × rate
--   quantity_lbs  — Lbs-equivalent (স্টক কর্তন / COGS / wastage-stock পুল হিসাবের জন্য;
--                   kg হলে ÷0.453592 করে ভরা হয়)

alter table public.wastage_sales
  add column if not exists unit text not null default 'lbs',
  add column if not exists quantity numeric(14,2) not null default 0,
  add column if not exists rate numeric(14,4) not null default 0;

update public.wastage_sales
   set quantity = case when quantity = 0 then quantity_lbs else quantity end,
       rate     = case when rate = 0 then rate_per_lbs else rate end;

alter table public.wastage_sales drop column if exists rate_per_lbs;

alter table public.wastage_sales drop constraint if exists wastage_sales_unit_check;
alter table public.wastage_sales
  add constraint wastage_sales_unit_check check (unit = any (array['lbs'::text, 'kg'::text]));
