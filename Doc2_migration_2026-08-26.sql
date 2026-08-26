-- ============================================================
-- FJ ERP — 2026-08-26 migration
-- Supabase Dashboard → SQL Editor-এ পুরোটা কপি করে Run করুন।
-- ============================================================

-- 1) Purchase Entry: Cash/Credit, Import/Local + LC ফিল্ড, Bags/Lbs ইউনিট
ALTER TABLE purchase_entries
  ADD COLUMN IF NOT EXISTS payment_type text NOT NULL DEFAULT 'credit' CHECK (payment_type IN ('cash','credit')),
  ADD COLUMN IF NOT EXISTS purchase_source text NOT NULL DEFAULT 'local' CHECK (purchase_source IN ('import','local')),
  ADD COLUMN IF NOT EXISTS lc_no text,
  ADD COLUMN IF NOT EXISTS lc_date date,
  ADD COLUMN IF NOT EXISTS bill_of_entry_no text;

ALTER TABLE purchase_entry_items
  ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'lbs' CHECK (unit IN ('lbs','bags')),
  ADD COLUMN IF NOT EXISTS entered_quantity numeric;

-- 2) Warehouse Transfer রেজিস্টার (Stock + Wastage, দুই ধরনের transfer একই টেবিলে,
--    transfer_type দিয়ে আলাদা করা হয়, list পেজে ফিল্টার করা যায়)
CREATE TABLE IF NOT EXISTS warehouse_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_no text NOT NULL UNIQUE,
  transfer_type text NOT NULL CHECK (transfer_type IN ('stock','wastage')),
  from_warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  to_warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  material_id uuid NOT NULL REFERENCES raw_materials(id),
  unit text NOT NULL DEFAULT 'lbs' CHECK (unit IN ('lbs','bags')),
  entered_quantity numeric NOT NULL,
  quantity_lbs numeric NOT NULL,
  transfer_date date NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3) AT Accessories Submit-to-Customer invoice-এর জন্য Buyer-ভিত্তিক Markup %
ALTER TABLE buyers
  ADD COLUMN IF NOT EXISTS markup_percentage numeric NOT NULL DEFAULT 2;

-- বর্তমান জানা রেট বসিয়ে দিচ্ছি (buyers.name ঠিক এভাবে না মিললে এই ৩ লাইন স্কিপ হয়ে যাবে,
-- পরে Buyers পেজ থেকে ম্যানুয়ালিও বসানো যাবে):
UPDATE buyers SET markup_percentage = 4   WHERE name IN ('Jack & Jones','Bestseller');
UPDATE buyers SET markup_percentage = 2.5 WHERE name = 'Justice';
-- বাকি সবার জন্য ডিফল্ট ইতিমধ্যে 2% বসে গেছে (উপরের ADD COLUMN-এর DEFAULT থেকে)।
