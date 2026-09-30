import { resolveRate } from "@/lib/rateHistory";
import { calcQuotedUnitPrice } from "@/lib/calcTubeCutting";

// Booking Group → BookingForm-এর editContext (হেডার + প্রোডাক্ট তালিকা)। Booking Edit ও Booking
// Clone — দুটোতেই একই হেল্পার (Clone-এ sourceBookingId/progress বাদ দিয়ে ব্যবহার হয়)।

const CM_PER_INCH = 2.54;

export type BookingItemProgress = {
  /** "Blowing সম্পন্ন", "Challan: 1,200 pcs" ইত্যাদি — এডিট ফর্মে সতর্কবার্তায় দেখানো হয় */
  notes: string[];
  deliveredPcs: number;
  producedPcs: number;
};

export function buildBookingItems(
  bookings: any[],
  opts: {
    warehouses: { id: string; name: string }[];
    customer: any | null;
    priceHistory: { customer_id: string; effective_from: string; rate: number; material_type: string }[];
    progressById?: Record<string, BookingItemProgress>;
  },
) {
  const warehouseName: Record<string, string> = {};
  opts.warehouses.forEach((w) => (warehouseName[w.id] = w.name));

  const first = bookings[0];
  // Booking Date-এ কার্যকর Price/Lbs — পুরনো Adjust/Pc implied ভাবে বের করতে লাগে
  // (quoted_unit_price − formula দাম)। ফর্ম আলাদা adjustment কলাম রাখে না।
  const bucket: "pe" | "pp" = first?.material_type === "pp" ? "pp" : "pe";
  const history = opts.priceHistory.filter((h) => h.customer_id === first?.customer_id && h.material_type === bucket);
  const priceForBucket = bucket === "pp" ? opts.customer?.price_per_lbs_pp : opts.customer?.price_per_lbs_pe;
  const effRate = resolveRate(history, first?.booking_date, Number(priceForBucket ?? 0));

  return bookings.map((b: any) => {
    const fg = b.finished_goods;
    const materialsNeeded = (b.booking_materials ?? [])
      .map((bm: any) => ({ name: bm.raw_materials?.material_name ?? "", qty: Number(bm.quantity_lbs) || 0 }))
      .filter((m: any) => m.name && m.qty > 0);
    const finalLbs = Number(b.required_lbs) || 0;
    const storedUnit = Number(b.quoted_unit_price) || 0;
    const formulaUnit = calcQuotedUnitPrice(b, effRate, Number(b.thickness_mm) || 0);
    const impliedAdj = formulaUnit > 0 && storedUnit > 0 ? Math.round((storedUnit - formulaUnit) * 100) / 100 : 0;
    return {
      sourceBookingId: b.id as string,
      progress: opts.progressById?.[b.id],
      style: b.style ?? "",
      customerBookingRef: b.customer_booking_ref ?? "",
      poNo: b.po_no ?? "",
      printLayoutNote: b.print_layout_note ?? "",
      printLayoutFileUrl: b.print_layout_file_url ?? "",
      productDetails: b.product_details ?? "",
      measurementType: b.measurement_type,
      unit: b.measurement_unit,
      lengthVal: Number(b.length_val) || 0,
      widthVal: Number(b.width_val) || 0,
      flapVal: Number(b.flap_val) || 0,
      gussetVal: Number(b.gusset_val) || 0,
      pillowVal: Number(b.pillow_val) || 0,
      thicknessMm: Number(b.thickness_mm) || 0,
      productionThicknessMm: Number(b.production_thickness_mm) || 0,
      piThicknessMm: Number(b.pi_thickness_mm) || 0,
      materialType: b.material_type,
      quantity: Number(b.quantity_pcs) || 0,
      warehouseId: b.warehouse_id ?? "",
      warehouseName: warehouseName[b.warehouse_id] ?? "-",
      finalLbs,
      kg: Number(b.required_kg) || finalLbs * 0.453592,
      bags: Number(b.required_bags) || finalLbs / 55,
      materialsNeeded,
      lengthCm: Number(fg?.length_cm) || (b.measurement_unit === "cm" ? Number(b.length_val) : Number(b.length_val) * CM_PER_INCH) || 0,
      widthCm: Number(fg?.width_cm) || (b.measurement_unit === "cm" ? Number(b.width_val) : Number(b.width_val) * CM_PER_INCH) || 0,
      hasPrint: !!b.has_print,
      printColors: Number(b.print_colors) || 0,
      ratePerColor: Number(b.rate_per_color) || 0.20,
      ratePerInch: Number(b.rate_per_inch) || 0.02,
      adjustmentPerPc: impliedAdj,
      unitPrice: Number(b.quoted_unit_price) || 0,
      amount: Number(b.quoted_amount) || 0,
    };
  });
}

/** booking group-এর শেয়ার করা হেডার ফিল্ড (প্রথম booking থেকে) */
export function bookingHeader(first: any) {
  return {
    bookingNo: first.booking_no as string,
    bookingDate: first.booking_date as string,
    customerId: first.customer_id as string,
    customerName: first.customers?.name ?? "",
    buyerId: first.buyer_id ?? null,
    buyerName: first.buyers?.name ?? null,
    garmentsId: first.garments_id ?? null,
    garmentsName: first.garments_name ?? null,
    merchantId: first.merchant_id ?? null,
    merchantName: first.merchants?.name ?? null,
    deliveryPoint: first.delivery_point ?? "",
  };
}

/** Booking Edit/Clone পেজে booking group আনার select */
export const BOOKING_GROUP_SELECT = `*, customers(name), buyers(name), merchants(name),
  finished_goods(length_cm, width_cm, thickness),
  booking_materials(quantity_lbs, raw_materials(material_name)),
  production_orders(id, stage, blowing_completed_at, printing_completed_at, cutting_completed_at,
    blowing_produced_lbs, printing_produced_pcs, cutting_produced_pcs)`;
