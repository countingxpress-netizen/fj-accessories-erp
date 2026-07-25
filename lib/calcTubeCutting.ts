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

export function calcPiWeightLbs(booking: any, piThicknessMm: number): number {
  if (!piThicknessMm || !booking.quantity_pcs) return 0;
  const { tube, cutting } = calcTubeCutting(booking);
  const unit = booking.measurement_unit;
  const tubeInch = unit === "cm" ? tube / CM_PER_INCH : tube;
  const cuttingInch = unit === "cm" ? cutting / CM_PER_INCH : cutting;
  const baseLbs = (booking.quantity_pcs * tubeInch * cuttingInch * piThicknessMm) / 75000;
  return baseLbs * 1.01; // 1% বাফার সহ, Booking formula-র মতোই
}

export function calcPiUnitPrice(booking: any, pricePerLbs: number): number {
  if (!booking.finished_goods || !booking.pi_thickness_mm || !pricePerLbs) return 0;
  const { length_cm, width_cm } = booking.finished_goods;
  return (pricePerLbs * length_cm * width_cm * booking.pi_thickness_mm) / 75000 / 2.54 / 2.54;
}