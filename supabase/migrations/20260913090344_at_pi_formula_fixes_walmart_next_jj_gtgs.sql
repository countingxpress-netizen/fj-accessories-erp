-- AT Accessories — সব বায়ারের সব PI ফাইল (747+ real files, AT Folders/PI) formula-by-formula
-- ক্রস-চেক করে (২০২৬-০৯-১৩) পাওয়া গরমিলগুলো ঠিক করা। প্রতিটা RECENT (2025/2026) ফাইলের
-- L/Q-কলাম থেকে সরাসরি rate/markup তুলে DB-র সাথে মেলানো হয়েছে।

-- Walmart-এর জন্য দুই রকম Rate/Lbs — measurement type-এ adhesive/flap থাকলে আলাদা রেট।
-- calcPiUnitPriceWithMarkup() এই কলাম থাকলে ব্যবহার করবে, নাহলে সাধারণ rate_per_lbs_value।
alter table buyers add column if not exists rate_per_lbs_value_adhesive numeric(10,4);

-- Walmart — আগের এন্ট্রি (rate=95, markup=150%, USD/BDT=107) ফাইলের সাথে মেলেনি।
-- আসল ফাইল (PI-1529/1593, AT Folders/PI): non-adhesive বাগে rate=120.6, adhesive/flap
-- বাগে rate=172.9, কোনো markup% নেই, USD/BDT=115।
update buyers b set
  rate_per_lbs_value = 120.6,
  rate_per_lbs_value_adhesive = 172.9,
  percentage_value = 0,
  usd_bdt_rate = 115
from customers c
where b.customer_id = c.id and c.code = 'AT' and b.name = 'Walmart';

-- NEXT — migration কমেন্টে লেখা ছিল "adhesive অনিশ্চিত, ডিফল্ট বসানো, যাচাই করবেন" (30%,
-- কখনো ফাইল দিয়ে যাচাই হয়নি)। আসল ফাইল (PI-1710, 2026): markup 1.558 = 55.8%।
update buyers b set percentage_value = 55.8
from customers c
where b.customer_id = c.id and c.code = 'AT' and b.name = 'NEXT';

-- Jack & Jones — adhesive_rate_per_inch NULL ছিল (adhesive charge বাদ পড়ছিল)। আসল ফাইলে
-- (PI-1042/1054, 2025) প্রতি লাইনে CuttingInch × 0.02 adhesive charge যোগ হয়
-- (thickness ঠিক 7mm হলে বাদ — এই edge case এখনো দেখা যায়নি, কোডে যোগ করা হয়নি)।
update buyers b set adhesive_rate_per_inch = 0.02
from customers c
where b.customer_id = c.id and c.code = 'AT' and b.name = 'Jack & Jones';

-- GTGS — আগে "রেট বের করা যায়নি" বলে বায়ারই তৈরি হয়নি। আসল ফাইল (PI-1123/1163/1207,
-- AT Folders/PI, ৫৬ লাইন): rate/Lbs=150, markup 0%, adhesive 0.01/inch। দাম per-dozen
-- (×12) দেখানো হয় কিন্তু qty-ও per-dozen ধরা হয় বলে টোটাল বিল ঠিকই থাকে।
insert into buyers (customer_id, name, pricing_rule, rate_per_lbs_value, usd_bdt_rate, percentage_value, pi_thickness_mm, adhesive_rate_per_inch)
select c.id, 'GTGS', 'rate_per_lbs_markup', 150, 107, 0, 9.5, 0.01
from customers c where c.code = 'AT'
on conflict (customer_id, name) do update set
  pricing_rule = excluded.pricing_rule,
  rate_per_lbs_value = excluded.rate_per_lbs_value,
  usd_bdt_rate = excluded.usd_bdt_rate,
  percentage_value = excluded.percentage_value,
  pi_thickness_mm = excluded.pi_thickness_mm,
  adhesive_rate_per_inch = excluded.adhesive_rate_per_inch;
