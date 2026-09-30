-- কাস্টমার এডজাস্টমেন্ট — কোনো বিক্রি/পেমেন্ট ছাড়াই কাস্টমারের বাকি বাড়ানো বা কমানো,
-- বিপরীতে অন্য একটা account (যেমন মুন্না-3 কমিশন 2710)।
--   direction = 'debit'  → কাস্টমারের বাকি বাড়ে:  Dr 1100 Accounts Receivable / Cr contra
--                          (যেমন "মুন্না-3-এর কাছ থেকে নিয়ে এটি-কে দেওয়া হলো")
--   direction = 'credit' → কাস্টমারের বাকি কমে:   Dr contra / Cr 1100
-- Customer Ledger / Outstanding / Receivable / Dashboard / DayBook-এর বাকি হিসাবে আসে;
-- 'debit' এডজাস্টমেন্ট Payment Received-এ বকেয়া হিসেবে দেখায় (payment_allocations.customer_adjustment_id)।

create table if not exists public.customer_adjustments (
  id uuid primary key default extensions.uuid_generate_v4(),
  adj_no text not null unique,
  adj_date date not null default current_date,
  customer_id uuid not null references public.customers(id),
  direction text not null default 'debit',
  contra_account_id uuid not null references public.chart_of_accounts(id),
  amount numeric(14,2) not null,
  note text,
  voucher_id uuid references public.journal_vouchers(id),
  created_by uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  constraint customer_adjustments_direction_check check (direction = any (array['debit'::text, 'credit'::text])),
  constraint customer_adjustments_amount_check check (amount > 0)
);

alter table public.customer_adjustments owner to postgres;
alter table public.customer_adjustments enable row level security;

create policy "auth_full_access_customer_adjustments" on public.customer_adjustments
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

grant all on table public.customer_adjustments to anon;
grant all on table public.customer_adjustments to authenticated;
grant all on table public.customer_adjustments to service_role;

create index if not exists customer_adjustments_customer_idx on public.customer_adjustments (customer_id);
create index if not exists customer_adjustments_date_idx on public.customer_adjustments (adj_date);

-- Payment Received-এ 'debit' এডজাস্টমেন্টের বিপরীতেও টাকা allocate করা যাবে
alter table public.payment_allocations
  add column if not exists customer_adjustment_id uuid
    references public.customer_adjustments(id) on delete cascade;

alter table public.payment_allocations
  drop constraint if exists payment_allocations_single_target;
alter table public.payment_allocations
  add constraint payment_allocations_single_target check (
    (case when invoice_id is not null then 1 else 0 end)
    + (case when raw_material_sale_id is not null then 1 else 0 end)
    + (case when wastage_sale_id is not null then 1 else 0 end)
    + (case when customer_adjustment_id is not null then 1 else 0 end) <= 1
  );

create index if not exists payment_allocations_customer_adjustment_idx
  on public.payment_allocations (customer_adjustment_id);
