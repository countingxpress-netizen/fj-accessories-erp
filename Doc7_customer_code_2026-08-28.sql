-- ============================================================
-- FJ ERP — 2026-08-28 migration (Doc7)
-- Customer short code (PI নম্বর PI/FNJ-{seq}-{CODE}/{year}-এর জন্য)।
-- Supabase Dashboard → SQL Editor-এ Run করুন।
-- ============================================================

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS code text;

-- code case-insensitive unique (NULL বাদে)
CREATE UNIQUE INDEX IF NOT EXISTS customers_code_unique_ci
  ON customers (upper(code))
  WHERE code IS NOT NULL AND code <> '';

-- জানা কাস্টমারদের code বসিয়ে দিচ্ছি (নাম ঠিক এভাবে না মিললে স্কিপ হবে, পরে
-- Customers পেজ থেকে সেট করা যাবে):
UPDATE customers SET code = 'AT'  WHERE code IS NULL AND name ILIKE 'AT Accessories%';
UPDATE customers SET code = 'NAL' WHERE code IS NULL AND name ILIKE 'Network Apparels%';
