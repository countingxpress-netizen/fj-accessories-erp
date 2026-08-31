-- Payroll accrual — separate the accrual JV (booked when a Salary Sheet / Bonus
-- Sheet is generated, dated to the salary month or bonus date) from the payment JV
-- (booked on "Mark Paid", dated the payment day). "Mark Paid" can now post the
-- credit to Bank instead of Cash.
--
--   Accrual JV : Dr 5100 Salary & Wages Expense  / Cr 2100 Salary & Bonus Payable
--   Payment JV : Dr 2100 Salary & Bonus Payable  / Cr <chosen Cash 1000 / Bank 1010>
--
-- salary_sheet.voucher_id / bonus_sheet.voucher_id now hold the PAYMENT voucher;
-- the new accrual_voucher_id columns hold the ACCRUAL voucher.

-- 1) Liability account for accrued (unpaid) salary + bonus
insert into public.chart_of_accounts (account_code, account_name, account_type)
values ('2100', 'Salary & Bonus Payable', 'liability')
on conflict (account_code) do nothing;

-- 2) accrual voucher link
alter table public.salary_sheet
  add column if not exists accrual_voucher_id uuid references public.journal_vouchers(id);

alter table public.bonus_sheet
  add column if not exists accrual_voucher_id uuid references public.journal_vouchers(id);
