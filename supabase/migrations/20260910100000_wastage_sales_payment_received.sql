-- Wastage Sale-এ Sales Invoice-এর মতো "Payment Received" — টিক থাকলে নগদ বিক্রি
-- (Dr 1000 Cash in Hand), না থাকলে বাকি (Dr <party: customer→1100 AR / account→ঐ account>)।
-- "কার কাছে বিক্রি" ড্রপডাউন সবসময় পার্টি রেকর্ড করে (customer_id / party_account_id)।

alter table public.wastage_sales
  add column if not exists payment_received boolean not null default false;
