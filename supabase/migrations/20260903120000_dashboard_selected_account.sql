-- Dashboard "Selected Account Balance" card.
--
-- Settings → Company Info-তে একটা Chart of Accounts অ্যাকাউন্ট বাছাই করা যায়;
-- Dashboard-এর টপ রো-তে সেই অ্যাকাউন্টের current balance দেখানো হয়।
-- পুরো কোম্পানির জন্য একটাই পছন্দ (company_profile single-row), তাই এখানেই কলাম।
-- অ্যাকাউন্ট মুছে ফেললে null হয়ে যাবে (card তখন "সেট করা নেই" দেখাবে)।

alter table public.company_profile
  add column if not exists dashboard_account_id uuid references public.chart_of_accounts(id) on delete set null;
