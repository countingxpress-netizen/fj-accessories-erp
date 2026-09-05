-- Cutting/Printing সম্পন্ন হয়ে গেছে কিন্তু আগের স্টেজে (Blowing/Printing) আলাদা এন্ট্রি
-- কখনো লেখা হয়নি এমন পুরনো Production Order ঠিক করা হচ্ছে — পরের স্টেজ শেষ মানে আগেরটা
-- (Blow না করে প্রিন্ট/কাট করা যায় না) নিশ্চিতভাবেই হয়ে গেছে।

-- Blowing: Printing বা Cutting যেটা আগে সম্পন্ন হয়েছে সেই timestamp ব্যবহার করে ব্যাকফিল
UPDATE public.production_orders
SET
  blowing_completed_at = COALESCE(printing_completed_at, cutting_completed_at),
  blowing_produced_lbs = GREATEST(COALESCE(blowing_produced_lbs, 0), COALESCE(required_lbs, 0))
WHERE blowing_completed_at IS NULL
  AND COALESCE(printing_completed_at, cutting_completed_at) IS NOT NULL;

-- Printing: Cutting সম্পন্ন, বুকিং-এ Print আছে, কিন্তু printing_completed_at খালি
UPDATE public.production_orders po
SET
  printing_completed_at = po.cutting_completed_at,
  printing_produced_pcs = GREATEST(COALESCE(po.printing_produced_pcs, 0), COALESCE(po.quantity_pcs, 0))
FROM public.bookings b
WHERE po.booking_id = b.id
  AND b.has_print = true
  AND po.printing_completed_at IS NULL
  AND po.cutting_completed_at IS NOT NULL;
