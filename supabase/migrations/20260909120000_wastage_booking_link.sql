-- Booking View থেকে "Wastage Register" — বুকিং-এর বিপরীতে প্রতি প্রোডাক্টে ওয়েস্টেজ।
--
--   • এই ওয়েস্টেজ **অতিরিক্ত** কাঁচামাল খরচ (required_lbs-এর বাইরে) —
--     রেকর্ড করলে কাঁচামাল স্টক থেকে ঐ পরিমাণ (booking material-split অনুপাতে) কমে,
--     JV: Dr 5600 Wastage Loss / Cr <material inv 1200-1203>  (recycled অংশ Dr 1203)।
--   • wastage.deducts_stock = true এই ধরনের এন্ট্রিতে; পুরনো Production > Wastage
--     পেজের এন্ট্রি (WIP→Loss, স্টক কমে না) deducts_stock = false।
--   • wastage.booking_id — Booking View-এ সহজে দেখানোর জন্য (production_id থেকেও
--     পাওয়া যায়, তবু direct link)।

alter table public.wastage
  add column if not exists deducts_stock boolean not null default false;

alter table public.wastage
  add column if not exists booking_id uuid references public.bookings(id);

-- পুরনো এন্ট্রির booking_id ভরে দাও (production_orders হয়ে)
update public.wastage w
   set booking_id = po.booking_id
  from public.production_orders po
 where w.production_id = po.id and w.booking_id is null;
