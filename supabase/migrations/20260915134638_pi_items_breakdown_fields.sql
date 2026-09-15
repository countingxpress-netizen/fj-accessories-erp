-- New PI (Booking মোড, AT Accessories বাদে বাকি সব কাস্টমার)-এ প্রতি লাইনের দাম-ব্রেকডাউন
-- স্বচ্ছভাবে এডিট করা যায় তার জন্য — Price/Unit এখন এই কলামগুলো থেকে বিল্ড হয়:
--   subtotal   = round(price_per_lbs × TubeInch × CuttingInch × Thickness / 75000
--                       + adhesive_charge + print_charge)
--   withMarkup = subtotal × (1 + percentage_value/100)
--   price_unit = withMarkup + extra_charge + other_charge
-- (print_charge, adhesive_charge, tube_inch, cutting_inch আগে থেকেই ছিল — শুধু নতুনগুলো)
alter table pi_items
  add column if not exists price_per_lbs numeric,
  add column if not exists percentage_value numeric default 0,
  add column if not exists extra_charge numeric default 0,
  add column if not exists other_charge numeric default 0,
  add column if not exists weight_kg numeric;
