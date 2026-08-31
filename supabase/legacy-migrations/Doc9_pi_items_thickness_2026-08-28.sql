-- ============================================================
-- FJ ERP — 2026-08-28 migration (Doc9)
-- pi_items-এ per-line PI Thickness ও Print/Adhesive charge কলাম
-- (Edit PI form + নতুন PI form-এর per-line "PI Thick" কলামের জন্য)।
-- Supabase Dashboard → SQL Editor-এ Run করুন।
-- ============================================================

ALTER TABLE pi_items
  ADD COLUMN IF NOT EXISTS pi_thickness_mm numeric,
  ADD COLUMN IF NOT EXISTS print_charge   numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adhesive_charge numeric NOT NULL DEFAULT 0;
