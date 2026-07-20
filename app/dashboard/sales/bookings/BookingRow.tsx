"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/formatDate";

const statusLabels: Record<string, string> = {
  open: "Open",
  in_production: "In Production",
  partially_delivered: "Partially Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
};
const statusColors: Record<string, string> = {
  open: "bg-gray-100 text-gray-700",
  in_production: "bg-blue-100 text-blue-700",
  partially_delivered: "bg-orange-100 text-orange-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

export default function BookingRow({
  booking, serial, isGroupStart, groupSize,
}: { booking: any; serial?: number; isGroupStart?: boolean; groupSize?: number }) {
  const router = useRouter();
  const supabase = createClient();

  async function handleDelete() {
    if (!window.confirm(`Booking "${booking.booking_no}" মুছে ফেলতে চান? এর সাথে যুক্ত Production Order, স্টক কর্তন সবকিছু ফেরত/মুছে যাবে।`)) return;

    const { data: challanItems } = await supabase.from("delivery_challans").select("id").eq("booking_id", booking.id);
    const { data: invoiceItems } = await supabase.from("sales_invoice_items").select("id").eq("booking_id", booking.id);
    if ((challanItems && challanItems.length > 0) || (invoiceItems && invoiceItems.length > 0)) {
      alert("এই বুকিং-এর সাথে ইতিমধ্যে Delivery Challan বা Sales Invoice যুক্ত আছে, তাই মুছে ফেলা যাবে না।");
      return;
    }

    const { data: prodOrders } = await supabase.from("production_orders").select("id").eq("booking_id", booking.id);
    for (const po of prodOrders ?? []) {
      const { data: consumptions } = await supabase.from("material_consumption").select("*").eq("production_id", po.id);
      for (const c of consumptions ?? []) {
        const { data: ledgerEntry } = await supabase
          .from("stock_ledger").select("*")
          .eq("reference_type", "production").eq("reference_id", po.id).eq("item_id", c.material_id).maybeSingle();
        if (ledgerEntry) {
          const { data: stock } = await supabase
            .from("raw_material_stock").select("*")
            .eq("material_id", c.material_id).eq("warehouse_id", ledgerEntry.warehouse_id).maybeSingle();
          if (stock) {
            await supabase.from("raw_material_stock")
              .update({ quantity_lbs: stock.quantity_lbs + c.quantity_lbs, updated_at: new Date().toISOString() })
              .eq("id", stock.id);
          }
          await supabase.from("stock_ledger").delete().eq("id", ledgerEntry.id);
        }
      }
      await supabase.from("material_consumption").delete().eq("production_id", po.id);
    }
    await supabase.from("production_orders").delete().eq("booking_id", booking.id);
    await supabase.from("booking_materials").delete().eq("booking_id", booking.id);

    const { error } = await supabase.from("bookings").delete().eq("id", booking.id);
    if (error) {
      alert("মুছে ফেলা যায়নি: " + error.message);
      return;
    }
    router.refresh();
  }

  const groupBg = groupSize && groupSize > 1 ? "bg-blue-50/40" : "";

  return (
    <tr className={`border-t ${groupBg} ${isGroupStart && groupSize && groupSize > 1 ? "border-t-2 border-t-blue-200" : ""}`}>
      <td className="px-4 py-2 text-gray-500">{serial ?? ""}</td>
      <td className="px-4 py-2 font-medium">
        {booking.booking_no}
        {groupSize && groupSize > 1 && (
          <span className="ml-1 text-xs text-blue-600">({groupSize}টি প্রোডাক্ট)</span>
        )}
      </td>
      <td className="px-4 py-2 text-gray-500">{formatDate(booking.booking_date)}</td>
      <td className="px-4 py-2">{booking.customers?.name ?? "-"}</td>
      <td className="px-4 py-2 text-gray-500">{booking.buyers?.name ?? "-"}</td>
      <td className="px-4 py-2 text-gray-500">{booking.garments_name ?? "-"}</td>
      <td className="px-4 py-2">{booking.finished_goods?.product_name ?? "-"}</td>
      <td className="px-4 py-2 text-right">{booking.quantity_pcs?.toLocaleString()}</td>
      <td className="px-4 py-2 text-right">{booking.required_lbs?.toFixed(2)}</td>
      <td className="px-4 py-2">
        <span className={`rounded-full px-2 py-0.5 text-xs ${statusColors[booking.status] ?? ""}`}>
          {statusLabels[booking.status] ?? booking.status}
        </span>
      </td>
      <td className="px-4 py-2 text-right">
        <details className="relative inline-block text-left">
          <summary className="cursor-pointer list-none rounded bg-gray-100 px-3 py-1 text-xs text-gray-700 hover:bg-gray-200 select-none">
            Action ▾
          </summary>
          <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border bg-white shadow-lg py-1 text-left">
            <Link href={`/dashboard/sales/bookings/${booking.id}`} className="block px-3 py-1.5 text-xs hover:bg-gray-50">View</Link>
            <Link href={`/dashboard/sales/bookings/${booking.id}/edit`} className="block px-3 py-1.5 text-xs hover:bg-gray-50">Edit</Link>
            <button onClick={handleDelete} className="block w-full text-left px-3 py-1.5 text-xs text-red-700 hover:bg-red-50">Delete</button>
            <div className="border-t my-1"></div>
            <Link href={`/dashboard/sales/bookings/${booking.id}/schedule?type=blowing`} target="_blank" className="block px-3 py-1.5 text-xs hover:bg-gray-50">Blowing Schedule</Link>
            {booking.has_print && (
              <Link href={`/dashboard/sales/bookings/${booking.id}/schedule?type=printing`} target="_blank" className="block px-3 py-1.5 text-xs hover:bg-gray-50">Printing Schedule</Link>
            )}
            <Link href={`/dashboard/sales/bookings/${booking.id}/schedule?type=cutting`} target="_blank" className="block px-3 py-1.5 text-xs hover:bg-gray-50">Cutting Schedule</Link>
          </div>
        </details>
      </td>
    </tr>
  );
}