-- "নতুন পার্টি" গ্রুপ + ১৫টা নগদ কাস্টমারের ওপেনিং ব্যালেন্স সেট-আপ।
--
-- পটভূমি: এতদিন সব নগদ বিক্রির ওপেনিং একটা লাম্প কাস্টমার "নতুন পাটি"-তে (৳৮৫,০২৪)
-- বসানো ছিল। এখন প্রতিটা নগদ পার্টি আলাদা কাস্টমার হবে, সবগুলো "নতুন পার্টি" গ্রুপে —
-- রিপোর্টে এক লাইনে গ্রুপ নামে রোল-আপ হবে (দেখুন 20260907113000_customer_groups.sql)।
--
-- সোর্স: E:\Apps\Customer Balance Summary.xlsx (Zoho export), F কলামে "নতুন পার্টি"
-- ট্যাগ করা ৭০টার মধ্যে যাদের closing_balance ≠ 0 — সেই ১৫টা। নেট = ৳৮৫,০২৪, যা
-- পুরনো লাম্প কাস্টমারের ব্যালেন্সের সমান — তাই মোট বই (consolidated opening JV
-- JV-2026-0001, ৳৩,৫৫,২১,৪৬৯) অপরিবর্তিত থাকে।
--
-- বাকি ৫৫টা শূন্য-ব্যালেন্স নগদ পার্টি এখানে আনা হচ্ছে না — প্রয়োজনে Customers
-- পেজ থেকে হাতে যোগ করে Customer Groups পেজ থেকে গ্রুপে বসানো যাবে।

-- ১. পুরনো টেস্ট গ্রুপ সরাও (০ সদস্য)
delete from public.customer_groups where name = 'নতুন পার্টি--';

-- ২. "নতুন পার্টি" গ্রুপ (আগে থেকে না থাকলে)
insert into public.customer_groups (name)
select 'নতুন পার্টি'
where not exists (select 1 from public.customer_groups where name = 'নতুন পার্টি');

-- ৩. ১৫টা নগদ কাস্টমার — ওপেনিং ব্যালেন্স সহ, "নতুন পার্টি" গ্রুপে
insert into public.customers (name, opening_balance, opening_balance_date, group_id)
select v.name, v.bal, date '2026-09-01', g.id
from (values
  ('Abul Hossen - Cash',  1100),
  ('BIT Pack-Cash',         737),
  ('Cash Sale - Imran',   22000),
  ('Cash Sale - Lutfor',   5801),
  ('CASH-PP',             23920),
  ('CrossWeare - Cash',   21379),
  ('InterPack',              88),
  ('Lokman-Cash',           900),
  ('MARKS',                5600),
  ('Rinku',                4413),
  ('Shahin - Cash',      -11455),
  ('Sharif-Cash',           184),
  ('Shopon-CashSale',      6757),
  ('Sicilia-',              200),
  ('Sobuj Packeging',      3400)
) as v(name, bal)
cross join (select id from public.customer_groups where name = 'নতুন পার্টি' limit 1) g
where not exists (select 1 from public.customers c where c.name = v.name);

-- ৪. পুরনো লাম্প কাস্টমার "নতুন পাটি" সরাও।
--    এর কোনো Invoice/Payment/Booking নেই — থাকলে FK আটকাবে ও পুরো migration rollback হবে।
delete from public.customers
where name = 'নতুন পাটি'
  and coalesce(opening_balance, 0) = 85024
  and not exists (select 1 from public.sales_invoices si where si.customer_id = customers.id)
  and not exists (select 1 from public.customer_payments cp where cp.customer_id = customers.id)
  and not exists (select 1 from public.bookings b where b.customer_id = customers.id);
