-- ============================================================
-- FJ ERP — 2026-08-29 migration (Doc11)
-- 1) buyers.usd_surcharge_per_pc — PI Unit Price-এর সাথে যোগ হওয়া flat USD/pc
--    (H&M-এর "100% Recycled" charge: Excel-এ R = ROUND(Q/107 + 0.03/12, 4) = +0.0025/pc)
-- 2) "H&M-Masud" — সম্পূর্ণ আলাদা buyer (PI-FNJ-1748), merchant Masud, markup ×1.05
-- Supabase Dashboard → SQL Editor-এ Run করুন।
-- ============================================================

ALTER TABLE buyers
  ADD COLUMN IF NOT EXISTS usd_surcharge_per_pc numeric NOT NULL DEFAULT 0;

-- H&M (Afzal) — Doc8-এ markup 83 বসানো; recycled surcharge যোগ
-- ('H&M-Masud' আলাদাভাবে নিচে হ্যান্ডল হচ্ছে, তাই সেটা বাদ)
UPDATE buyers SET usd_surcharge_per_pc = 0.0025
  WHERE (name ILIKE 'H&M' OR name ILIKE 'H & M' OR name ILIKE 'H&M %' OR name ILIKE 'H & M %')
    AND name NOT ILIKE '%Masud%';

-- H&M-Masud — নতুন buyer (AT Accessories-এর অধীনে), না থাকলে যোগ
INSERT INTO buyers (customer_id, name, pricing_rule, rate_per_lbs_value, usd_bdt_rate,
                    percentage_value, pi_thickness_mm, adhesive_rate_per_inch, usd_surcharge_per_pc)
SELECT c.id, 'H&M-Masud', 'rate_per_lbs_markup', 95, 107, 5, 12, 0.02, 0.0025
FROM customers c
WHERE (c.code = 'AT' OR c.name ILIKE 'AT Accessories%')
  AND NOT EXISTS (SELECT 1 FROM buyers b WHERE b.customer_id = c.id AND b.name ILIKE 'H&M-Masud')
LIMIT 1;
