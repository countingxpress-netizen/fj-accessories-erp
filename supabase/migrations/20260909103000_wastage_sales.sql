-- Wastage / Scrap বিক্রি।
--
--   • from_stock = true  → Recycled Chips স্টক থেকে বিক্রি:
--       raw_material_stock কমে, stock_ledger 'out' (reference_type='wastage_sale'),
--       COGS: Dr 5050 Cost of Goods Sold / Cr 1203 Raw Material Inventory-Recycled
--             = quantity_lbs × Recycled Chips avg_cost_per_lbs
--   • from_stock = false → কারখানার আলগা স্ক্র্যাপ (স্টকে ট্র্যাক নেই): শুধু বিক্রির JV
--
--   বিক্রি JV:  Dr <deposit account (cash/bank) | 1100 Accounts Receivable>
--              Cr 4020 Wastage / Scrap Sales

insert into public.chart_of_accounts (account_code, account_name, account_type) values
  ('4020', 'Wastage / Scrap Sales', 'income')
on conflict (account_code) do nothing;

create table if not exists public.wastage_sales (
  id uuid primary key default extensions.uuid_generate_v4(),
  sale_no text not null unique,
  sale_date date not null default current_date,
  from_stock boolean not null default true,
  warehouse_id uuid references public.warehouses(id),
  quantity_lbs numeric(14,2) not null default 0,
  rate_per_lbs numeric(14,4) not null default 0,
  amount numeric(14,2) not null,
  payment_mode text not null default 'cash',
  deposit_account_id uuid references public.chart_of_accounts(id),
  customer_id uuid references public.customers(id),
  sold_to_name text,
  cogs_amount numeric(14,2) not null default 0,
  voucher_id uuid references public.journal_vouchers(id),
  note text,
  created_by uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  constraint wastage_sales_payment_mode_check check (payment_mode = any (array['cash'::text, 'credit'::text])),
  constraint wastage_sales_amount_check check (amount >= 0)
);

alter table public.wastage_sales owner to postgres;
alter table public.wastage_sales enable row level security;

create policy "auth_full_access_wastage_sales" on public.wastage_sales
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

grant all on table public.wastage_sales to anon;
grant all on table public.wastage_sales to authenticated;
grant all on table public.wastage_sales to service_role;

create index if not exists wastage_sales_date_idx on public.wastage_sales (sale_date);
