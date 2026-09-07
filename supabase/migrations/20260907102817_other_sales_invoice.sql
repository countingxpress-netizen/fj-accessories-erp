-- Other Sales Invoice — বুকিং ছাড়া সরাসরি বিক্রি (scrap/ঝুট, die-cylinder charge,
-- transport charge, sample charge ইত্যাদি)।
--
-- একই sales_invoices টেবিল, একই INV number series, একই Sales Invoice list।
--   invoice_type = 'other'
--   line: booking_id / product_id NULL, line_type = 'other', line_label = বিবরণ,
--         quantity_pcs = পরিমাণ, unit_price = রেট, amount = round(rate × qty) (generated)
-- Journal Voucher স্ট্যান্ডার্ড invoice-এর মতোই:
--   Dr 1000 Cash in Hand (Payment Received) / 1100 Accounts Receivable
--   Cr 4000 Sales Revenue-Local
--
-- sales_invoice_items-এর line_label কলাম আগেই আছে (20260907090000_lbs_invoicing) —
-- এখানে শুধু invoice_type check constraint-এ 'other' যোগ করা হচ্ছে।

ALTER TABLE "public"."sales_invoices" DROP CONSTRAINT IF EXISTS "sales_invoices_invoice_type_check";

ALTER TABLE "public"."sales_invoices"
  ADD CONSTRAINT "sales_invoices_invoice_type_check"
  CHECK ("invoice_type" = ANY (ARRAY['standard'::"text", 'lbs'::"text", 'other'::"text"]));
