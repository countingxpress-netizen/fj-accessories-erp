-- Payroll advance — এতদিন Salary Sheet-এ "Advance" শুধু একটা সংখ্যা ছিল, কোনো
-- অ্যাকাউন্টিং ছিল না। এখন কর্মীকে অগ্রিম দিলে JV হয় (Dr 1260 / Cr Cash-Bank),
-- আর Salary Sheet-এর accrual JV সেই অগ্রিম 1260 থেকে recover করে — ফলে বেতন খরচ
-- gross-এ পোস্ট হয় (net_salary নয়)।
--
--   Advance দেওয়া      Dr 1260 Advance to Employees / Cr Cash-Bank
--   Salary accrual     Dr 5100 Salary Expense (= total − other deduction)
--                      Cr 2200 Salary Payable (= net salary)
--                      Cr 1260 Advance to Employees (= এই মাসে recover করা advance)

insert into public.chart_of_accounts (account_code, account_name, account_type) values
  ('1260', 'Advance to Employees', 'asset')
on conflict (account_code) do nothing;

create table if not exists public.employee_advances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  amount numeric(14,2) not null,
  advance_date date not null default current_date,
  note text,
  voucher_id uuid references public.journal_vouchers(id),
  created_at timestamptz not null default now()
);
create index if not exists employee_advances_emp_idx on public.employee_advances(employee_id, advance_date desc);

alter table public.employee_advances enable row level security;
drop policy if exists "Authenticated users full access" on public.employee_advances;
create policy "Authenticated users full access" on public.employee_advances
  for all to authenticated using (true) with check (true);
