-- Raw Material সরাসরি বিক্রি (স্টক থেকে, উৎপাদনে না দিয়ে) — যেকোনো raw material
-- (LLDPE/LDPE/PP/Recycled Chips/...) কোনো কাস্টমার বা অন্য পার্টির কাছে বিক্রি।
--
--   raw_material_stock কমে (material_id + warehouse_id), stock_ledger 'out'
--   (item_type='raw_material', reference_type='raw_material_sale')
--
--   COGS: Dr 5050 Cost of Goods Sold / Cr <material.inventory_account_code (1200-1203/1299)>
--         = quantity_lbs × ঐ material-এর avg_cost_per_lbs
--
--   বিক্রি JV: Dr <Cash 1000 (নগদ) | Customer→1100 Accounts Receivable | বাছাই করা account>
--             Cr 4030 Raw Material Sales

insert into public.chart_of_accounts (account_code, account_name, account_type) values
  ('4030', 'Raw Material Sales', 'income')
on conflict (account_code) do nothing;

create table if not exists public.raw_material_sales (
  id uuid primary key default extensions.uuid_generate_v4(),
  sale_no text not null unique,
  sale_date date not null default current_date,
  material_id uuid not null references public.raw_materials(id),
  warehouse_id uuid not null references public.warehouses(id),
  unit text not null default 'lbs',
  quantity numeric(14,2) not null default 0,
  rate numeric(14,4) not null default 0,
  quantity_lbs numeric(14,2) not null default 0,
  amount numeric(14,2) not null,
  cogs_amount numeric(14,2) not null default 0,
  customer_id uuid references public.customers(id),
  party_account_id uuid references public.chart_of_accounts(id),
  sold_to_name text,
  payment_received boolean not null default false,
  voucher_id uuid references public.journal_vouchers(id),
  note text,
  created_by uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  constraint raw_material_sales_unit_check check (unit = any (array['lbs'::text, 'kg'::text])),
  constraint raw_material_sales_amount_check check (amount >= 0)
);

alter table public.raw_material_sales owner to postgres;
alter table public.raw_material_sales enable row level security;

create policy "auth_full_access_raw_material_sales" on public.raw_material_sales
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

grant all on table public.raw_material_sales to anon;
grant all on table public.raw_material_sales to authenticated;
grant all on table public.raw_material_sales to service_role;

create index if not exists raw_material_sales_date_idx on public.raw_material_sales (sale_date);
create index if not exists raw_material_sales_material_idx on public.raw_material_sales (material_id);
create index if not exists raw_material_sales_customer_idx on public.raw_material_sales (customer_id);
