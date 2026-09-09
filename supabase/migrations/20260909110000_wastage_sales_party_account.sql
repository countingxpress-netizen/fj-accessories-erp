-- Wastage Sale — "কার কাছে বিক্রি" এখন একটাই dropdown: Customer অথবা যেকোনো
-- chart_of_accounts (asset / liability / equity / income) — যেমন "1500 রিপন থিনার"।
-- ঐ নির্বাচিত পক্ষই বিক্রির JV-তে Dr হয়। আলাদা 'নগদ/ব্যাংক | বাকি' + deposit
-- account + "কোন Customer খাতায়" ফিল্ডের দরকার নেই।
--
--   Customer বাছলে   → Dr 1100 Accounts Receivable  (+ wastage_sales.customer_id, ledger-এ দেখায়)
--   Account বাছলে    → Dr <ঐ account>               (wastage_sales.party_account_id)
--   Cr 4020 Wastage / Scrap Sales — সব ক্ষেত্রেই

alter table public.wastage_sales
  add column if not exists party_account_id uuid references public.chart_of_accounts(id);

alter table public.wastage_sales drop constraint if exists wastage_sales_payment_mode_check;
alter table public.wastage_sales drop column if exists payment_mode;
alter table public.wastage_sales drop column if exists deposit_account_id;
