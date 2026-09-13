-- Irish Garments — সব বায়ারের PI ফাইল (84 real files, 02. PI-2023/Submitted PI, প্রতিটার
-- ২য় sheet "PI (2)" আসল ডেটা — ১ম sheet "PI" সব ফাইলেই হুবহু একই কপি-পেস্ট করা GP@72.6
-- leftover, বাদ দেওয়া হয়েছে) formula-by-formula চেক করে (২০২৬-০৯-১৩) পাওয়া গরমিল।
--
-- বেশিরভাগ বায়ারের রেট আসলে সরাসরি USD/Lbs (M/L11 কলামে সরাসরি ~0.8-0.9, exchange rate
-- দিয়ে ভাগ করা লাগে না)। আমাদের buyers.rate_per_lbs_value-এ এই USD রেট × 107 করে BDT-
-- সমতুল্য সংখ্যা বসানো ছিল (যেমন 0.86×107=92.02) — ঠিকই ছিল, কিন্তু usd_bdt_rate ভুলে
-- 100 বসানো ছিল, 107 না। ফলে সাজেস্ট করা দাম প্রতিটা PI-তে প্রায় ৭% বেশি হচ্ছিল
-- (baseBDT÷100 বনাম আসল সূত্রের baseBDT÷107)। শুধু Kmart আর IDL সত্যিকারের BDT-ভিত্তিক
-- (÷100 সরাসরি ফাইলেও তাই), ওরা আগে থেকেই ঠিক আছে — বাদ রাখা হলো।
update buyers b set usd_bdt_rate = 107
from customers c
where b.customer_id = c.id and c.code = 'IDL'
  and b.name in ('048', 'ANF', 'Big Ster', 'Bonmarche', 'Districenter', 'EC', 'GEORGE', 'Maurices', 'Pepco', 'Rossmann', 'Walmart');

-- GP — সম্পূর্ণ ভিন্ন বায়ার-নিজস্ব সূত্র (আসল ফাইল, leftover কপি না): rate=72.6 BDT/Lbs
-- (92.02 না), USD/BDT=90 (100 না)। ছোট একটা flat +0.5 BDT addition-ও ফাইলে আছে (এবং
-- প্রতি লাইনে ভিন্ন ভিন্ন ম্যানুয়াল "Extra" কলাম) — এগুলো buyer-wide ধ্রুবক নয় (Maurices/
-- Rossmann-এর মতো বায়ারেও লাইনে-লাইনে ভিন্ন), তাই কোডে যোগ করা হলো না; ম্যানুয়ালি
-- ঠিক করার মতো ছোট সমন্বয় হিসেবেই থাকবে (আগের মতোই)।
update buyers b set
  rate_per_lbs_value = 72.6,
  usd_bdt_rate = 90
from customers c
where b.customer_id = c.id and c.code = 'IDL' and b.name = 'GP';
