"use client";
import { useState, useEffect, Fragment } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { generatePiNo } from "@/lib/docNumber";
import { calcPiUnitPrice, calcPiUnitPriceBreakdown, calcPiUnitPriceWithMarkup, calcPiWeightLbs, calcTubeCutting, toInches, convertBreakdownToPrice } from "@/lib/calcTubeCutting";
import { resolveRate } from "@/lib/rateHistory";
import { amountInWords } from "@/lib/numberToWords";
import { getCurrentUserId } from "@/lib/currentUser";
import { money } from "@/lib/format";

type Booking = {
  id: string; booking_no: string; booking_date: string | null; quantity_pcs: number; product_id: string; customer_id: string;
  style: string | null; customer_booking_ref: string | null; garments_name: string | null; buyer_id: string | null;
  buyers: { name: string } | null; merchants: { name: string } | null;
  measurement_type: string; measurement_unit: string; length_val: number; width_val: number;
  flap_val: number | null; gusset_val: number | null; pillow_val: number | null; pi_thickness_mm: number | null;
  material_type: string; has_print: boolean; print_colors: number | null; rate_per_color: number | null;
  plain_cm_conversion?: boolean | null;
  finished_goods: { product_name: string; length_cm: number; width_cm: number; thickness: number } | null;
};
type Customer = { id: string; name: string; code: string | null; price_per_lbs: number | null; default_print_rate: number | null };
type BuyerMaster = { id: string; customer_id: string; name: string; pricing_rule: string; percentage_value: number; rate_per_lbs_value: number; pi_thickness_mm: number | null; adhesive_rate_per_inch: number | null; print_colors_default: number | null; usd_bdt_rate: number | null; price_basis_default: string | null; usd_surcharge_per_pc: number | null; rate_per_lbs_value_adhesive: number | null };
type Garment = { id: string; customer_id: string; name: string; address: string | null };
type AdvisingBank = { id: string; name: string; branch: string | null; address: string | null; swift: string | null };
type BuyerRateHistoryRow = { buyer_id: string; effective_from: string; rate: number };
type ManualLine = {
  description: string; measurement: string; qtyPcs: string; priceUnit: string; priceBasis: "pcs" | "dzn";
  tubeInch: string; cuttingInch: string; thicknessMm: string; // Weight অটো-ক্যালকুলেশনের জন্য, ঐচ্ছিক
};
// AT Accessories বাদে বাকি কাস্টমারদের বুকিং-লাইন দাম-ব্রেকডাউনে একটা ফিল্ড সদ্য বদলালে
// সেই মানটা সরাসরি পাস করার জন্য (setState অ্যাসিঙ্ক বলে state read-back করলে এক টিক পুরনো
// মান পাওয়া যেত) — lineThickness/lineTubeCuttingInches/lineQty/lineBreakdown সবাই এটা নেয়।
type BreakdownPatch = Partial<{
  qty: string; thickness: string; tubeInch: string; cuttingInch: string;
  pricePerLbs: string; pricePerLbsCurrency: "BDT" | "USD"; adhesivePc: string; printPc: string;
  percentage: string; extra: string; otherCharge: string;
}>;

const DEFAULT_TERMS = `01) 100% IRREVOCABLE LETTER OF CREDIT AT SIGHT.
02) PARTIAL SHIPMENT MUST BE ALLOWED IN THE L/C.
03) SHIPMENT WITHIN 15 DAYS AFTER RECEIVED OF L/C.
04) DELIVERY FROM OUR FACTORY TO APPLICANT FACTORY.
05) C&F BASIS.
06) INSPECTION CERTIFICATE ISSUE BY BENEFICIARIES.
07) OUR DUE INTEREST WILL BE THE L/C OPENER.
08) L/C RECEIVE FROM UD
09) PAYMENT MUST BE BY USD.`;

