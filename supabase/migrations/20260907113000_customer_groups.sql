-- Customer Group ("পার্টি") — Customer-এর উপরে একটা রোল-আপ লেয়ার।
--
-- উদ্দেশ্য: কয়েকটা আলাদা নগদ কাস্টমারকে এক গ্রুপে ("নতুন পার্টি") রাখা।
-- লেনদেন (Invoice / Booking / PI / Delivery Challan / Payment Received) আগের মতোই
-- কাস্টমার-ভিত্তিকই থাকে — কোনো কিছু customer_group-এ পোস্ট হয় না।
--
-- শুধু রিপোর্টে: গ্রুপে থাকা কাস্টমারগুলো আলাদা না দেখিয়ে একটা লাইনে গ্রুপের
-- নামে রোল-আপ হয় (Customer Ledger তালিকা, Outstanding, Receivable Statement,
-- Commission Report, Dashboard-এর recent invoice). গ্রুপ-বিহীন কাস্টমার অপরিবর্তিত।
--
-- একটা কাস্টমার সর্বোচ্চ একটা গ্রুপে (customers.group_id)। গ্রুপ মুছলে সদস্যরা
-- এমনিতেই গ্রুপ-বিহীন হয়ে যায় (on delete set null) — কোনো লেনদেন হারায় না।

create table if not exists public.customer_groups (
  id uuid primary key default extensions.uuid_generate_v4(),
  name text not null,
  note text,
  created_at timestamptz not null default now()
);

alter table public.customer_groups owner to postgres;
alter table public.customer_groups enable row level security;

create policy "auth_full_access_customer_groups" on public.customer_groups
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

grant all on table public.customer_groups to anon;
grant all on table public.customer_groups to authenticated;
grant all on table public.customer_groups to service_role;

alter table public.customers
  add column if not exists group_id uuid references public.customer_groups(id) on delete set null;

create index if not exists customers_group_id_idx on public.customers (group_id);
