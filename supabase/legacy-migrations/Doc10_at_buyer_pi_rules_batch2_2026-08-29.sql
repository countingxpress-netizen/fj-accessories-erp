-- ============================================================
-- FJ ERP — 2026-08-29 migration (Doc10)
-- E:\Apps\atpis\2 ফোল্ডারের নতুন PI Excel থেকে আরও ২টা buyer-এর PI rule:
--   GIII (G-III)  — PI-FNJ-1719
--   Monoprix      — PI-FNJ-1732
-- (Jack & Jones / PI-FNJ-1720 — Doc8-এ আগেই বসানো, একই মান ১৫৯.৫ / 6 / 0.02)
-- Supabase Dashboard → SQL Editor-এ Run করুন।
-- ============================================================

UPDATE buyers SET pricing_rule='rate_per_lbs_markup', rate_per_lbs_value=95, usd_bdt_rate=107,
  percentage_value=150,   pi_thickness_mm=10,   adhesive_rate_per_inch=0.01
  WHERE name ILIKE 'GIII%' OR name ILIKE 'G-III%' OR name ILIKE 'G III%' OR name ILIKE 'G3%';

-- Monoprix: Excel Q12 = 1.85  →  markup% = (1.85 - 1) × 100 = 85
UPDATE buyers SET pricing_rule='rate_per_lbs_markup', rate_per_lbs_value=95, usd_bdt_rate=107,
  percentage_value=85,    pi_thickness_mm=8,    adhesive_rate_per_inch=0.02
  WHERE name ILIKE 'Monoprix%';
