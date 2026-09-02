-- প্রতিটা ইউজারের নিজস্ব Signature — Invoice/Challan/PI print-এ document তৈরি
-- করা ইউজারের signature দেখানোর জন্য। Upload API route (service-role, admin
-- গেটেড) ব্যবহার করে, তাই storage.objects-এ ক্লায়েন্ট-সাইড write policy
-- লাগবে না — শুধু পাবলিক read লাগবে যাতে print page-এ <img> সরাসরি দেখাতে পারে।

alter table public.app_users add column if not exists signature_url text;

insert into storage.buckets (id, name, public)
values ('signatures', 'signatures', true)
on conflict (id) do nothing;

drop policy if exists "public_read_signatures" on storage.objects;
create policy "public_read_signatures" on storage.objects
  for select using (bucket_id = 'signatures');
