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

/**
 * production_orders (joined with bookings) থেকে প্রতিটা স্টেজের জন্য একটা করে StageRow
 * বানায় — Production Orders পেজ (active) এবং Complete Production পেজ (finished),
 * দুই জায়গাতেই এই একই লজিক ব্যবহার হয় যাতে সারি-গঠন সবসময় মেলে।
 */
export function buildStageRows(orders: any[]) {
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

  return { blowingRows, printingRows, cuttingRows };
}

export const PRODUCTION_ORDER_SELECT = `
  id, booking_id, product_id, required_lbs, quantity_pcs, stage,
  blowing_completed_at, printing_completed_at, cutting_completed_at,
  blowing_produced_lbs, printing_produced_pcs, cutting_produced_pcs,
  bookings (
    booking_no, booking_group_id, has_print, warehouse_id, measurement_type, measurement_unit,
    length_val, width_val, flap_val, gusset_val, pillow_val,
    customers (name), finished_goods (product_name)
  )
`;
