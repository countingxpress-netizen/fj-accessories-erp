import { cmToInch } from "./cmToInch";

const CM_PER_INCH = 2.54;

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

export function calcTubeCutting(booking: any) {
  const L = booking.length_val ?? 0;
  const W = booking.width_val ?? 0;
  const F = booking.flap_val ?? 0;
  const G = booking.gusset_val ?? 0;
  const P = booking.pillow_val ?? 0;

  if (booking.measurement_type === "simple") return { tube: W, cutting: L };
  if (booking.measurement_type === "adhesive") return { tube: L + F / 2, cutting: W };
  if (booking.measurement_type === "flap_gusset") return { tube: L + F / 2 + G, cutting: W };
  if (booking.measurement_type === "pillow") return { tube: L + P, cutting: W };
  return { tube: W + G + G, cutting: L }; // gusset
}

// Adhesive Rate/Inch চার্জ Adhesive আর Flap Gusset — দুই টাইপেই লাগে, দুটোতেই Flap/আঠা থাকে
export function hasAdhesiveCharge(measurementType: string) {
  return measurementType === "adhesive" || measurementType === "flap_gusset";
}

// cm → inch রূপান্তর:
//  • Tube    — PP হলে টেবিল (die সাইজ) অনুযায়ী, নাহলে ÷2.54
//  • Cutting — material নির্বিশেষে: Print থাকলে টেবিল (die/print সাইজ) অনুযায়ী,
//              Print না থাকলে ÷2.54
//  • plainConversion (আইরিশ / দেবনিয়ার গার্মেন্টস) — die-size টেবিল পুরো বাদ,
//    tube ও cutting দুটোই সরল ÷2.54।
export function toInches(
  tube: number,
  cutting: number,
  unit: string,
  materialType: string,
  hasPrint: boolean,
  plainConversion = false
): { tubeInch: number; cuttingInch: number } {
  if (unit !== "cm") return { tubeInch: tube, cuttingInch: cutting };

  if (plainConversion) {
    return { tubeInch: tube / CM_PER_INCH, cuttingInch: cutting / CM_PER_INCH };
  }

  const isPP = materialType === "pp";
  const tubeInch = isPP ? cmToInch(tube) : tube / CM_PER_INCH;
  const cuttingInch = hasPrint ? cmToInch(cutting) : cutting / CM_PER_INCH;

  return { tubeInch, cuttingInch };
}

export function calcRequiredLbs(booking: any, thicknessMm: number): number {
  if (!thicknessMm || !booking.quantity_pcs) return 0;
  const { tube, cutting } = calcTubeCutting(booking);
  const { tubeInch, cuttingInch } = toInches(tube, cutting, booking.measurement_unit, booking.material_type, booking.has_print, !!booking.plain_cm_conversion);
  const baseLbs = (booking.quantity_pcs * tubeInch * cuttingInch * thicknessMm) / 75000;
  return Math.ceil(baseLbs);
}

export function calcPiWeightLbs(booking: any, piThicknessMm: number): number {
  if (!piThicknessMm || !booking.quantity_pcs) return 0;
  const { tube, cutting } = calcTubeCutting(booking);
  const { tubeInch, cuttingInch } = toInches(tube, cutting, booking.measurement_unit, booking.material_type, booking.has_print, !!booking.plain_cm_conversion);
  return (booking.quantity_pcs * tubeInch * cuttingInch * piThicknessMm) / 75000;
}

// Booking quote / Sales Invoice-এর per-piece Unit Price — Order Thickness (thickness_mm)
// ব্যবহার করে। = base + Print Charge + Adhesive Charge। ২ দশমিকে round।
// Print Charge: colors × rate_per_color × (CuttingInch > 29" ? 2 : 1)  — বড় ব্যাগে দ্বিগুণ।
// (Sales Invoice ফর্মে এর সাথে হাতে-দেওয়া Adjustment আলাদাভাবে যোগ হয়।)
export function calcQuotedUnitPrice(booking: any, pricePerLbs: number, orderThicknessMm?: number): number {
  const thickness = orderThicknessMm ?? booking.thickness_mm;
  if (!thickness || !pricePerLbs) return 0;
  const { tube, cutting } = calcTubeCutting(booking);
  const { tubeInch, cuttingInch } = toInches(tube, cutting, booking.measurement_unit, booking.material_type, booking.has_print, !!booking.plain_cm_conversion);
  if (!tubeInch || !cuttingInch) return 0;
  const base = (pricePerLbs * tubeInch * cuttingInch * thickness) / 75000;
  const printCharge = booking.has_print
    ? (booking.print_colors || 0) * (booking.rate_per_color || 0.20) * (cuttingInch > 29 ? 2 : 1)
    : 0;
  const adhesiveCharge = hasAdhesiveCharge(booking.measurement_type)
    ? cuttingInch * (booking.rate_per_inch || 0.02)
    : 0;
  return Math.round((base + printCharge + adhesiveCharge) * 100) / 100;
}

