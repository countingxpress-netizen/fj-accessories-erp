-- Commission ট্র্যাকিং (শুধু রিপোর্ট — কোনো Journal Voucher নয়)।
--   customers.commission_enabled     — এই customer-এর invoice-এ কমিশন হিসাব হবে কি না
--   customers.commission_percentage  — non-AT নিয়ম: Invoice Total × এই % (default 1)
--   sales_invoices.commission_adjustment / commission_note
--        — Commission Report পেজ থেকে প্রতি invoice-এ হাতে ± করা যাবে
-- এটি এক্সেসোরিজ (code AT): commission_enabled = true, কিন্তু হিসাব আগের মতোই
-- markup% + freight/pc নিয়মে (lib/atCommission.ts) — percentage উপেক্ষিত।

ALTER TABLE "public"."customers"
  ADD COLUMN IF NOT EXISTS "commission_enabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "commission_percentage" numeric NOT NULL DEFAULT 1;

ALTER TABLE "public"."sales_invoices"
  ADD COLUMN IF NOT EXISTS "commission_adjustment" numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "commission_note" "text";

UPDATE "public"."customers" SET "commission_enabled" = true WHERE "code" = 'AT';
