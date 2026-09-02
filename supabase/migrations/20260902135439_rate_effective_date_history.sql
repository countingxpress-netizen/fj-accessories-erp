-- Effective-date-wise rate history.
--
-- Customer-এর Price/Lbs আর Buyer-এর PI Rate/Lbs এখন থেকে তারিখ-ভিত্তিক।
-- একটাই টেবিল `rate_history` — customer_id অথবা buyer_id (ঠিক একটা) সেট থাকে।
--
-- ব্যবহার:
--   * Sales Invoice: প্রতিটি booking-এর `booking_date` ধরে সেই দিনে কার্যকর
--     Price/Lbs বসবে (per-line manual override আগের মতোই জেতে)।
--   * Proforma Invoice: booking-এর `booking_date` ধরে সেই দিনে কার্যকর
--     Buyer Rate/Lbs দিয়ে suggested price হিসাব হবে।
--   * ইতিমধ্যে সেভ হওয়া Invoice / PI অপরিবর্তিত — তাদের unit_price frozen।
--
-- `customers.price_per_lbs` ও `buyers.rate_per_lbs_value` কলাম টিকে থাকবে —
-- এখন থেকে ওগুলো "আজকের দিনে কার্যকর দাম"-এর cached copy (অ্যাপ কোড sync রাখে),
-- fallback হিসেবেও ব্যবহৃত হয়।

create table if not exists public.rate_history (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  buyer_id uuid references public.buyers(id) on delete cascade,
  rate numeric(14,4) not null,
  effective_from date not null,
  note text,
  created_by uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  constraint rate_history_exactly_one_ref check (num_nonnulls(customer_id, buyer_id) = 1)
);

-- এক customer / buyer-এর একটা তারিখে একটাই rate
create unique index if not exists rate_history_customer_effdate_idx
  on public.rate_history (customer_id, effective_from) where customer_id is not null;
create unique index if not exists rate_history_buyer_effdate_idx
  on public.rate_history (buyer_id, effective_from) where buyer_id is not null;

alter table public.rate_history enable row level security;

create policy "auth_full_access_rate_history" on public.rate_history
  using ((auth.role() = 'authenticated'::text))
  with check ((auth.role() = 'authenticated'::text));

-- Backfill: বর্তমান দাম '1900-01-01' থেকে কার্যকর ধরা হলো, যাতে feature চালুর
-- দিন কোনো পুরনো booking-এর হিসাব বদলে না যায়। পরে হাতে করে আসল তারিখ-ভিত্তিক
-- এন্ট্রি (যেমন "116 জানু-জুন, 110 জুলাই থেকে") History panel থেকে যোগ করা যাবে।
insert into public.rate_history (customer_id, rate, effective_from, note)
select id, price_per_lbs, date '1900-01-01', 'Migration backfill (current Price/Lbs)'
from public.customers
where price_per_lbs is not null
on conflict do nothing;

insert into public.rate_history (buyer_id, rate, effective_from, note)
select id, rate_per_lbs_value, date '1900-01-01', 'Migration backfill (current Rate/Lbs)'
from public.buyers
where rate_per_lbs_value is not null and rate_per_lbs_value <> 0
on conflict do nothing;
