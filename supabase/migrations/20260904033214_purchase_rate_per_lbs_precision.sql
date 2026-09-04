-- Purchase Entry-তে Unit = Bags হলে ব্যবহারকারী এখন "Rate/Bag" টাইপ করেন;
-- ফর্ম সেটাকে ÷55 করে rate_per_lbs হিসেবে রাখে। ভাগফলে দশমিক লম্বা হয়
-- (যেমন 3500/55 = 63.636363…), তাই numeric(14,2) রাউন্ডিং-এ stored amount
-- আর Journal Voucher-এর অঙ্কে কয়েক টাকা gap তৈরি হতো।
--
-- rate_per_lbs → numeric(14,6): per-bag দাম ÷55 করলেও stored `amount`
-- (generated: quantity_lbs * rate_per_lbs) আর JV পয়সা পর্যন্ত মেলে।
-- `amount` generated column numeric(14,2)-ই থাকে, শুধু ইনপুট precision বাড়ল।
--
-- Postgres generated column-এ ব্যবহৃত কলামের type সরাসরি বদলাতে দেয় না,
-- তাই amount আগে drop করে, type বদলে, আবার হুবহু একই expression-এ re-add করা হয়।

alter table public.purchase_entry_items drop column "amount";

alter table public.purchase_entry_items
  alter column "rate_per_lbs" type numeric(14,6);

alter table public.purchase_entry_items
  add column "amount" numeric(14,2)
  generated always as (("quantity_lbs" * "rate_per_lbs")) stored;
