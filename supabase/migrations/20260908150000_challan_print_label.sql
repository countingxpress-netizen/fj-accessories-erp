-- Delivery Challan — per-line print label
--
-- চালান প্রিন্টে Product কলাম হাতে এডিট করা যায় (finished_goods-এর নাম না বদলে
-- এই চালানের জন্য আলাদা লেখা)। খালি হলে product_name দেখায়।

alter table public.delivery_challan_items
  add column if not exists print_label text;
