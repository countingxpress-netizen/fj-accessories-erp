-- ============================================================
-- AT Accessories (এটি এক্সেসোরিজ, code='AT') — buyer PI pricing rules
--
-- এই মাসের PendingPIList.xlsx (৬৭টা পেন্ডিং PI) ঢোকানোর আগে বায়ার-রুল
-- ঠিক করা। মান এসেছে দুই জায়গা থেকে, দুটোই মিলেছে:
--   ১) supabase/legacy-migrations/Doc8, Doc10, Doc11 — আগেই ডিকোড করা ছিল
--      (E:\Apps\atpis-এর তখনকার PI Excel থেকে), কিন্তু বর্তমান buyers
--      রো-গুলো এই সপ্তাহে (২০২৬-০৯-০৫ থেকে) নতুন করে তৈরি হওয়ায় Doc8/10/11
--      কখনো এই রো-গুলোর ওপর প্রয়োগ হয়নি।
--   ২) E:\AT Folders\PI-এর ৭৪৭টা রিয়েল PI ফাইল স্ক্রিপ্ট দিয়ে স্ক্যান করে
--      স্বাধীনভাবে ক্রস-চেক করা হয়েছে (L-column rate/lbs, Q/P-column
--      মার্কআপ মাল্টিপ্লায়ার) — Doc8/10-এর সাথে হুবহু মিলেছে।
--
-- সূত্র (AT-এর PI Excel-এর হুবহু, lib/calcTubeCutting.ts calcPiUnitPriceWithMarkup):
--   baseBDT = ROUND(rate/Lbs × TubeInch × CuttingInch × Thickness/75000
--                    + AdhesiveCharge + PrintCharge, 4), ROUND(,2)
--   priceBDT = baseBDT × (1 + markup%/100)
--   priceUSD = priceBDT / usd_bdt_rate (107)
--
-- বাদ রাখা হয়েছে (ব্যবহারকারীর সিদ্ধান্তে, আপাতত এভয়েড):
--   • Rainbow — Doc8-এ 110%, ফাইল-স্ক্যানে ৮টার ৬টা 55% দেখাচ্ছে, গরমিল অমীমাংসিত
--   • GTGS    — পেন্ডিং লিস্টে নেই, টেমপ্লেট শিফটেড, রেট বের করা যায়নি
--
-- Justice — Doc8: 115%। নিজের ১১টা ফাইলের ৬টা মিলেছে, ৫টা ভিন্ন (83%/158%)।
--   ব্যবহারকারীর সিদ্ধান্তে outlier-গুলো এভয়েড করে majority-rule (115%) বসানো হলো।
--
-- Five 11 — কোনো migration/Doc-এ ছিল না। ব্যবহারকারী নিজে সূত্র দিয়েছেন:
--   PI Price = $M$14×TubeInch×CuttingInch×Thickness/75000
--              + Print(flat 0.20/pc) + Adhesive(CuttingInch×0.02/inch)
--   — অর্থাৎ rate/lbs=261.50 (অন্য সবার থেকে আলাদা! প্রথমে একটা ফাইলে 150 পেয়েছিলাম,
--   ব্যবহারকারী সঠিক মান 261.50 হিসেবে কনফার্ম করেছেন), markup 0% (percentage_value=0)।
--
-- H&M-Masud — Doc11-এর অসম্পূর্ণ থাকা অংশ পূর্ণ করা হলো: merchant='Masud'-এর
--   H&M অর্ডারে আলাদা এই বায়ার ব্যবহার হবে (markup মাত্র 5%, নিয়মিত H&M 83% না)।
--   এন্ট্রির সময় merchant='Masud' + buyer='H&M' দেখলে এই বায়ার বেছে নিতে হবে —
--   কোনো স্বয়ংক্রিয় DB-লজিক নেই, ম্যানুয়াল সিলেকশন।
--   নিয়মিত H&M বায়ারেও Doc11-এর recycled surcharge (usd_surcharge_per_pc=0.0025)
--   যোগ হলো (Masud বাদে সব H&M অর্ডারে প্রযোজ্য)।
--
-- Supabase CLI দিয়ে db push করুন (npm run db:push)।
-- ============================================================

-- ---------- বিদ্যমান বায়ার ঠিক করা (এই সপ্তাহে fresh তৈরি, ভুল rule/মান নিয়ে) ----------

UPDATE buyers b SET
  pricing_rule = 'rate_per_lbs_markup',
  rate_per_lbs_value = 95,
  usd_bdt_rate = 107,
  percentage_value = 83,
  pi_thickness_mm = 7.5,
  adhesive_rate_per_inch = 0.01,
  usd_surcharge_per_pc = 0.0025
FROM customers c
WHERE b.customer_id = c.id AND c.code = 'AT' AND b.name = 'H&M';

UPDATE buyers b SET
  pricing_rule = 'rate_per_lbs_markup',
  rate_per_lbs_value = 95,
  usd_bdt_rate = 107,
  percentage_value = 61,
  pi_thickness_mm = 9.5,
  adhesive_rate_per_inch = 0.02
FROM customers c
WHERE b.customer_id = c.id AND c.code = 'AT' AND b.name = 'Kmart';

UPDATE buyers b SET
  pricing_rule = 'rate_per_lbs_markup',
  rate_per_lbs_value = 95,
  usd_bdt_rate = 107,
  percentage_value = 42.9,
  pi_thickness_mm = 10,
  adhesive_rate_per_inch = 0.01
FROM customers c
WHERE b.customer_id = c.id AND c.code = 'AT' AND b.name = 'LC WAIKIKI';