function addMonthsISO(iso: string, months: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function formatMeasurement(b: Booking) {
  const unit = b.measurement_unit;
  const L = b.length_val, W = b.width_val, F = b.flap_val, G = b.gusset_val, P = b.pillow_val;
  if (b.measurement_type === "simple") return `L-${L} x W-${W}${unit}`;
  if (b.measurement_type === "gusset") return `L-${L} x W-${W} + G-${G}${unit}`;
  if (b.measurement_type === "adhesive") return `L-${L} + F-${F} x W-${W}${unit}`;
  if (b.measurement_type === "flap_gusset") return `L-${L} + F-${F} + G-${G} x W-${W}${unit}`;
  if (b.measurement_type === "pillow") return `L-${L} + P-${P} x W-${W}${unit}`;
  return "-";
}

// Description = Style No + Customer Booking Ref (দুই লাইনে) — যেমন "St-xxxx" / "BN-2566556/12"
function buildBookingDescription(b: Booking): string {
  const parts: string[] = [];
  const style = b.style?.trim();
  const ref = b.customer_booking_ref?.trim();
  if (style) parts.push(/^st[-\s]/i.test(style) ? style : `St-${style}`);
  if (ref) parts.push(/^bn[-\s]/i.test(ref) ? ref : `BN-${ref}`);
  return parts.join("\n") || b.booking_no;
}

export default function ProformaForm({
  customers, bookings, buyersMaster, garments, advisingBanks, lastUnitPriceByBooking, buyerRateHistory = [],
}: {
  customers: Customer[]; bookings: Booking[]; buyersMaster: BuyerMaster[];
  garments: Garment[]; advisingBanks: AdvisingBank[];
  lastUnitPriceByBooking: Record<string, number>;
  buyerRateHistory?: BuyerRateHistoryRow[];
}) {
  const [mode, setMode] = useState<"booking" | "manual">("booking");
  const [customerId, setCustomerId] = useState("");
  const [garmentsId, setGarmentsId] = useState("");
  const [buyerFilter, setBuyerFilter] = useState("");
  const [merchantFilter, setMerchantFilter] = useState("");
  const [merchantName, setMerchantName] = useState("");
  const [styleFilter, setStyleFilter] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const [piDate, setPiDate] = useState(today);
  const [validTill, setValidTill] = useState(addMonthsISO(today, 2));
  const [validTillTouched, setValidTillTouched] = useState(false);
  const [currency, setCurrency] = useState("USD");
  const [exchangeRate, setExchangeRate] = useState("107");
  const [rateTouched, setRateTouched] = useState(false);
  const [discountType, setDiscountType] = useState<"none" | "percentage" | "fixed">("none");
  const [discountValue, setDiscountValue] = useState("0");
  const [adjustmentAmount, setAdjustmentAmount] = useState("0"); // Subtotal-Discount-এর উপরে ± ম্যানুয়াল সংশোধনী
  const [priceDecimals, setPriceDecimals] = useState("4");
  const [termsConditions, setTermsConditions] = useState(DEFAULT_TERMS);
  const [garmentsAddress, setGarmentsAddress] = useState("");
  const [itemDescription, setItemDescription] = useState("Poly Bags");
  const [advisingBankId, setAdvisingBankId] = useState("");
  const [advisingBankName, setAdvisingBankName] = useState("");
  const [advisingBankBranch, setAdvisingBankBranch] = useState("");
  const [advisingBankAddress, setAdvisingBankAddress] = useState("");
  const [advisingBankSwift, setAdvisingBankSwift] = useState("");
  const [totalWeightKg, setTotalWeightKg] = useState("");
  const [weightTouched, setWeightTouched] = useState(false);
  const [hsCode, setHsCode] = useState("3923.21.00");
  const [binNo, setBinNo] = useState("000113803-1201");

  const [selectedBookings, setSelectedBookings] = useState<Record<string, boolean>>({});
  const [bookingPrice, setBookingPrice] = useState<Record<string, string>>({});
  const [bookingAdjust, setBookingAdjust] = useState<Record<string, string>>({}); // প্রতি unit ± (ঋণাত্মকও), Price/Unit-এর সাথে যোগ
  const [bookingBasis, setBookingBasis] = useState<Record<string, "pcs" | "dzn">>({});
  const [bookingThickness, setBookingThickness] = useState<Record<string, string>>({});

  // AT Accessories বাদে বাকি সব কাস্টমারের জন্য — প্রতি লাইনের দাম-ব্রেকডাউন (স্বচ্ছ, এডিটেবল)।
  // Description/Measurement/Qty (Pcs)-ও এই কাস্টমারদের জন্য এডিটেবল, তাই আলাদা override state।
  const [bookingDescription, setBookingDescription] = useState<Record<string, string>>({});
  const [bookingMeasurement, setBookingMeasurement] = useState<Record<string, string>>({});
  const [bookingQty, setBookingQty] = useState<Record<string, string>>({});
  const [bookingTubeInch, setBookingTubeInch] = useState<Record<string, string>>({});
  const [bookingCuttingInch, setBookingCuttingInch] = useState<Record<string, string>>({});
  const [bookingPricePerLbs, setBookingPricePerLbs] = useState<Record<string, string>>({});
  // Price/Lbs BDT-তে না USD-তে টাইপ করা হচ্ছে — প্রতি বুকিং-লাইনে আলাদা (ডিফল্ট BDT)
  const [bookingPricePerLbsCurrency, setBookingPricePerLbsCurrency] = useState<Record<string, "BDT" | "USD">>({});
  const [bookingAdhesivePc, setBookingAdhesivePc] = useState<Record<string, string>>({});
  const [bookingPrintPc, setBookingPrintPc] = useState<Record<string, string>>({});
  const [bookingPercentage, setBookingPercentage] = useState<Record<string, string>>({});
  const [bookingExtra, setBookingExtra] = useState<Record<string, string>>({});
  const [bookingOtherCharge, setBookingOtherCharge] = useState<Record<string, string>>({});

  const [manualLines, setManualLines] = useState<ManualLine[]>([
    { description: "", measurement: "", qtyPcs: "", priceUnit: "", priceBasis: "pcs", tubeInch: "", cuttingInch: "", thicknessMm: "" },
  ]);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const selectedGarment = garments.find((g) => g.id === garmentsId);
  // AT Accessories-এর জন্য পুরনো বাল্ক-টেবিল (single Price/Unit) অক্ষুণ্ণ থাকবে — বাকি সব
  // কাস্টমারের জন্য নতুন লাইন-বাই-লাইন দাম-ব্রেকডাউন (ইনলাইন এক্সপ্যান্ড) দেখাবে।
  const isAtAccessories = selectedCustomer?.code === "AT";

  // Price/Unit-এ দশমিকের পর কয় ঘর (auto-round + print display)
  const pd = Math.max(0, Math.min(8, parseInt(priceDecimals) || 4));
  const roundPrice = (n: number) => { const f = Math.pow(10, pd); return Math.round(n * f) / f; };

  // per-line PI thickness (এডিটেবল) — না দিলে buyer-এর default। `patch` দিলে সেই মানটাই
  // ব্যবহার হয় — state আপডেট আর তার উপর নির্ভরশীল ক্যালকুলেশন একই সিঙ্ক্রোনাস কলে করতে হলে
  // (setState অ্যাসিঙ্ক বলে) সদ্য-বদলানো মান সরাসরি পাস করাই লাগে, state read-back না করে।
  function lineThickness(b: Booking, patch?: BreakdownPatch): number {
    const raw = patch?.thickness ?? bookingThickness[b.id];
    if (raw !== undefined && raw !== "") return parseFloat(raw) || 0;
    return getBuyerRule(b)?.pi_thickness_mm ?? b.pi_thickness_mm ?? 0;
  }

  const customerBookings = bookings
    .filter((b) => b.customer_id === customerId)
    .filter((b) => !selectedGarment || b.garments_name === selectedGarment.name)
    .filter((b) => !buyerFilter || b.buyer_id === buyerFilter)
    .filter((b) => !merchantFilter || (b.merchants?.name ?? "") === merchantFilter)
    .filter((b) => !styleFilter || b.style === styleFilter);

  const availableGarments = garments.filter((g) => g.customer_id === customerId);
  const availableBuyers = buyersMaster.filter((b) => b.customer_id === customerId);
  const availableMerchants = Array.from(
    new Set(bookings.filter((b) => b.customer_id === customerId).map((b) => b.merchants?.name).filter(Boolean))
  ) as string[];
  const availableStyles = Array.from(
    new Set(bookings.filter((b) => b.customer_id === customerId).map((b) => b.style).filter(Boolean))
  ) as string[];

  function getBuyerRule(b: Booking): BuyerMaster | undefined {
    return buyersMaster.find((bm) => bm.id === b.buyer_id);
  }

  // Booking-এর Tube"/Cutting" (inch) — pi_items-এ স্ন্যাপশট হিসেবে সেভ থাকে, যাতে
  // Edit পেজে Thickness বদলালে Weight/Price/Unit রিক্যালকুলেট করা যায়। AT বাদে বাকি
  // কাস্টমারদের জন্য ইউজার সরাসরি Tube Inch/Cutting Inch ওভাররাইড করতে পারে।
  function lineTubeCuttingInches(b: Booking, patch?: BreakdownPatch): { tubeInch: number; cuttingInch: number } {
    const { tube, cutting } = calcTubeCutting(b);
    const computed = toInches(tube, cutting, b.measurement_unit, b.material_type, b.has_print, !!b.plain_cm_conversion);
    const tubeOverride = parseFloat((patch?.tubeInch ?? bookingTubeInch[b.id]) || "");
    const cuttingOverride = parseFloat((patch?.cuttingInch ?? bookingCuttingInch[b.id]) || "");
    return {
      tubeInch: tubeOverride > 0 ? tubeOverride : computed.tubeInch,
      cuttingInch: cuttingOverride > 0 ? cuttingOverride : computed.cuttingInch,
    };
  }

  // Qty (Pcs) — AT বাদে বাকি কাস্টমারদের জন্য বুকিং থেকে অটো কিন্তু এডিটেবল
  function lineQty(b: Booking, patch?: BreakdownPatch): number {
    const raw = patch?.qty ?? bookingQty[b.id];
    if (raw !== undefined && raw !== "") return parseFloat(raw) || 0;
    return b.quantity_pcs;
  }

  function lineDescriptionText(b: Booking): string {
    return bookingDescription[b.id] ?? buildBookingDescription(b);
  }

  function lineMeasurementText(b: Booking): string {
    return bookingMeasurement[b.id] ?? formatMeasurement(b);
  }

  function lineWeightLbs(b: Booking, patch?: BreakdownPatch): number {
    const { tubeInch, cuttingInch } = lineTubeCuttingInches(b, patch);
    const thickness = lineThickness(b, patch);
    if (!thickness || !tubeInch || !cuttingInch) return 0;
    return (lineQty(b, patch) * tubeInch * cuttingInch * thickness) / 75000;
  }

  // AT বাদে বাকি কাস্টমারদের জন্য — প্রতি লাইনের দাম-ব্রেকডাউন (শুধু Price/Lbs+Adhesive+
  // Print+Percentage, BDT-তে, per-Pc)। Extra আর Other Charge এখানে নেই — দুটোই
  // Basis-লিঙ্কড (কোনো ×12 হয় না), নিচে computeFinalPrice()-এ যোগ হয়।
  function lineBreakdown(b: Booking, patch?: BreakdownPatch, rateOverride?: string) {
    const r = resolvedLineInputs(b, patch, undefined, rateOverride);
    return calcPiUnitPriceBreakdown(b, {
      qtyPcs: lineQty(b, patch),
      pricePerLbs: r.ratePerLbs,
      piThicknessMm: lineThickness(b, patch),
      adhesiveRatePerInch: r.rule?.adhesive_rate_per_inch,
      printRatePerColor: r.printRate,
      percentageValue: r.percentage,
      tubeInchOverride: r.tubeInch,
      cuttingInchOverride: r.cuttingInch,
      adhesiveChargeOverride: r.adhesiveOverride,
      printChargeOverride: r.printOverride,
    });
  }

  // BDT ব্রেকডাউন (Basis অনুযায়ী ×12) + Extra + Other Charge থেকে ফাইনাল Price/Unit
  // (currency-তে) বানায়। Extra সবসময় USD (buyers.usd_surcharge_per_pc-এর কনভেনশন —
  // getSuggestedPrice() দেখুন), Other Charge BDT — দুটোই Basis-লিঙ্কড (ইউজার যেই Basis-এ
  // টাইপ করেছে সেটাই সরাসরি যোগ হয়, কোনো ×12 হয় না)। basisOverride/rateOverride/patch —
  // সদ্য বদলানো মান সরাসরি পাস করার জন্য (state read-back এক টিক পুরনো হতো)।
  function computeFinalPrice(b: Booking, patch?: BreakdownPatch, rateOverride?: string, basisOverride?: "pcs" | "dzn") {
    const rate = parseFloat(rateOverride ?? exchangeRate) || 107;
    const basis = basisOverride ?? bookingBasis[b.id] ?? "pcs";
    const bd = lineBreakdown(b, patch, rateOverride);
    const r = resolvedLineInputs(b, patch, basis, rateOverride);
    const priceInCurrency = convertBreakdownToPrice({
      withMarkupBdt: bd.withMarkup, extraUsd: r.extra, otherChargeBdt: r.otherCharge,
      basis, currency, exchangeRate: rate,
    });
    return { bd, r, basis, priceInCurrency };
  }

  // breakdown-এর কোনো ফিল্ড বদলালে (existing changeThickness-এর মতোই কনভেনশন) Price/Unit
  // আবার রিক্যালকুলেট হয়ে বসে — ইউজার চাইলে Price/Unit বক্সে সরাসরি এডিটও করতে পারে
  // (পরের বদলে আবার ওভাররাইট হবে)।
  function recomputeBreakdownPrice(b: Booking, patch?: BreakdownPatch, rateOverride?: string, basisOverride?: "pcs" | "dzn") {
    const { priceInCurrency } = computeFinalPrice(b, patch, rateOverride, basisOverride);
    setBookingPrice((prev) => ({ ...prev, [b.id]: roundPrice(priceInCurrency).toFixed(pd) }));
  }

  // ব্রেকডাউনের যেকোনো ফিল্ড (Tube Inch, Cutting Inch, Price/Lbs, Adhesive/Pc, Print/Pc,
  // Percentage, Extra, Other Charge, Qty) বদলালে state আপডেট + Price/Unit রিক্যালকুলেট —
  // সদ্য বদলানো মানটা patch হিসেবে সরাসরি পাস করি (state read-back এক টিক পুরনো হতো)।
  function applyBreakdownChange(
    b: Booking, key: keyof BreakdownPatch,
    setter: React.Dispatch<React.SetStateAction<Record<string, string>>>, value: string
  ) {
    setter((prev) => ({ ...prev, [b.id]: value }));
    recomputeBreakdownPrice(b, { [key]: value } as BreakdownPatch);
  }

  // Price/Lbs BDT/USD টগল বদলালে — টাইপ করা মান অক্ষুণ্ণ রেখে শুধু ইউনিট বদলায় (ভ্যালু
  // রি-কনভার্ট করে না, ইউজার নিজে নতুন ইউনিটে মান বসাবে ধরে নেওয়া হয়)
  function setLbsCurrency(b: Booking, cur: "BDT" | "USD") {
    setBookingPricePerLbsCurrency((prev) => ({ ...prev, [b.id]: cur }));
    recomputeBreakdownPrice(b, { pricePerLbsCurrency: cur });
  }

  // buyer rule অনুযায়ী per-piece suggested price (currency অনুযায়ী)
  function getSuggestedPrice(b: Booking, thicknessOverride?: number): number {
    const rule = getBuyerRule(b);
    if (!rule || rule.pricing_rule === "manual") return 0;
    const rate = parseFloat(exchangeRate) || 107;
    const thickness = thicknessOverride ?? lineThickness(b);
    const printRate = rule.print_colors_default ?? selectedCustomer?.default_print_rate ?? 0.2;
    // Booking-এর Booking Date ধরে সেই দিনে কার্যকর Buyer Rate/Lbs (history না থাকলে
    // buyer-এর বর্তমান rate_per_lbs_value fallback)।
    const ratePerLbs = resolveRate(
      buyerRateHistory.filter((h) => h.buyer_id === rule.id),
      b.booking_date,
      rule.rate_per_lbs_value
    );
    if (rule.pricing_rule === "percentage") {
      const lastPrice = lastUnitPriceByBooking[b.id] ?? 0;
      if (!lastPrice) return 0;
      const bdtPrice = lastPrice * (1 + (rule.percentage_value || 0) / 100);
      return currency === "USD" ? roundPrice(bdtPrice / rate) : roundPrice(bdtPrice);
    }
    if (rule.pricing_rule === "rate_per_lbs") {
      const bdt = calcPiUnitPrice(b, ratePerLbs || 0, thickness);
      return currency === "USD" ? roundPrice(bdt / rate) : roundPrice(bdt);
    }
    if (rule.pricing_rule === "rate_per_lbs_markup") {
      const bdtPrice = calcPiUnitPriceWithMarkup(
        b, ratePerLbs || 0, rule.percentage_value || 0,
        rule.adhesive_rate_per_inch, thickness, printRate,
        rule.rate_per_lbs_value_adhesive
      );
      if (!bdtPrice) return 0;
      const surcharge = rule.usd_surcharge_per_pc || 0; // recycled ইত্যাদি flat USD/pc
      return currency === "USD"
        ? roundPrice(bdtPrice / rate + surcharge)
        : roundPrice(bdtPrice + surcharge * rate);
    }
    return 0;
  }

  function basisFactor(basis: "pcs" | "dzn") {
    return basis === "dzn" ? 12 : 1;
  }

  // Basis অনুযায়ী suggested price বসাও (Per Dzn হলে ×12)
  function applyAutoPrice(bookingId: string, basis: "pcs" | "dzn") {
    const b = bookings.find((bk) => bk.id === bookingId);
    if (!b) return;
    const perPc = getSuggestedPrice(b);
    if (perPc > 0) {
      setBookingPrice((prev) => ({ ...prev, [bookingId]: (perPc * basisFactor(basis)).toFixed(pd) }));
    }
  }

  // rate state আপডেট অ্যাসিঙ্ক বলে, একই টিকে breakdown রিক্যালকুলেট করতে হলে নতুন রেটটা
  // সরাসরি রিটার্ন করে দিতে হয় (recomputeBreakdownPrice-এ patch হিসেবে পাস করার জন্য) —
  // নাহলে পুরনো exchangeRate দিয়েই BDT→currency কনভার্সন হয়ে ভুল Price/Unit বসে যেত।
  function maybePrefillRate(b: Booking): string | undefined {
    if (rateTouched || currency !== "USD") return undefined;
    const rule = getBuyerRule(b);
    if (rule?.usd_bdt_rate) {
      setExchangeRate(String(rule.usd_bdt_rate));
      return String(rule.usd_bdt_rate);
    }
    return undefined;
  }

  // চেকবক্সে টিক দিলেই Basis + Price/Unit অটো বসবে (AT), অথবা পুরো breakdown প্রিফিল
  // হয়ে ইনলাইন এক্সপ্যান্ড হবে (বাকি সব কাস্টমার)
  function toggleBooking(b: Booking, checked: boolean) {
    setSelectedBookings((prev) => ({ ...prev, [b.id]: checked }));
    if (!checked) return;
    const rule = getBuyerRule(b);

    let thicknessPatch: string | undefined;
    if (bookingThickness[b.id] === undefined) {
      const thk = rule?.pi_thickness_mm ?? b.pi_thickness_mm ?? 0;
      if (thk) {
        setBookingThickness((prev) => ({ ...prev, [b.id]: String(thk) }));
        thicknessPatch = String(thk);
      }
    }
    const ratePatch = maybePrefillRate(b);

    const basis: "pcs" | "dzn" =
      bookingBasis[b.id] || (rule?.price_basis_default === "dzn" ? "dzn" : "pcs");
    setBookingBasis((prev) => ({ ...prev, [b.id]: basis }));

    if (isAtAccessories) {
      applyAutoPrice(b.id, basis);
      return;
    }

    recomputeBreakdownPrice(b, thicknessPatch !== undefined ? { thickness: thicknessPatch } : undefined, ratePatch, basis);
  }

  function changeBasis(b: Booking, basis: "pcs" | "dzn") {
    setBookingBasis((prev) => ({ ...prev, [b.id]: basis }));
    if (isAtAccessories) {
      applyAutoPrice(b.id, basis);
      return;
    }
    recomputeBreakdownPrice(b, undefined, undefined, basis);
  }

  function changeThickness(b: Booking, value: string) {
    setBookingThickness((prev) => ({ ...prev, [b.id]: value }));
    if (!selectedBookings[b.id]) return;
    if (!isAtAccessories) {
      recomputeBreakdownPrice(b, { thickness: value });
      return;
    }
    // thickness বদলালে suggested দাম রি-ক্যালকুলেট (setState async, তাই override দিয়ে)
    const basis = bookingBasis[b.id] || "pcs";
    const perPc = getSuggestedPrice(b, parseFloat(value) || 0);
    if (perPc > 0) {
      setBookingPrice((prev) => ({ ...prev, [b.id]: (perPc * basisFactor(basis)).toFixed(pd) }));
    }
  }

  function onBuyerFilterChange(id: string) {
    setBuyerFilter(id);
    if (rateTouched || currency !== "USD") return;
    const bm = buyersMaster.find((b) => b.id === id);
    if (bm?.usd_bdt_rate) setExchangeRate(String(bm.usd_bdt_rate));
  }

  function onGarmentsChange(id: string) {
    setGarmentsId(id);
    const g = garments.find((x) => x.id === id);
    if (g) setGarmentsAddress(g.address || "");
  }

  function onAdvisingBankChange(id: string) {
    setAdvisingBankId(id);
    const bk = advisingBanks.find((x) => x.id === id);
    if (bk) {
      setAdvisingBankName(bk.name || "");
      setAdvisingBankBranch(bk.branch || "");
      setAdvisingBankAddress(bk.address || "");
      setAdvisingBankSwift(bk.swift || "");
    }
  }

  function getBuyerDefaults(b: Booking) {
    const rule = getBuyerRule(b);
    return {
      thickness: rule?.pi_thickness_mm ?? null,
      adhesiveRate: rule?.adhesive_rate_per_inch ?? null,
      printColors: rule?.print_colors_default ?? null,
    };
  }

  function calcLineAmount(qtyPcs: number, priceUnit: number, basis: "pcs" | "dzn") {
    const raw = basis === "dzn" ? (qtyPcs / 12) * priceUnit : qtyPcs * priceUnit;
    return Math.round(raw * 100) / 100;
  }

  // ব্রেকডাউনের প্রতিটা ইনপুটের "রিজলভড" মান (ওভাররাইড থাকলে সেটা, নাহলে buyer rule থেকে
  // ডিফল্ট) — lineBreakdown() আর ব্রেকডাউন প্যানেলের ইনপুট-ভ্যালু দেখানো, দুটোতেই লাগে।
  // Extra (USD) Basis-লিঙ্কড — ইউজার নিজে টাইপ করলে সেটাই যেই Basis-এই থাকুক (আর কোনো ×12
  // হয় না), কিন্তু buyer rule-এর ডিফল্ট (usd_surcharge_per_pc, সবসময় per-Pc) থেকে সাজেস্ট
  // করার সময় Basis Dzn হলে ×12 করে সাজেস্ট করি — যাতে ডিফল্ট বক্সটাও সঠিক ইউনিটে দেখায়।
  function resolvedLineInputs(b: Booking, patch?: BreakdownPatch, basisOverride?: "pcs" | "dzn", rateOverride?: string) {
    const rule = getBuyerRule(b);
    const { tubeInch, cuttingInch } = lineTubeCuttingInches(b, patch);
    const pricePerLbsRaw = patch?.pricePerLbs ?? bookingPricePerLbs[b.id];
    const pricePerLbsCurrency = patch?.pricePerLbsCurrency ?? bookingPricePerLbsCurrency[b.id] ?? "BDT";
    // ইউজার USD সিলেক্ট করে টাইপ করলে সেই মানটা BDT-তে কনভার্ট করে হিসাবে ব্যবহার হয় (buyer
    // rule/history থেকে ডিফল্ট রেট সবসময় BDT-তেই থাকে, তাই ওভাররাইড না থাকলে কনভার্সন লাগে না)।
    // rateOverride (computeFinalPrice থেকে পাস করা) না থাকলে লাইভ exchangeRate state — এই
    // একই রেট যেন divide স্টেপেও (computeFinalPrice-এর rate) ব্যবহার হয়, নাহলে multiply আর
    // divide আলাদা রেটে হয়ে round-trip ঠিকমতো cancel হয় না (ভুল Price/Unit আসে)।
    const defaultRateBdt = resolveRate(buyerRateHistory.filter((h) => h.buyer_id === rule?.id), b.booking_date, rule?.rate_per_lbs_value || 0);
    const typedPricePerLbs = pricePerLbsRaw !== undefined && pricePerLbsRaw !== "" ? (parseFloat(pricePerLbsRaw) || 0) : null;
    // ratePerLbsNative — Price/Lbs যেই কারেন্সিতে টাইপ করা হয়েছে ঠিক সেই কারেন্সিতেই (কোনো
    // BDT কনভার্সন ছাড়া) — lineBreakdown()-এ সরাসরি ক্যালকুলেশনে ব্যবহারের জন্য, যাতে USD-তে
    // টাইপ করলে গোটা হিসাবই USD-এ থাকে, কোনো BDT round-trip লাগে না।
    const ratePerLbsNative = typedPricePerLbs !== null ? typedPricePerLbs : defaultRateBdt;
    // ratePerLbs — সবসময় BDT-equivalent (সেভ/অন্যান্য ডিসপ্লে ব্যাকওয়ার্ড-কম্প্যাটিবিলিটির জন্য)।
    const ratePerLbs = typedPricePerLbs !== null
      ? typedPricePerLbs * (pricePerLbsCurrency === "USD" ? (parseFloat(rateOverride ?? exchangeRate) || 107) : 1)
      : defaultRateBdt;
    const percentageRaw = patch?.percentage ?? bookingPercentage[b.id];
    const percentage = percentageRaw !== undefined && percentageRaw !== "" ? parseFloat(percentageRaw) || 0 : rule?.percentage_value || 0;
    const basis = basisOverride ?? bookingBasis[b.id] ?? "pcs";
    const extraRaw = patch?.extra ?? bookingExtra[b.id];
    const extra = extraRaw !== undefined && extraRaw !== ""
      ? parseFloat(extraRaw) || 0
      : (rule?.usd_surcharge_per_pc || 0) * basisFactor(basis);
    const otherChargeRaw = patch?.otherCharge ?? bookingOtherCharge[b.id];
    const otherCharge = parseFloat(otherChargeRaw || "") || 0;
    const adhesiveRaw = patch?.adhesivePc ?? bookingAdhesivePc[b.id];
    const adhesiveOverride = adhesiveRaw !== undefined && adhesiveRaw !== "" ? parseFloat(adhesiveRaw) || 0 : null;
    const printRaw = patch?.printPc ?? bookingPrintPc[b.id];
    const printOverride = printRaw !== undefined && printRaw !== "" ? parseFloat(printRaw) || 0 : null;
    const printRate = rule?.print_colors_default ?? selectedCustomer?.default_print_rate ?? 0.2;
    return { rule, tubeInch, cuttingInch, ratePerLbs, ratePerLbsNative, pricePerLbsCurrency, percentage, extra, otherCharge, adhesiveOverride, printOverride, printRate };
  }

  // Effective Price/Unit = (দেওয়া দাম + Adjustment) → precision অনুযায়ী round।
  // Sales Invoice-এর মতোই Adjustment per-unit, ঋণাত্মকও হতে পারে।
  function effectivePriceUnit(id: string): number {
    return roundPrice((parseFloat(bookingPrice[id] || "0") || 0) + (parseFloat(bookingAdjust[id] || "0") || 0));
  }

  // selectedBookings-এর key-order (click sequence) নয় — customerBookings-এর নিজস্ব
  // order (booking entry sequence) থেকেই লাইন বসে, যাতে PI-র Sl No বুকিং এন্ট্রি সিরিয়াল মেনে চলে।
  const bookingLineItems = customerBookings
    .filter((b) => selectedBookings[b.id])
    .map((b) => {
      const priceUnit = effectivePriceUnit(b.id);
      const basis = bookingBasis[b.id] || "pcs";
      const qty = lineQty(b);
      const amount = calcLineAmount(qty, priceUnit, basis);
      return { booking: b, priceUnit, basis, qty, amount };
    });

  const manualLineItems = manualLines
    .filter((l) => l.description && parseFloat(l.qtyPcs) > 0)
    .map((l) => {
      const qtyPcs = parseFloat(l.qtyPcs) || 0;
      const priceUnit = parseFloat(l.priceUnit) || 0;
      const amount = calcLineAmount(qtyPcs, priceUnit, l.priceBasis);
      const tube = parseFloat(l.tubeInch) || 0;
      const cutting = parseFloat(l.cuttingInch) || 0;
      const thickness = parseFloat(l.thicknessMm) || 0;
      // Tube/Cutting/Thickness তিনটাই দিলে তবেই এই লাইনের ওজন গোনা হবে (অংশত দেওয়া হলে ০)
      const weightLbs = tube > 0 && cutting > 0 && thickness > 0 ? (qtyPcs * tube * cutting * thickness) / 75000 : 0;
      return { ...l, qtyPcs, priceUnit, amount, tube, cutting, thickness, weightLbs };
    });

  // Total Weight (Kg) — PI Thickness ধরে অটো: Σ (Qty × Tube" × Cutting" × PI_Thk / 75000) / 2.2
  // (AT বাদে বাকি কাস্টমারদের জন্য lineWeightLbs Qty/Tube/Cutting override-ও ধরে)
  const autoWeightKg = mode === "booking"
    ? bookingLineItems.reduce((s, li) => s + lineWeightLbs(li.booking) / 2.2, 0)
    : manualLineItems.reduce((s, li) => s + li.weightLbs / 2.2, 0);

  useEffect(() => {
    if (!weightTouched && autoWeightKg > 0) setTotalWeightKg(String(Math.round(autoWeightKg)));
  }, [autoWeightKg, weightTouched]);

  useEffect(() => {
    if (!validTillTouched) setValidTill(addMonthsISO(piDate, 2));
  }, [piDate, validTillTouched]);

  const subtotal = mode === "booking"
    ? bookingLineItems.reduce((s, li) => s + li.amount, 0)
    : manualLineItems.reduce((s, li) => s + li.amount, 0);

  const discountAmount = discountType === "percentage"
    ? (subtotal * (parseFloat(discountValue) || 0)) / 100
    : discountType === "fixed"
    ? (parseFloat(discountValue) || 0)
    : 0;

  const totalAmount = Math.max(subtotal - discountAmount + (parseFloat(adjustmentAmount) || 0), 0);

  function updateManualLine(i: number, field: keyof ManualLine, value: string) {
    setManualLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));
  }
  function addManualLine() {
    setManualLines((prev) => [...prev, { description: "", measurement: "", qtyPcs: "", priceUnit: "", priceBasis: "pcs", tubeInch: "", cuttingInch: "", thicknessMm: "" }]);
  }
  function removeManualLine(i: number) {
    setManualLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (mode === "booking") {
      if (!customerId || bookingLineItems.length === 0) {
        setError("Customer বাছুন এবং অন্তত একটা বুকিং বেছে দাম দিন।");
        return;
      }
      if (bookingLineItems.some((li) => li.priceUnit <= 0)) {
        setError("প্রতিটা বাছাই করা বুকিং-এর জন্য দাম দিন।");
        return;
      }
    } else {
      if (manualLineItems.length === 0) {
        setError("অন্তত একটা লাইন আইটেম (Description, Qty, Price) দিন।");
        return;
      }
    }

    setLoading(true);

    const styles = mode === "booking"
      ? Array.from(new Set(bookingLineItems.map((li) => li.booking.style).filter(Boolean))).join(", ")
      : null;
    const firstBooking = mode === "booking" ? bookingLineItems[0]?.booking : null;

    const piNo = await generatePiNo(supabase, selectedCustomer ?? null, piDate);
    const createdBy = await getCurrentUserId(supabase);

    const { data: pi, error: piError } = await supabase
      .from("proforma_invoices")
      .insert({
        pi_no: piNo,
        created_by: createdBy,
        customer_id: mode === "booking" ? customerId : (customerId || null),
        pi_date: piDate,
        valid_till: validTill || null,
        style: styles,
        buyer_name: firstBooking?.buyers?.name ?? null,
        merchant_name: merchantName || firstBooking?.merchants?.name || null,
        garments_id: garmentsId || null,
        garments_name: selectedGarment?.name ?? firstBooking?.garments_name ?? null,
        garments_address: garmentsAddress || null,
        item_description: itemDescription || null,
        advising_bank_id: advisingBankId || null,
        advising_bank_name: advisingBankName || null,
        advising_bank_branch: advisingBankBranch || null,
        advising_bank_address: advisingBankAddress || null,
        advising_bank_swift: advisingBankSwift || null,
        total_weight_kg: parseFloat(totalWeightKg) || null,
        hs_code: hsCode, bin_no: binNo,
        total_amount: totalAmount,
        currency, discount_type: discountType, discount_value: parseFloat(discountValue) || 0,
        adjustment_amount: parseFloat(adjustmentAmount) || 0,
        price_decimals: pd,
        exchange_rate_to_bdt: parseFloat(exchangeRate) || 107,
        terms_conditions: termsConditions, is_manual: mode === "manual", status: "draft",
      })
      .select().single();

    if (piError || !pi) {
      setLoading(false);
      setError(piError?.message ?? "PI তৈরি ব্যর্থ হয়েছে।");
      return;
    }

    if (mode === "booking") {
      const rate = parseFloat(exchangeRate) || 107;
      const { error: itemsError } = await supabase.from("pi_items").insert(
        bookingLineItems.map((li, i) => {
          const { tubeInch, cuttingInch } = lineTubeCuttingInches(li.booking);
          const base = {
            pi_id: pi.id, booking_id: li.booking.id, sl_no: i + 1,
            description: lineDescriptionText(li.booking),
            measurement: lineMeasurementText(li.booking),
            qty_pcs: li.qty, price_unit: li.priceUnit, price_basis: li.basis,
            pi_thickness_mm: lineThickness(li.booking) || null,
            tube_inch: tubeInch || null, cutting_inch: cuttingInch || null,
          };
          // AT-এর জন্য ব্রেকডাউন কলামগুলো খালি থাকে (আগের মতোই একটা Price/Unit ম্যানুয়াল)
          if (isAtAccessories) return base;
          const bd = lineBreakdown(li.booking);
          return {
            ...base,
            print_charge: currency === "USD" ? bd.printCharge / rate : bd.printCharge,
            adhesive_charge: currency === "USD" ? bd.adhesiveCharge / rate : bd.adhesiveCharge,
            // price_per_lbs সবসময় BDT-তে সেভ হয় — resolvedLineInputs() ইতিমধ্যে Price/Lbs
            // USD-তে টাইপ করা থাকলে BDT-তে কনভার্ট করে দেয় (উপরের ratePerLbs, একই লজিক)
            price_per_lbs: resolvedLineInputs(li.booking).ratePerLbs,
            percentage_value: parseFloat(bookingPercentage[li.booking.id] || "") || getBuyerRule(li.booking)?.percentage_value || 0,
            extra_charge: parseFloat(bookingExtra[li.booking.id] || "") || getBuyerRule(li.booking)?.usd_surcharge_per_pc || 0,
            other_charge: parseFloat(bookingOtherCharge[li.booking.id] || "") || 0,
            weight_kg: lineWeightLbs(li.booking) / 2.2 || null,
          };
        })
      );
      if (itemsError) {
        setLoading(false);
        setError("PI Item সেভ ব্যর্থ হয়েছে: " + itemsError.message);
        return;
      }
    } else {
      const { error: itemsError } = await supabase.from("pi_items").insert(
        manualLineItems.map((li, i) => ({
          pi_id: pi.id, booking_id: null, sl_no: i + 1,
          description: li.description, measurement: li.measurement,
          qty_pcs: li.qtyPcs, price_unit: li.priceUnit, price_basis: li.priceBasis,
          pi_thickness_mm: li.thickness || null,
          tube_inch: li.tube || null, cutting_inch: li.cutting || null,
        }))
      );
      if (itemsError) {
        setLoading(false);
        setError("PI Item সেভ ব্যর্থ হয়েছে: " + itemsError.message);
        return;
      }
    }

    setLoading(false);
    router.push("/dashboard/lc-export/proforma");
    router.refresh();
  }

  // ব্রেকডাউন প্যানেলের ছোট লেবেলড ইনপুট (Tube Inch, Price/Lbs ইত্যাদি) — সবগুলোই একই স্টাইল
  function miniField(
    label: string, value: string, onChange?: (v: string) => void, opts?: { placeholder?: string; width?: string }
  ) {
    const readOnly = !onChange;
    return (
      <div className={opts?.width || "w-24"}>
        <label className="block text-[10px] text-gray-500">{label}</label>
        <input
          type="number" step="0.0001"
          value={value}
          readOnly={readOnly}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={opts?.placeholder}
          className={`w-full rounded border px-2 py-1 text-xs ${readOnly ? "bg-gray-100 text-gray-500" : ""}`}
        />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4 max-w-5xl">
      <div className="flex gap-2">
        <button type="button" onClick={() => setMode("booking")} className={`rounded-lg px-4 py-2 text-sm ${mode === "booking" ? "bg-gray-900 text-white" : "border text-gray-600"}`}>
          Booking থেকে তৈরি করুন
        </button>
        <button type="button" onClick={() => setMode("manual")} className={`rounded-lg px-4 py-2 text-sm ${mode === "manual" ? "bg-gray-900 text-white" : "border text-gray-600"}`}>
          Manual PI (Booking ছাড়া)
        </button>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex-1 max-w-xs">
          <label className="block text-sm text-gray-600 mb-1">Customer {mode === "manual" && "(ঐচ্ছিক)"}</label>
          <select
            value={customerId}
            onChange={(e) => { setCustomerId(e.target.value); setSelectedBookings({}); setBookingAdjust({}); setGarmentsId(""); setGarmentsAddress(""); setBuyerFilter(""); setMerchantFilter(""); setMerchantName(""); setStyleFilter(""); }}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            required={mode === "booking"}
          >
            <option value="">-- বাছুন --</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {customerId && (
          <div>
            <label className="block text-sm text-gray-600 mb-1">Garments (Print &quot;To&quot;)</label>
            <select value={garmentsId} onChange={(e) => onGarmentsChange(e.target.value)} className="rounded-lg border px-3 py-2 text-sm min-w-[180px]">
              <option value="">-- বাছুন --</option>
              {availableGarments.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        )}
        {mode === "booking" && customerId && (
          <>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Buyer Filter</label>
              <select value={buyerFilter} onChange={(e) => onBuyerFilterChange(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
                <option value="">সব</option>
                {availableBuyers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Merchant Filter</label>
              <select value={merchantFilter} onChange={(e) => { setMerchantFilter(e.target.value); setMerchantName(e.target.value); }} className="rounded-lg border px-3 py-2 text-sm">
                <option value="">সব</option>
                {availableMerchants.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Style Filter</label>
              <select value={styleFilter} onChange={(e) => setStyleFilter(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
                <option value="">সব</option>
                {availableStyles.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </>
        )}
        <div>
          <label className="block text-sm text-gray-600 mb-1">PI Date</label>
          <input type="date" value={piDate} onChange={(e) => setPiDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" required />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">PI Validity Date</label>
          <input type="date" value={validTill} onChange={(e) => { setValidTill(e.target.value); setValidTillTouched(true); }} className="rounded-lg border px-3 py-2 text-sm" />
          <p className="text-[11px] text-gray-400 mt-1">PI Date + ২ মাস (Terms Clause 10)</p>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Currency</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
            <option value="USD">USD</option>
            <option value="BDT">BDT</option>
            <option value="EUR">EUR</option>
          </select>
        </div>
        {currency === "USD" && (
          <div>
            <label className="block text-sm text-gray-600 mb-1">USD → BDT Rate</label>
            <input type="number" step="0.01" value={exchangeRate} onChange={(e) => { setExchangeRate(e.target.value); setRateTouched(true); }} className="rounded-lg border px-3 py-2 text-sm w-28" />
          </div>
        )}
      </div>

      {mode === "booking" && customerId && isAtAccessories && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-3 py-2 w-10"></th>
                <th className="px-3 py-2">Booking</th>
                <th className="px-3 py-2">Garments</th>
                <th className="px-3 py-2">Style</th>
                <th className="px-3 py-2">Measurement</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 w-20">Basis</th>
                <th className="px-3 py-2 w-24">PI Thick</th>
                <th className="px-3 py-2 w-32">Price/Unit</th>
                <th className="px-3 py-2 w-24">Adjust</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {customerBookings.map((b) => {
                const rule = getBuyerRule(b);
                const basis = bookingBasis[b.id] || "pcs";
                const suggested = getSuggestedPrice(b) * basisFactor(basis);
                const defaults = getBuyerDefaults(b);
                return (
                  <tr key={b.id} className="border-t">
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={!!selectedBookings[b.id]} onChange={(e) => toggleBooking(b, e.target.checked)} />
                    </td>
                    <td className="px-3 py-2 font-medium">{b.booking_no}</td>
                    <td className="px-3 py-2 text-gray-500">{b.garments_name || "-"}</td>
                    <td className="px-3 py-2 text-gray-500">{b.style || "-"}</td>
                    <td className="px-3 py-2 text-gray-500">{formatMeasurement(b)}</td>
                    <td className="px-3 py-2 text-right">{b.quantity_pcs}</td>
                    <td className="px-3 py-2">
                      <select value={basis} onChange={(e) => changeBasis(b, e.target.value as "pcs" | "dzn")} className="w-full rounded border px-1 py-1 text-xs">
                        <option value="pcs">Per Pc</option>
                        <option value="dzn">Per Dzn</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number" step="0.1"
                        value={bookingThickness[b.id] ?? ""}
                        onChange={(e) => changeThickness(b, e.target.value)}
                        className="w-16 rounded border px-1 py-1 text-xs"
                        placeholder={rule?.pi_thickness_mm != null ? String(rule.pi_thickness_mm) : ""}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 items-center">
                        <input
                          type="number" step="0.0001"
                          value={bookingPrice[b.id] || ""}
                          onChange={(e) => setBookingPrice((prev) => ({ ...prev, [b.id]: e.target.value }))}
                          className="w-24 rounded border px-2 py-1 text-sm"
                        />
                        {rule && rule.pricing_rule !== "manual" && suggested > 0 && (
                          <button type="button" onClick={() => applyAutoPrice(b.id, basis)} className="text-xs text-blue-600 hover:underline whitespace-nowrap" title={`Buyer Rule: ${rule.pricing_rule}`}>
                            Use {suggested.toFixed(pd)}
                          </button>
                        )}
                      </div>
                      {(defaults.thickness || defaults.adhesiveRate || defaults.printColors !== null) && (
                        <div className="mt-1 text-[11px] text-gray-500">
                          {defaults.thickness !== null && <>PI Thick: {defaults.thickness} mm</>}
                          {defaults.adhesiveRate !== null && <> • Adhesive: {defaults.adhesiveRate}/inch</>}
                          {defaults.printColors !== null && <> • Print: {defaults.printColors} color</>}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number" step="0.0001"
                        value={bookingAdjust[b.id] || ""}
                        onChange={(e) => setBookingAdjust((prev) => ({ ...prev, [b.id]: e.target.value }))}
                        className="w-20 rounded border px-2 py-1 text-sm"
                        placeholder="0"
                      />
                      <span className="block text-[11px] text-gray-400">± /{basis === "dzn" ? "dzn" : "pc"}</span>
                      <div className="mt-1 text-[11px] whitespace-nowrap text-gray-500">= {effectivePriceUnit(b.id).toFixed(pd)}/{basis === "dzn" ? "dzn" : "pc"}</div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {money(calcLineAmount(b.quantity_pcs, effectivePriceUnit(b.id), basis))}
                    </td>
                  </tr>
                );
              })}
              {customerBookings.length === 0 && (
                <tr><td colSpan={11} className="px-3 py-3 text-gray-400 italic">এই ফিল্টারে কোনো বুকিং নেই</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {mode === "booking" && customerId && !isAtAccessories && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-3 py-2 w-10"></th>
                <th className="px-3 py-2">Booking</th>
                <th className="px-3 py-2">Garments</th>
                <th className="px-3 py-2">Style</th>
                <th className="px-3 py-2">Measurement</th>
                <th className="px-3 py-2 text-right w-24">Qty (Pcs)</th>
                <th className="px-3 py-2 w-20">Basis</th>
                <th className="px-3 py-2 w-28">Price/Unit</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {customerBookings.map((b) => {
                const checked = !!selectedBookings[b.id];
                const qty = lineQty(b);
                const basis = bookingBasis[b.id] || "pcs";
                return (
                  <Fragment key={b.id}>
                    <tr className="border-t align-top">
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={checked} onChange={(e) => toggleBooking(b, e.target.checked)} />
                      </td>
                      <td className="px-3 py-2 font-medium">{b.booking_no}</td>
                      <td className="px-3 py-2 text-gray-500">{b.garments_name || "-"}</td>
                      <td className="px-3 py-2 text-gray-500">{b.style || "-"}</td>
                      <td className="px-3 py-2">
                        <input
                          value={bookingMeasurement[b.id] ?? formatMeasurement(b)}
                          onChange={(e) => setBookingMeasurement((prev) => ({ ...prev, [b.id]: e.target.value }))}
                          className="w-full min-w-[140px] rounded border px-2 py-1 text-xs text-gray-600"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          value={bookingQty[b.id] ?? String(b.quantity_pcs)}
                          onChange={(e) => applyBreakdownChange(b, "qty", setBookingQty, e.target.value)}
                          className="w-full rounded border px-2 py-1 text-sm text-right"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select value={basis} onChange={(e) => changeBasis(b, e.target.value as "pcs" | "dzn")} className="w-full rounded border px-1 py-1 text-xs">
                          <option value="pcs">Per Pc</option>
                          <option value="dzn">Per Dzn</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number" step="0.0001"
                          value={bookingPrice[b.id] || ""}
                          onChange={(e) => setBookingPrice((prev) => ({ ...prev, [b.id]: e.target.value }))}
                          className="w-full rounded border px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        {money(calcLineAmount(qty, effectivePriceUnit(b.id), basis))}
                      </td>
                    </tr>
                    {checked && (() => {
                      const r = resolvedLineInputs(b, undefined, basis);
                      const bd = lineBreakdown(b);
                      const weightKg = lineWeightLbs(b) / 2.2;
                      return (
                        <tr className="bg-gray-50/60 border-t">
                          <td></td>
                          <td colSpan={8} className="px-3 py-3">
                            <div className="mb-2">
                              <label className="block text-[10px] text-gray-500">Description</label>
                              <input
                                value={bookingDescription[b.id] ?? buildBookingDescription(b)}
                                onChange={(e) => setBookingDescription((prev) => ({ ...prev, [b.id]: e.target.value }))}
                                className="w-full max-w-md rounded border px-2 py-1 text-xs"
                              />
                            </div>
                            <div className="flex flex-wrap gap-2 items-end">
                              {miniField("Tube\"", bookingTubeInch[b.id] ?? (r.tubeInch ? r.tubeInch.toFixed(3) : ""),
                                (v) => applyBreakdownChange(b, "tubeInch", setBookingTubeInch, v))}
                              {miniField("Cutting\"", bookingCuttingInch[b.id] ?? (r.cuttingInch ? r.cuttingInch.toFixed(3) : ""),
                                (v) => applyBreakdownChange(b, "cuttingInch", setBookingCuttingInch, v))}
                              {miniField("Thickness (mm)", bookingThickness[b.id] ?? "", (v) => changeThickness(b, v),
                                { placeholder: r.rule?.pi_thickness_mm != null ? String(r.rule.pi_thickness_mm) : "" })}
                              <div className="w-28">
                                <div className="flex items-center justify-between">
                                  <label className="block text-[10px] text-gray-500">Price/Lbs</label>
                                  <select
                                    value={bookingPricePerLbsCurrency[b.id] ?? "BDT"}
                                    onChange={(e) => setLbsCurrency(b, e.target.value as "BDT" | "USD")}
                                    className="rounded border text-[9px] leading-tight"
                                  >
                                    <option value="BDT">BDT</option>
                                    <option value="USD">USD</option>
                                  </select>
                                </div>
                                <input
                                  type="number" step="0.0001"
                                  value={bookingPricePerLbs[b.id] ?? (
                                    r.ratePerLbsNative
                                      ? r.ratePerLbsNative.toFixed(r.pricePerLbsCurrency === "USD" ? 4 : 2)
                                      : ""
                                  )}
                                  onChange={(e) => applyBreakdownChange(b, "pricePerLbs", setBookingPricePerLbs, e.target.value)}
                                  className="w-full rounded border px-2 py-1 text-xs"
                                />
                              </div>
                              {miniField("Adhesive/Pc (BDT)", bookingAdhesivePc[b.id] ?? (bd.adhesiveCharge ? bd.adhesiveCharge.toFixed(4) : "0"),
                                (v) => applyBreakdownChange(b, "adhesivePc", setBookingAdhesivePc, v))}
                              {miniField("Print/Pc (BDT)", bookingPrintPc[b.id] ?? (bd.printCharge ? bd.printCharge.toFixed(4) : "0"),
                                (v) => applyBreakdownChange(b, "printPc", setBookingPrintPc, v))}
                              {miniField("Percentage (%)", bookingPercentage[b.id] ?? (r.percentage ? String(r.percentage) : "0"),
                                (v) => applyBreakdownChange(b, "percentage", setBookingPercentage, v))}
                              {miniField(`Extra (USD/${basis === "dzn" ? "dzn" : "pc"})`, bookingExtra[b.id] ?? (r.extra ? String(r.extra) : "0"),
                                (v) => applyBreakdownChange(b, "extra", setBookingExtra, v))}
                              {miniField(`Other Charge (BDT/${basis === "dzn" ? "dzn" : "pc"})`, bookingOtherCharge[b.id] ?? "0",
                                (v) => applyBreakdownChange(b, "otherCharge", setBookingOtherCharge, v))}
                              {miniField("Weight (Kg)", weightKg ? weightKg.toFixed(2) : "0")}
                              {miniField("Qty (Dzn)", (qty / 12).toFixed(2))}
                              <div className="text-[11px] text-gray-500 whitespace-nowrap pb-1">
                                = {bd.withMarkup.toFixed(4)} BDT/pc + {r.extra || 0} USD (Extra) + {r.otherCharge || 0} BDT (Other) → {effectivePriceUnit(b.id).toFixed(pd)} {currency}/{basis === "dzn" ? "dzn" : "pc"}
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })()}
                  </Fragment>
                );
              })}
              {customerBookings.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-3 text-gray-400 italic">এই ফিল্টারে কোনো বুকিং নেই</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {mode === "manual" && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">Measurement</th>
                <th className="px-3 py-2 text-right w-24">Qty (Pcs)</th>
                <th className="px-3 py-2 w-20">Basis</th>
                <th className="px-3 py-2 w-28">Price/Unit</th>
                <th className="px-3 py-2 w-20">Tube&quot;</th>
                <th className="px-3 py-2 w-20">Cutting&quot;</th>
                <th className="px-3 py-2 w-20">Thick(mm)</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {manualLines.map((l, i) => (
                <tr key={i} className="border-t">
                  <td className="px-3 py-2"><input value={l.description} onChange={(e) => updateManualLine(i, "description", e.target.value)} className="w-full rounded border px-2 py-1 text-sm" placeholder="Style/Description" /></td>
                  <td className="px-3 py-2"><input value={l.measurement} onChange={(e) => updateManualLine(i, "measurement", e.target.value)} className="w-full rounded border px-2 py-1 text-sm" placeholder="L-32+F-5 x W-27cm" /></td>
                  <td className="px-3 py-2"><input type="number" value={l.qtyPcs} onChange={(e) => updateManualLine(i, "qtyPcs", e.target.value)} className="w-full rounded border px-2 py-1 text-sm text-right" /></td>
                  <td className="px-3 py-2">
                    <select value={l.priceBasis} onChange={(e) => updateManualLine(i, "priceBasis", e.target.value)} className="w-full rounded border px-1 py-1 text-xs">
                      <option value="pcs">Per Pc</option>
                      <option value="dzn">Per Dzn</option>
                    </select>
                  </td>
                  <td className="px-3 py-2"><input type="number" step="0.0001" value={l.priceUnit} onChange={(e) => updateManualLine(i, "priceUnit", e.target.value)} className="w-full rounded border px-2 py-1 text-sm" /></td>
                  <td className="px-3 py-2"><input type="number" step="0.01" value={l.tubeInch} onChange={(e) => updateManualLine(i, "tubeInch", e.target.value)} className="w-full rounded border px-2 py-1 text-xs" placeholder="ইঞ্চি" /></td>
                  <td className="px-3 py-2"><input type="number" step="0.01" value={l.cuttingInch} onChange={(e) => updateManualLine(i, "cuttingInch", e.target.value)} className="w-full rounded border px-2 py-1 text-xs" placeholder="ইঞ্চি" /></td>
                  <td className="px-3 py-2"><input type="number" step="0.1" value={l.thicknessMm} onChange={(e) => updateManualLine(i, "thicknessMm", e.target.value)} className="w-full rounded border px-2 py-1 text-xs" placeholder="mm" /></td>
                  <td className="px-3 py-2 text-right">{money(calcLineAmount(parseFloat(l.qtyPcs) || 0, parseFloat(l.priceUnit) || 0, l.priceBasis))}</td>
                  <td className="px-3 py-2 text-right">
                    {manualLines.length > 1 && <button type="button" onClick={() => removeManualLine(i)} className="text-red-600 text-xs hover:underline">সরান</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" onClick={addManualLine} className="w-full border-t px-3 py-2 text-xs text-gray-600 hover:bg-gray-50">+ আরেকটি লাইন যোগ করুন</button>
          <p className="px-3 py-2 text-[11px] text-gray-400 border-t">Tube/Cutting/Thickness ঐচ্ছিক — তিনটাই দিলে নিচের Total Weight (Kg) অটো-ক্যালকুলেট হবে।</p>
        </div>
      )}

      <div className="rounded-lg border p-3 bg-gray-50 space-y-3">
        <p className="text-sm font-semibold text-gray-700">Garments Info (Print-এ &quot;To&quot; সেকশনে দেখাবে)</p>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Garments Address (dropdown থেকে অটো, দরকারে এডিট করুন)</label>
          <textarea value={garmentsAddress} onChange={(e) => setGarmentsAddress(e.target.value)} rows={2} className="w-full rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Item (Print-এ &quot;Item:- ...&quot; লাইন — যেমন Poly Bags (0.012cm))</label>
          <input value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Poly Bags (0.012cm)" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Merchant Name (Merchant Filter থেকে অটো, দরকারে এডিট করুন)</label>
          <input value={merchantName} onChange={(e) => setMerchantName(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Merchant নাম" />
        </div>
      </div>

      <div className="rounded-lg border p-3 bg-gray-50 space-y-3">
        <p className="text-sm font-semibold text-gray-700">Advising Bank</p>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Bank বাছুন (বাকিগুলো অটো)</label>
          <select value={advisingBankId} onChange={(e) => onAdvisingBankChange(e.target.value)} className="rounded-lg border px-3 py-2 text-sm min-w-[220px]">
            <option value="">-- বাছুন / নিজে লিখুন --</option>
            {advisingBanks.map((bk) => <option key={bk.id} value={bk.id}>{bk.name}{bk.branch ? ` — ${bk.branch}` : ""}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-3">
          <input value={advisingBankName} onChange={(e) => setAdvisingBankName(e.target.value)} placeholder="Bank Name" className="flex-1 min-w-[160px] rounded-lg border px-3 py-2 text-sm" />
          <input value={advisingBankBranch} onChange={(e) => setAdvisingBankBranch(e.target.value)} placeholder="Branch Name" className="flex-1 min-w-[160px] rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div className="flex flex-wrap gap-3">
          <input value={advisingBankAddress} onChange={(e) => setAdvisingBankAddress(e.target.value)} placeholder="সংক্ষিপ্ত ঠিকানা" className="flex-1 min-w-[160px] rounded-lg border px-3 py-2 text-sm" />
          <input value={advisingBankSwift} onChange={(e) => setAdvisingBankSwift(e.target.value)} placeholder="Swift Code" className="w-40 rounded-lg border px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Total Weight (Kg) — PI Thickness ধরে অটো</label>
          <div className="flex items-center gap-2">
            <input type="number" step="0.01" value={totalWeightKg} onChange={(e) => { setTotalWeightKg(e.target.value); setWeightTouched(true); }} className="rounded-lg border px-3 py-2 text-sm w-32" />
            {weightTouched && autoWeightKg > 0 && (
              <button type="button" onClick={() => { setWeightTouched(false); setTotalWeightKg(String(Math.round(autoWeightKg))); }} className="text-xs text-blue-600 hover:underline whitespace-nowrap">
                Auto {Math.round(autoWeightKg)}
              </button>
            )}
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">H.S. Code</label>
          <input value={hsCode} onChange={(e) => setHsCode(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-36" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">BIN No</label>
          <input value={binNo} onChange={(e) => setBinNo(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-40" />
        </div>
      </div>

      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Price/Unit দশমিক ঘর</label>
          <input type="number" min="0" max="8" step="1" value={priceDecimals} onChange={(e) => setPriceDecimals(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-20" />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Discount Type</label>
          <select value={discountType} onChange={(e) => setDiscountType(e.target.value as any)} className="rounded-lg border px-3 py-2 text-sm">
            <option value="none">নেই</option>
            <option value="percentage">Percentage (%)</option>
            <option value="fixed">Fixed Amount</option>
          </select>
        </div>
        {discountType !== "none" && (
          <div>
            <label className="block text-sm text-gray-600 mb-1">Discount Value</label>
            <input type="number" step="0.01" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-32" />
          </div>
        )}
        <div>
          <label className="block text-sm text-gray-600 mb-1">Adjustment (±)</label>
          <input type="number" step="0.01" value={adjustmentAmount} onChange={(e) => setAdjustmentAmount(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-32" placeholder="0" />
          <p className="text-[11px] text-gray-400 mt-1">Discount-এর পরে, Total-এর আগে যোগ/বিয়োগ হবে</p>
        </div>
      </div>

      <div>
        <label className="block text-sm text-gray-600 mb-1">Terms &amp; Conditions</label>
        <textarea value={termsConditions} onChange={(e) => setTermsConditions(e.target.value)} rows={9} className="w-full rounded-lg border px-3 py-2 text-sm font-mono" />
        <p className="text-[11px] text-gray-400 mt-1">Clause 10 (PI Validity) Print-এ উপরের &quot;PI Validity Date&quot; থেকে অটো যোগ হবে।</p>
      </div>

      <div className="rounded-lg bg-gray-50 border p-4 space-y-1 text-sm">
        <p>Subtotal: <strong>{currency} {money(subtotal)}</strong></p>
        {discountType !== "none" && <p>Discount: <strong>{currency} {money(discountAmount)}</strong></p>}
        {(parseFloat(adjustmentAmount) || 0) !== 0 && (
          <p>Adjustment: <strong>{currency} {(parseFloat(adjustmentAmount) || 0) > 0 ? "+" : ""}{money(parseFloat(adjustmentAmount) || 0)}</strong></p>
        )}
        <p className="text-base">Total: <strong>{currency} {money(totalAmount)}</strong></p>
        <p className="text-xs text-gray-500 italic">{amountInWords(totalAmount, currency)}</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "সেভ হচ্ছে..." : "Proforma Invoice তৈরি করুন"}
      </button>
    </form>
  );
}
