-- pi_items: store Tube"/Cutting" (inches) per line so the Edit page can recompute
-- Total Weight (Kg) and Price/Unit when Thickness/Print/Adhesive change later,
-- the same way the Manual PI create form already does at creation time.
ALTER TABLE "public"."pi_items"
  ADD COLUMN IF NOT EXISTS "tube_inch" numeric,
  ADD COLUMN IF NOT EXISTS "cutting_inch" numeric;
