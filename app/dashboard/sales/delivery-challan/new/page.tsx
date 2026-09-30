import { createClient } from "@/lib/supabase/server";
import DeliveryChallanForm from "./DeliveryChallanForm";
import { fetchAllRows } from "@/lib/fetchAll";

export default async function NewDeliveryChallanPage() {
  const supabase = await createClient();

  const [
    { data: customers },
    { data: existingChallans },
    { data: bookings },
    { data: warehouses },
    { data: allItems },
    { data: fgStock },
  ] = await Promise.all([
    supabase.from("customers").select("id, name, code, challan_next_serial_hint").order("name"),
    fetchAllRows<any>(supabase, "delivery_challans", "customer_id").then((data) => ({ data })),
    fetchAllRows<any>(supabase, "bookings", "id, booking_no, quantity_pcs, product_id, customer_id, warehouse_id, style, garments_name, buyers(name), merchants(name), delivery_point, customer_booking_ref, finished_goods(product_name)",
      (q) => q.neq("status", "cancelled").order("booking_date", { ascending: false }).order("created_at", { ascending: true })).then((data) => ({ data })),
    supabase.from("warehouses").select("id, name").order("name"),
    fetchAllRows<any>(supabase, "delivery_challan_items", "quantity_pcs, booking_id, delivery_challans(booking_id)").then((data) => ({ data })),
    // প্রতিটা product কোন warehouse-এ কত pcs আছে — challan ফর্মে warehouse বাছাই ও
    // stock দেখানোর জন্য (আগে সাবমিটের সময় অনুমান করা হতো, এখন ইউজার দেখে বাছে)
    supabase.from("finished_goods_stock").select("product_id, warehouse_id, quantity_pcs"),
  ]);
  const customersWithChallans = Array.from(new Set((existingChallans ?? []).map((c) => c.customer_id)));

  const deliveredMap: Record<string, number> = {};
  (allItems ?? []).forEach((item: any) => {
    const bId = item.booking_id ?? item.delivery_challans?.booking_id;
    if (!bId) return;
    deliveredMap[bId] = (deliveredMap[bId] ?? 0) + item.quantity_pcs;
  });

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
        customersWithChallans={customersWithChallans}
      />
    </div>
  );
}
