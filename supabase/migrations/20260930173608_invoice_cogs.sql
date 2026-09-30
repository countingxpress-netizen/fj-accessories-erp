-- Sales Invoice-এ COGS (Cost of Goods Sold) — বিক্রির সময়ই বিক্রিত মালের কাঁচামাল-খরচ খরচে যায়।
-- এতদিন COGS শুধু Delivery Challan দিলে পোস্ট হতো; Challan না থাকায় booking-এ কাটা কাঁচামালের
-- পুরো মূল্য WIP (1220)-এ আটকে ছিল আর P&L-এ COGS প্রায় শূন্য দেখাত।
--
-- প্রতিটা invoice লাইন (booking থাকলে) → একটা সারি:
--   amount   = booking-এর কাঁচামাল issue মূল্য × (invoice Qty ÷ booking Qty, সর্বোচ্চ 1)
--   JV       : Dr 5050 COGS / Cr 1220 WIP (wip_amount) + Cr 1210 FG (fg_amount — WIP আগেই FG Receive-এ
--              সরে গিয়ে থাকলে বাকিটা FG থেকে)
--   production_orders.wip_cost থেকে wip_amount কমে; উল্টালে (invoice এডিট/ডিলিট) ফেরত আসে।
-- লজিক: lib/invoiceCogs.ts (syncInvoiceCogs / reverseInvoiceCogs)।

create table if not exists public.invoice_cogs (
  id uuid primary key default extensions.uuid_generate_v4(),
  invoice_id uuid not null references public.sales_invoices(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  production_order_id uuid references public.production_orders(id) on delete set null,
  voucher_id uuid references public.journal_vouchers(id),
  amount numeric(14,2) not null default 0,
  wip_amount numeric(14,2) not null default 0,
  fg_amount numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

alter table public.invoice_cogs owner to postgres;
alter table public.invoice_cogs enable row level security;

create policy "auth_full_access_invoice_cogs" on public.invoice_cogs
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

grant all on table public.invoice_cogs to anon;
grant all on table public.invoice_cogs to authenticated;
grant all on table public.invoice_cogs to service_role;

create index if not exists invoice_cogs_invoice_idx on public.invoice_cogs (invoice_id);
create index if not exists invoice_cogs_booking_idx on public.invoice_cogs (booking_id);
