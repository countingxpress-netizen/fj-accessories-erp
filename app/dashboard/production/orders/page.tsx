import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ProductionStageRow from "./ProductionStageRow";

export type StageRow = {
  key: string;
  productionOrderId: string;
  stageType: "blowing" | "printing" | "cutting";
  bookingId: string;
  bookingNo: string;
  customerName: string;
  productName: string;
  measurement: string;
  quantity: number;
  quantityUnit: "Lbs" | "Pcs";
  completed: boolean;
};

export default async function ProductionOrdersPage() {
  const supabase = await createClient();

  const { data: orders } = await supabase
    .from("production_orders")
    .select(`
      id, booking_id, required_lbs, quantity_pcs,
      blowing_completed_at, printing_completed_at, cutting_completed_at,
      bookings (
        booking_no, has_print, measurement_type, measurement_unit,
        length_val, width_val, flap_val, gusset_val,
        customers (name), finished_goods (product_name)
      )
    `)
    .order("order_date", { ascending: false });

  const { formatMeasurement } = await import("@/lib/formatMeasurement");

  const rows: StageRow[] = [];
  (orders ?? []).forEach((o: any) => {
    const b = o.bookings;
    if (!b) return;
    const measurement = formatMeasurement(b);
    const customerName = b.customers?.name ?? "-";
    const productName = b.finished_goods?.product_name ?? "-";

    rows.push({
      key: `${o.id}-blowing`, productionOrderId: o.id, stageType: "blowing",
      bookingId: o.booking_id, bookingNo: b.booking_no, customerName, productName, measurement,
      quantity: o.required_lbs ?? 0, quantityUnit: "Lbs", completed: !!o.blowing_completed_at,
    });

    if (b.has_print) {
      rows.push({
        key: `${o.id}-printing`, productionOrderId: o.id, stageType: "printing",
        bookingId: o.booking_id, bookingNo: b.booking_no, customerName, productName, measurement,
        quantity: o.quantity_pcs ?? 0, quantityUnit: "Pcs", completed: !!o.printing_completed_at,
      });
    }

    rows.push({
      key: `${o.id}-cutting`, productionOrderId: o.id, stageType: "cutting",
      bookingId: o.booking_id, bookingNo: b.booking_no, customerName, productName, measurement,
      quantity: o.quantity_pcs ?? 0, quantityUnit: "Pcs", completed: !!o.cutting_completed_at,
    });
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Production Orders</h1>
      <p className="text-sm text-gray-500 mb-4">
        Booking Receive করার সাথে সাথেই Blowing/Printing/Cutting শিডিউল এখানে আলাদা আলাদা সারিতে চলে আসে।
      </p>

      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Production Type</th>
              <th className="px-4 py-2">Booking No</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Product</th>
              <th className="px-4 py-2">Measurement</th>
              <th className="px-4 py-2 text-right">Quantity</th>
              <th className="px-4 py-2 text-center">Production</th>
              <th className="px-4 py-2">Stage</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => <ProductionStageRow key={r.key} row={r} />)}
            {rows.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-3 text-gray-400 italic">এখনো কোনো Production Schedule নেই</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}