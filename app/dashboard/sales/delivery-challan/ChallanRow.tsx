"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/formatDate";
import DeliveryStatusBadge from "./DeliveryStatusBadge";
import { recalcBookingStatus } from "@/lib/recalcBookingStatus";

export default function ChallanRow({ challan }: { challan: any }) {
  const router = useRouter();
  const supabase = createClient();

  const items = challan.delivery_challan_items ?? [];
  const totalQty = items.reduce((s: number, i: any) => s + i.quantity_pcs, 0);
  const productNames = Array.from(new Set(items.map((i: any) => i.finished_goods?.product_name))).join(", ");

  async function handleDelete() {
    if (!window.confirm(`Challan "${challan.challan_no}" মুছে ফেলতে চান? স্টক আগের অবস্থায় ফিরে আসবে।`)) return;

    // স্টক ফেরত দিন (item ধরে ধরে, warehouse চিনতে stock_ledger থেকে খুঁজে বের করি)
    const { data: ledgerEntries } = await supabase
      .from("stock_ledger").select("*").eq("reference_type", "delivery").eq("reference_id", challan.id);

    for (const entry of ledgerEntries ?? []) {
      const { data: stock } = await supabase
        .from("finished_goods_stock").select("*")
        .eq("product_id", entry.item_id).eq("warehouse_id", entry.warehouse_id).maybeSingle();
      if (stock) {
        await supabase.from("finished_goods_stock")
          .update({ quantity_pcs: stock.quantity_pcs + entry.quantity, updated_at: new Date().toISOString() })
          .eq("id", stock.id);
      } else {
        await supabase.from("finished_goods_stock").insert({
          product_id: entry.item_id, warehouse_id: entry.warehouse_id, quantity_pcs: entry.quantity,
        });
      }
    }
    await supabase.from("stock_ledger").delete().eq("reference_type", "delivery").eq("reference_id", challan.id);
    await supabase.from("delivery_challan_items").delete().eq("challan_id", challan.id);
    const { error } = await supabase.from("delivery_challans").delete().eq("id", challan.id);

    if (error) {
      alert("মুছে ফেলা যায়নি: " + error.message);
      return;
    }

    if (challan.booking_id) await recalcBookingStatus(supabase, challan.booking_id);
    router.refresh();
  }

  return (
    <tr className="border-t">
      <td className="px-4 py-2 font-medium">{challan.challan_no}</td>
      <td className="px-4 py-2 text-gray-500">{formatDate(challan.challan_date)}</td>
      <td className="px-4 py-2">{challan.customers?.name ?? "-"}</td>
      <td className="px-4 py-2">{challan.bookings?.booking_no ?? "-"}</td>
      <td className="px-4 py-2">{productNames}</td>
      <td className="px-4 py-2 text-right">{totalQty}</td>
      <td className="px-4 py-2">
        {challan.is_partial ? <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700">Partial</span> : <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">Full</span>}
      </td>

    <td className="px-4 py-2">
        <DeliveryStatusBadge challanId={challan.id} currentStatus={challan.delivery_status ?? "challan_ready"} />
      </td>

      <td className="px-4 py-2 text-right whitespace-nowrap">
        <Link href={`/dashboard/sales/delivery-challan/${challan.id}/print`} target="_blank" className="text-blue-700 hover:underline text-xs mr-2">Print</Link>
        <button onClick={handleDelete} className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100">Delete</button>
      </td>
    </tr>
  );
}