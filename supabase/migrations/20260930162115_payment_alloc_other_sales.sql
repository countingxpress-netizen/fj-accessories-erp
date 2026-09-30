-- Customer Payment Received-এ Raw Material সরাসরি বিক্রি / Wastage বিক্রি (বাকিতে, কাস্টমারের
-- নামে) — এগুলোর বিপরীতেও টাকা allocate করা যাবে। এতদিন payment_allocations শুধু
-- sales_invoices (invoice_id) বা Opening Balance (সব target NULL) চিনত।
--
-- একটা allocation row-তে সর্বোচ্চ একটা target থাকবে:
--   invoice_id            → Sales Invoice
--   raw_material_sale_id  → Raw Material সরাসরি বিক্রি
--   wastage_sale_id       → Wastage বিক্রি
--   সবগুলো NULL          → Opening Balance
-- বিক্রিটা delete হলে তার allocation-ও মুছে যায় (টাকাটা payment-এ Advance হিসেবে থেকে যায়)।

alter table public.payment_allocations
  add column if not exists raw_material_sale_id uuid
    references public.raw_material_sales(id) on delete cascade,
  add column if not exists wastage_sale_id uuid
    references public.wastage_sales(id) on delete cascade;

alter table public.payment_allocations
  drop constraint if exists payment_allocations_single_target;
alter table public.payment_allocations
  add constraint payment_allocations_single_target check (
    (case when invoice_id is not null then 1 else 0 end)
    + (case when raw_material_sale_id is not null then 1 else 0 end)
    + (case when wastage_sale_id is not null then 1 else 0 end) <= 1
  );

create index if not exists payment_allocations_raw_material_sale_idx
  on public.payment_allocations (raw_material_sale_id);
create index if not exists payment_allocations_wastage_sale_idx
  on public.payment_allocations (wastage_sale_id);