export function calcPiUnitPrice(booking: any, pricePerLbs: number, piThicknessMm?: number): number {
  const thickness = piThicknessMm ?? booking.pi_thickness_mm;
  if (!thickness || !pricePerLbs) return 0;
  const { tube, cutting } = calcTubeCutting(booking);
  const { tubeInch, cuttingInch } = toInches(tube, cutting, booking.measurement_unit, booking.material_type, booking.has_print, !!booking.plain_cm_conversion);
  if (!tubeInch || !cuttingInch) return 0;
  return (pricePerLbs * tubeInch * cuttingInch * thickness) / 75000;
}

// "PI Rate/Lbs + Markup%" pricing rule — AT Accessories-এর PI Excel-এর হুবহু সূত্র:
//   baseBDT  = ROUND( rate/Lbs × TubeInch × CuttingInch × PIThickness / 75000
//                     + AdhesiveCharge + PrintCharge , 4 )
//   roundBDT = ROUND(baseBDT, 2)
//   result   = roundBDT × (1 + markup% / 100)      ← BDT; caller divide-by-rate + ROUND(,4) করবে
// AdhesiveCharge: flap/adhesive ব্যাগে CuttingInch × adhesiveRatePerInch (buyer 0.01/0.02)
// PrintCharge:    colors × printRatePerColor × (CuttingInch > 29 ? 2 : 1)   (বড় ব্যাগে rate দ্বিগুণ)
export function calcPiUnitPriceWithMarkup(
  booking: any,
  pricePerLbs: number,
  markupPercentage: number,
  adhesiveRatePerInch: number | null,
  piThicknessMm?: number,
  printRatePerColor?: number | null,
  pricePerLbsAdhesive?: number | null
): number {
  const thickness = piThicknessMm ?? booking.pi_thickness_mm;
  if (!thickness || !pricePerLbs) return 0;

  const { tube, cutting } = calcTubeCutting(booking);
  const { tubeInch, cuttingInch } = toInches(tube, cutting, booking.measurement_unit, booking.material_type, booking.has_print, !!booking.plain_cm_conversion);
  if (!tubeInch || !cuttingInch) return 0;

  const hasAdhesive = hasAdhesiveCharge(booking.measurement_type);
  // কিছু বায়ারের (যেমন Walmart) adhesive/flap ব্যাগে আলাদা (বেশি) Rate/Lbs —
  // buyers.rate_per_lbs_value_adhesive সেট থাকলে সেটাই ব্যবহার হবে।
  const effectiveRate = hasAdhesive && pricePerLbsAdhesive ? pricePerLbsAdhesive : pricePerLbs;
  const baseBdt = (effectiveRate * tubeInch * cuttingInch * thickness) / 75000;

  const adhesiveCharge = hasAdhesive
    ? cuttingInch * (adhesiveRatePerInch || 0)
    : 0;

  const printRate = printRatePerColor ?? 0.2;
  const colors = booking.has_print ? (booking.print_colors || 1) : 0;
  const printCharge = colors * printRate * (cuttingInch > 29 ? 2 : 1);

  const roundedBdt = round2(round4(baseBdt + adhesiveCharge + printCharge));
  return roundedBdt * (1 + (markupPercentage || 0) / 100);
}

export type PiUnitPriceBreakdown = {
  tubeInch: number;
  cuttingInch: number;
  base: number;
  adhesiveCharge: number;
  printCharge: number;
  subtotal: number;
  withMarkup: number;
  weightLbs: number;
};

export type PiBreakdownCore = { base: number; subtotal: number; withMarkup: number };

// বুকিং ছাড়াই — শুধু সংখ্যা থেকে — base/subtotal/withMarkup বের করে। New PI (বুকিং থেকে
// Tube"/Cutting" ডেরাইভ করে) আর Edit PI (আগে থেকেই সেভ করা tube_inch/cutting_inch থেকে,
// কোনো বুকিং অবজেক্ট ছাড়াই) — দুটোতেই এই একই কোর ফর্মুলা লাগে, তাই আলাদা করা:
//   subtotal   = round(base + adhesiveCharge + printCharge)
//   withMarkup = subtotal × (1 + percentageValue/100)   ← per-Pc, BDT
export function calcPiBreakdownCore(opts: {
  pricePerLbs: number; tubeInch: number; cuttingInch: number; thicknessMm: number;
  adhesiveCharge: number; printCharge: number; percentageValue?: number;
}): PiBreakdownCore {
  if (!opts.thicknessMm || !opts.tubeInch || !opts.cuttingInch || !opts.pricePerLbs) {
    return { base: 0, subtotal: 0, withMarkup: 0 };
  }
  const base = (opts.pricePerLbs * opts.tubeInch * opts.cuttingInch * opts.thicknessMm) / 75000;
  const subtotal = round2(round4(base + opts.adhesiveCharge + opts.printCharge));
  const withMarkup = subtotal * (1 + (opts.percentageValue || 0) / 100);
  return { base, subtotal, withMarkup };
}

