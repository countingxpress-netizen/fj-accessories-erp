"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/formatDate";

function formatMeasurement(b: any) {
  const unit = b.measurement_unit;
  const L = b.length_val, W = b.width_val, F = b.flap_val, G = b.gusset_val;

  if (b.measurement_type === "simple") return `L-${L} x W-${W} ${unit}`;
  if (b.measurement_type === "gusset") return `L-${L} x W-${W} + G-${G} ${unit}`;
  if (b.measurement_type === "adhesive") return `L-${L} + F-${F} x W-${W} ${unit}`;
  return "-";
}

function getStatusLabel(booking: any, deliveredQty: number) {
  const po = booking.production_orders?.[0];

  if (deliveredQty >= booking.quantity_pcs && booking.quantity_pcs > 0) {
    return { label: "Delivery Done", color: "bg-green-100 text-green-700" };
  }
  if (deliveredQty > 0) {
    return { label: "Partially Delivered", color: "bg-orange-100 text-orange-700" };
  }
  if (po?.cutting_completed_at) {
    return { label: "Cutting OK", color: "bg-purple-100 text-purple-700" };
  }
  if (po?.printing_completed_at) {
    return { label: "Printing OK", color: "bg-indigo-100 text-indigo-700" };
  }
  if (po?.blowing_completed_at) {
    return { label: "Blowing OK", color: "bg-blue-100 text-blue-700" };
  }
  return { label: "Booking Received", color: "bg-gray-100 text-gray-700" };
}

export default function BookingRow({
  booking, serial, isGroupStart, groupSize, deliveredQty,
}: { booking: any; serial?: number; isGroupStart?: boolean; groupSize?: number; deliveredQty: number }) {
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
  const status = getStatusLabel(booking, deliveredQty);
  const groupKey = booking.booking_group_id ?? booking.id;

  const piNo = booking.pi_bookings?.[0]?.proforma_invoices?.pi_no ?? null;

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
      <td className="px-4 py-2 text-sm">{formatMeasurement(booking)}</td>
      <td className="px-4 py-2 text-right">{booking.quantity_pcs?.toLocaleString()}</td>
      <td className="px-4 py-2 text-right">{booking.required_lbs?.toFixed(2)}</td>
      <td className="px-4 py-2">
        <span className={`rounded-full px-2 py-0.5 text-xs ${status.color}`}>{status.label}</span>
      </td>
      <td className="px-4 py-2 font-medium text-xs">
        {piNo ? (
          <span className="text-blue-700">{piNo}</span>
        ) : (
          <span className="text-gray-400">-</span>
        )}
      </td>
      <td className="px-4 py-2 text-right">
        <details className="relative inline-block text-left">
          <summary className="cursor-pointer list-none rounded bg-gray-100 px-3 py-1 text-xs text-gray-700 hover:bg-gray-200 select-none">
            Action ▾
          </summary>
          <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border bg-white shadow-lg py-1 text-left">
            <Link href={`/dashboard/sales/bookings/${booking.id}`} className="block px-3 py-1.5 text-xs hover:bg-gray-50">View</Link>
            <Link href={`/dashboard/sales/bookings/${booking.id}/edit`} className="block px-3 py-1.5 text-xs hover:bg-gray-50">Edit</Link>
            <button onClick={handleDelete} className="block w-full text-left px-3 py-1.5 text-xs text-red-700 hover:bg-red-50">Delete</button>
            <div className="border-t my-1"></div>
            <Link href={`/dashboard/production/schedule-group/${groupKey}`} target="_blank" className="block px-3 py-1.5 text-xs hover:bg-gray-50">Schedule</Link>
          </div>
        </details>
      </td>
    </tr>
  );
}