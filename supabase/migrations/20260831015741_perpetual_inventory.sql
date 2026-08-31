-- Perpetual inventory & COGS.
--
-- আগে Purchase Entry কাঁচামালকে asset (1200–1203) হিসেবে debit করত, কিন্তু
-- Booking / Production / Challan কোনো JV করত না — তাই inventory অ্যাকাউন্ট বাড়তেই
-- থাকত আর COGS কখনো ধরা হতো না। এখন প্রতিটা ধাপে অটো JV হয়:
--
--   Booking (কাঁচামাল issue)   Dr 1300 WIP            / Cr <material inv acct>
--   Cutting শেষ / FG Receive    Dr 1400 FG Inventory   / Cr 1300 WIP
--   Delivery Challan (shipment) Dr 5000 COGS           / Cr 1400 FG Inventory
--   Wastage                     Dr 5000 COGS (+Dr recycled inv) / Cr 1300 WIP
--
-- খরচ হিসাব: raw material — সব purchase-এর weighted average per lb;
--            finished good — production order-এ issue করা WIP cost ÷ pcs (moving avg)।

-- ── 1) নতুন অ্যাকাউন্ট ───────────────────────────────────────────────
insert into public.chart_of_accounts (account_code, account_name, account_type) values
  ('1299', 'Other Raw Material Inventory', 'asset'),
  ('1300', 'Work-in-Process Inventory',    'asset'),
  ('1400', 'Finished Goods Inventory',     'asset'),
  ('5000', 'Cost of Goods Sold',           'expense')
on conflict (account_code) do nothing;

-- ── 2) raw material: প্রতি material-এর inventory অ্যাকাউন্ট + গড় খরচ ──
alter table public.raw_materials
  add column if not exists inventory_account_code text,
  add column if not exists avg_cost_per_lbs numeric(14,4) not null default 0;

update public.raw_materials set inventory_account_code = '1200' where inventory_account_code is null and material_name = 'LLDPE';
update public.raw_materials set inventory_account_code = '1201' where inventory_account_code is null and material_name = 'LDPE';
update public.raw_materials set inventory_account_code = '1202' where inventory_account_code is null and material_name = 'PP';
update public.raw_materials set inventory_account_code = '1203' where inventory_account_code is null and material_name = 'Recycled Chips';
update public.raw_materials set inventory_account_code = '1299' where inventory_account_code is null;

-- বিদ্যমান purchase history থেকে গড় খরচ ভরে দিন (weighted average per lb)
update public.raw_materials m set avg_cost_per_lbs = coalesce((
  select sum(pi.quantity_lbs * pi.rate_per_lbs) / nullif(sum(pi.quantity_lbs), 0)
  from public.purchase_entry_items pi
  where pi.material_id = m.id
), 0);

-- ── 3) production order-এর চলমান WIP মূল্য ──────────────────────────
alter table public.production_orders
  add column if not exists wip_cost numeric(14,2) not null default 0;

-- ── 4) finished good-এর গড় একক খরচ + প্রতি receipt-এর খরচ ──────────
alter table public.finished_goods
  add column if not exists avg_cost_per_pc numeric(14,4) not null default 0;

alter table public.finished_goods_receive
  add column if not exists unit_cost  numeric(14,4) not null default 0,
  add column if not exists total_cost numeric(14,2) not null default 0;

-- ── 5) প্রতিটা source ডকে auto inventory JV-র লিংক (delete-এ reverse করার জন্য) ─
alter table public.bookings
  add column if not exists inventory_voucher_id uuid references public.journal_vouchers(id);
alter table public.finished_goods_receive
  add column if not exists inventory_voucher_id uuid references public.journal_vouchers(id);
alter table public.delivery_challans
  add column if not exists inventory_voucher_id uuid references public.journal_vouchers(id);
alter table public.wastage
  add column if not exists inventory_voucher_id uuid references public.journal_vouchers(id);
