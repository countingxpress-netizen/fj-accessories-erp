-- কাস্টমারের প্রথম ERP Delivery Challan তৈরির সময় সাজেস্ট করার জন্য পরবর্তী সিরিয়াল
-- (ERP-এর আগে কাগজের চালান বইয়ে ব্যবহৃত শেষ সিরিয়াল + ১)। NULL মানে কোনো হিন্ট নেই —
-- generateChallanNo() তখন স্বাভাবিকভাবে ১ থেকে শুরু করে। lib/docNumber.ts দেখুন।
alter table customers
  add column if not exists challan_next_serial_hint integer;

-- E:\Customer ফোল্ডারের প্রকৃত চালান ফাইল/রেজিস্টার ঘেঁটে (2026-09-13) বের করা শেষ
-- ব্যবহৃত সিরিয়াল + ১। AT Accessories-এর জন্য ফোল্ডারের এলোমেলো ফাইল-নম্বর নয়,
-- "Challan List/Challan list.xlsx" রেজিস্টারের শেষ এন্ট্রি (20398, 2026-09-08) ব্যবহার
-- করা হয়েছে। Rapid Design-এ ডিসেম্বর ২০২৫-এর একটা পরিত্যক্ত "500100+" সিরিজ ছিল, সেটা
-- বাদ দিয়ে সক্রিয় "Challan-2026" ফোল্ডারের শেষ সিরিয়াল (6085) ধরা হয়েছে।
update customers set challan_next_serial_hint = 6086 where code = 'RDL';   -- র‌্যাপিড ডিজাইন
update customers set challan_next_serial_hint = 7108 where code = 'VALF';  -- ভালমন্ট
update customers set challan_next_serial_hint = 2909 where code = 'DEB';   -- ডেবনিয়ার গার্মেন্টস
update customers set challan_next_serial_hint = 3099 where code = 'FLOG';  -- ফ্লোরেন্স
update customers set challan_next_serial_hint = 20399 where code = 'AT';   -- এটি এক্সেসরিজ
update customers set challan_next_serial_hint = 2787 where code = 'IDL';   -- আইরিশ গার্মেন্টস
update customers set challan_next_serial_hint = 1816 where code = 'HAMS';  -- রুবেল-হ্যামস
update customers set challan_next_serial_hint = 14133 where code = 'MOONG'; -- মুন লাইট গার্মেন্টস
update customers set challan_next_serial_hint = 17061 where code = 'VIS';  -- ভিশন গার্মেন্টস
update customers set challan_next_serial_hint = 2781 where code = 'NET';   -- নেটওয়ার্ক
