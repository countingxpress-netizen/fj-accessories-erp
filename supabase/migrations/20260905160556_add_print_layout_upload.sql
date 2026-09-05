-- Print Layout ফাইল (ছবি/PDF) আপলোড — Booking ফর্ম থেকে সরাসরি ক্লায়েন্ট-সাইড আপলোড হবে
-- (Signature-এর মতো admin-gated API route নয় — বুকিং লেখার সময় যেকোনো লগইন করা স্টাফ
-- আপলোড করবে), তাই authenticated write policy লাগবে, সাথে public read যাতে Printing
-- Schedule শিটে সরাসরি <img>/লিংক দিয়ে দেখানো যায়।

alter table public.bookings add column if not exists print_layout_file_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'print-layouts', 'print-layouts', true, 8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public_read_print_layouts" on storage.objects;
create policy "public_read_print_layouts" on storage.objects
  for select using (bucket_id = 'print-layouts');

drop policy if exists "authenticated_write_print_layouts" on storage.objects;
create policy "authenticated_write_print_layouts" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'print-layouts');
