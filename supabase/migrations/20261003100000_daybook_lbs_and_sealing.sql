-- হাতের DayBook-এর সাথে মেলাতে দুটো জিনিস:
--
-- ১. sales_invoices.daybook_lbs — খাতায় লেখা বিক্রির Lbs (PE-)। থাকলে রিপোর্টে (DayBook, Sales by Customer,
--    মাসিক টপশীট) বুকিংয়ের ফর্মুলার Required Lbs-এর বদলে এটা দেখায়। ইনভয়েসের টাকা/COGS/স্টকে কোনো প্রভাব নেই।
--    NULL = আগের মতো (লাইনের required_lbs, নইলে booking.required_lbs)।
--
-- ২. daybook_sealing — দৈনিক সাইড/বটম সিলিং (খাতায় হাতে গোনা)। কোনো দিনের এন্ট্রি থাকলে DayBook-এ সেটাই দেখায়,
--    না থাকলে আগের মতো ঐ দিনের cutting-সম্পন্ন pcs থেকে হিসাব।

alter table public.sales_invoices
  add column if not exists daybook_lbs numeric(14,2);

create table if not exists public.daybook_sealing (
  id uuid primary key default extensions.uuid_generate_v4(),
  seal_date date not null,
  side_pcs numeric(14,2) not null default 0,
  bottom_pcs numeric(14,2) not null default 0,
  note text,
  created_by uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  constraint daybook_sealing_date_key unique (seal_date)
);

alter table public.daybook_sealing owner to postgres;
alter table public.daybook_sealing enable row level security;

create policy "auth_full_access_daybook_sealing" on public.daybook_sealing
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

grant all on table public.daybook_sealing to anon;
grant all on table public.daybook_sealing to authenticated;
grant all on table public.daybook_sealing to service_role;
