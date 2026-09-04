-- Chart of Accounts-এ প্রতি অ্যাকাউন্টের opening balance।
-- Trial Balance / Balance Sheet সব journal_entry_lines থেকে হিসাব হয়, তাই
-- opening balance-কে একটা consolidated Journal Voucher-এ রূপ দিতে হয় —
-- lib/openingBalanceJv.ts এর syncOpeningBalanceJv() সেটা auto-sync রাখে
-- (ঠিক যেমন customers.opening_balance → lib/customerOpeningJv.ts)।
--
--   opening_balance      — অ্যাকাউন্টের normal side-এ ধরা হয় (asset/expense → debit,
--                          liability/equity/income → credit); ঋণাত্মক দিলে উল্টো দিকে।
--   opening_balance_date — ওই ব্যালেন্স কোন তারিখ থেকে; JV-র তারিখ = সবচেয়ে আগেরটা।
--
-- পুরো JV-র balancing line যায় 3900 Opening Balance Equity-তে।

alter table public.chart_of_accounts
  add column if not exists opening_balance      numeric(14,2) not null default 0,
  add column if not exists opening_balance_date date;
