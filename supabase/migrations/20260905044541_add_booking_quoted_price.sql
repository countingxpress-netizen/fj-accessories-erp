-- Booking সময়েই আনুমানিক Price/Pc ও Total Amount হিসাব করে রাখার জন্য।
-- Sales Invoice-এর unit_price/amount থেকে ইচ্ছাকৃতভাবে আলাদা নামের কলাম —
-- এটা শুধু বুকিং-এর সময়কার Estimate (customer-এর price_per_lbs/rate_history
-- অনুযায়ী), আসল ইনভয়েসের দাম পরে বদলাতে পারে (rate change/manual override)।
ALTER TABLE "public"."bookings"
  ADD COLUMN IF NOT EXISTS "quoted_unit_price" numeric(12,2),
  ADD COLUMN IF NOT EXISTS "quoted_amount" numeric(14,0);