UPDATE buyers b SET
  pricing_rule = 'rate_per_lbs_markup',
  rate_per_lbs_value = 95,
  usd_bdt_rate = 107,
  percentage_value = 45,
  pi_thickness_mm = 10,
  adhesive_rate_per_inch = 0.02
FROM customers c
WHERE b.customer_id = c.id AND c.code = 'AT' AND b.name = 'S&G';

-- GIII — ফাইলে/পেন্ডিং লিস্টে "G3" নামেও দেখা যায়, একই বায়ার (Doc10 নিশ্চিত করে)
UPDATE buyers b SET
  pricing_rule = 'rate_per_lbs_markup',
  rate_per_lbs_value = 95,
  usd_bdt_rate = 107,
  percentage_value = 150,
  pi_thickness_mm = 10,
  adhesive_rate_per_inch = 0.01
FROM customers c
WHERE b.customer_id = c.id AND c.code = 'AT' AND b.name = 'GIII';

-- Bestseller/Connor/Jack & Jones/Walmart — ইতিমধ্যে সঠিক (ফাইল-যাচাই মিলেছে),
-- কোনো পরিবর্তন দরকার নেই। usd_bdt_rate শুধু বসিয়ে দিচ্ছি (আগে null ছিল)।
UPDATE buyers b SET usd_bdt_rate = 107
FROM customers c
WHERE b.customer_id = c.id AND c.code = 'AT'
  AND b.name IN ('Bestseller', 'Connor', 'Jack & Jones', 'Walmart')
  AND b.usd_bdt_rate IS NULL;

-- ---------- নতুন বায়ার যোগ করা ----------

INSERT INTO buyers (customer_id, name, pricing_rule, rate_per_lbs_value, usd_bdt_rate,
                    percentage_value, pi_thickness_mm, adhesive_rate_per_inch)
SELECT c.id, v.name, 'rate_per_lbs_markup', 95, 107, v.pct, v.thk, v.adh
FROM customers c
CROSS JOIN (VALUES
  ('Orchestra',  80::numeric,   9::numeric,   0.02::numeric),
  ('NewYorker',  55,            9,            0.02),
  ('ZXY',        85,            10,           0.01),
  ('Monoprix',   85,            8,            0.02),
  ('Justice',    115,           9.5,          0.01),
  ('NEXT',       30,            9.5,          0.02), -- adhesive অনিশ্চিত, ডিফল্ট বসানো — এন্ট্রির সময় যাচাই করবেন
  ('Dickies',    55.8,          12,           0.02)
) AS v(name, pct, thk, adh)
WHERE c.code = 'AT'
ON CONFLICT (customer_id, name) DO UPDATE SET
  pricing_rule = EXCLUDED.pricing_rule,
  rate_per_lbs_value = EXCLUDED.rate_per_lbs_value,
  usd_bdt_rate = EXCLUDED.usd_bdt_rate,
  percentage_value = EXCLUDED.percentage_value,
  pi_thickness_mm = EXCLUDED.pi_thickness_mm,
  adhesive_rate_per_inch = EXCLUDED.adhesive_rate_per_inch;

-- Five 11 — অন্য সবার থেকে আলাদা rate/lbs (150, ৯৫ না), মার্কআপ নেই (0%),
-- flat print charge (colors=1 × print_colors_default দিয়ে রিপ্রেজেন্ট করা)
INSERT INTO buyers (customer_id, name, pricing_rule, rate_per_lbs_value, usd_bdt_rate,
                    percentage_value, pi_thickness_mm, adhesive_rate_per_inch,
                    print_colors_default, color_quantity)
SELECT c.id, 'Five 11', 'rate_per_lbs_markup', 261.50, 107, 0, 10, 0.02, 0.20, 1
FROM customers c WHERE c.code = 'AT'
ON CONFLICT (customer_id, name) DO UPDATE SET
  pricing_rule = EXCLUDED.pricing_rule,
  rate_per_lbs_value = EXCLUDED.rate_per_lbs_value,
  usd_bdt_rate = EXCLUDED.usd_bdt_rate,
  percentage_value = EXCLUDED.percentage_value,
  pi_thickness_mm = EXCLUDED.pi_thickness_mm,
  adhesive_rate_per_inch = EXCLUDED.adhesive_rate_per_inch,
  print_colors_default = EXCLUDED.print_colors_default,
  color_quantity = EXCLUDED.color_quantity;

-- H&M-Masud — merchant='Masud'-এর H&M অর্ডারের জন্য আলাদা বায়ার (Doc11)
INSERT INTO buyers (customer_id, name, pricing_rule, rate_per_lbs_value, usd_bdt_rate,
                    percentage_value, pi_thickness_mm, adhesive_rate_per_inch,
                    usd_surcharge_per_pc)
SELECT c.id, 'H&M-Masud', 'rate_per_lbs_markup', 95, 107, 5, 12, 0.02, 0.0025
FROM customers c WHERE c.code = 'AT'
ON CONFLICT (customer_id, name) DO UPDATE SET
  pricing_rule = EXCLUDED.pricing_rule,
  rate_per_lbs_value = EXCLUDED.rate_per_lbs_value,
  usd_bdt_rate = EXCLUDED.usd_bdt_rate,
  percentage_value = EXCLUDED.percentage_value,
  pi_thickness_mm = EXCLUDED.pi_thickness_mm,
  adhesive_rate_per_inch = EXCLUDED.adhesive_rate_per_inch,
  usd_surcharge_per_pc = EXCLUDED.usd_surcharge_per_pc;
