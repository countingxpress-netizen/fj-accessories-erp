-- মাসিক টপশীট "Confirm" (চূড়ান্ত হিসাব) — user-confirmed 2026-10-04
--   confirm করলে: ওই মাসের কাঁচামাল দর lock (lib/rawCost.ts), ERP-র closing stock (Lbs + মূল্য) টপশীটের
--   closing-এ মেলানো — Lbs পার্থক্য stock_ledger-এ (reference_type='topsheet_confirm', reference_id = এই row),
--   মূল্যের পার্থক্য একটা true-up JV-তে (Dr/Cr inventory, contra 5050 COGS)। পরের মাসের Opening = এই closing।
--   Un-confirm (শুধু Admin, অ্যাপ-লেভেলে যাচাই) — JV ও Lbs সমন্বয় উল্টে confirmed_at মুছে দেয়।

alter table public.month_topsheets
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by uuid references public.app_users(id),
  add column if not exists true_up_voucher_id uuid references public.journal_vouchers(id) on delete set null;
