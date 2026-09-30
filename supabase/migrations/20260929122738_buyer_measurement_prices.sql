-- মেজারমেন্ট-ভিত্তিক দাম মনে রাখা (কিছু কাস্টমারের নির্দিষ্ট বায়ারের জন্য)।
-- buyers.remember_measurement_price = true হলে সেই বায়ারের প্রতিটা সাইজ + থিকনেসের দাম
-- buyer_measurement_prices-এ থাকে — বায়ার পেজ থেকে হাতে লেখা যায়, আর PI সেভ করলে
-- অটো আপডেট হয়। PI ফর্মে ফর্মুলার দামই বসে, পাশে "আগের দাম" বাটন দেখায়।
-- মিল = measurement_type + unit + L/W/Flap/Gusset/Pillow + PI thickness (স্টাইল ধরা হয় না)।

alter table public.buyers
  add column if not exists remember_measurement_price boolean not null default false;

create table if not exists public.buyer_measurement_prices (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.buyers(id) on delete cascade,
  -- lib/measurementPrice.ts measurementPriceKey() দিয়ে বানানো normalized key
  match_key text not null,
  measurement_type text not null,
  measurement_unit text not null,
  length_val numeric not null default 0,
  width_val numeric not null default 0,
  flap_val numeric,
  gusset_val numeric,
  pillow_val numeric,
  thickness_mm numeric,
  price numeric not null,
  currency text not null default 'USD',
  price_basis text not null default 'pcs',
  source text not null default 'manual', -- 'manual' (বায়ার পেজ) | 'pi' (PI সেভ থেকে)
  last_pi_id uuid references public.proforma_invoices(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (buyer_id, match_key)
);

alter table public.buyer_measurement_prices enable row level security;

create policy "auth_full_access_buyer_measurement_prices" on public.buyer_measurement_prices
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

grant all on table public.buyer_measurement_prices to anon;
grant all on table public.buyer_measurement_prices to authenticated;
grant all on table public.buyer_measurement_prices to service_role;
