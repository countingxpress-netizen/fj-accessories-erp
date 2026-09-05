-- দুইটা নতুন Measurement Type যোগ:
--   flap_gusset: Tube = L + Flap/2 + Gusset (Gusset পুরোটাই ব্যবহার হয়, Flap-এর মতো অর্ধেক নয়), Cutting = W
--   pillow:      Tube = L + Pillow, Cutting = W
-- এর জন্য নতুন "pillow_val" কলাম আর measurement_type CHECK constraint-এ দুটো নতুন মান যোগ।

alter table public.bookings add column if not exists pillow_val numeric(10,3);

alter table public.bookings drop constraint if exists bookings_measurement_type_check;
alter table public.bookings add constraint bookings_measurement_type_check
  check (measurement_type = any (array['simple', 'adhesive', 'gusset', 'flap_gusset', 'pillow']));
