-- ============================================================
-- AT Accessories — LPP বায়ার (আগের migration 20260911163831-এ ভুলে বাদ পড়েছিল)
-- Doc8: percentage_value=80, pi_thickness_mm=10.5, adhesive_rate_per_inch=0.02
-- ============================================================

INSERT INTO buyers (customer_id, name, pricing_rule, rate_per_lbs_value, usd_bdt_rate,
                    percentage_value, pi_thickness_mm, adhesive_rate_per_inch)
SELECT c.id, 'LPP', 'rate_per_lbs_markup', 95, 107, 80, 10.5, 0.02
FROM customers c WHERE c.code = 'AT'
ON CONFLICT (customer_id, name) DO UPDATE SET
  pricing_rule = EXCLUDED.pricing_rule,
  rate_per_lbs_value = EXCLUDED.rate_per_lbs_value,
  usd_bdt_rate = EXCLUDED.usd_bdt_rate,
  percentage_value = EXCLUDED.percentage_value,
  pi_thickness_mm = EXCLUDED.pi_thickness_mm,
  adhesive_rate_per_inch = EXCLUDED.adhesive_rate_per_inch;
