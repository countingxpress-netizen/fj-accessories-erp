-- Purchase Freight / Carrying charge — ক্রয়ের ফ্রেইট/লেবার খরচ কাঁচামালের দামে
-- যোগ (capitalize) হয়, আলাদা period expense নয়।
--
--   • এক ক্রয়ের ফ্রেইট ওই entry-র material লাইনগুলোর মধ্যে **Lbs-অনুপাতে** ভাগ হয়।
--   • JV:  Dr <material inventory acct 1200-1203/1299 — নিজ নিজ ভাগে>
--          Cr <paid via: Cash 1000 / Bank / Md Abu Jafor 3000>
--     (বাকিতে ফ্রেইট নেওয়া হয় না — সবসময় নগদে/ব্যাংকে পরিশোধ)
--   • raw_materials.avg_cost_per_lbs =
--        ( Σ(qty×rate) + Σ ভাগ করা freight ) ÷ Σ qty     (lib/inventoryCost.ts)
--   • এক ক্রয়ে একাধিক freight charge যোগ করা যায় (পরিবহন + লেবার আলাদা, বা
--     ভিন্ন তারিখে)। entry থেকে সরাসরি (source='with_purchase') বা আলাদা
--     Freight ফর্ম থেকে (source='separate') — দুই ভাবেই।

create table if not exists public.purchase_freight_charges (
  id uuid primary key default extensions.uuid_generate_v4(),
  purchase_entry_id uuid not null references public.purchase_entries(id) on delete cascade,
  charge_date date not null default current_date,
  description text,
  amount numeric(14,2) not null,
  paid_via_account_id uuid not null references public.chart_of_accounts(id),
  source text not null default 'separate',
  voucher_id uuid references public.journal_vouchers(id),
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint purchase_freight_charges_amount_check check (amount > 0),
  constraint purchase_freight_charges_source_check check (source = any (array['with_purchase'::text, 'separate'::text]))
);

alter table public.purchase_freight_charges owner to postgres;
alter table public.purchase_freight_charges enable row level security;

create policy "auth_full_access_purchase_freight_charges" on public.purchase_freight_charges
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

grant all on table public.purchase_freight_charges to anon;
grant all on table public.purchase_freight_charges to authenticated;
grant all on table public.purchase_freight_charges to service_role;

create index if not exists purchase_freight_charges_entry_idx
  on public.purchase_freight_charges (purchase_entry_id);
