-- Delivery Challan flow rework
--
-- নতুন নিয়ম: বুকিং রিসিভ হলেই চালান করা যায়। চালান সেভ করলেই —
--   • ঐ বুকিং-এর production order: produced += চালান qty, তিন স্টেজ (Blowing/
--     Printing/Cutting) completed, stage='finished' → Complete Production পেজে।
--   • চালান করা qty-টুকু Finished Goods-এ receive হয় (JV Dr 1210 / Cr 1220),
--     finished_goods_receive-এ delivery_challan_id দিয়ে লিংক থাকে (delete-এ reverse)।
--   • এরপর আগের মতোই shipment COGS (Dr 5050 / Cr 1210)।
--
-- Delivery Status আর হাতে dropdown-এ বদলানো যায় না — শুধু:
--   challan_ready  (চালান তৈরি)
--   delivery_done  (চালান Print করা হলে — printed_at বসে)
--   challan_received (Challan Received পেজ থেকে — received_date/received_note বসে)
-- 'in_transit' বাদ; পুরনো in_transit row → delivery_done।

-- ── 1) delivery_status: in_transit বাদ ──────────────────────────────
update public.delivery_challans set delivery_status = 'delivery_done'
  where delivery_status = 'in_transit';

alter table public.delivery_challans
  drop constraint if exists delivery_challans_delivery_status_check;
alter table public.delivery_challans
  add constraint delivery_challans_delivery_status_check
  check (delivery_status = any (array['challan_ready'::text, 'delivery_done'::text, 'challan_received'::text]));

-- ── 2) delivery_challans: Print ও Received ট্র্যাকিং ────────────────
alter table public.delivery_challans
  add column if not exists printed_at    timestamptz,
  add column if not exists received_date date,
  add column if not exists received_note text;

-- আগে থেকেই delivery_done/challan_received থাকা row-এ printed_at আনুমানিক বসাই
update public.delivery_challans
  set printed_at = coalesce(printed_at, created_at)
  where delivery_status in ('delivery_done', 'challan_received') and printed_at is null;

-- ── 3) delivery_challan_items: প্রতি লাইন কোন বুকিং-এর ──────────────
alter table public.delivery_challan_items
  add column if not exists booking_id uuid references public.bookings(id);

update public.delivery_challan_items i
  set booking_id = c.booking_id
  from public.delivery_challans c
  where i.challan_id = c.id and i.booking_id is null;

create index if not exists delivery_challan_items_booking_idx
  on public.delivery_challan_items (booking_id);

-- ── 4) finished_goods_receive: চালান-ট্রিগার করা receive-এর লিংক ────
alter table public.finished_goods_receive
  add column if not exists delivery_challan_id uuid references public.delivery_challans(id);

create index if not exists finished_goods_receive_challan_idx
  on public.finished_goods_receive (delivery_challan_id);
