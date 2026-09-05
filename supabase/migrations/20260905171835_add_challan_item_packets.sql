-- Delivery Challan-এর প্রতি লাইনে কয় প্যাকেট/কার্টনে মাল যাচ্ছে সেটা রাখার জন্য।
-- Qty (pcs)-এর পাশে ম্যানুয়াল সংখ্যা; challan ফর্ম ও print-এ Total row-এ যোগফল দেখায়।
ALTER TABLE "public"."delivery_challan_items"
  ADD COLUMN IF NOT EXISTS "packets" integer;
