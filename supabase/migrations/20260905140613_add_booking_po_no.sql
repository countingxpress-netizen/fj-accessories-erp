-- কাস্টমারের PO No (Purchase Order নম্বর) — Customer Booking Ref-এর পাশে আলাদা ফিল্ড,
-- ANANTA-র মতো বুকিং শীটে "Po No" আলাদা কলাম হিসেবে থাকে (Style-এর সব Row-এ একই থাকে)।
ALTER TABLE "public"."bookings"
  ADD COLUMN IF NOT EXISTS "po_no" "text";
