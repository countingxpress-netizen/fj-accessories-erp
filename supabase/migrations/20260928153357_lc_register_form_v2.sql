-- Export LC ফর্ম রিভিশন v2 (E:\Customer-এর real LC Doc ফাইল আর ইউজারের দেওয়া
-- "Export LC form.xlsx" instruction অনুযায়ী):
--
-- ১. LC Opening Bank (বায়ারের ইস্যু করা ব্যাংক, যেমন Southeast Bank/Agrani Bank) — এতদিন
--    বিদ্যমান "banks" টেবিল (F&J-এর নিজের Uttara/BRAC/EBL অ্যাকাউন্ট, Settings→Bank
--    Accounts, ক্যাশ/ব্যাংক GL-র সাথে যুক্ত) রিইউজ হচ্ছিল, যা ভুল — F&J-এর একাউন্ট
--    রেকর্ডে বায়ারের ব্যাংক আর BIN/লাইসেন্স নম্বর মিশে যেত। এখন আলাদা টেবিল।
-- ২. Export LC/Sales Contract No + Date — নতুন ফিল্ড, real Doc ফাইলে সবসময় থাকে
--    ("EXPORT LC/SC NO. ... Dt-...")।
--
-- Import LC অপরিবর্তিত — ওটার bank_id এখনো "banks" (F&J-এর নিজের একাউন্ট) নির্দেশ করবে।

create table if not exists public.lc_opening_banks (
  id uuid primary key default gen_random_uuid(),
  bank_name text not null,
  branch text,
  address text,
  -- বায়ার/আপ্লিক্যান্টের customs-registration নম্বর — ইউজারের সিদ্ধান্ত অনুযায়ী এই
  -- ব্যাংক রেকর্ডের সাথেই সেভ থাকবে (আসলে বায়ারের নিজস্ব তথ্য, কিন্তু বাস্তবে এক বায়ার
  -- প্রায় সবসময় একই ইস্যুয়িং ব্যাংক ব্যবহার করে বলে এখানে একসাথে রাখা সহজ)
  applicant_bin text,
  bond_license_no text,
  boi_no text,
  erc_no text,
  irc_no text,
  issuing_bank_bin text,
  bangladesh_bank_ref_no text,
  hs_code_no text,
  -- ইউজারের "৩টা কাস্টম ফিল্ড থাকলে ভালো হয়" — নির্দিষ্ট কলাম না বানিয়ে flexible
  -- {label,value}[] জেসন, যাতে ভবিষ্যতে যেকোনো নাম/মান বসানো যায়
  custom_fields jsonb,
  created_at timestamptz default now()
);
alter table public.lc_opening_banks enable row level security;

create policy "auth_full_access_lc_opening_banks" on public.lc_opening_banks
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

grant all on table public.lc_opening_banks to anon;
grant all on table public.lc_opening_banks to authenticated;
grant all on table public.lc_opening_banks to service_role;

alter table public.lc_register
  add column if not exists lc_opening_bank_id uuid references public.lc_opening_banks(id),
  add column if not exists sales_contract_no text,
  add column if not exists sales_contract_date date;

-- Drafts at ফিক্সড ৩টা অপশনে আটকে না রেখে যেকোনো মান নেওয়া দরকার ("60 Days Sight" ইত্যাদি
-- যেকোনো ফিগার হতে পারে) — আগের migration-এর inline CHECK (auto-named lc_register_drafts_at_check
-- Postgres-এর ডিফল্ট কনভেনশন অনুযায়ী) সরিয়ে দেওয়া হলো, কলাম এখন থেকে free text।
alter table public.lc_register drop constraint if exists lc_register_drafts_at_check;
