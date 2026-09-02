-- "কে তৈরি করেছে" ট্র্যাক করার জন্য সব transaction ডকুমেন্টে created_by যোগ করা হলো।
-- journal_vouchers-এ কলামটা আগে থেকেই ছিল (কিন্তু কখনো সেট করা হতো না — অ্যাপ কোডে আলাদা ফিক্স করা হচ্ছে)।

alter table public.sales_invoices add column if not exists created_by uuid references public.app_users(id);
alter table public.delivery_challans add column if not exists created_by uuid references public.app_users(id);
alter table public.bookings add column if not exists created_by uuid references public.app_users(id);
alter table public.purchase_entries add column if not exists created_by uuid references public.app_users(id);
alter table public.proforma_invoices add column if not exists created_by uuid references public.app_users(id);
alter table public.customer_payments add column if not exists created_by uuid references public.app_users(id);
alter table public.supplier_payments add column if not exists created_by uuid references public.app_users(id);
alter table public.quotations add column if not exists created_by uuid references public.app_users(id);
alter table public.expenses add column if not exists created_by uuid references public.app_users(id);
alter table public.wastage add column if not exists created_by uuid references public.app_users(id);
alter table public.salary_sheet add column if not exists created_by uuid references public.app_users(id);
alter table public.bonus_sheet add column if not exists created_by uuid references public.app_users(id);
alter table public.employee_advances add column if not exists created_by uuid references public.app_users(id);
alter table public.lc_register add column if not exists created_by uuid references public.app_users(id);
alter table public.export_invoices add column if not exists created_by uuid references public.app_users(id);
alter table public.packing_lists add column if not exists created_by uuid references public.app_users(id);
alter table public.warehouse_transfers add column if not exists created_by uuid references public.app_users(id);
alter table public.bank_charges add column if not exists created_by uuid references public.app_users(id);
