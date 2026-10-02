-- মাসিক টপশীট (চূড়ান্ত হিসাব) — মাস-শেষের snapshot।
-- পাওনা + বাঁকি / দেনা / খরচ / স্টক বিবরণ / প্রাথমিক লাভ — ERP থেকে হিসাব করে, হাতে এডিট করে
-- "সেভ" করলে পুরো শীট `data` (jsonb) হিসেবে জমা থাকে; পরে ERP ডাটা বদলালেও সেভ করা শীট বদলায় না।
-- পরের মাসের "আগের মাসের স্টক" (lbs + টাকা) এই snapshot-এর closing থেকে আসে।
-- কোনো JV পোস্ট হয় না (লাভ বণ্টন আলাদা — Accounting > Profit বণ্টন)।

create table if not exists public.month_topsheets (
  id uuid primary key default extensions.uuid_generate_v4(),
  year int not null,
  month int not null,
  data jsonb not null,
  saved_by uuid references public.app_users(id),
  saved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint month_topsheets_month_check check (month between 1 and 12),
  constraint month_topsheets_year_month_key unique (year, month)
);

alter table public.month_topsheets owner to postgres;
alter table public.month_topsheets enable row level security;

create policy "auth_full_access_month_topsheets" on public.month_topsheets
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

grant all on table public.month_topsheets to anon;
grant all on table public.month_topsheets to authenticated;
grant all on table public.month_topsheets to service_role;
