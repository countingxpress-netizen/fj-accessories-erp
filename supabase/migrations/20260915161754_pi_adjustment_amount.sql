-- Subtotal - Discount-এর উপরে (Total-এর ঠিক আগে) একটা ± Adjustment অপশন — গোল রাউন্ডিং,
-- ব্যাংক চার্জ পাস-থ্রু ইত্যাদির জন্য ম্যানুয়াল সংশোধনী। Discount percentage/fixed-এর
-- মতো টাইপ নেই, শুধু একটা সরাসরি currency অ্যামাউন্ট (ঋণাত্মকও হতে পারে)।
alter table proforma_invoices
  add column if not exists adjustment_amount numeric default 0;
