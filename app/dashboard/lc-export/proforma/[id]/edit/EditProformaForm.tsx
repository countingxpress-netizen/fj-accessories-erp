"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { amountInWords, currencySymbol } from "@/lib/numberToWords";
import { money } from "@/lib/format";
import { calcPiUnitPrice, calcPiUnitPriceWithMarkup, calcPiWeightLbs, calcTubeCutting, toInches } from "@/lib/calcTubeCutting";
import { resolveRate } from "@/lib/rateHistory";

type Garment = { id: string; customer_id: string; name: string; address: string | null };
type AdvisingBank = { id: string; name: string; branch: string | null; address: string | null; swift: string | null };
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
type BuyerMaster = { id: string; customer_id: string; name: string; pricing_rule: string; percentage_value: number; rate_per_lbs_value: number; pi_thickness_mm: number | null; adhesive_rate_per_inch: number | null; print_colors_default: number | null; usd_bdt_rate: number | null; price_basis_default: string | null; usd_surcharge_per_pc: number | null };
type BuyerRateHistoryRow = { buyer_id: string; effective_from: string; rate: number };

function round(n: number, decimals: number) {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

// Print/Adhesive charge সবসময় BDT-তে লেখা হয় (buyer rule ইঞ্জিনের calcPiUnitPriceWithMarkup-এর
// কনভেনশন অনুযায়ী — পুরো base+adhesive+print যোগফলটাই শেষে একবারে rate দিয়ে ভাগ হয়ে USD হয়)।
// তাই USD/EUR PI-তে এগুলোকে Price/Unit-এর সাথে মেলানোর আগে exchange rate দিয়ে ভাগ করে
// currency-তে আনতে হয়। BDT PI-তে ভাগ লাগে না (÷1)।
function currencyDivisorFor(currency: string, exchangeRate: number) {
  return currency === "USD" ? (exchangeRate || 107) : 1;
}

// price_unit-এ ইতিমধ্যে বেক করা আছে এমন একটা "effective rate/Lbs" রিভার্স-ক্যালকুলেট করে —
// যাতে পরে Thickness/Print/Adhesive/Tube/Cutting বদলালে Price/Unit-ও প্রোপোরশনালি
// রিক্যালকুলেট করা যায়। Tube/Cutting সেভ করা না থাকলে (পুরনো PI Item), বা Print+Adhesive
// (BDT→currency কনভার্টের পরও) Price/Unit-এর চেয়ে বড় হয়ে গেলে ০ রিটার্ন করে — তখন
// Price/Unit যথারীতি সম্পূর্ণ ম্যানুয়াল থেকে যায় (আগের আচরণ অক্ষুণ্ণ)।
function deriveEffectiveRatePerLbs(
  priceUnit: number, basis: string, thicknessMm: number,
  tubeInch: number, cuttingInch: number, printChargeBdt: number, adhesiveChargeBdt: number,
  currencyDivisor: number
): number {
  if (!thicknessMm || !tubeInch || !cuttingInch) return 0;
  const perPiece = basis === "dzn" ? priceUnit / 12 : priceUnit;
  const base = perPiece - (printChargeBdt + adhesiveChargeBdt) / currencyDivisor;
  if (base <= 0) return 0;
  return (base * 75000) / (tubeInch * cuttingInch * thicknessMm);
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

function buildBookingDescription(b: Booking): string {
  const parts: string[] = [];
  const style = b.style?.trim();
  const ref = b.customer_booking_ref?.trim();
  if (style) parts.push(/^st[-\s]/i.test(style) ? style : `St-${style}`);
  if (ref) parts.push(/^bn[-\s]/i.test(ref) ? ref : `BN-${ref}`);
  return parts.join("\n") || b.booking_no;
}

export default function EditProformaForm({
  pi, items, garments = [], advisingBanks = [],
  bookings = [], buyersMaster = [], buyerRateHistory = [], lastUnitPriceByBooking = {}, customerDefaultPrintRate = null,
}: {
  pi: any; items: any[]; garments?: Garment[]; advisingBanks?: AdvisingBank[];
  bookings?: Booking[]; buyersMaster?: BuyerMaster[]; buyerRateHistory?: BuyerRateHistoryRow[];
  lastUnitPriceByBooking?: Record<string, number>; customerDefaultPrintRate?: number | null;
}) {
  const [piDate, setPiDate] = useState(pi.pi_date);
  const [currency, setCurrency] = useState(pi.currency);
  const [discountType, setDiscountType] = useState(pi.discount_type);
  const [discountValue, setDiscountValue] = useState(String(pi.discount_value ?? 0));
  const [priceDecimals, setPriceDecimals] = useState(String(pi.price_decimals ?? 4));
  const [status, setStatus] = useState(pi.status);
  const [termsConditions, setTermsConditions] = useState(pi.terms_conditions ?? "");
  const [validTill, setValidTill] = useState(pi.valid_till ?? "");
  const [garmentsId, setGarmentsId] = useState(pi.garments_id ?? "");
  const [garmentsName, setGarmentsName] = useState(pi.garments_name ?? "");
  const [garmentsAddress, setGarmentsAddress] = useState(pi.garments_address ?? "");
  const [itemDescription, setItemDescription] = useState(pi.item_description ?? "Poly Bags");
  const [merchantName, setMerchantName] = useState(pi.merchant_name ?? "");
  const [advisingBankId, setAdvisingBankId] = useState(pi.advising_bank_id ?? "");
  const [advisingBankName, setAdvisingBankName] = useState(pi.advising_bank_name ?? "");
  const [advisingBankBranch, setAdvisingBankBranch] = useState(pi.advising_bank_branch ?? "");
  const [advisingBankAddress, setAdvisingBankAddress] = useState(pi.advising_bank_address ?? "");
  const [advisingBankSwift, setAdvisingBankSwift] = useState(pi.advising_bank_swift ?? "");
  const [hsCode, setHsCode] = useState(pi.hs_code ?? "3923.21.00");
  const [binNo, setBinNo] = useState(pi.bin_no ?? "000113803-1201");
  const [exchangeRate, setExchangeRate] = useState(pi.exchange_rate_to_bdt ? String(pi.exchange_rate_to_bdt) : "107");
  // /new পেজের মতোই — buyer-এর নিজের USD→BDT rate (buyers.usd_bdt_rate) থাকলে প্রথমবার
  // বুকিং বাছার সময় exchange rate অটো বসে (AT-এর মতো real market rate না — Irish-এর
  // মতো buyer নিজেই ভিন্ন সরল rate ব্যবহার করলে ভুল suggested price আসা ঠেকায়)। ইউজার
  // হাতে rate বদলালে rateTouched=true হয়ে যাবে, তারপর আর অটো বসবে না।
  const [rateTouched, setRateTouched] = useState(false);

  const [lines, setLines] = useState(items.map((it) => ({
    id: it.id, description: it.description, measurement: it.measurement,
    qtyPcs: String(it.qty_pcs), priceUnit: String(it.price_unit), priceBasis: it.price_basis,
    thickness: it.pi_thickness_mm ? String(it.pi_thickness_mm) : "",
    printCharge: it.print_charge ? String(it.print_charge) : "",
    adhesiveCharge: it.adhesive_charge ? String(it.adhesive_charge) : "",
    tubeInch: it.tube_inch ? String(it.tube_inch) : "",
    cuttingInch: it.cutting_inch ? String(it.cutting_inch) : "",
  })));

  // প্রতি লাইনের effective Rate/Lbs — mount-এ সেভ করা ডেটা থেকে ডেরাইভ করার চেষ্টা করে (নতুন
  // PI-তে Tube/Cutting থাকলে সাথে সাথেই কাজ করে); পুরনো PI Item-এ না থাকলে updateLine()
  // পরে লাইভ বসিয়ে দেয় (নিচে দেখুন)।
  const lineRatesRef = useRef(items.map((it) =>
    deriveEffectiveRatePerLbs(
      parseFloat(it.price_unit) || 0, it.price_basis, parseFloat(it.pi_thickness_mm) || 0,
      parseFloat(it.tube_inch) || 0, parseFloat(it.cutting_inch) || 0,
      parseFloat(it.print_charge) || 0, parseFloat(it.adhesive_charge) || 0,
      currencyDivisorFor(pi.currency, parseFloat(pi.exchange_rate_to_bdt) || 107)
    )
  ));

  function initialAutoWeightKg() {
    return items.reduce((s, it) => {
      const qty = parseFloat(it.qty_pcs) || 0;
      const tube = parseFloat(it.tube_inch) || 0;
      const cutting = parseFloat(it.cutting_inch) || 0;
      const thickness = parseFloat(it.pi_thickness_mm) || 0;
      const weightLbs = tube > 0 && cutting > 0 && thickness > 0 ? (qty * tube * cutting * thickness) / 75000 : 0;
      return s + weightLbs / 2.2;
    }, 0);
  }

  const [totalWeightKg, setTotalWeightKg] = useState(pi.total_weight_kg ? String(pi.total_weight_kg) : "");
  // সেভ করা Total Weight যদি অটো-ক্যালকুলেশনের সাথে ইতিমধ্যে মিলে যায় (নতুন PI, বা এখনো এডিট হয়নি),
  // তাহলে touched=false রেখে Tube/Cutting/Thickness বদলালে অটো-রিক্যালকুলেট চালু থাকবে।
  // ম্যানুয়ালি ভিন্ন একটা ওজন সেভ করা থাকলে (touched=true) সেটা এখানে না ছুঁয়ে রেখে দেওয়া হয়।
  const [weightTouched, setWeightTouched] = useState(() => {
    const auto = initialAutoWeightKg();
    const saved = parseFloat(pi.total_weight_kg) || 0;
    return auto > 0 && Math.abs(auto - saved) > 0.005;
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const sym = currencySymbol(currency);

  const pd = Math.max(0, Math.min(8, parseInt(priceDecimals) || 4));
  const roundPrice = (n: number) => round(n, pd);

  function onGarmentsChange(id: string) {
    setGarmentsId(id);
    const g = garments.find((x) => x.id === id);
    if (g) { setGarmentsName(g.name); setGarmentsAddress(g.address || ""); }
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

  const RECALC_FIELDS = new Set(["thickness", "printCharge", "adhesiveCharge", "tubeInch", "cuttingInch"]);

  // rate একবার জানা হয়ে গেলে (lineRatesRef.current[i] > 0), তারপর Thickness/Print/
  // Adhesive/Tube/Cutting যেকোনোটা বদলালেই Price/Unit সেই rate ধরে ফরওয়ার্ড
  // রিক্যালকুলেট হয়। rate এখনো অজানা থাকলে (পুরনো PI Item, Tube/Cutting সেভ করা নেই)
  // এখানে কিছু বদলায় না — বেসলাইন rate বসে শুধু commitLineGeometry()-তে, onBlur-এ
  // (নিচে দেখুন) — প্রতিটা কি-স্ট্রোকে না, কারণ টাইপ করার মাঝপথের আধা-লেখা সংখ্যা
  // (যেমন "46" টাইপ করার সময় "4") দিয়ে rate বসিয়ে ফেললে সেটা ভুল/স্থায়ীভাবে নষ্ট
  // rate হয়ে যায় — এটা আগে বাস্তব বাগ হিসেবে ধরা পড়েছে, তাই এই সাবধানতা।
  // Price/Unit ম্যানুয়ালি বদলালে সেটাকেই নতুন বেসলাইন rate ধরা হয় (প্রতি কি-স্ট্রোকে
  // ফ্রেশ ডেরাইভ — কম্পাউন্ড হয় না, তাই এখানে সমস্যা নেই)।
  function updateLine(i: number, field: string, value: string) {
    const l = lines[i];
    const updated = { ...l, [field]: value };

    if (field === "priceUnit") {
      const thickness = parseFloat(updated.thickness) || 0;
      const tubeInch = parseFloat(updated.tubeInch) || 0;
      const cuttingInch = parseFloat(updated.cuttingInch) || 0;
      const printCharge = parseFloat(updated.printCharge) || 0;
      const adhesiveCharge = parseFloat(updated.adhesiveCharge) || 0;
      const divisor = currencyDivisorFor(currency, parseFloat(exchangeRate) || 107);
      const newRate = deriveEffectiveRatePerLbs(parseFloat(value) || 0, updated.priceBasis, thickness, tubeInch, cuttingInch, printCharge, adhesiveCharge, divisor);
      if (newRate > 0) lineRatesRef.current[i] = newRate;
    } else if (RECALC_FIELDS.has(field)) {
      const existingRate = lineRatesRef.current[i] || 0;
      if (existingRate > 0) {
        const thickness = parseFloat(updated.thickness) || 0;
        const tubeInch = parseFloat(updated.tubeInch) || 0;
        const cuttingInch = parseFloat(updated.cuttingInch) || 0;
        const printCharge = parseFloat(updated.printCharge) || 0;
        const adhesiveCharge = parseFloat(updated.adhesiveCharge) || 0;
        const divisor = currencyDivisorFor(currency, parseFloat(exchangeRate) || 107);
        if (thickness > 0 && tubeInch > 0 && cuttingInch > 0) {
          const perPiece = roundPrice((existingRate * tubeInch * cuttingInch * thickness) / 75000 + (printCharge + adhesiveCharge) / divisor);
          updated.priceUnit = String(updated.priceBasis === "dzn" ? roundPrice(perPiece * 12) : perPiece);
        }
      }
    }

    setLines((prev) => prev.map((row, idx) => (idx === i ? updated : row)));
  }

  // Tube"/Cutting"/Thickness ফিল্ড থেকে ফোকাস সরলে (onBlur — মানে টাইপ করা শেষ, চূড়ান্ত
  // ভ্যালু) কল হয়। এখানেই একমাত্র জায়গা যেখানে নতুন বেসলাইন rate বসে (bootstrap) —
  // rate তখনও অজানা থাকলে এবং তিনটা মাপ (Tube+Cutting+Thickness) এখন সব থাকলে, বর্তমান
  // (ম্যানুয়াল) Price/Unit-কে বেসলাইন ধরে rate সেট করা হয়। এই ধাপে Price/Unit নিজে
  // বদলায় না — পরের এডিট থেকে ফরওয়ার্ড রিক্যালকুলেট শুরু হবে।
  function commitLineGeometry(i: number) {
    const l = lines[i];
    if ((lineRatesRef.current[i] || 0) > 0) return;
    const thickness = parseFloat(l.thickness) || 0;
    const tubeInch = parseFloat(l.tubeInch) || 0;
    const cuttingInch = parseFloat(l.cuttingInch) || 0;
    if (!(thickness > 0 && tubeInch > 0 && cuttingInch > 0)) return;
    const printCharge = parseFloat(l.printCharge) || 0;
    const adhesiveCharge = parseFloat(l.adhesiveCharge) || 0;
    const divisor = currencyDivisorFor(currency, parseFloat(exchangeRate) || 107);
    const bootstrapped = deriveEffectiveRatePerLbs(parseFloat(l.priceUnit) || 0, l.priceBasis, thickness, tubeInch, cuttingInch, printCharge, adhesiveCharge, divisor);
    if (bootstrapped > 0) {
      lineRatesRef.current[i] = bootstrapped;
      // ref বদলালে React নিজে থেকে রি-রেন্ডার করে না — হিন্ট টেক্সট ("✓ Auto-recalc
      // সক্রিয়") আপডেট দেখাতে জোর করে একটা রি-রেন্ডার ট্রিগার করা হচ্ছে।
      setLines((prev) => [...prev]);
    }
  }

  function calcAmount(qtyPcs: string, priceUnit: string, basis: string) {
    const q = parseFloat(qtyPcs) || 0, p = parseFloat(priceUnit) || 0;
    return basis === "dzn" ? (q / 12) * p : q * p;
  }

  const existingSubtotal = lines.reduce((s, l) => s + calcAmount(l.qtyPcs, l.priceUnit, l.priceBasis), 0);

  // ===== নতুন বুকিং যোগ করা (Manual PI-সহ যে কোনো PI-তে, পরে) =====
  // /new পেজের বুকিং-মোডের মতোই: কাস্টমারের বাকি থাকা (অন্য কোনো PI-তে ব্যবহৃত হয়নি এমন)
  // বুকিং বেছে buyer rule অনুযায়ী suggested দাম বসিয়ে এই PI-তে নতুন লাইন হিসেবে যোগ করা যায়।
  const [showAddBooking, setShowAddBooking] = useState(false);
  const [buyerFilter, setBuyerFilter] = useState("");
  const [merchantFilter, setMerchantFilter] = useState("");
  const [styleFilter, setStyleFilter] = useState("");
  const [selectedBookings, setSelectedBookings] = useState<Record<string, boolean>>({});
  const [bookingPrice, setBookingPrice] = useState<Record<string, string>>({});
  const [bookingAdjust, setBookingAdjust] = useState<Record<string, string>>({});
  const [bookingBasis, setBookingBasis] = useState<Record<string, "pcs" | "dzn">>({});
  const [bookingThickness, setBookingThickness] = useState<Record<string, string>>({});

  const filteredBookings = bookings
    .filter((b) => !buyerFilter || b.buyer_id === buyerFilter)
    .filter((b) => !merchantFilter || (b.merchants?.name ?? "") === merchantFilter)
    .filter((b) => !styleFilter || b.style === styleFilter);

  const availableMerchants = Array.from(new Set(bookings.map((b) => b.merchants?.name).filter(Boolean))) as string[];
  const availableStyles = Array.from(new Set(bookings.map((b) => b.style).filter(Boolean))) as string[];

  function getBuyerRule(b: Booking): BuyerMaster | undefined {
    return buyersMaster.find((bm) => bm.id === b.buyer_id);
  }

  function lineThickness(b: Booking): number {
    const raw = bookingThickness[b.id];
    if (raw !== undefined && raw !== "") return parseFloat(raw) || 0;
    return getBuyerRule(b)?.pi_thickness_mm ?? b.pi_thickness_mm ?? 0;
  }

  function lineTubeCuttingInches(b: Booking): { tubeInch: number; cuttingInch: number } {
    const { tube, cutting } = calcTubeCutting(b);
    return toInches(tube, cutting, b.measurement_unit, b.material_type, b.has_print, !!b.plain_cm_conversion);
  }

  function getSuggestedPrice(b: Booking, thicknessOverride?: number): number {
    const rule = getBuyerRule(b);
    if (!rule || rule.pricing_rule === "manual") return 0;
    const rate = parseFloat(exchangeRate) || 107;
    const thickness = thicknessOverride ?? lineThickness(b);
    const printRate = customerDefaultPrintRate ?? 0.2;
    const ratePerLbs = resolveRate(buyerRateHistory.filter((h) => h.buyer_id === rule.id), b.booking_date, rule.rate_per_lbs_value);
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
      const bdtPrice = calcPiUnitPriceWithMarkup(b, ratePerLbs || 0, rule.percentage_value || 0, rule.adhesive_rate_per_inch, thickness, printRate);
      if (!bdtPrice) return 0;
      const surcharge = rule.usd_surcharge_per_pc || 0;
      return currency === "USD" ? roundPrice(bdtPrice / rate + surcharge) : roundPrice(bdtPrice + surcharge * rate);
    }
    return 0;
  }

  function basisFactor(basis: "pcs" | "dzn") {
    return basis === "dzn" ? 12 : 1;
  }

  function applyAutoPrice(bookingId: string, basis: "pcs" | "dzn") {
    const b = bookings.find((bk) => bk.id === bookingId);
    if (!b) return;
    const perPc = getSuggestedPrice(b);
    if (perPc > 0) setBookingPrice((prev) => ({ ...prev, [bookingId]: (perPc * basisFactor(basis)).toFixed(pd) }));
  }

  function maybePrefillRate(b: Booking) {
    if (rateTouched || currency !== "USD") return;
    const rule = getBuyerRule(b);
    if (rule?.usd_bdt_rate) setExchangeRate(String(rule.usd_bdt_rate));
  }

  function toggleBooking(b: Booking, checked: boolean) {
    setSelectedBookings((prev) => ({ ...prev, [b.id]: checked }));
    if (!checked) return;
    const rule = getBuyerRule(b);
    const basis: "pcs" | "dzn" = bookingBasis[b.id] || (rule?.price_basis_default === "dzn" ? "dzn" : "pcs");
    setBookingBasis((prev) => ({ ...prev, [b.id]: basis }));
    if (bookingThickness[b.id] === undefined) {
      const thk = rule?.pi_thickness_mm ?? b.pi_thickness_mm ?? 0;
      if (thk) setBookingThickness((prev) => ({ ...prev, [b.id]: String(thk) }));
    }
    maybePrefillRate(b);
    applyAutoPrice(b.id, basis);
  }

  function changeBasis(b: Booking, basis: "pcs" | "dzn") {
    setBookingBasis((prev) => ({ ...prev, [b.id]: basis }));
    applyAutoPrice(b.id, basis);
  }

  function changeThickness(b: Booking, value: string) {
    setBookingThickness((prev) => ({ ...prev, [b.id]: value }));
    if (selectedBookings[b.id]) {
      const basis = bookingBasis[b.id] || "pcs";
      const perPc = getSuggestedPrice(b, parseFloat(value) || 0);
      if (perPc > 0) setBookingPrice((prev) => ({ ...prev, [b.id]: (perPc * basisFactor(basis)).toFixed(pd) }));
    }
  }

  function effectivePriceUnit(id: string): number {
    return roundPrice((parseFloat(bookingPrice[id] || "0") || 0) + (parseFloat(bookingAdjust[id] || "0") || 0));
  }

  function calcLineAmount(qtyPcs: number, priceUnit: number, basis: "pcs" | "dzn") {
    return basis === "dzn" ? (qtyPcs / 12) * priceUnit : qtyPcs * priceUnit;
  }

  const newBookingLineItems = Object.keys(selectedBookings)
    .filter((id) => selectedBookings[id])
    .map((id) => {
      const b = bookings.find((bk) => bk.id === id);
      if (!b) return null;
      const priceUnit = effectivePriceUnit(id);
      const basis = bookingBasis[id] || "pcs";
      const amount = calcLineAmount(b.quantity_pcs, priceUnit, basis);
      return { booking: b, priceUnit, basis, amount };
    })
    .filter((li): li is { booking: Booking; priceUnit: number; basis: "pcs" | "dzn"; amount: number } => li !== null);

  const newBookingSubtotal = newBookingLineItems.reduce((s, li) => s + li.amount, 0);
  const subtotal = existingSubtotal + newBookingSubtotal;
  const discountAmount = discountType === "percentage" ? (subtotal * parseFloat(discountValue || "0")) / 100
    : discountType === "fixed" ? parseFloat(discountValue || "0") : 0;
  const totalAmount = Math.max(subtotal - discountAmount, 0);

  // Total Weight (Kg) — বিদ্যমান লাইন + নতুন বুকিং-লাইন দুটোই ধরে অটো
  const autoWeightKg = lines.reduce((s, l) => {
    const qty = parseFloat(l.qtyPcs) || 0;
    const tube = parseFloat(l.tubeInch) || 0;
    const cutting = parseFloat(l.cuttingInch) || 0;
    const thickness = parseFloat(l.thickness) || 0;
    const weightLbs = tube > 0 && cutting > 0 && thickness > 0 ? (qty * tube * cutting * thickness) / 75000 : 0;
    return s + weightLbs / 2.2;
  }, 0) + newBookingLineItems.reduce((s, li) => s + calcPiWeightLbs(li.booking, lineThickness(li.booking)) / 2.2, 0);

  useEffect(() => {
    if (!weightTouched && autoWeightKg > 0) setTotalWeightKg(autoWeightKg.toFixed(2));
  }, [autoWeightKg, weightTouched]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    for (const l of lines) {
      await supabase.from("pi_items").update({
        description: l.description, measurement: l.measurement,
        qty_pcs: parseFloat(l.qtyPcs) || 0, price_unit: parseFloat(l.priceUnit) || 0, price_basis: l.priceBasis,
        pi_thickness_mm: parseFloat(l.thickness) || null,
        print_charge: parseFloat(l.printCharge) || 0,
        adhesive_charge: parseFloat(l.adhesiveCharge) || 0,
        tube_inch: parseFloat(l.tubeInch) || null,
        cutting_inch: parseFloat(l.cuttingInch) || null,
      }).eq("id", l.id);
    }

    if (newBookingLineItems.length > 0) {
      const maxSlNo = lines.length; // sl_no ১-ভিত্তিক, বিদ্যমান লাইনের পরে চালিয়ে যাওয়া
      const { error: newItemsError } = await supabase.from("pi_items").insert(
        newBookingLineItems.map((li, i) => {
          const { tubeInch, cuttingInch } = lineTubeCuttingInches(li.booking);
          return {
            pi_id: pi.id, booking_id: li.booking.id, sl_no: maxSlNo + i + 1,
            description: buildBookingDescription(li.booking),
            measurement: formatMeasurement(li.booking),
            qty_pcs: li.booking.quantity_pcs, price_unit: li.priceUnit, price_basis: li.basis,
            pi_thickness_mm: lineThickness(li.booking) || null,
            tube_inch: tubeInch || null, cutting_inch: cuttingInch || null,
          };
        })
      );
      if (newItemsError) {
        setLoading(false);
        setError("নতুন বুকিং লাইন সেভ ব্যর্থ হয়েছে: " + newItemsError.message);
        return;
      }
    }

    const { error: updateError } = await supabase.from("proforma_invoices").update({
      pi_date: piDate, currency, discount_type: discountType, discount_value: parseFloat(discountValue) || 0,
      price_decimals: Math.max(0, Math.min(8, parseInt(priceDecimals) || 4)),
      status, terms_conditions: termsConditions, total_amount: totalAmount,
      valid_till: validTill || null,
      garments_id: garmentsId || null, garments_name: garmentsName || null, garments_address: garmentsAddress || null,
      item_description: itemDescription || null,
      merchant_name: merchantName || null,
      advising_bank_id: advisingBankId || null,
      advising_bank_name: advisingBankName || null, advising_bank_branch: advisingBankBranch || null,
      advising_bank_address: advisingBankAddress || null, advising_bank_swift: advisingBankSwift || null,
      total_weight_kg: parseFloat(totalWeightKg) || null, hs_code: hsCode, bin_no: binNo,
      exchange_rate_to_bdt: parseFloat(exchangeRate) || 107,
    }).eq("id", pi.id);

    setLoading(false);
    if (updateError) { setError(updateError.message); return; }
    router.push(`/dashboard/lc-export/proforma/${pi.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4 max-w-6xl">
      <div className="flex flex-wrap gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">PI Date</label>
          <input type="date" value={piDate} onChange={(e) => setPiDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Currency</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
            <option value="USD">USD</option><option value="BDT">BDT</option><option value="EUR">EUR</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
            <option value="draft">Draft</option><option value="sent">Sent</option>
            <option value="in_garments">In Garments</option><option value="lc_opened">LC Opened</option>
            <option value="paid">Paid</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Valid Till</label>
          <input type="date" value={validTill} onChange={(e) => setValidTill(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2">Measurement</th>
              <th className="px-3 py-2 text-right w-24">Qty(Pcs)</th>
              <th className="px-3 py-2 w-20">Tube&quot;</th>
              <th className="px-3 py-2 w-20">Cutting&quot;</th>
              <th className="px-3 py-2 w-20">Thickness</th>
              <th className="px-3 py-2 w-20">Print</th>
              <th className="px-3 py-2 w-20">Adhesive</th>
              <th className="px-3 py-2 w-20">Basis</th>
              <th className="px-3 py-2 w-28">Price/Unit</th>
              <th className="px-3 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.id} className="border-t">
                <td className="px-3 py-2"><input value={l.description} onChange={(e) => updateLine(i, "description", e.target.value)} className="w-full rounded border px-2 py-1 text-sm" /></td>
                <td className="px-3 py-2"><input value={l.measurement} onChange={(e) => updateLine(i, "measurement", e.target.value)} className="w-full rounded border px-2 py-1 text-sm" /></td>
                <td className="px-3 py-2"><input type="number" value={l.qtyPcs} onChange={(e) => updateLine(i, "qtyPcs", e.target.value)} className="w-full rounded border px-2 py-1 text-sm text-right" /></td>
                <td className="px-3 py-2"><input type="number" step="0.01" placeholder="ইঞ্চি" value={l.tubeInch} onChange={(e) => updateLine(i, "tubeInch", e.target.value)} onBlur={() => commitLineGeometry(i)} className="w-full rounded border px-1 py-1 text-xs" /></td>
                <td className="px-3 py-2"><input type="number" step="0.01" placeholder="ইঞ্চি" value={l.cuttingInch} onChange={(e) => updateLine(i, "cuttingInch", e.target.value)} onBlur={() => commitLineGeometry(i)} className="w-full rounded border px-1 py-1 text-xs" /></td>
                <td className="px-3 py-2"><input type="number" step="0.1" placeholder="mm" value={l.thickness} onChange={(e) => updateLine(i, "thickness", e.target.value)} onBlur={() => commitLineGeometry(i)} className="w-full rounded border px-1 py-1 text-xs" /></td>
                <td className="px-3 py-2"><input type="number" step="0.01" placeholder="0" value={l.printCharge} onChange={(e) => updateLine(i, "printCharge", e.target.value)} className="w-full rounded border px-1 py-1 text-xs" /></td>
                <td className="px-3 py-2"><input type="number" step="0.01" placeholder="0" value={l.adhesiveCharge} onChange={(e) => updateLine(i, "adhesiveCharge", e.target.value)} className="w-full rounded border px-1 py-1 text-xs" /></td>
                <td className="px-3 py-2">
                  <select value={l.priceBasis} onChange={(e) => updateLine(i, "priceBasis", e.target.value)} className="w-full rounded border px-1 py-1 text-xs">
                    <option value="pcs">Per Pc</option><option value="dzn">Per Dzn</option>
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input type="number" step="0.0001" value={l.priceUnit} onChange={(e) => updateLine(i, "priceUnit", e.target.value)} className="w-full rounded border px-2 py-1 text-sm" />
                  <div className="mt-1 text-[10px] whitespace-nowrap">
                    {(lineRatesRef.current[i] || 0) > 0
                      ? <span className="text-green-600">✓ Auto-recalc সক্রিয়</span>
                      : <span className="text-gray-400">Tube+Cutting দিন (২ ফিল্ড) → Auto চালু হবে</span>}
                  </div>
                </td>
                <td className="px-3 py-2 text-right">{sym}{money(calcAmount(l.qtyPcs, l.priceUnit, l.priceBasis))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-3 py-2 text-[11px] text-gray-400 border-t">
          Tube&quot;/Cutting&quot; থাকলে Thickness/Print/Adhesive/Tube/Cutting বদলালে Price/Unit ও নিচের Total Weight (Kg) অটো-রিক্যালকুলেট হবে।
        </p>
      </div>

      <div className="rounded-lg border p-3 bg-blue-50/40 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">নতুন বুকিং যোগ করুন</p>
          <button type="button" onClick={() => setShowAddBooking((v) => !v)} className="text-xs text-blue-600 hover:underline">
            {showAddBooking ? "বন্ধ করুন" : bookings.length ? `+ বুকিং যোগ করুন (${bookings.length} টা পাওয়া গেছে)` : "বুকিং যোগ করুন"}
          </button>
        </div>
        {showAddBooking && (
          bookings.length === 0 ? (
            <p className="text-xs text-gray-500 italic">
              {pi.customer_id ? "এই কাস্টমারের কোনো খালি (অন্য PI-তে ব্যবহার হয়নি এমন) বুকিং নেই।" : "এই PI-তে কোনো Customer সেট নেই — বুকিং যোগ করার আগে Customer সেট করতে হবে (এখন এই ফর্মে নেই, দরকার হলে বলুন)।"}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-3">
                <select value={buyerFilter} onChange={(e) => setBuyerFilter(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
                  <option value="">সব Buyer</option>
                  {buyersMaster.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <select value={merchantFilter} onChange={(e) => setMerchantFilter(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
                  <option value="">সব Merchant</option>
                  {availableMerchants.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <select value={styleFilter} onChange={(e) => setStyleFilter(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
                  <option value="">সব Style</option>
                  {availableStyles.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="overflow-x-auto rounded-lg border bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-gray-600">
                    <tr>
                      <th className="px-3 py-2 w-10"></th>
                      <th className="px-3 py-2">Booking</th>
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
                    {filteredBookings.map((b) => {
                      const rule = getBuyerRule(b);
                      const basis = bookingBasis[b.id] || "pcs";
                      const suggested = getSuggestedPrice(b) * basisFactor(basis);
                      return (
                        <tr key={b.id} className="border-t">
                          <td className="px-3 py-2"><input type="checkbox" checked={!!selectedBookings[b.id]} onChange={(e) => toggleBooking(b, e.target.checked)} /></td>
                          <td className="px-3 py-2 font-medium">{b.booking_no}</td>
                          <td className="px-3 py-2 text-gray-500">{b.style || "-"}</td>
                          <td className="px-3 py-2 text-gray-500">{formatMeasurement(b)}</td>
                          <td className="px-3 py-2 text-right">{b.quantity_pcs}</td>
                          <td className="px-3 py-2">
                            <select value={basis} onChange={(e) => changeBasis(b, e.target.value as "pcs" | "dzn")} className="w-full rounded border px-1 py-1 text-xs">
                              <option value="pcs">Per Pc</option><option value="dzn">Per Dzn</option>
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" step="0.1" value={bookingThickness[b.id] ?? ""} onChange={(e) => changeThickness(b, e.target.value)} className="w-16 rounded border px-1 py-1 text-xs" placeholder={rule?.pi_thickness_mm != null ? String(rule.pi_thickness_mm) : ""} />
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex gap-1 items-center">
                              <input type="number" step="0.0001" value={bookingPrice[b.id] || ""} onChange={(e) => setBookingPrice((prev) => ({ ...prev, [b.id]: e.target.value }))} className="w-24 rounded border px-2 py-1 text-sm" />
                              {rule && rule.pricing_rule !== "manual" && suggested > 0 && (
                                <button type="button" onClick={() => applyAutoPrice(b.id, basis)} className="text-xs text-blue-600 hover:underline whitespace-nowrap" title={`Buyer Rule: ${rule.pricing_rule}`}>
                                  Use {suggested.toFixed(pd)}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" step="0.0001" value={bookingAdjust[b.id] || ""} onChange={(e) => setBookingAdjust((prev) => ({ ...prev, [b.id]: e.target.value }))} className="w-20 rounded border px-2 py-1 text-sm" placeholder="0" />
                            <div className="mt-1 text-[11px] whitespace-nowrap text-gray-500">= {effectivePriceUnit(b.id).toFixed(pd)}/{basis === "dzn" ? "dzn" : "pc"}</div>
                          </td>
                          <td className="px-3 py-2 text-right">{money(calcLineAmount(b.quantity_pcs, effectivePriceUnit(b.id), basis))}</td>
                        </tr>
                      );
                    })}
                    {filteredBookings.length === 0 && (
                      <tr><td colSpan={10} className="px-3 py-3 text-gray-400 italic">এই ফিল্টারে কোনো বুকিং নেই</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {newBookingLineItems.length > 0 && (
                <p className="text-xs text-gray-600">{newBookingLineItems.length} টা নতুন বুকিং লাইন যোগ হবে — সাবটোটাল {sym}{money(newBookingSubtotal)}। সেভ করলেই এই PI-তে যুক্ত হবে।</p>
              )}
            </>
          )
        )}
      </div>

      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Price/Unit দশমিক ঘর</label>
          <input type="number" min="0" max="8" step="1" value={priceDecimals} onChange={(e) => setPriceDecimals(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-20" />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Discount Type</label>
          <select value={discountType} onChange={(e) => setDiscountType(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
            <option value="none">নেই</option><option value="percentage">Percentage</option><option value="fixed">Fixed</option>
          </select>
        </div>
        {discountType !== "none" && (
          <div>
            <label className="block text-sm text-gray-600 mb-1">Discount Value</label>
            <input type="number" step="0.01" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-32" />
          </div>
        )}
      </div>

      <div className="rounded-lg border p-3 bg-gray-50 space-y-3">
        <p className="text-sm font-semibold text-gray-700">Garments Info</p>
        {garments.length > 0 && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Garments (Print &quot;To&quot;)</label>
            <select value={garmentsId} onChange={(e) => onGarmentsChange(e.target.value)} className="rounded-lg border px-3 py-2 text-sm min-w-[200px]">
              <option value="">-- বাছুন / নিজে লিখুন --</option>
              {garments.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Garments Name</label>
          <input value={garmentsName} onChange={(e) => setGarmentsName(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Garments Address</label>
          <textarea value={garmentsAddress} onChange={(e) => setGarmentsAddress(e.target.value)} rows={2} className="w-full rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Item (Print-এ &quot;Item:- ...&quot; লাইন)</label>
          <input value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Poly Bags (0.012cm)" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Merchant Name</label>
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
          <label className="block text-xs text-gray-500 mb-1">Total Weight (Kg)</label>
          <div className="flex items-center gap-2">
            <input type="number" step="0.01" value={totalWeightKg} onChange={(e) => { setTotalWeightKg(e.target.value); setWeightTouched(true); }} className="rounded-lg border px-3 py-2 text-sm w-32" />
            {weightTouched && autoWeightKg > 0 && (
              <button type="button" onClick={() => { setWeightTouched(false); setTotalWeightKg(autoWeightKg.toFixed(2)); }} className="text-xs text-blue-600 hover:underline whitespace-nowrap">
                Auto {money(autoWeightKg)}
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
        {currency === "USD" && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">USD → BDT Rate</label>
            <input type="number" step="0.01" value={exchangeRate} onChange={(e) => { setExchangeRate(e.target.value); setRateTouched(true); }} className="rounded-lg border px-3 py-2 text-sm w-28" />
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm text-gray-600 mb-1">Terms &amp; Conditions</label>
        <textarea value={termsConditions} onChange={(e) => setTermsConditions(e.target.value)} rows={9} className="w-full rounded-lg border px-3 py-2 text-sm font-mono" />
      </div>

      <div className="rounded-lg bg-gray-50 border p-4 space-y-1 text-sm">
        <p>Subtotal: <strong>{sym}{money(subtotal)}</strong></p>
        {discountType !== "none" && <p>Discount: <strong>{sym}{money(discountAmount)}</strong></p>}
        <p className="text-base">Total: <strong>{sym}{money(totalAmount)}</strong></p>
        <p className="text-xs text-gray-500 italic">{amountInWords(totalAmount, currency)}</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "সেভ হচ্ছে..." : "পরিবর্তন সেভ করুন"}
      </button>
    </form>
  );
}
