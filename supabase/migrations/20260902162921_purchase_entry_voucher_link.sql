-- Purchase Entry ↔ Journal Voucher লিংক।
--
-- এতদিন Purchase Entry save করলে একটা JV (Dr Inventory / Cr Cash|AP) তৈরি হতো,
-- কিন্তু কোন JV কোন entry-র সেটা কোথাও রাখা হতো না। ফলে Purchase Entry ডিলিট
-- করলে JV-টা রয়ে যেত (stock reverse হতো, কিন্তু accounting entry থেকে যেত →
-- Inventory/Payable overstated)।
--
-- এখন `purchase_entries.voucher_id` রাখা হয়; `deletePurchaseEntryCascade`
-- entry-র সাথে JV-ও মুছে দেয়।

alter table public.purchase_entries
  add column if not exists voucher_id uuid references public.journal_vouchers(id);
