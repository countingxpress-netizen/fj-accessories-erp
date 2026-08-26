import { cmToInch } from "./cmToInch";

const CM_PER_INCH = 2.54;

export function calcTubeCutting(booking: any) {
  const L = booking.length_val ?? 0;
  const W = booking.width_val ?? 0;
  const F = booking.flap_val ?? 0;
  const G = booking.gusset_val ?? 0;

  if (booking.measurement_type === "simple") return { tube: W, cutting: L };
  if (booking.measurement_type === "adhesive") return { tube: L + F / 2, cutting: W };
  return { tube: W + G + G, cutting: L }; // gusset
}

// cm → inch রূপান্তর: PE-এর ক্ষেত্রে শুধু cutting টেবিল (die/print সাইজ) অনুযায়ী,
// tube সবসময় ÷2.54। PP-এর ক্ষেত্রে tube সবসময় টেবিল অনুযায়ী; cutting শুধু Print
// থাকলে টেবিল অনুযায়ী, না থাকলে ÷2.54।
export function toInches(
  tube: number,
  cutting: number,
  unit: string,
  materialType: string,
  hasPrint: boolean
): { tubeInch: number; cuttingInch: number } {
  if (unit !== "cm") return { tubeInch: tube, cuttingInch: cutting };

  const isPP = materialType === "pp";
  const tubeInch = isPP ? cmToInch(tube) : tube / CM_PER_INCH;
  const cuttingInch = isPP ? (hasPrint ? cmToInch(cutting) : cutting / CM_PER_INCH) : cmToInch(cutting);

  return { tubeInch, cuttingInch };
}

export function calcRequiredLbs(booking: any, thicknessMm: number): number {
  if (!thicknessMm || !booking.quantity_pcs) return 0;
  const { tube, cutting } = calcTubeCutting(booking);
  const { tubeInch, cuttingInch } = toInches(tube, cutting, booking.measurement_unit, booking.material_type, booking.has_print);
  const baseLbs = (booking.quantity_pcs * tubeInch * cuttingInch * thicknessMm) / 75000;
  return Math.ceil(baseLbs);
}

export function calcPiWeightLbs(booking: any, piThicknessMm: number): number {
  if (!piThicknessMm || !booking.quantity_pcs) return 0;
  const { tube, cutting } = calcTubeCutting(booking);
  const { tubeInch, cuttingInch } = toInches(tube, cutting, booking.measurement_unit, booking.material_type, booking.has_print);
  return (booking.quantity_pcs * tubeInch * cuttingInch * piThicknessMm) / 75000;
}

export function calcPiUnitPrice(booking: any, pricePerLbs: number): number {
  if (!booking.finished_goods || !booking.pi_thickness_mm || !pricePerLbs) return 0;
  const { length_cm, width_cm } = booking.finished_goods; // cutting_cm, tube_cm
  const { tubeInch, cuttingInch } = toInches(width_cm, length_cm, "cm", booking.material_type, booking.has_print);
  return (pricePerLbs * tubeInch * cuttingInch * booking.pi_thickness_mm) / 75000;
}
