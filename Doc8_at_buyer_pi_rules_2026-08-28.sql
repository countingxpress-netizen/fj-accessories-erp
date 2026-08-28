-- ============================================================
-- FJ ERP — 2026-08-28 migration (Doc8)
-- AT Accessories-এর buyer-দের PI pricing parameter (E:\Apps\atpis-এর
-- ১৩টা PI Excel থেকে ডিকোড করা):
--   pricing_rule       = 'rate_per_lbs_markup'
--   rate_per_lbs_value = 95   (সব buyer একই base rate, BDT/lb)
--   usd_bdt_rate       = 107  (PI-তে USD→BDT)
--   percentage_value   = markup %  ((multiplier - 1) × 100)
--   pi_thickness_mm    = PI pricing thickness (per-line এডিটেবল, এটা default)
--   adhesive_rate_per_inch = flap ব্যাগের আঠার রেট
-- নাম ঠিক এভাবে না মিললে সেই লাইন স্কিপ হবে — পরে Buyers পেজ থেকেও বসানো যাবে।
-- Supabase Dashboard → SQL Editor-এ Run করুন।
-- ============================================================

UPDATE buyers SET pricing_rule='rate_per_lbs_markup', rate_per_lbs_value=95, usd_bdt_rate=107,
  percentage_value=110,   pi_thickness_mm=13,   adhesive_rate_per_inch=0.01
  WHERE name ILIKE 'Rainbow%';

UPDATE buyers SET pricing_rule='rate_per_lbs_markup', rate_per_lbs_value=95, usd_bdt_rate=107,
  percentage_value=80,    pi_thickness_mm=9,    adhesive_rate_per_inch=0.02
  WHERE name ILIKE 'Orchestra%';

UPDATE buyers SET pricing_rule='rate_per_lbs_markup', rate_per_lbs_value=95, usd_bdt_rate=107,
  percentage_value=45,    pi_thickness_mm=10,   adhesive_rate_per_inch=0.02
  WHERE name ILIKE 'S&G%' OR name ILIKE 'S %G%';

UPDATE buyers SET pricing_rule='rate_per_lbs_markup', rate_per_lbs_value=95, usd_bdt_rate=107,
  percentage_value=80,    pi_thickness_mm=10.5, adhesive_rate_per_inch=0.02
  WHERE name ILIKE 'LPP%';

UPDATE buyers SET pricing_rule='rate_per_lbs_markup', rate_per_lbs_value=95, usd_bdt_rate=107,
  percentage_value=159.5, pi_thickness_mm=6,    adhesive_rate_per_inch=0.02
  WHERE name ILIKE 'Jack%Jones%' OR name ILIKE 'J&J%' OR name ILIKE 'JnJ%';

UPDATE buyers SET pricing_rule='rate_per_lbs_markup', rate_per_lbs_value=95, usd_bdt_rate=107,
  percentage_value=61,    pi_thickness_mm=9.5,  adhesive_rate_per_inch=0.02
  WHERE name ILIKE 'Kmart%';

UPDATE buyers SET pricing_rule='rate_per_lbs_markup', rate_per_lbs_value=95, usd_bdt_rate=107,
  percentage_value=42.9,  pi_thickness_mm=10,   adhesive_rate_per_inch=0.01
  WHERE name ILIKE 'LC Waikiki%' OR name ILIKE 'LCW%';

UPDATE buyers SET pricing_rule='rate_per_lbs_markup', rate_per_lbs_value=95, usd_bdt_rate=107,
  percentage_value=85,    pi_thickness_mm=10,   adhesive_rate_per_inch=0.01
  WHERE name ILIKE 'ZXY%';

UPDATE buyers SET pricing_rule='rate_per_lbs_markup', rate_per_lbs_value=95, usd_bdt_rate=107,
  percentage_value=80,    pi_thickness_mm=6,    adhesive_rate_per_inch=0.02
  WHERE name ILIKE 'Bestseller%';

UPDATE buyers SET pricing_rule='rate_per_lbs_markup', rate_per_lbs_value=95, usd_bdt_rate=107,
  percentage_value=115,   pi_thickness_mm=9.5,  adhesive_rate_per_inch=0.01
  WHERE name ILIKE 'Justice%';

UPDATE buyers SET pricing_rule='rate_per_lbs_markup', rate_per_lbs_value=95, usd_bdt_rate=107,
  percentage_value=55,    pi_thickness_mm=9,    adhesive_rate_per_inch=0.02
  WHERE name ILIKE 'NewYorker%' OR name ILIKE 'New Yorker%';

UPDATE buyers SET pricing_rule='rate_per_lbs_markup', rate_per_lbs_value=95, usd_bdt_rate=107,
  percentage_value=83,    pi_thickness_mm=7.5,  adhesive_rate_per_inch=0.01
  WHERE name ILIKE 'H%M' OR name ILIKE 'H & M%' OR name ILIKE 'H&M%';
