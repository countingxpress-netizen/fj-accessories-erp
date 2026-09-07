// LBS Invoicing — job-work / "Party Bill" ধরনের ইনভয়েসের হিসাব।
//
// customers.lbs_invoicing_enabled = true হলে ঐ কাস্টমারের Sales Invoice এইভাবে হয়:
//   • প্রতিটা booking = একটা "প্রোডাক্ট রো" — Description + Measurement + Qty + Required Lbs
//     (কোনো টাকা নয়)।
//   • তারপর ৫টা "চার্জ রো":
//       Powder Bill [PE/PP/RLD]  = মোট Required Lbs × materialRatePerLbs
//       Making Cutting Bill       = একই Lbs × makingCuttingRate
//       Printing Bill             = Print করা মোট Pcs × printRate
//       Non-Print                 = Print ছাড়া Pcs × 0
//       Adhesive Bill             = Σ(cutting-inch × Pcs)  × adhesiveRate
//   • প্রতি চার্জ Amount = ROUND(rate × qty, 0)।  Invoice Total = চার্জ যোগফল।
//
// Required Lbs (প্রতি লাইন) = ceil( qty × tubeInch × cuttingInch × Order Thickness / 75000 )
// — lib/calcTubeCutting.ts → calcRequiredLbs()-এর হুবহু সূত্র (Order thickness, ১% buffer নয়)।

import { calcTubeCutting, toInches, hasAdhesiveCharge } from "./calcTubeCutting";

export type LbsBooking = {
  id: string;
  product_id: string | null;
  quantity_pcs: number;
  thickness_mm: number | null; // Order thickness
  material_type: string | null;
  measurement_type: string;
  measurement_unit: string;
  length_val: number | null;
  width_val: number | null;
  flap_val: number | null;
  gusset_val: number | null;
  pillow_val: number | null;
  has_print: boolean | null;
  print_colors: number | null;
  rate_per_color: number | null;
  rate_per_inch: number | null;
};

export type LbsRates = {
  materialRatePerLbs: number; // customers.price_per_lbs (তারিখ ধরে resolve)
  makingCuttingRate: number; // customers.making_cutting_rate
  bigBagDoublePrint?: boolean; // cutting > 29" হলে print rate দ্বিগুণ (default true, editable)
};

export type LbsProductLine = {
  line_type: "lbs_product";
  booking_id: string;
  product_id: string | null;
  label: string; // Item Description
  measurement: string;
  quantity_pcs: number;
  required_lbs: number;
};

export type LbsChargeType =
  | "lbs_powder"
  | "lbs_making"
  | "lbs_printing"
  | "lbs_nonprint"
  | "lbs_adhesive";

export type LbsChargeLine = {
  line_type: LbsChargeType;
  label: string; // col D — "Powder Bill PE" ইত্যাদি
  quantity_pcs: number; // qty basis (Lbs / Pcs / Inch)
  unit_price: number; // rate
  amount: number; // ROUND(rate × qty, 0)
};

const round0 = (n: number) => Math.round(n);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Order thickness ধরে এই লাইনের Required Lbs (ভগ্নাংশ থাকলে উপরে — Math.ceil)। */
export function lbsRequiredLbs(b: LbsBooking): number {
  const thickness = b.thickness_mm ?? 0;
  if (!thickness || !b.quantity_pcs) return 0;
  const { tube, cutting } = calcTubeCutting(b);
  const { tubeInch, cuttingInch } = toInches(
    tube, cutting, b.measurement_unit, b.material_type ?? "", !!b.has_print,
  );
  if (!tubeInch || !cuttingInch) return 0;
  return Math.ceil((b.quantity_pcs * tubeInch * cuttingInch * thickness) / 75000);
}

/** এই লাইনের cutting মাপ inch-এ (Adhesive Bill-এর qty basis)। */
export function lbsCuttingInch(b: LbsBooking): number {
  const { tube, cutting } = calcTubeCutting(b);
  const { cuttingInch } = toInches(
    tube, cutting, b.measurement_unit, b.material_type ?? "", !!b.has_print,
  );
  return cuttingInch;
}

/** material_type → Powder Bill লেবেলের suffix। */
export function lbsMaterialLabel(materialType: string | null | undefined): string {
  if (materialType === "pp") return "PP";
  if (materialType === "pe_rld") return "PE (RLD)";
  return "PE"; // pe_standard, custom, null
}

