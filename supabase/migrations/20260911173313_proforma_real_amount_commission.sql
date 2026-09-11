-- ============================================================
-- Proforma Invoice — real_amount (আমাদের টাকা) + commission_amount (কমিশন)
--
-- Manual PI (booking ছাড়া, যেমন AT Accessories-এর ৭২টা historical PI)-এর জন্য
-- "Sales Invoice Value" (আমাদের আসল টাকা) কম্পিউট করার মতো কোনো linked booking/
-- sales invoice নেই — তাই হাতে বসানোর জন্য দুটো ঐচ্ছিক ফিল্ড। বিশুদ্ধ রিপোর্টিং —
-- কোনো Journal Voucher পোস্ট হয় না (বিদ্যমান commission report-এর মতোই)।
--
-- Proforma Invoice লিস্ট পেজে:
--   PI Value (pi.total_amount)      → "Submit to Customer" (কমিশন-সহ, PI-তে যা লেখা)
--   real_amount (নতুন, হাতে)         → "Sales Invoice Value" (আমাদের আসল টাকা)
--   commission_amount (নতুন, হাতে)   → "Commission" কলাম
-- booking-লিংকড PI-তে real_amount না বসালে আগের মতোই sales_invoice_items থেকে
-- auto-compute হবে (backward compatible)।
-- ============================================================

ALTER TABLE proforma_invoices
  ADD COLUMN IF NOT EXISTS real_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS commission_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS amount_notes text;
