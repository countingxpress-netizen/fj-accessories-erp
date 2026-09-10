-- আগের preset migration-এ বাংলা বানানে "দেবনিয়া" (দ - dental) ব্যবহার হয়েছিল, কিন্তু
-- আসল কাস্টমারের নাম "ডেবনিয়ার গার্মেন্টস" (ড - retroflex) — তাই ÷2.54 টগল পায়নি।
-- এখানে সেট করা হলো (আইরিশ গার্মেন্টস আগেই সেট আছে)।

update public.customers
   set plain_cm_conversion = true
 where name ilike '%ডেবনিয়া%' and plain_cm_conversion = false;

-- ঐ কাস্টমারের বুকিংগুলোর snapshot টগল অনুযায়ী মিলিয়ে দাও
update public.bookings b
   set plain_cm_conversion = c.plain_cm_conversion
  from public.customers c
 where b.customer_id = c.id
   and c.name ilike '%ডেবনিয়া%'
   and b.plain_cm_conversion is distinct from c.plain_cm_conversion;