/** প্রোডাক্ট রো-র Item Description — "PE  02 color 9 mm" ধরনের। */
export function lbsItemDescription(b: LbsBooking): string {
  const mat = lbsMaterialLabel(b.material_type);
  const parts: string[] = [mat];
  if (b.has_print) {
    const colors = String(b.print_colors ?? 0).padStart(2, "0");
    parts.push(`${colors} color`);
  } else {
    parts.push("Non-Print");
  }
  if (b.thickness_mm) parts.push(`${b.thickness_mm} mm`);
  return parts.join("  ");
}

/** স্ট্যান্ডার্ড print page-এর মতোই measurement স্ট্রিং। */
export function lbsFormatMeasurement(b: LbsBooking): string {
  const u = b.measurement_unit;
  const L = b.length_val, W = b.width_val, F = b.flap_val, G = b.gusset_val, P = b.pillow_val;
  if (b.measurement_type === "simple") return `L-${L} x W-${W} ${u}`;
  if (b.measurement_type === "gusset") return `L-${L} x W-${W} + G-${G} ${u}`;
  if (b.measurement_type === "adhesive") return `L-${L} + F-${F} x W-${W} ${u}`;
  if (b.measurement_type === "flap_gusset") return `L-${L} + F-${F} + G-${G} x W-${W} ${u}`;
  if (b.measurement_type === "pillow") return `L-${L} + P-${P} x W-${W} ${u}`;
  return "-";
}

export type LbsInvoiceResult = {
  productLines: LbsProductLine[];
  chargeLines: LbsChargeLine[];
  total: number;
};

/**
 * booking-গুলো + কাস্টমার rate থেকে LBS invoice-এর সব লাইন ও Total বানায়।
 * Printing/Adhesive-এ প্রতি চার্জ লাইন একটাই rate ধরে (প্রথম প্রযোজ্য booking থেকে) —
 * print page/ফর্মে rate editable, তাই মিশ্র রঙ হলে হাতে ঠিক করা যাবে।
 */
export function buildLbsLines(bookings: LbsBooking[], rates: LbsRates): LbsInvoiceResult {
  const bigBag = rates.bigBagDoublePrint ?? true;

  const productLines: LbsProductLine[] = bookings.map((b) => ({
    line_type: "lbs_product",
    booking_id: b.id,
    product_id: b.product_id,
    label: lbsItemDescription(b),
    measurement: lbsFormatMeasurement(b),
    quantity_pcs: b.quantity_pcs || 0,
    required_lbs: lbsRequiredLbs(b),
  }));

  const totalLbs = productLines.reduce((s, l) => s + l.required_lbs, 0);
  const printedPcs = bookings.filter((b) => b.has_print).reduce((s, b) => s + (b.quantity_pcs || 0), 0);
  const nonPrintPcs = bookings.filter((b) => !b.has_print).reduce((s, b) => s + (b.quantity_pcs || 0), 0);

  const adhesiveBookings = bookings.filter((b) => hasAdhesiveCharge(b.measurement_type));
  const adhesiveInch = round2(
    adhesiveBookings.reduce((s, b) => s + lbsCuttingInch(b) * (b.quantity_pcs || 0), 0),
  );

  // Printing rate — প্রথম print-করা booking: colors × rate_per_color × (বড় ব্যাগ ? 2 : 1)
  const firstPrint = bookings.find((b) => b.has_print);
  let printRate = 0;
  if (firstPrint) {
    const colors = firstPrint.print_colors || 0;
    const perColor = firstPrint.rate_per_color || 0;
    const factor = bigBag && lbsCuttingInch(firstPrint) > 29 ? 2 : 1;
    printRate = round2(colors * perColor * factor);
  }

  // Adhesive rate — প্রথম adhesive/flap_gusset booking-এর rate_per_inch
  const adhesiveRate = adhesiveBookings.length ? round2(adhesiveBookings[0].rate_per_inch || 0) : 0;

  const materialLabel = lbsMaterialLabel(bookings[0]?.material_type);

  const mk = (line_type: LbsChargeType, label: string, qty: number, rate: number): LbsChargeLine => ({
    line_type, label, quantity_pcs: round2(qty), unit_price: round2(rate), amount: round0(round2(rate) * round2(qty)),
  });

  const chargeLines: LbsChargeLine[] = [
    mk("lbs_powder", `Powder Bill ${materialLabel}`, totalLbs, rates.materialRatePerLbs),
    mk("lbs_making", "Making Cutting Bill", totalLbs, rates.makingCuttingRate),
    mk("lbs_printing", "Printing Bill", printedPcs, printRate),
    mk("lbs_nonprint", "Non-Print", nonPrintPcs, 0),
    mk("lbs_adhesive", "Adhesive Bill", adhesiveInch, adhesiveRate),
  ];

  const total = chargeLines.reduce((s, l) => s + l.amount, 0);
  return { productLines, chargeLines, total };
}
