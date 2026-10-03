-- Booking Discount — PI-এর মতো পুরো Booking Group-এর মোট মূল্যের উপর Discount (এডিটযোগ্য)।
--   discount_type : 'none' | 'percentage' | 'fixed'   (proforma_invoices-এর মতোই)
--   discount_value: % হলে শতাংশ, fixed হলে টাকা
-- Group-এর header ফিল্ড (customer/buyer/delivery_point-এর মতো) — group-এর সব booking row-এ একই মান।
-- auto Sales Invoice-এ এটা আলাদা একটা লাইন হয়: sales_invoice_items.line_type = 'discount',
-- booking_id/product_id NULL, quantity_pcs 1, unit_price = −Discount টাকা (amount = generated, ঋণাত্মক) —
-- তাই invoice-এর মোট (Σ amount) যেখানেই ব্যবহার হয় (Ledger, DayBook, TopSheet, Outstanding …) নিজে থেকেই net।

ALTER TABLE "public"."bookings"
  ADD COLUMN IF NOT EXISTS "discount_type" "text" NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "discount_value" numeric(14,4) NOT NULL DEFAULT 0;

ALTER TABLE "public"."bookings"
  DROP CONSTRAINT IF EXISTS "bookings_discount_type_check";
ALTER TABLE "public"."bookings"
  ADD CONSTRAINT "bookings_discount_type_check"
  CHECK ("discount_type" = ANY (ARRAY['none'::"text", 'percentage'::"text", 'fixed'::"text"]));
