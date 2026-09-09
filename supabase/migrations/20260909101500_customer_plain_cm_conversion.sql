-- আইরিশ গার্মেন্টস / দেবনিয়ার গার্মেন্টস (customers) — cm→inch এ কারখানার die-size
-- লুকআপ টেবিল (lib/cmToInch.ts) বাদ, সরল ÷2.54 হবে।
--
--   • customers.plain_cm_conversion — Customer master-এ টগল (Customers পেজ থেকে on/off)।
--   • bookings.plain_cm_conversion  — booking তৈরির সময় ঐ মুহূর্তের customer-টগল
--     booking row-এ snapshot হয় (পরে master টগল বদলালেও পুরনো বুকিং অপরিবর্তিত;
--     calcRequiredLbs / calcQuotedUnitPrice / calcPiUnitPrice ইত্যাদি এই কলাম পড়ে)।

alter table public.customers
  add column if not exists plain_cm_conversion boolean not null default false;

alter table public.bookings
  add column if not exists plain_cm_conversion boolean not null default false;

-- নাম ধরে দুই কাস্টমার পরি-সেট (বাংলা/ইংরেজি যেভাবেই লেখা থাকুক)
update public.customers
   set plain_cm_conversion = true
 where name ilike '%আইরিশ%' or name ilike '%irish%'
    or name ilike '%দেবনিয়া%' or name ilike '%debon%' or name ilike '%devn%';

-- ঐ কাস্টমারের আগের বুকিংগুলোতেও snapshot বসাও — future PI/Invoice ঠিক থাকবে
-- (already-stored bookings.required_lbs re-save না করা পর্যন্ত অপরিবর্তিত)।
update public.bookings b
   set plain_cm_conversion = true
  from public.customers c
 where b.customer_id = c.id
   and c.plain_cm_conversion = true
   and b.plain_cm_conversion = false;
