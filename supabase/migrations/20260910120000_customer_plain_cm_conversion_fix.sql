-- FIX: 20260909101500 টাইমস্ট্যাম্পে প্রথমে garments-লক্ষ্য ভার্সন apply হয়ে
-- গিয়েছিল (db push-এর সময় Supabase API 502 চলছিল)। পরে ফাইলটা customers-লক্ষ্য
-- করে বদলানো হলেও ঐ version আগেই schema_migrations-এ থাকায় নতুন content আর চলেনি।
-- এখানে সঠিক অবস্থা তৈরি করা হলো।
--
--   • customers.plain_cm_conversion — এই কলামটাই কোড ব্যবহার করে (Customers পেজ টগল)।
--   • garments.plain_cm_conversion — ভুল করে তৈরি হয়েছিল, কেউ ব্যবহার করে না — সরানো।
--   • bookings.plain_cm_conversion — snapshot; customer-এর টগল অনুযায়ী মিলিয়ে দেওয়া।

alter table public.customers
  add column if not exists plain_cm_conversion boolean not null default false;

alter table public.garments drop column if exists plain_cm_conversion;

-- নাম ধরে আইরিশ / দেবনিয়ার কাস্টমার পরি-সেট
update public.customers
   set plain_cm_conversion = true
 where name ilike '%আইরিশ%' or name ilike '%irish%'
    or name ilike '%দেবনিয়া%' or name ilike '%debon%' or name ilike '%devn%';

-- প্রতিটা বুকিং তার কাস্টমারের টগল অনুযায়ী মিলিয়ে দাও
update public.bookings b
   set plain_cm_conversion = c.plain_cm_conversion
  from public.customers c
 where b.customer_id = c.id
   and b.plain_cm_conversion is distinct from c.plain_cm_conversion;
