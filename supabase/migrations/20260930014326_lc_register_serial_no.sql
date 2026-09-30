-- Export LC সিরিয়াল নম্বর — LC Register (Export) লিস্টে কলাম, আর LC-র সব ডকুমেন্টে
-- (Mushok-6.3 বাদে) রেফারেন্স হিসেবে ছাপা হয়: "Ref: FNJ/<serial>/<LC সাল>"।
-- ইউজারের সিদ্ধান্ত (2026-09-30): সব Export LC মিলিয়ে একটাই ক্রম; নতুন LC-তে অটো
-- (সর্বোচ্চ + 1) কিন্তু এডিটযোগ্য (আসল ফাইলের নম্বর যেমন "423. 31384.07-AGL..." বসানোর জন্য)।
-- পুরনো LC-তে NULL রাখা হলো — আন্দাজে নম্বর বসানো হয়নি, LC View পেজ থেকে বসাতে হবে।

alter table public.lc_register add column if not exists serial_no integer;

create unique index if not exists lc_register_export_serial_no_key
  on public.lc_register (serial_no)
  where lc_type = 'export' and serial_no is not null;
