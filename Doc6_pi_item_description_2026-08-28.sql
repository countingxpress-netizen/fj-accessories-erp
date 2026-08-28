-- ============================================================
-- FJ ERP — 2026-08-28 migration (Doc6)
-- Proforma Invoice print "To" ব্লকে "Item:- ..." লাইনের জন্য
-- editable Item Description ফিল্ড (default "Poly Bags")।
-- Supabase Dashboard → SQL Editor-এ Run করুন।
-- ============================================================

ALTER TABLE proforma_invoices
  ADD COLUMN IF NOT EXISTS item_description text;
