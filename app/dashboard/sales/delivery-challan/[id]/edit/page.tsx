import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DeliveryChallanForm, { type EditChallanContext } from "../../new/DeliveryChallanForm";

export default async function EditChallanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: challan } = await supabase
    .from("delivery_challans")
    .select("id, challan_no, challan_date, customer_id, delivery_status, delivery_challan_items(booking_id, product_id, quantity_pcs, packets, print_label)")
    .eq("id", id)
    .single();
  if (!challan) return notFound();

  // শুধু সর্বশেষ চালান (highest challan_no) এডিট করা যায়
  const { data: latest } = await supabase
    .from("delivery_challans").select("challan_no").order("challan_no", { ascending: false }).limit(1).maybeSingle();

  const blocked =
    latest?.challan_no !== challan.challan_no
      ? "শুধু সর্বশেষ চালানটাই এডিট করা যায় — এর পরে নতুন চালান তৈরি হয়ে গেছে।"
      : challan.delivery_status === "challan_received"
        ? "Challan Received হয়ে যাওয়া চালান আর এডিট করা যায় না।"
        : null;

  if (blocked) {
    return (
      <div className="p-2">
        <h1 className="text-2xl font-semibold mb-2">চালান এডিট — {challan.challan_no}</h1>
        <p className="text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded-lg p-3">{blocked}</p>
        <Link href="/dashboard/sales/delivery-challan" className="text-sm text-blue-700 hover:underline mt-3 inline-block">
          ← Delivery Challans
        </Link>
      </div>
    );
  }

  const [{ data: customers }, { data: bookings }, { data: warehouses }, { data: allItems }, { data: fgStock }, { data: dcLedger }] =
    await Promise.all([
      supabase.from("customers").select("id, name").order("name"),
      supabase.from("bookings")
        .select("id, booking_no, quantity_pcs, product_id, customer_id, warehouse_id, style, garments_name, buyers(name), merchants(name), delivery_point, customer_booking_ref, finished_goods(product_name)")
        .neq("status", "cancelled").order("booking_date", { ascending: false }),
      supabase.from("warehouses").select("id, name").order("name"),
      supabase.from("delivery_challan_items").select("quantity_pcs, booking_id, challan_id"),
      supabase.from("finished_goods_stock").select("product_id, warehouse_id, quantity_pcs"),
      supabase.from("stock_ledger").select("item_id, warehouse_id").eq("reference_type", "delivery").eq("reference_id", id),
    ]);

  // deliveredMap — এই চালানের নিজের item বাদ দিয়ে (তাহলে Remaining ঠিক দেখাবে)
  const deliveredMap: Record<string, number> = {};
  (allItems ?? []).forEach((it: any) => {
    if (!it.booking_id || it.challan_id === id) return;
    deliveredMap[it.booking_id] = (deliveredMap[it.booking_id] ?? 0) + Number(it.quantity_pcs || 0);
  });

  const stockByProduct: Record<string, Record<string, number>> = {};
  (fgStock ?? []).forEach((s: any) => {
    if (!s.product_id || !s.warehouse_id) return;
    (stockByProduct[s.product_id] ??= {})[s.warehouse_id] =
      (stockByProduct[s.product_id][s.warehouse_id] ?? 0) + (s.quantity_pcs ?? 0);
  });

  const whByProduct: Record<string, string> = {};
  (dcLedger ?? []).forEach((l: any) => { if (l.item_id && l.warehouse_id) whByProduct[l.item_id] = l.warehouse_id; });

  const editChallan: EditChallanContext = {
    id: challan.id,
    challanNo: challan.challan_no,
    challanDate: challan.challan_date,
    customerId: challan.customer_id,
    lines: (challan.delivery_challan_items ?? []).map((i: any) => ({
      bookingId: i.booking_id,
      qty: Number(i.quantity_pcs || 0),
      packets: Number(i.packets || 0),
      printLabel: i.print_label ?? "",
      warehouseId: whByProduct[i.product_id] ?? "",
    })),
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">চালান এডিট — {challan.challan_no}</h1>
        <Link href="/dashboard/sales/delivery-challan" className="text-sm text-gray-500 hover:underline">← Delivery Challans</Link>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Quantity / Packets / Warehouse / তারিখ বদলান। সেভ করলে আগের স্টক ও হিসাব উল্টে নতুন করে বসবে, চালান নম্বর একই থাকবে।
      </p>
      <DeliveryChallanForm
        customers={customers ?? []}
        bookings={(bookings ?? []) as any}
        warehouses={warehouses ?? []}
        deliveredMap={deliveredMap}
        stockByProduct={stockByProduct}
        editChallan={editChallan}
      />
    </div>
  );
}
