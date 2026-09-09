-- Journal Voucher-এর উৎস (source) — হাতে-বানানো ("manual") বনাম সিস্টেম-জেনারেটেড
-- (Sales Invoice / Payroll / Purchase / Freight / Wastage / Payment / Opening ...)।
--
-- সাইডবারে নতুন "Manual Journal" পেজ শুধু source='manual' দেখাবে; পুরনো "Journal
-- Vouchers" পেজ আগের মতোই সব দেখাবে।

alter table public.journal_vouchers
  add column if not exists source text not null default 'manual';

-- ── বিদ্যমান ভাউচার শ্রেণীবদ্ধ করা ─────────────────────────────────────────────
-- ১) অন্য টেবিল থেকে সরাসরি রেফারেন্স আছে এমন (নিশ্চিত সিস্টেম-জেনারেটেড)

update public.journal_vouchers v set source = 'sales_invoice'
  from public.sales_invoices s where s.voucher_id = v.id;

update public.journal_vouchers v set source = 'payment_in'
  from public.customer_payments p where p.voucher_id = v.id;

update public.journal_vouchers v set source = 'payment_out'
  from public.supplier_payments p where p.voucher_id = v.id;

update public.journal_vouchers v set source = 'expense'
  from public.expenses e where e.voucher_id = v.id;

update public.journal_vouchers v set source = 'payroll'
  from public.salary_sheet s where s.voucher_id = v.id;

update public.journal_vouchers v set source = 'payroll'
  from public.bonus_sheet b where b.voucher_id = v.id;

update public.journal_vouchers v set source = 'purchase'
  from public.purchase_entries pe where pe.voucher_id = v.id;

update public.journal_vouchers v set source = 'freight'
  from public.purchase_freight_charges f where f.voucher_id = v.id;

update public.journal_vouchers v set source = 'inventory'
  from public.bookings b where b.inventory_voucher_id = v.id;

update public.journal_vouchers v set source = 'inventory'
  from public.finished_goods_receive r where r.inventory_voucher_id = v.id;

update public.journal_vouchers v set source = 'inventory'
  from public.delivery_challans d where d.inventory_voucher_id = v.id;

update public.journal_vouchers v set source = 'inventory'
  from public.wastage w where w.inventory_voucher_id = v.id;

update public.journal_vouchers v set source = 'bank_txn'
  from public.bank_transactions t where t.linked_voucher_id = v.id;

update public.journal_vouchers v set source = 'cash_txn'
  from public.cash_transactions t where t.linked_voucher_id = v.id;

-- ২) back-reference নেই এমন সিস্টেম ভাউচার — narration প্যাটার্ন ধরে (শুধু এখনো
--    'manual' থেকে যাওয়াগুলো)

update public.journal_vouchers
   set source = 'opening'
 where source = 'manual'
   and (narration ilike 'Opening —%' or narration = 'Opening inventory reconciliation');

update public.journal_vouchers
   set source = 'profit_distribution'
 where source = 'manual' and narration ilike 'Profit distribution —%';

update public.journal_vouchers
   set source = 'bank_charge'
 where source = 'manual' and narration ilike 'Bank Charge —%';

update public.journal_vouchers
   set source = 'sales_invoice'
 where source = 'manual' and narration ilike 'Sales Invoice %';

update public.journal_vouchers
   set source = 'purchase'
 where source = 'manual' and narration ilike 'Purchase from %';

update public.journal_vouchers
   set source = 'payment_in'
 where source = 'manual' and narration ilike 'Payment received%';

update public.journal_vouchers
   set source = 'payment_out'
 where source = 'manual' and narration ilike 'Payment given to %';

update public.journal_vouchers
   set source = 'expense'
 where source = 'manual' and narration ilike 'Expense —%';

update public.journal_vouchers
   set source = 'inventory'
 where source = 'manual'
   and (narration ilike 'RM issued to production%'
     or narration ilike 'Finished goods to store%'
     or narration ilike 'COGS —%'
     or narration ilike 'Production wastage%');

update public.journal_vouchers
   set source = 'freight'
 where source = 'manual' and narration ilike 'Freight/Labour —%';

create index if not exists journal_vouchers_source_idx on public.journal_vouchers (source);
