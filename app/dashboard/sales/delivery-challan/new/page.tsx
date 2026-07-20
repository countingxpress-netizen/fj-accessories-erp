import { createClient } from "@/lib/supabase/server";
import DeliveryChallanForm from "./DeliveryChallanForm";

export default async function NewDeliveryChallanPage() {
  const supabase = await createClient();

  const { data: customers } = await supabase.from("customers").select("id, name").order("name");
  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, booking_no, quantity_pcs, product_id, customer_id, style, buyers(name), merchants(name), delivery_point, customer_booking_ref, finished_goods(product_name)")
    .in("status", ["in_production", "partially_delivered"])
    .order("booking_date", { ascending: false });
  const { data: warehouses } = await supabase.from("warehouses").select("id, name").order("name");

  const { data: allItems } = await supabase
    .from("delivery_challan_items")
    .select("quantity_pcs, delivery_challans(booking_id)");

  const deliveredMap: Record<string, number> = {};
  (allItems ?? []).forEach((item: any) => {
    const bId = item.delivery_challans?.booking_id;
    if (!bId) return;
    deliveredMap[bId] = (deliveredMap[bId] ?? 0) + item.quantity_pcs;
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">নতুন Delivery Challan</h1>
      <DeliveryChallanForm customers={customers ?? []} bookings={(bookings ?? []) as any} warehouses={warehouses ?? []} deliveredMap={deliveredMap} />
    </div>
  );
}