-- Wastage Sale-এ উৎস তিন রকম (from_stock boolean-এর বদলে source enum):
--   'wastage_stock'  — রেকর্ড করা non-recycled wastage পুল থেকে (COGS নেই — মূল্য
--                      আগেই 5600 Wastage Loss-এ গেছে); available = Σ(non-recycled
--                      wastage Lbs) − Σ(এই উৎস থেকে আগের বিক্রি Lbs)।
--   'recycled_chips' — Recycled Chips raw-material স্টক থেকে; স্টক কমে +
--                      COGS Dr 5050 / Cr 1203।
--   'loose'          — কারখানার আলগা স্ক্র্যাপ; স্টকে প্রভাব নেই।

alter table public.wastage_sales
  add column if not exists source text not null default 'loose';

update public.wastage_sales
   set source = case when from_stock then 'recycled_chips' else 'loose' end
 where source = 'loose';

alter table public.wastage_sales drop column if exists from_stock;

alter table public.wastage_sales
  add constraint wastage_sales_source_check
  check (source = any (array['wastage_stock'::text, 'recycled_chips'::text, 'loose'::text]));
