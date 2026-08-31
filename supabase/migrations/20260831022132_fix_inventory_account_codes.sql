-- Fix — আগের দুই migration (payroll_accrual, perpetual_inventory) যে account code
-- ধরে নিয়েছিল, বাস্তব Chart of Accounts-এ সেগুলো অন্য কাজে ব্যবহৃত ছিল:
--   2100 = Import LC Payable      (payroll ভুল করে এখানে posting করত)
--   1300 = Advance to Suppliers   (WIP ভুল করে এখানে)
--   1400 = Fixed Assets - Machinery (FG Inv ভুল করে এখানে)
--   5000 = Raw Material Purchase   (COGS ভুল করে এখানে)
-- `on conflict do nothing`-এর কারণে ওই migration-গুলো নতুন account তৈরি করতে
-- পারেনি; কোডও তাই ভুল account খুঁজে পেত।
--
-- সঠিক ম্যাপিং (কোডেও একই সাথে ঠিক করা হয়েছে):
--   Salary & Bonus Payable → 2200  (ইতিমধ্যে "Salary Payable" নামে আছে)
--   Finished Goods Inventory → 1210 (ইতিমধ্যে আছে)
--   Wastage Loss → 5600            (ইতিমধ্যে আছে)
--   Work-in-Process Inventory → 1220 (নতুন, এই migration-এ তৈরি)
--   Cost of Goods Sold → 5050        (নতুন, এই migration-এ তৈরি)
--
-- এই migration-এর আগে কোনো payroll/inventory JV পোস্ট হয়নি (যাচাই করা), তাই
-- ভুল posting সংশোধনের দরকার নেই — শুধু অনুপস্থিত account দুটো যোগ করা।

insert into public.chart_of_accounts (account_code, account_name, account_type) values
  ('1220', 'Work-in-Process Inventory', 'asset'),
  ('5050', 'Cost of Goods Sold',        'expense'),
  ('3900', 'Opening Balance Equity',    'equity')  -- perpetual চালুর সময় stock reconcile করার balancing account
on conflict (account_code) do nothing;
