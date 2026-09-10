-- Sales Invoice প্রিন্টের নিচের শর্ট সামারি (Previous Bill Due / This Bill / Paid)
-- হাতে এডিট করে ইনভয়েসে সেভ রাখা যাবে। NULL = অটো হিসাব। Total Due ও Running Due
-- সবসময় (prev + this) ও (total − paid) দিয়ে অটো। summary_note = নিচের ফ্রি-টেক্সট।

alter table public.sales_invoices
  add column if not exists summary_prev_due  numeric(14,2),
  add column if not exists summary_this_bill numeric(14,2),
  add column if not exists summary_paid      numeric(14,2),
  add column if not exists summary_note      text;
