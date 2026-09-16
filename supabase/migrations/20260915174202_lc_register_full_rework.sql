-- LC Register পুনর্গঠন: Export LC-র জন্য বিস্তারিত ফিল্ড (SWIFT MT700-এর মতো — Applicant,
-- Beneficiary entity, Amendment, Shipment Date, Drafts at, Required Documents checklist)
-- এবং একটা LC-তে একাধিক PI লিংক করার সাপোর্ট (lc_pi_items junction table)।
-- পুরনো single linked_pi_id কলাম রাখা হলো — পুরনো এন্ট্রি ভাঙবে না, নতুন এন্ট্রি lc_pi_items ব্যবহার করবে।

alter table public.lc_register add column if not exists applicant text;
alter table public.lc_register add column if not exists beneficiary_entity text
  check (beneficiary_entity in ('F&J Accessories', 'MK Accessories'));
alter table public.lc_register add column if not exists amendment_no text;
alter table public.lc_register add column if not exists amendment_date date;
alter table public.lc_register add column if not exists shipment_date date;
alter table public.lc_register add column if not exists drafts_at text
  check (drafts_at in ('at_sight', '90_days_sight', '120_days_sight'));
alter table public.lc_register add column if not exists required_documents text[];

create table if not exists public.lc_pi_items (
  id uuid primary key default extensions.uuid_generate_v4(),
  lc_id uuid not null references public.lc_register(id) on delete cascade,
  pi_id uuid not null references public.proforma_invoices(id),
  created_at timestamp with time zone default now(),
  unique (lc_id, pi_id)
);

alter table public.lc_pi_items enable row level security;

create policy "auth_full_access_lc_pi_items" on public.lc_pi_items
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

grant all on table public.lc_pi_items to anon;
grant all on table public.lc_pi_items to authenticated;
grant all on table public.lc_pi_items to service_role;
