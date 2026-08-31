import { createClient } from "@/lib/supabase/server";
import DeliveryChallanForm from "./DeliveryChallanForm";

export default async function NewDeliveryChallanPage() {
  const supabase = await createClient();

  const { data: customers } = await supabase.from("customers").select("id, name").order("name");
  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, booking_no, quantity_pcs, product_id, customer_id, warehouse_id, style, garments_name, buyers(name), merchants(name), delivery_point, customer_booking_ref, finished_goods(product_name)")
    .neq("status", "cancelled")
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

  // প্রতিটা product কোন warehouse-এ কত pcs আছে — challan ফর্মে warehouse বাছাই ও
  // stock দেখানোর জন্য (আগে সাবমিটের সময় অনুমান করা হতো, এখন ইউজার দেখে বাছে)
  const { data: fgStock } = await supabase
    .from("finished_goods_stock")
    .select("product_id, warehouse_id, quantity_pcs");

  const stockByProduct: Record<string, Record<string, number>> = {};
  (fgStock ?? []).forEach((s: any) => {
    if (!s.product_id || !s.warehouse_id) return;
    stockByProduct[s.product_id] = stockByProduct[s.product_id] ?? {};
    stockByProduct[s.product_id][s.warehouse_id] =
      (stockByProduct[s.product_id][s.warehouse_id] ?? 0) + (s.quantity_pcs ?? 0);
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">নতুন Delivery Challan</h1>
      <DeliveryChallanForm
        customers={customers ?? []}
        bookings={(bookings ?? []) as any}
        warehouses={warehouses ?? []}
        deliveredMap={deliveredMap}
        stockByProduct={stockByProduct}
      />
    </div>
  );
}
