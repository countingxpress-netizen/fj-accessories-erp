-- Delivery Challan নম্বর থেকে "DC/FNJ-" prefix, কাস্টমার কোড আর "/{year}" suffix বাদ
-- দিয়ে শুধু প্লেইন সিরিয়াল রাখা হচ্ছে (কাগজের চালান বইয়ে যেভাবে লেখা হতো ঠিক সেভাবে,
-- যেমন শুধু 20399) — lib/docNumber.ts-এর generateChallanNo() আপডেট হয়েছে।
--
-- আলাদা কাস্টমারের নিজের চালান বই, তাই দুই কাস্টমারের একই সিরিয়াল নম্বর থাকতেই পারে —
-- তাই গ্লোবাল UNIQUE(challan_no)-এর বদলে UNIQUE(customer_id, challan_no) রাখা হলো।

-- বিদ্যমান রো থাকলে নতুন কোডেড ফরম্যাট (DC/FNJ-{n}-{CODE}/{year}) থেকে সিরিয়াল বের করা
update delivery_challans
  set challan_no = (regexp_match(challan_no, 'FNJ-(\d+)-'))[1]
  where challan_no ~ 'FNJ-\d+-';

-- পুরনো গ্লোবাল ফরম্যাট (DC-{year}-{NNNN}) থাকলে সেটা থেকেও সিরিয়াল বের করা
update delivery_challans
  set challan_no = (regexp_match(challan_no, '-(\d+)$'))[1]
  where challan_no ~ '^DC-\d{4}-\d+$';

alter table delivery_challans drop constraint if exists delivery_challans_challan_no_key;
alter table delivery_challans
  add constraint delivery_challans_customer_challan_no_key unique (customer_id, challan_no);
