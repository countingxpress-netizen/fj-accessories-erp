-- Doc14 — Payroll: Salary Revisions history + Eid Bonus sheet + mid-month proration
-- Doc13-এর পরে চালান। Supabase SQL editor.

-- ============================================================
-- 1) Salary Revision history — কর্মীর বেতন যে কোনো সময় বাড়তে পারে
--    কার্যকর basic = সবচেয়ে সাম্প্রতিক effective_date <= প্রশ্নবিদ্ধ তারিখ।
--    কোনো revision না থাকলে employees.basic_salary fallback।
-- ============================================================
create table if not exists public.salary_revisions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  effective_date date not null,
  basic_salary numeric not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists salary_revisions_emp_idx on public.salary_revisions(employee_id, effective_date desc);

alter table public.salary_revisions enable row level security;
drop policy if exists "Authenticated users full access" on public.salary_revisions;
create policy "Authenticated users full access" on public.salary_revisions
  for all to authenticated using (true) with check (true);

-- ============================================================
-- 2) Eid Bonus sheet — সকল active কর্মীর জন্য, বছরে দুই ঈদে দুইটা শিট
--    ডিফল্ট বোনাস = basic × 50% × min(1, চাকরির মাস / 12)   (এডিটেবল)
-- ============================================================
create table if not exists public.bonus_sheet (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  festival text not null check (festival in ('eid_ul_fitr','eid_ul_azha')),
  year integer not null,
  bonus_date date not null,
  basic numeric not null,
  tenure_months numeric not null default 0,
  bonus_amount numeric not null default 0,
  paid boolean not null default false,
  voucher_id uuid references public.journal_vouchers(id),
  created_at timestamptz not null default now(),
  unique (employee_id, festival, year)
);
create index if not exists bonus_sheet_festival_idx on public.bonus_sheet(festival, year);

alter table public.bonus_sheet enable row level security;
drop policy if exists "Authenticated users full access" on public.bonus_sheet;
create policy "Authenticated users full access" on public.bonus_sheet
  for all to authenticated using (true) with check (true);

-- ============================================================
-- 3) Salary sheet — মাঝ-মাসে join করা Fixed কর্মীর proration ট্র্যাকিং
--    prorated basic = round( basic / মাসের মোট দিন × counted_days )
--    counted_days = join থেকে মাস-শেষ পর্যন্ত দিন − absent দিন   (এডিটেবল)
-- ============================================================
alter table public.salary_sheet
  add column if not exists prorated       boolean not null default false,
  add column if not exists counted_days   integer,
  add column if not exists days_in_month  integer;
