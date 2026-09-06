-- Booking সেভ করলে অটো Sales Invoice তৈরি হয় (এক booking_group = এক invoice)।
-- সেই auto-invoice-টা booking edit/delete-এ খুঁজে বের করে sync/মুছতে এই দুটো কলাম লাগে।
--   source_booking_group_id — কোন booking group থেকে তৈরি
--   auto_generated          — true হলে booking থেকে অটো (হাতে তৈরি নয়)
ALTER TABLE "public"."sales_invoices"
  ADD COLUMN IF NOT EXISTS "source_booking_group_id" "uuid",
  ADD COLUMN IF NOT EXISTS "auto_generated" boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "sales_invoices_source_booking_group_id_idx"
  ON "public"."sales_invoices" ("source_booking_group_id");
