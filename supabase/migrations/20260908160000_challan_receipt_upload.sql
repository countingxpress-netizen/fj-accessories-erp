-- Challan Received — কাস্টমার-স্বাক্ষরিত চালানের স্ক্যান কপি / ছবি আপলোড
-- (Challan Received ফর্ম থেকে ক্লায়েন্ট-সাইড আপলোড, print-layouts-এর মতোই
-- authenticated write + public read)।

alter table public.delivery_challans
  add column if not exists received_file_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'challan-receipts', 'challan-receipts', true, 8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public_read_challan_receipts" on storage.objects;
create policy "public_read_challan_receipts" on storage.objects
  for select using (bucket_id = 'challan-receipts');

drop policy if exists "authenticated_write_challan_receipts" on storage.objects;
create policy "authenticated_write_challan_receipts" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'challan-receipts');
