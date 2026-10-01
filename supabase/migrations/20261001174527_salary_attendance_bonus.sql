-- "অন্যান্য" — Salary Sheet-এ হাতে বসানো অতিরিক্ত টাকা (যেমন হাজিরা বোনাস)।
-- Total Amount = basic + net_adjustment + attendance_bonus ; net_salary = Total − advance − other_deduction
-- Accrual JV-তে gross-এর অংশ (Dr 5100 Salary Expense)।
alter table public.salary_sheet
  add column if not exists attendance_bonus numeric not null default 0;