// withMarkup (BDT, per-Pc) + Extra (USD, buyers.usd_surcharge_per_pc-এর কনভেনশন) +
// Other Charge (BDT) থেকে ফাইনাল Price/Unit (currency-তে) বানায়। Extra/Other Charge
// দুটোই Basis-লিঙ্কড — ইউজার যেই Basis-এ টাইপ করেছে সেটাই সরাসরি (কোনো ×12 হয় না),
// শুধু withMarkup-টাই (per-Pc বলে) Basis Dzn হলে ×12 হয়। New PI আর Edit PI দুটোতেই
// এই একই ফাংশন — ফর্মুলা কখনো আলাদা হয়ে না যায়।
export function convertBreakdownToPrice(opts: {
  withMarkupBdt: number; extraUsd: number; otherChargeBdt: number;
  basis: "pcs" | "dzn"; currency: string; exchangeRate: number;
}): number {
  const factor = opts.basis === "dzn" ? 12 : 1;
  const rate = opts.exchangeRate || 107;
  const bdt = opts.withMarkupBdt * factor;
  const baseInCurrency = opts.currency === "USD" ? bdt / rate : bdt;
  const extraInCurrency = opts.currency === "USD" ? opts.extraUsd : opts.extraUsd * rate;
  const otherChargeInCurrency = opts.currency === "USD" ? opts.otherChargeBdt / rate : opts.otherChargeBdt;
  return baseInCurrency + extraInCurrency + otherChargeInCurrency;
}

// AT Accessories বাদে বাকি সব কাস্টমারের New PI "Booking" মোডে প্রতিটা লাইনের দাম-ব্রেকডাউন
// স্বচ্ছভাবে দেখানো ও এডিট করার জন্য — বুকিং থেকে Tube"/Cutting" বের করে calcPiBreakdownCore()
// কল করে (Edit PI-তে ব্যবহৃত হয় না, ওখানে সরাসরি সেভ করা tube_inch/cutting_inch দিয়ে
// calcPiBreakdownCore() সরাসরি কল হয়)।
export function calcPiUnitPriceBreakdown(
  booking: any,
  opts: {
    qtyPcs: number;
    pricePerLbs: number;
    piThicknessMm?: number;
    adhesiveRatePerInch?: number | null;
    printRatePerColor?: number | null;
    percentageValue?: number;
    tubeInchOverride?: number | null;
    cuttingInchOverride?: number | null;
    // rate থেকে না বানিয়ে সরাসরি এই BDT অ্যামাউন্টই ব্যবহার করতে চাইলে (ইউজার Adhesive/Pc
    // বা Print/Pc সেল সরাসরি এডিট করলে)
    adhesiveChargeOverride?: number | null;
    printChargeOverride?: number | null;
  }
): PiUnitPriceBreakdown {
  const thickness = opts.piThicknessMm ?? booking.pi_thickness_mm;
  const { tube, cutting } = calcTubeCutting(booking);
  const computed = toInches(tube, cutting, booking.measurement_unit, booking.material_type, booking.has_print, !!booking.plain_cm_conversion);
  const tubeInch = opts.tubeInchOverride || computed.tubeInch;
  const cuttingInch = opts.cuttingInchOverride || computed.cuttingInch;

  const hasAdhesive = hasAdhesiveCharge(booking.measurement_type);
  const adhesiveCharge = opts.adhesiveChargeOverride != null
    ? opts.adhesiveChargeOverride
    : hasAdhesive ? cuttingInch * (opts.adhesiveRatePerInch || 0) : 0;

  const printRate = opts.printRatePerColor ?? 0.2;
  const colors = booking.has_print ? (booking.print_colors || 1) : 0;
  const printCharge = opts.printChargeOverride != null
    ? opts.printChargeOverride
    : colors * printRate * (cuttingInch > 29 ? 2 : 1);

  const core = calcPiBreakdownCore({
    pricePerLbs: opts.pricePerLbs, tubeInch, cuttingInch, thicknessMm: thickness || 0,
    adhesiveCharge, printCharge, percentageValue: opts.percentageValue,
  });

  const weightLbs = thickness && tubeInch && cuttingInch ? (opts.qtyPcs * tubeInch * cuttingInch * thickness) / 75000 : 0;

  return { tubeInch, cuttingInch, adhesiveCharge, printCharge, ...core, weightLbs };
}

export { round2 as piRound2, round4 as piRound4 };
