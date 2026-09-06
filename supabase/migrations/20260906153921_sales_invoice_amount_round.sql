-- Sales Invoice লাইনের Amount: floor → round (half-up)।
--   আগে:  amount = floor(unit_price * quantity_pcs)   — ভগ্নাংশ কেটে বাদ
--   এখন:  amount = round(unit_price * quantity_pcs)   — .50–.99 উপরে, .00–.49 নিচে
-- generated column-এর expression সরাসরি ALTER করা যায় না, তাই drop করে নতুন করে যোগ।
-- ⚠️ এতে পুরনো সব invoice line-এর amount নতুন করে হিসাব হবে (বেশিরভাগ ০–১ টাকা এদিক-ওদিক)।
-- পুরনো Journal Voucher নিজে থেকে বদলাবে না — invoice edit/save করলে নতুন হিসাবে বসবে।

ALTER TABLE "public"."sales_invoice_items" DROP COLUMN "amount";

ALTER TABLE "public"."sales_invoice_items"
  ADD COLUMN "amount" numeric(14,0)
  GENERATED ALWAYS AS ("round"(("unit_price" * "quantity_pcs"))) STORED;
