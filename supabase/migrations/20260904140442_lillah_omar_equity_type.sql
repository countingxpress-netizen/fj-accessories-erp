-- লিল্লাহ্ ফান্ড (2800) আর ওমর ফারুক (3300) — দুটোই Equity, liability নয়।
-- মালিক জানিয়েছেন দুটো account-ই বর্তমানে কোম্পানিকে দেনা (over-drawn), তাই
-- opening balance ঋণাত্মক বসবে — Chart of Accounts-এর নতুন Opening Balance
-- ফিচারে (equity credit-normal) ঋণাত্মক মানে debit side, যেটা ঠিক এই অবস্থাই দেখায়।
--
-- কোড অপরিবর্তিত রাখা হলো (শুধু account_type বদলাচ্ছে) — profitDistribution.ts-এর
-- LILLAH_CODE/OMAR_CODE কনস্ট্যান্ট account_code দিয়ে lookup করে, code না বদলালে
-- ওখানে কিছু ছোঁয়ার দরকার নেই। 3300 আগে থেকেই equity ব্লকের কোড, তাই এই update
-- ওটার জন্য no-op হতে পারে — নিরাপদ/idempotent।

update public.chart_of_accounts
   set account_type = 'equity'
 where account_code in ('2800', '3300')
   and account_type <> 'equity';
