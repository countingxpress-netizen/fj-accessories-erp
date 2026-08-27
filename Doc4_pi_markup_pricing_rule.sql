-- buyers.pricing_rule কলামের CHECK constraint-এ নতুন value 'rate_per_lbs_markup' যোগ করা
-- (Walmart-এর মতো buyer-দের জন্য: PI Rate/Lbs + Markup% pricing rule)

ALTER TABLE buyers DROP CONSTRAINT IF EXISTS buyers_pricing_rule_check;

ALTER TABLE buyers ADD CONSTRAINT buyers_pricing_rule_check
  CHECK (pricing_rule IN ('manual', 'percentage', 'rate_per_lbs', 'rate_per_lbs_markup'));
