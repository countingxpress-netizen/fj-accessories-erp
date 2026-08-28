-- ============================================================
-- FJ ERP — 2026-08-28 migration
-- Proforma Invoice form enhancements:
--   1) proforma_invoices — নতুন কলাম নিশ্চিত করা (garments/advising bank/weight/validity)
--   2) advising_banks master টেবিল (LC & Export → Advising Banks পেজ)
--   3) buyers — USD→BDT default rate ও default price basis (Per Pc / Per Dzn)
-- Supabase Dashboard → SQL Editor-এ পুরোটা কপি করে Run করুন।
-- ============================================================

-- 1) proforma_invoices কলামগুলো (কোডে আগে থেকেই ব্যবহৃত — না থাকলে যোগ হবে)
ALTER TABLE proforma_invoices
  ADD COLUMN IF NOT EXISTS garments_id uuid REFERENCES garments(id),
  ADD COLUMN IF NOT EXISTS garments_name text,
  ADD COLUMN IF NOT EXISTS garments_address text,
  ADD COLUMN IF NOT EXISTS advising_bank_id uuid,
  ADD COLUMN IF NOT EXISTS advising_bank_name text,
  ADD COLUMN IF NOT EXISTS advising_bank_branch text,
  ADD COLUMN IF NOT EXISTS advising_bank_address text,
  ADD COLUMN IF NOT EXISTS advising_bank_swift text,
  ADD COLUMN IF NOT EXISTS total_weight_kg numeric,
  ADD COLUMN IF NOT EXISTS hs_code text,
  ADD COLUMN IF NOT EXISTS bin_no text,
  ADD COLUMN IF NOT EXISTS valid_till date,
  ADD COLUMN IF NOT EXISTS exchange_rate_to_bdt numeric;

-- 2) Advising Banks master (বায়ারের নেগোশিয়েটিং / অ্যাডভাইজিং ব্যাংক — SWIFT সহ)
CREATE TABLE IF NOT EXISTS advising_banks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  branch text,
  address text,
  swift text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE advising_banks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users full access" ON advising_banks;
CREATE POLICY "Authenticated users full access" ON advising_banks
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

ALTER TABLE proforma_invoices DROP CONSTRAINT IF EXISTS proforma_invoices_advising_bank_id_fkey;
ALTER TABLE proforma_invoices
  ADD CONSTRAINT proforma_invoices_advising_bank_id_fkey
  FOREIGN KEY (advising_bank_id) REFERENCES advising_banks(id);

-- 3) buyers — USD→BDT ডিফল্ট রেট ও ডিফল্ট Price Basis
ALTER TABLE buyers
  ADD COLUMN IF NOT EXISTS usd_bdt_rate numeric,
  ADD COLUMN IF NOT EXISTS price_basis_default text NOT NULL DEFAULT 'pcs'
    CHECK (price_basis_default IN ('pcs','dzn'));
