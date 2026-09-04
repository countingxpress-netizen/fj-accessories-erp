-- Allow 'carton' as a raw_materials.unit value (e.g. Adhesive, tracked by carton not weight)
ALTER TABLE "public"."raw_materials" DROP CONSTRAINT "raw_materials_unit_check";
ALTER TABLE "public"."raw_materials" ADD CONSTRAINT "raw_materials_unit_check"
  CHECK (("unit" = ANY (ARRAY['lbs'::"text", 'kg'::"text", 'bag'::"text", 'carton'::"text"])));
