import { cmToInch } from "./cmToInch";

const CM_PER_INCH = 2.54;

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

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

export function calcPiUnitPrice(booking: any, pricePerLbs: number, piThicknessMm?: number): number {
  const thickness = piThicknessMm ?? booking.pi_thickness_mm;
  if (!thickness || !pricePerLbs) return 0;
  const { tube, cutting } = calcTubeCutting(booking);
  const { tubeInch, cuttingInch } = toInches(tube, cutting, booking.measurement_unit, booking.material_type, booking.has_print);
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
  printRatePerColor?: number | null
): number {
  const thickness = piThicknessMm ?? booking.pi_thickness_mm;
  if (!thickness || !pricePerLbs) return 0;

  const { tube, cutting } = calcTubeCutting(booking);
  const { tubeInch, cuttingInch } = toInches(tube, cutting, booking.measurement_unit, booking.material_type, booking.has_print);
  if (!tubeInch || !cuttingInch) return 0;

  const baseBdt = (pricePerLbs * tubeInch * cuttingInch * thickness) / 75000;

  const adhesiveCharge = booking.measurement_type === "adhesive"
    ? cuttingInch * (adhesiveRatePerInch || 0)
    : 0;

  const printRate = printRatePerColor ?? 0.2;
  const colors = booking.has_print ? (booking.print_colors || 1) : 0;
  const printCharge = colors * printRate * (cuttingInch > 29 ? 2 : 1);

  const roundedBdt = round2(round4(baseBdt + adhesiveCharge + printCharge));
  return roundedBdt * (1 + (markupPercentage || 0) / 100);
}

export { round2 as piRound2, round4 as piRound4 };
