-- ============================================================
-- FJ ERP — 2026-08-29 migration (Doc12)
-- proforma_invoices.price_decimals — PI-এর Price/Unit-এ দশমিকের পরে কয় ঘর
-- দেখানো/রাউন্ড হবে (default 4)।
-- Supabase Dashboard → SQL Editor-এ Run করুন।
-- ============================================================

ALTER TABLE proforma_invoices
  ADD COLUMN IF NOT EXISTS price_decimals integer NOT NULL DEFAULT 4;
