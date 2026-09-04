-- আবু জাফরের জন্য ভুলে আলাদা account 2500 "Loan from Owner" তৈরি হয়ে গিয়েছিল
-- আর সেটা "Opening — extra assets & liabilities" (JV-2026-0002) নামের একটা
-- আগে থেকেই-থাকা ম্যানুয়াল ভাউচারে পোস্ট করা ছিল — যেটা আমাদের chart_of_accounts
-- .opening_balance কলাম-ভিত্তিক মেকানিজম (lib/openingBalanceJv.ts, migration
-- 20260904155629) থেকে সম্পূর্ণ আলাদা। ফলে:
--   ১. আবু জাফরের টাকা ঠিক জায়গায় (3000 Owner's Capital) ছিল না।
--   ২. লিল্লাহ্ ফান্ড/ওমর ফারুক দুই জায়গায় পোস্ট হয়ে গিয়েছিল — পুরনো ভাউচারে
--      positive (credit), আর আমাদের নতুন ভাউচারে negative (debit) — নেট
--      হিসাবে একে অপরকে কাটাকাটি করে বাতিল হয়ে যাচ্ছিল।
--
-- সমাধান: পুরনো ম্যানুয়াল ভাউচারটা (JV-2026-0002) সম্পূর্ণ সরিয়ে, তার সব
-- অ্যাকাউন্টের opening balance নতুন column-ভিত্তিক মেকানিজমে নিয়ে আসা হলো —
-- এখন থেকে এই সবগুলো account-এর জন্য একটাই voucher ("Opening — Account
-- balances") সোর্স অফ ট্রুথ থাকবে, দুবার গোনার ঝুঁকি থাকবে না।

do $$
declare
  v_voucher_id  uuid;
  v_date        date := '2026-09-01';
  v_year        int;
  v_max         int;
  v_voucher_no  text;
  v_total_dr    numeric(14,2);
  v_total_cr    numeric(14,2);
  v_diff        numeric(14,2);
  v_obe_id      uuid;
  v_old_jv_id   uuid;
begin
  -- ১. পুরনো ম্যানুয়াল "Opening — extra assets & liabilities" ভাউচার (ও তার
  --    লাইন, account 2500 সহ) পুরোপুরি সরিয়ে দিন
  select id into v_old_jv_id
    from public.journal_vouchers
   where narration = 'Opening — extra assets & liabilities'
   limit 1;

  if v_old_jv_id is not null then
    delete from public.journal_entry_lines where voucher_id = v_old_jv_id;
    delete from public.journal_vouchers where id = v_old_jv_id;
  end if;

  -- ২. ভুলে তৈরি হওয়া account 2500 এখন নিরাপদে মুছে ফেলা যায় (আর কোনো লাইন নেই)
  delete from public.chart_of_accounts where account_code = '2500';

  -- ৩. প্রতিটা account-এর opening balance বসান (2800/3300 আগেই ঠিক আছে,
  --    idempotent হওয়ার জন্য আবার লেখা হলো)
  update public.chart_of_accounts set opening_balance = 400000.00,    opening_balance_date = v_date where account_code = '1010'; -- Uttara Bank
  update public.chart_of_accounts set opening_balance = 408000.00,    opening_balance_date = v_date where account_code = '1305'; -- আত্তুশ আলী
  update public.chart_of_accounts set opening_balance = 1350000.00,   opening_balance_date = v_date where account_code = '1405'; -- এলডি মেশিন (নতুন)
  update public.chart_of_accounts set opening_balance = 15203.00,     opening_balance_date = v_date where account_code = '1500'; -- রিপন থিনার
  update public.chart_of_accounts set opening_balance = 1805176.00,   opening_balance_date = v_date where account_code = '2600'; -- এম কে এক্সেসোরিজ
  update public.chart_of_accounts set opening_balance = 143618.00,    opening_balance_date = v_date where account_code = '2700'; -- মুন্না
  update public.chart_of_accounts set opening_balance = 185000.00,    opening_balance_date = v_date where account_code = '2710'; -- মুন্না-3
  update public.chart_of_accounts set opening_balance = 48354038.00,  opening_balance_date = v_date where account_code = '3000'; -- Owner's Capital (আবু জাফর)
  update public.chart_of_accounts set opening_balance = -37570.00,    opening_balance_date = v_date where account_code = '2800'; -- লিল্লাহ্ ফান্ড
  update public.chart_of_accounts set opening_balance = -1408284.00,  opening_balance_date = v_date where account_code = '3300'; -- ওমর ফারুক

  -- ৪. আমাদের নিজস্ব consolidated "Opening — Account balances" ভাউচার খুঁজুন
  select id into v_voucher_id
    from public.journal_vouchers
   where narration = 'Opening — Account balances'
   limit 1;

  if v_voucher_id is not null then
    delete from public.journal_entry_lines where voucher_id = v_voucher_id;
  else
    v_year := extract(year from v_date);
    select coalesce(max(sub.n), 0) into v_max
      from (
        select (regexp_match(voucher_no, 'JV-' || v_year || '-(\d+)$'))[1]::int as n
          from public.journal_vouchers
         where voucher_no ~ ('^JV-' || v_year || '-\d+$')
      ) sub;
    v_voucher_no := 'JV-' || v_year || '-' || lpad((v_max + 1)::text, 4, '0');

    insert into public.journal_vouchers (voucher_no, voucher_date, narration)
    values (v_voucher_no, v_date, 'Opening — Account balances')
    returning id into v_voucher_id;
  end if;

  -- ৫. প্রতিটা eligible অ্যাকাউন্ট (AR/inventory/3900 বাদে) normal side অনুযায়ী লাইন
  insert into public.journal_entry_lines (voucher_id, account_id, debit, credit, memo)
  select
    v_voucher_id,
    id,
    case when (account_type in ('asset', 'expense')) = (opening_balance > 0)
         then abs(opening_balance) else 0 end,
    case when (account_type in ('asset', 'expense')) = (opening_balance > 0)
         then 0 else abs(opening_balance) end,
    'Opening balance'
  from public.chart_of_accounts
  where account_code not in ('1000', '1100', '1200', '1201', '1202', '1203', '1210', '1220', '1299', '3900')
    and abs(coalesce(opening_balance, 0)) >= 0.005;

  -- ৬. net balancing → 3900 Opening Balance Equity
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
    into v_total_dr, v_total_cr
    from public.journal_entry_lines
   where voucher_id = v_voucher_id;

  v_diff := v_total_dr - v_total_cr;

  if abs(v_diff) >= 0.005 then
    select id into v_obe_id from public.chart_of_accounts where account_code = '3900';
    if v_obe_id is not null then
      insert into public.journal_entry_lines (voucher_id, account_id, debit, credit, memo)
      values (
        v_voucher_id, v_obe_id,
        case when v_diff < 0 then -v_diff else 0 end,
        case when v_diff > 0 then v_diff else 0 end,
        'Opening Balance Equity (balancing)'
      );
    end if;
  end if;
end $$;
