import { createClient } from "@/lib/supabase/server";
import ProductionStageRow from "./ProductionStageRow";
import { formatMeasurement } from "@/lib/formatMeasurement";

export type StageRow = {
  key: string;
  productionOrderId: string;
  groupId: string;
  stageType: "blowing" | "printing" | "cutting";
  bookingId: string;
  bookingNo: string;
  customerName: string;
  productName: string;
  measurement: string;
  target: number;
  produced: number;
  quantityUnit: "Lbs" | "Pcs";
  completed: boolean;
  productId: string;
  warehouseId: string | null;
};

export default async function ProductionOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const activeTab = tab === "printing" || tab === "cutting" ? tab : "blowing";

  const supabase = await createClient();

  const { data: orders } = await supabase
    .from("production_orders")
    .select(
      `
      id, booking_id, product_id, required_lbs, quantity_pcs,
      blowing_completed_at, printing_completed_at, cutting_completed_at,
      blowing_produced_lbs, printing_produced_pcs, cutting_produced_pcs,
      bookings (
        booking_no, booking_group_id, has_print, warehouse_id, measurement_type, measurement_unit,
        length_val, width_val, flap_val, gusset_val,
        customers (name), finished_goods (product_name)
      )
    `
    )
    .order("order_date", { ascending: false });

  const blowingRows: StageRow[] = [];
  const printingRows: StageRow[] = [];
  const cuttingRows: StageRow[] = [];

  (orders ?? []).forEach((o: any) => {
    const b = o.bookings;
    if (!b) return;
    const measurement = formatMeasurement(b);
    const customerName = b.customers?.name ?? "-";
    const productName = b.finished_goods?.product_name ?? "-";
    const groupId = b.booking_group_id ?? o.booking_id;

    blowingRows.push({
      key: `${o.id}-blowing`,
      productionOrderId: o.id,
      groupId,
      stageType: "blowing",
      bookingId: o.booking_id,
      bookingNo: b.booking_no,
      customerName,
      productName,
      measurement,
      target: o.required_lbs ?? 0,
      produced: o.blowing_produced_lbs ?? 0,
      quantityUnit: "Lbs",
      completed: !!o.blowing_completed_at,
      productId: o.product_id,
      warehouseId: b.warehouse_id,
    });

    if (b.has_print) {
      printingRows.push({
        key: `${o.id}-printing`,
        productionOrderId: o.id,
        groupId,
        stageType: "printing",
        bookingId: o.booking_id,
        bookingNo: b.booking_no,
        customerName,
        productName,
        measurement,
        target: o.quantity_pcs ?? 0,
        produced: o.printing_produced_pcs ?? 0,
        quantityUnit: "Pcs",
        completed: !!o.printing_completed_at,
        productId: o.product_id,
        warehouseId: b.warehouse_id,
      });
    }

    cuttingRows.push({
      key: `${o.id}-cutting`,
      productionOrderId: o.id,
      groupId,
      stageType: "cutting",
      bookingId: o.booking_id,
      bookingNo: b.booking_no,
      customerName,
      productName,
      measurement,
      target: o.quantity_pcs ?? 0,
      produced: o.cutting_produced_pcs ?? 0,
      quantityUnit: "Pcs",
      completed: !!o.cutting_completed_at,
      productId: o.product_id,
      warehouseId: b.warehouse_id,
    });
  });

  const tabData: Record<string, { label: string; rows: StageRow[] }> = {
    blowing: { label: "Blowing", rows: blowingRows },
    printing: { label: "Printing", rows: printingRows },
    cutting: { label: "Cutting", rows: cuttingRows },
  };

  const currentRows = tabData[activeTab].rows;
  const tabKeys = Object.keys(tabData);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Production Orders</h1>
      <p className="text-sm text-gray-500 mb-4">
        প্রতিটা স্টেজে কত উৎপাদন হয়েছে তা লিখে সেভ করুন — Target-এ পৌঁছালে স্বয়ংক্রিয়ভাবে &quot;OK&quot; হয়ে যাবে।
      </p>

      <div className="flex gap-2 mb-4">
        {tabKeys.map((key) => {
          const info = tabData[key];
          return (
            <a
              key={key}
              href={`/dashboard/production/orders?tab=${key}`}
              className={
                activeTab === key
                  ? "rounded-lg px-4 py-2 text-sm bg-gray-900 text-white"
                  : "rounded-lg px-4 py-2 text-sm border text-gray-600 hover:bg-gray-50"
              }
            >
              {info.label} ({info.rows.length})
            </a>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Booking No</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Product</th>
              <th className="px-4 py-2">Measurement</th>
              <th className="px-4 py-2 text-right">Target</th>
              <th className="px-4 py-2 text-right">Remaining</th>
              <th className="px-4 py-2 w-40">Produced</th>
              <th className="px-4 py-2">Stage</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {currentRows.map((r) => (
              <ProductionStageRow key={r.key} row={r} />
            ))}
            {currentRows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-3 text-gray-400 italic">
                  এই তালিকায় এখনো কিছু নেই
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}