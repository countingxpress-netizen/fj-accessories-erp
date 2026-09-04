-- মালিক জানিয়েছেন: বাকি সব অ্যাকাউন্টের opening balance UI দিয়ে আগেই বসানো
-- হয়ে গেছে — শুধু লিল্লাহ্ ফান্ড (2800) ও ওমর ফারুক (3300) negative করে দিতে
-- হবে (spreadsheet-এ +37,570 / +1,408,284 ছিল, কিন্তু বাস্তবে দুটো অ্যাকাউন্টই
-- এখন কোম্পানিকে দেনা)। তারিখ: 2026-09-01।
--
-- এই দুইটা অ্যাকাউন্ট বদলানোর পর পুরো "Opening — Account balances" consolidated
-- JV (lib/openingBalanceJv.ts এর syncOpeningBalanceJv() যা তৈরি করে) নতুন করে
-- rebuild করা দরকার — migration-এ SQL সরাসরি চালানোয় ওই JS ফাংশন এখানে চলে না,
-- তাই এই DO ব্লক তার লজিকটাই হুবহু SQL-এ replicate করছে (একই exclusion list,
-- একই normal-side নিয়ম, একই 3900 balancing)।

do $$
declare
  v_voucher_id uuid;
  v_date date := '2026-09-01';
  v_year int;
  v_max int;
  v_voucher_no text;
  v_total_dr numeric(14,2);
  v_total_cr numeric(14,2);
  v_diff numeric(14,2);
  v_obe_id uuid;
begin
  -- ১. লিল্লাহ্ ফান্ড ও ওমর ফারুক negative
  update public.chart_of_accounts
     set opening_balance = -37570.00, opening_balance_date = v_date
   where account_code = '2800';

  update public.chart_of_accounts
     set opening_balance = -1408284.00, opening_balance_date = v_date
   where account_code = '3300';

  -- ২. বিদ্যমান consolidated Opening voucher খুঁজুন (থাকারই কথা)
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

  -- ৩. প্রতিটা eligible অ্যাকাউন্ট (AR/inventory/3900 বাদে) normal side অনুযায়ী লাইন
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
  where account_code not in ('1100', '1200', '1201', '1202', '1203', '1210', '1220', '1299', '3900')
    and abs(coalesce(opening_balance, 0)) >= 0.005;

  -- ৪. net balancing → 3900 Opening Balance Equity
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
