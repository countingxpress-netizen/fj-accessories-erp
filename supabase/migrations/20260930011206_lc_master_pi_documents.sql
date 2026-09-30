-- Export LC → Master PI + LC Documents (Bill of Exchange, Delivery/Truck Challan,
-- Commercial Invoice, Packing List, Beneficiary's Certificate, Mushok-6.3)
--
-- বাস্তব ফাইল: E:\Customer-29.09.2026\19. AT Acc\LC\01. FnJ\423. ...\Documents - $ 31384.07.xlsx
--   "PI" শীট = Master PI — LC-র সব PI-র লাইন একসাথে, হেডারে সব PI No + Date।
--   বাকি সব শীট ওই Master PI থেকে ফর্মুলায় তৈরি।
--
-- ইউজারের সিদ্ধান্ত:
--   ১. Master PI = আলাদা কপি (snapshot) — এডিট করলে আসল PI অপরিবর্তিত থাকে।
--   ২. এক LC-তে একাধিক ডকুমেন্ট সেট (partial shipment) — প্রতিটা সেটে নিজস্ব
--      Invoice/Challan No, তারিখ, ওজন আর লাইনপ্রতি আংশিক Qty।
--   ৩. প্রিন্ট পেজ এডিটেবল — ফ্রি-টেক্সট অংশগুলোর হাতে-বদল overrides jsonb-তে।

create table if not exists public.lc_master_pis (
  id uuid primary key default gen_random_uuid(),
  lc_id uuid not null unique references public.lc_register(id) on delete cascade,
  -- "PROFORMA INVOICE NO. PI/FNJ-1638-AT/2026 DATE: 14.05.2026, ..." লাইন
  pi_ref_text text,
  buyer_name text,
  buyer_address text,
  advising_bank_name text,
  advising_bank_branch text,
  advising_bank_address text,
  advising_bank_swift text,
  discount_pct numeric default 0,
  -- NULL = auto (subtotal × discount_pct / 100); হাতে বসালে সেটাই (Excel-এর "G67*F68-0.01")
  discount_amount numeric(14,2),
  hs_code text default '3923.21.00',
  bin_no text,
  beneficiary_bin text,
  terms_conditions text,
  price_decimals integer not null default 4,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.lc_master_pi_items (
  id uuid primary key default gen_random_uuid(),
  master_pi_id uuid not null references public.lc_master_pis(id) on delete cascade,
  sl_no integer not null,
  source_pi_id uuid references public.proforma_invoices(id) on delete set null,
  source_pi_item_id uuid references public.pi_items(id) on delete set null,
  description text,
  measurement text,
  qty_pcs numeric(14,2) not null default 0,
  price_unit numeric(14,4) not null default 0,
  price_basis text not null default 'pcs' check (price_basis in ('pcs', 'dzn')),
  created_at timestamptz default now()
);
create index if not exists lc_master_pi_items_master_idx on public.lc_master_pi_items(master_pi_id);

create table if not exists public.lc_document_sets (
  id uuid primary key default gen_random_uuid(),
  lc_id uuid not null references public.lc_register(id) on delete cascade,
  set_no integer not null,
  invoice_no text,
  invoice_date date,
  challan_no text,            -- TR/DC NO
  delivery_date date,
  truck_no text,
  total_net_weight_kg numeric(14,2),
  total_gross_weight_kg numeric(14,2),
  mushok_no text,
  mushok_date date,
  mushok_time text,
  -- ফ্রি-টেক্সট অংশের হাতে-বদল: { "<doc>.<field>": "text" } — না থাকলে ডিফল্ট টেক্সট
  overrides jsonb not null default '{}'::jsonb,
  created_by uuid references public.app_users(id),
  created_at timestamptz default now(),
  unique (lc_id, set_no)
);

create table if not exists public.lc_document_set_items (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.lc_document_sets(id) on delete cascade,
  master_item_id uuid not null references public.lc_master_pi_items(id) on delete cascade,
  qty_pcs numeric(14,2) not null default 0,
  unique (set_id, master_item_id)
);

alter table public.lc_master_pis enable row level security;
alter table public.lc_master_pi_items enable row level security;
alter table public.lc_document_sets enable row level security;
alter table public.lc_document_set_items enable row level security;

create policy "auth_full_access_lc_master_pis" on public.lc_master_pis
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth_full_access_lc_master_pi_items" on public.lc_master_pi_items
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth_full_access_lc_document_sets" on public.lc_document_sets
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth_full_access_lc_document_set_items" on public.lc_document_set_items
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

grant all on table public.lc_master_pis to anon, authenticated, service_role;
grant all on table public.lc_master_pi_items to anon, authenticated, service_role;
grant all on table public.lc_document_sets to anon, authenticated, service_role;
grant all on table public.lc_document_set_items to anon, authenticated, service_role;
