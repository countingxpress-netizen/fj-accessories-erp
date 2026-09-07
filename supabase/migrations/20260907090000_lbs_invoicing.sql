-- LBS Invoicing (job-work / "Party Bill" ধরনের ইনভয়েস — Rubel-HAMS টাইপ কাস্টমার)।
--
-- স্ট্যান্ডার্ড Sales Invoice এক Unit Price/pc দেয়। LBS Invoice-এ প্রতিটা প্রোডাকশন
-- স্টেজ আলাদা চার্জ হয়:
--   Powder Bill        = মোট Required Lbs × customers.price_per_lbs
--   Making Cutting Bill = একই Lbs × customers.making_cutting_rate      (নতুন ফিল্ড)
--   Printing Bill       = Print করা মোট Pcs × (colors × booking.rate_per_color)
--   Non-Print           = Print ছাড়া Pcs × 0   (শুধু তথ্যের জন্য)
--   Adhesive Bill       = Σ(cutting-inch × Pcs) × booking.rate_per_inch
-- প্রতি চার্জ লাইন Amount = ROUND(rate × qty, 0)।  Invoice Total = চার্জ লাইনের যোগফল।
--
-- Trigger: customers.lbs_invoicing_enabled = true হলে ঐ কাস্টমারের booking group
-- সেভ করলে auto Sales Invoice এই ফরম্যাটে তৈরি হয় (lib/autoInvoiceFromBooking.ts)।

-- ── customers ──────────────────────────────────────────────────────────────
ALTER TABLE "public"."customers"
  ADD COLUMN IF NOT EXISTS "lbs_invoicing_enabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "making_cutting_rate" numeric NOT NULL DEFAULT 0;

-- ── sales_invoices ────────────────────────────────────────────────────────
--   invoice_type = 'standard' (আগের সব) | 'lbs'
ALTER TABLE "public"."sales_invoices"
  ADD COLUMN IF NOT EXISTS "invoice_type" "text" NOT NULL DEFAULT 'standard';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_invoices_invoice_type_check') THEN
    ALTER TABLE "public"."sales_invoices"
      ADD CONSTRAINT "sales_invoices_invoice_type_check"
      CHECK ("invoice_type" = ANY (ARRAY['standard'::"text", 'lbs'::"text"]));
  END IF;
END $$;

-- ── sales_invoice_items ───────────────────────────────────────────────────
--   line_type:
--     'standard'     — আগের সব লাইন
--     'lbs_product'  — LBS invoice-এর প্রোডাক্ট রো (booking_id সেট, unit_price 0,
--                      required_lbs-এ Lbs, amount 0 — Total-এ যোগ হয় না)
--     'lbs_powder' | 'lbs_making' | 'lbs_printing' | 'lbs_nonprint' | 'lbs_adhesive'
--                    — চার্জ রো (booking_id null, quantity_pcs = qty basis,
--                      unit_price = rate, amount = ROUND(rate × qty) generated)
ALTER TABLE "public"."sales_invoice_items"
  ADD COLUMN IF NOT EXISTS "line_type" "text" NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS "line_label" "text",
  ADD COLUMN IF NOT EXISTS "required_lbs" numeric;
