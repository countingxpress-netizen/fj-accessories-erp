-- Doc13 — Payroll salary engine (F&J salary sheet rules)
-- Run in Supabase SQL editor.
--
-- নিয়ম:
--   Production কর্মী:  ঘণ্টা রেট = Basic / 26 / 8
--                     Absent hours = max(0, absentDays - 1) * 8   (প্রথম ১ দিন মাফ)
--                     Net adjustment = round( rate * (otHours - absentHours) )   (ঋণাত্মক হতে পারে)
--                     Total = Basic + Net adjustment
--   Fixed/Monthly কর্মী:  OT / absent ধরা হয় না; Total = Basic
--   Net salary = Total - Advance - Other deduction
--   Late joining: join_date-এর আগের attendance / OT হিসাবে আসে না

alter table public.salary_sheet
  add column if not exists salary_type      text    not null default 'production',
  add column if not exists ot_hours         numeric not null default 0,
  add column if not exists absent_days      integer not null default 0,
  add column if not exists absent_hours     numeric not null default 0,
  add column if not exists hourly_rate      numeric not null default 0,
  add column if not exists absent_deduction numeric not null default 0,
  add column if not exists net_adjustment   numeric not null default 0,
  add column if not exists advance          numeric not null default 0,
  add column if not exists other_deduction  numeric not null default 0;

-- OT রেট এখন Basic থেকে অটো হিসাব হয় — এন্ট্রিতে আর রেট লাগে না
alter table public.overtime alter column rate_per_hour drop not null;
alter table public.overtime alter column rate_per_hour set default 0;

-- Attendance + Overtime এখন এক গ্রিডে এন্ট্রি হয় — মন্তব্যের জন্য কলাম
alter table public.attendance add column if not exists comments text;

-- পুরনো rows-এ salary_type ঠিক করা (ঐচ্ছিক — নতুন generate করলেই ঠিক বসবে)
-- update public.salary_sheet set salary_type = 'fixed' where overtime_amount = 0 and net_adjustment = 0;
