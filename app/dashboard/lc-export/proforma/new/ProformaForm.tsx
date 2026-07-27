"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { generateNextDocNo } from "@/lib/docNumber";
import { calcPiUnitPrice } from "@/lib/calcTubeCutting";
import { amountInWords } from "@/lib/numberToWords";
import { calcPiUnitPrice } from "@/lib/calcTubeCutting";

type Booking = {
  id: string; booking_no: string; quantity_pcs: number; product_id: string; customer_id: string;
  style: string | null; garments_name: string | null; buyers: { name: string } | null; merchants: { name: string } | null;
  measurement_type: string; measurement_unit: string; length_val: number; width_val: number;
  flap_val: number | null; gusset_val: number | null; pi_thickness_mm: number | null;
  finished_goods: { product_name: string; length_cm: number; width_cm: number; thickness: number } | null;
};
type Customer = { id: string; name: string; price_per_lbs: number | null };

type ManualLine = { description: string; measurement: string; qtyPcs: string; priceUnit: string; priceBasis: "pcs" | "dzn" };

type BookingOverride = {
  thickness: string;
  printCharge: string;
  adhesiveCharge: string;
  customPrice: string;
  customBasis: "pcs" | "dzn";
};

const DEFAULT_TERMS = `01) 100% IRREVOCABLE LETTER OF CREDIT AT SIGHT.
02) PARTIAL SHIPMENT MUST BE ALLOWED IN THE L/C.
03) SHIPMENT WITHIN 15 DAYS AFTER RECEIVED OF L/C.
04) DELIVERY FROM OUR FACTORY TO APPLICANT FACTORY.
05) C&F BASIS.
06) INSPECTION CERTIFICATE ISSUE BY BENEFICIARIES.
07) OUR DUE INTEREST WILL BE THE L/C OPENER.
08) L/C RECEIVE FROM UD
09) PAYMENT MUST BE BY USD.`;

function formatMeasurement(b: Booking) {
  const unit = b.measurement_unit;
  const L = b.length_val, W = b.width_val, F = b.flap_val, G = b.gusset_val;
  if (b.measurement_type === "simple") return `L-${L} x W-${W}${unit}`;
  if (b.measurement_type === "gusset") return `L-${L} x W-${W} + G-${G}${unit}`;
  if (b.measurement_type === "adhesive") return `L-${L} + F-${F} x W-${W}${unit}`;
  return "-";
}

type Garment = { id: string; customer_id: string; name: string; pricing_rule: string; percentage_value: number; rate_per_lbs_value: number };

export default function ProformaForm({
  customers, bookings, garmentsMaster, lastUnitPriceByBooking,
}: { customers: Customer[]; bookings: Booking[]; garmentsMaster: Garment[]; lastUnitPriceByBooking: Record<string, number> }) {
  const [mode, setMode] = useState<"booking" | "manual">("booking");
  const [customerId, setCustomerId] = useState("");
  const [garmentsFilter, setGarmentsFilter] = useState("");
  const [buyerFilter, setBuyerFilter] = useState("");
  const [styleFilter, setStyleFilter] = useState("");
  const [bookingPricingRule, setBookingPricingRule] = useState<Record<string, "manual" | "percentage" | "rate_per_lbs">>({});
  const [bookingRuleValue, setBookingRuleValue] = useState<Record<string, string>>({});
  const [piDate, setPiDate] = useState(new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState("USD");
  const [discountType, setDiscountType] = useState<"none" | "percentage" | "fixed">("none");
  const [discountValue, setDiscountValue] = useState("0");
  const [termsConditions, setTermsConditions] = useState(DEFAULT_TERMS);
  const [validTill, setValidTill] = useState("");
  const [garmentsAddress, setGarmentsAddress] = useState("");
  const [advisingBankName, setAdvisingBankName] = useState("");
  const [advisingBankBranch, setAdvisingBankBranch] = useState("");
  const [advisingBankAddress, setAdvisingBankAddress] = useState("");
  const [advisingBankSwift, setAdvisingBankSwift] = useState("");
  const [totalWeightKg, setTotalWeightKg] = useState("");
  const [hsCode, setHsCode] = useState("3923.21.00");
  const [binNo, setBinNo] = useState("000131803-1201");
  const [exchangeRate, setExchangeRate] = useState("122");

  const [selectedBookings, setSelectedBookings] = useState<Record<string, boolean>>({});
  const [bookingPrice, setBookingPrice] = useState<Record<string, string>>({});
  const [bookingBasis, setBookingBasis] = useState<Record<string, "pcs" | "dzn">>({});
  const [bookingOverrides, setBookingOverrides] = useState<Record<string, BookingOverride>>({});

  const [manualLines, setManualLines] = useState<ManualLine[]>([
    { description: "", measurement: "", qtyPcs: "", priceUnit: "", priceBasis: "pcs" },
  ]);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const selectedCustomer = customers.find((c) => c.id === customerId);

  function getDefaultPrice(b: Booking): number {
    const overrides = bookingOverrides[b.id];
    const thickness = overrides?.thickness ? parseFloat(overrides.thickness) : (b.pi_thickness_mm ?? 0);
    const printCharge = overrides?.printCharge ? parseFloat(overrides.printCharge) : 0;
    const adhesiveCharge = overrides?.adhesiveCharge ? parseFloat(overrides.adhesiveCharge) : 0;

    let basePrice = 0;
    if (selectedCustomer?.price_per_lbs && thickness) {
      const { tube, cutting } = (() => {
        const L = b.length_val ?? 0, W = b.width_val ?? 0, F = b.flap_val ?? 0, G = b.gusset_val ?? 0;
        if (b.measurement_type === "simple") return { tube: W, cutting: L };
        if (b.measurement_type === "adhesive") return { tube: L + F / 2, cutting: W };
        return { tube: W + G + G, cutting: L };
      })();
      const unit = b.measurement_unit;
      const tubeInch = unit === "cm" ? tube / 2.54 : tube;
      const cuttingInch = unit === "cm" ? cutting / 2.54 : cutting;
      basePrice = (selectedCustomer.price_per_lbs * tubeInch * cuttingInch * thickness) / 75000 / 2.54 / 2.54;
    }
    return basePrice + printCharge + adhesiveCharge;
  }

  const customerBookings = useMemo(() => {
    return bookings
      .filter((b) => b.customer_id === customerId)
      .filter((b) => !garmentsFilter || b.garments_name === garmentsFilter)
      .filter((b) => !buyerFilter || b.buyers?.name === buyerFilter)
      .filter((b) => !styleFilter || b.style === styleFilter);
  }, [bookings, customerId, garmentsFilter, buyerFilter, styleFilter]);

  const availableGarments = useMemo(
    () => Array.from(new Set(bookings.filter((b) => b.customer_id === customerId).map((b) => b.garments_name).filter(Boolean))) as string[],
    [bookings, customerId]
  );

  const availableBuyers = useMemo(
    () => Array.from(new Set(bookings.filter((b) => b.customer_id === customerId).map((b) => b.buyers?.name).filter(Boolean))) as string[],
    [bookings, customerId]
  );
  const availableStyles = useMemo(
    () => Array.from(new Set(bookings.filter((b) => b.customer_id === customerId).map((b) => b.style).filter(Boolean))) as string[],
    [bookings, customerId]
  );

  function calcLineAmount(qtyPcs: number, priceUnit: number, basis: "pcs" | "dzn") {
    if (basis === "dzn") return (qtyPcs / 12) * priceUnit;
    return qtyPcs * priceUnit;
  }

  function getGarmentFor(b: Booking): Garment | undefined {
    return garmentsMaster.find((g) => g.customer_id === b.customer_id && g.name === b.garments_name);
  }

  function getSuggestedPrice(b: Booking): number {
    const rule = bookingPricingRule[b.id];
    const ruleValue = parseFloat(bookingRuleValue[b.id] || "0");
    const lastPrice = lastUnitPriceByBooking[b.id] ?? 0;

    if (rule === "percentage" && lastPrice) {
      const bdtPrice = lastPrice * (1 + ruleValue / 100);
      return bdtPrice / parseFloat(exchangeRateForSuggestion());
    }
    if (rule === "rate_per_lbs") {
      return calcPiUnitPrice(b, ruleValue);
    }
    return 0;
  }

  function exchangeRateForSuggestion() {
    return "122"; // ডিফল্ট রেট, নিচের ফর্মের Exchange Rate ফিল্ডের সাথে মিলিয়ে ম্যানুয়ালি সমন্বয় করুন
  }

  function applySuggested(bookingId: string) {
    const b = customerBookings.find((bk) => bk.id === bookingId);
    if (!b) return;
    const suggested = getSuggestedPrice(b);
    setBookingPrice((prev) => ({ ...prev, [bookingId]: suggested.toFixed(4) }));
  }

  // বুকিং মোডে সিলেক্ট করা লাইনগুলোর হিসাব
  const bookingLineItems = Object.keys(selectedBookings)
    .filter((id) => selectedBookings[id])
    .map((id) => {
      const b = customerBookings.find((bk) => bk.id === id)!;
      const overrides = bookingOverrides[id];
      const priceUnit = overrides?.customPrice ? parseFloat(overrides.customPrice) : parseFloat(bookingPrice[id] || "0");
      const basis = overrides?.customBasis || bookingBasis[id] || "pcs";
      const amount = calcLineAmount(b.quantity_pcs, priceUnit, basis);
      const thickness = overrides?.thickness ? parseFloat(overrides.thickness) : b.pi_thickness_mm;
      const printCharge = overrides?.printCharge ? parseFloat(overrides.printCharge) : 0;
      const adhesiveCharge = overrides?.adhesiveCharge ? parseFloat(overrides.adhesiveCharge) : 0;
      return { booking: b, priceUnit, basis, amount, thickness, printCharge, adhesiveCharge };
    });

  // Manual মোডের লাইনগুলোর হিসাব
  const manualLineItems = manualLines
    .filter((l) => l.description && parseFloat(l.qtyPcs) > 0)
    .map((l) => {
      const qtyPcs = parseFloat(l.qtyPcs) || 0;
      const priceUnit = parseFloat(l.priceUnit) || 0;
      const amount = calcLineAmount(qtyPcs, priceUnit, l.priceBasis);
      return { ...l, qtyPcs, priceUnit, amount };
    });

  const subtotal = mode === "booking"
    ? bookingLineItems.reduce((s, li) => s + li.amount, 0)
    : manualLineItems.reduce((s, li) => s + li.amount, 0);

  const discountAmount = discountType === "percentage"
    ? (subtotal * parseFloat(discountValue || "0")) / 100
    : discountType === "fixed"
    ? parseFloat(discountValue || "0")
    : 0;

  const totalAmount = Math.max(subtotal - discountAmount, 0);

  function updateManualLine(i: number, field: keyof ManualLine, value: string) {
    setManualLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));
  }
  function addManualLine() {
    setManualLines((prev) => [...prev, { description: "", measurement: "", qtyPcs: "", priceUnit: "", priceBasis: "pcs" }]);
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

    const piNo = await generateNextDocNo(supabase, "proforma_invoices", "pi_no", "PI", "pi_date", piDate);

    const { data: pi, error: piError } = await supabase
      .from("proforma_invoices")
      .insert({
        pi_no: piNo,
        customer_id: mode === "booking" ? customerId : (customerId || null),
        pi_date: piDate,
        style: styles,
        buyer_name: firstBooking?.buyers?.name ?? null,
        merchant_name: firstBooking?.merchants?.name ?? null,
        total_amount: totalAmount,
        currency, discount_type: discountType, discount_value: parseFloat(discountValue) || 0,
        terms_conditions: termsConditions, is_manual: mode === "manual", status: "draft",
        garments_name: firstBooking?.garments_name ?? null, garments_address: garmentsAddress || null,
        advising_bank_name: advisingBankName || null, advising_bank_branch: advisingBankBranch || null,
        advising_bank_address: advisingBankAddress || null, advising_bank_swift: advisingBankSwift || null,
        total_weight_kg: parseFloat(totalWeightKg) || null, hs_code: hsCode, bin_no: binNo,
        exchange_rate_to_bdt: parseFloat(exchangeRate) || 122,
      })
      .select().single();

    if (piError || !pi) {
      setLoading(false);
      setError(piError?.message ?? "PI তৈরি ব্যর্থ হয়েছে।");
      return;
    }

    if (mode === "booking") {
      await supabase.from("pi_items").insert(
        bookingLineItems.map((li, i) => ({
          pi_id: pi.id, booking_id: li.booking.id, sl_no: i + 1,
          description: `${li.booking.style || li.booking.booking_no}`,
          measurement: formatMeasurement(li.booking),
          qty_pcs: li.booking.quantity_pcs, price_unit: li.priceUnit, price_basis: li.basis,
          pi_thickness_mm: li.thickness || null, print_charge: li.printCharge || 0, adhesive_charge: li.adhesiveCharge || 0,
        }))
      );
    } else {
      await supabase.from("pi_items").insert(
        manualLineItems.map((li, i) => ({
          pi_id: pi.id, booking_id: null, sl_no: i + 1,
          description: li.description, measurement: li.measurement,
          qty_pcs: li.qtyPcs, price_unit: li.priceUnit, price_basis: li.priceBasis,
        }))
      );
    }

    setLoading(false);
    router.push("/dashboard/lc-export/proforma");
    router.refresh();
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
            onChange={(e) => {
              const newCustomerId = e.target.value;
              setCustomerId(newCustomerId);
              setSelectedBookings({});
              setGarmentsFilter("");
              // এই কাস্টমারের সব বুকিং-এ তাদের Garments-এর ডিফল্ট রুল বসিয়ে দিন
              const newRules: Record<string, any> = {};
              const newValues: Record<string, string> = {};
              bookings.filter((b) => b.customer_id === newCustomerId).forEach((b) => {
                const g = garmentsMaster.find((gm) => gm.customer_id === newCustomerId && gm.name === b.garments_name);
                if (g) {
                  newRules[b.id] = g.pricing_rule;
                  newValues[b.id] = g.pricing_rule === "percentage" ? String(g.percentage_value) : String(g.rate_per_lbs_value);
                }
              });
              setBookingPricingRule(newRules);
              setBookingRuleValue(newValues);
            }}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            required={mode === "booking"}
          >
            <option value="">-- বাছুন --</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {mode === "booking" && customerId && (
          <>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Garments Filter</label>
              <select value={garmentsFilter} onChange={(e) => setGarmentsFilter(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
                <option value="">সব</option>
                {availableGarments.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Buyer Filter</label>
              <select value={buyerFilter} onChange={(e) => setBuyerFilter(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
                <option value="">সব</option>
                {availableBuyers.map((b) => <option key={b} value={b}>{b}</option>)}
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
          <label className="block text-sm text-gray-600 mb-1">Currency</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
            <option value="USD">USD</option>
            <option value="BDT">BDT</option>
            <option value="EUR">EUR</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Valid Till (ঐচ্ছিক)</label>
          <input type="date" value={validTill} onChange={(e) => setValidTill(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
        </div>
      </div>

      {mode === "booking" && customerId && (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-3 py-2 w-10"></th>
                <th className="px-3 py-2">Booking</th>
                <th className="px-3 py-2">Garments</th>
                <th className="px-3 py-2">Style</th>
                <th className="px-3 py-2">Measurement</th>
                <th className="px-3 py-2 text-right">Qty (Pcs)</th>
                <th className="px-3 py-2 w-24">Basis</th>
                <th className="px-3 py-2">Pricing Rule</th>
                <th className="px-3 py-2 w-32">Price/Unit</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {customerBookings.map((b) => {
                const overrides = bookingOverrides[b.id];
                const defaultPrice = getDefaultPrice(b);
                return (
                  <tr key={b.id} className="border-t">
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={!!selectedBookings[b.id]} onChange={(e) => setSelectedBookings((prev) => ({ ...prev, [b.id]: e.target.checked }))} />
                    </td>
                    <td className="px-3 py-2 font-medium">{b.booking_no}</td>
                    <td className="px-3 py-2 text-gray-500">{b.garments_name || "-"}</td>
                    <td className="px-3 py-2 text-gray-500">{b.style || "-"}</td>
                    <td className="px-3 py-2 text-gray-500">{formatMeasurement(b)}</td>
                    <td className="px-3 py-2 text-right">{b.quantity_pcs}</td>
                    <td className="px-3 py-2">
                      <input type="number" step="0.1" placeholder={b.pi_thickness_mm ? String(b.pi_thickness_mm) : "mm"} value={overrides?.thickness || ""} onChange={(e) => setBookingOverrides((prev) => ({ ...prev, [b.id]: { ...prev[b.id], thickness: e.target.value, customPrice: prev[b.id]?.customPrice || "", printCharge: prev[b.id]?.printCharge || "", adhesiveCharge: prev[b.id]?.adhesiveCharge || "", customBasis: prev[b.id]?.customBasis || "pcs" } }))} className="w-full rounded border px-1 py-1 text-xs" />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" step="0.01" placeholder="0" value={overrides?.printCharge || ""} onChange={(e) => setBookingOverrides((prev) => ({ ...prev, [b.id]: { ...prev[b.id], printCharge: e.target.value, customPrice: prev[b.id]?.customPrice || "", thickness: prev[b.id]?.thickness || "", adhesiveCharge: prev[b.id]?.adhesiveCharge || "", customBasis: prev[b.id]?.customBasis || "pcs" } }))} className="w-full rounded border px-1 py-1 text-xs" />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" step="0.01" placeholder="0" value={overrides?.adhesiveCharge || ""} onChange={(e) => setBookingOverrides((prev) => ({ ...prev, [b.id]: { ...prev[b.id], adhesiveCharge: e.target.value, customPrice: prev[b.id]?.customPrice || "", thickness: prev[b.id]?.thickness || "", printCharge: prev[b.id]?.printCharge || "", customBasis: prev[b.id]?.customBasis || "pcs" } }))} className="w-full rounded border px-1 py-1 text-xs" />
                    </td>
                    <td className="px-3 py-2">
                      <select value={overrides?.customBasis || bookingBasis[b.id] || "pcs"} onChange={(e) => { setBookingBasis((prev) => ({ ...prev, [b.id]: e.target.value as "pcs" | "dzn" })); setBookingOverrides((prev) => ({ ...prev, [b.id]: { ...prev[b.id], customBasis: e.target.value as "pcs" | "dzn", customPrice: prev[b.id]?.customPrice || "", thickness: prev[b.id]?.thickness || "", printCharge: prev[b.id]?.printCharge || "", adhesiveCharge: prev[b.id]?.adhesiveCharge || "" } })); }} className="w-full rounded border px-1 py-1 text-xs">
                        <option value="pcs">Per Pc</option>
                        <option value="dzn">Per Dzn</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 items-center">
                        <select
                          value={bookingPricingRule[b.id] || "manual"}
                          onChange={(e) => setBookingPricingRule((prev) => ({ ...prev, [b.id]: e.target.value as any }))}
                          className="rounded border px-1 py-1 text-xs"
                        >
                          <option value="manual">Manual</option>
                          <option value="percentage">% on Invoice</option>
                          <option value="rate_per_lbs">Rate/Lbs</option>
                        </select>
                        {bookingPricingRule[b.id] && bookingPricingRule[b.id] !== "manual" && (
                          <input
                            type="number" step="0.01" placeholder="মান"
                            value={bookingRuleValue[b.id] || ""}
                            onChange={(e) => setBookingRuleValue((prev) => ({ ...prev, [b.id]: e.target.value }))}
                            className="w-16 rounded border px-1 py-1 text-xs"
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 items-center">
                        <input type="number" step="0.0001" value={bookingPrice[b.id] || ""} onChange={(e) => setBookingPrice((prev) => ({ ...prev, [b.id]: e.target.value }))} className="w-full rounded border px-2 py-1 text-sm" />
                        {bookingPricingRule[b.id] && bookingPricingRule[b.id] !== "manual" && (
                          <button type="button" onClick={() => applySuggested(b.id)} className="text-xs text-blue-600 hover:underline whitespace-nowrap">
                            Use {getSuggestedPrice(b).toFixed(4)}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {calcLineAmount(b.quantity_pcs, overrides?.customPrice ? parseFloat(overrides.customPrice) : parseFloat(bookingPrice[b.id] || "0"), overrides?.customBasis || bookingBasis[b.id] || "pcs").toFixed(2)}
                    </td>
                  </tr>
                );
              })}
              {customerBookings.length === 0 && (
                <tr><td colSpan={11} className="px-3 py-3 text-gray-400 italic">এই কাস্টমারের কোনো বুকিং নেই</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {mode === "manual" && (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">Measurement</th>
                <th className="px-3 py-2 text-right w-24">Qty (Pcs)</th>
                <th className="px-3 py-2 w-20">Basis</th>
                <th className="px-3 py-2 w-28">Price/Unit</th>
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
                  <td className="px-3 py-2 text-right">{calcLineAmount(parseFloat(l.qtyPcs) || 0, parseFloat(l.priceUnit) || 0, l.priceBasis).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">
                    {manualLines.length > 1 && <button type="button" onClick={() => removeManualLine(i)} className="text-red-600 text-xs hover:underline">সরান</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" onClick={addManualLine} className="w-full border-t px-3 py-2 text-xs text-gray-600 hover:bg-gray-50">+ আরেকটি লাইন যোগ করুন</button>
        </div>
      )}

      <div className="flex flex-wrap gap-4 items-end">
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
      </div>

      <div className="rounded-lg border p-3 bg-gray-50 space-y-3">
        <p className="text-sm font-semibold text-gray-700">Garments Info (Print-এ "To" সেকশনে দেখাবে)</p>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Garments Address</label>
          <textarea value={garmentsAddress} onChange={(e) => setGarmentsAddress(e.target.value)} rows={2} className="w-full rounded-lg border px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="rounded-lg border p-3 bg-gray-50 space-y-3">
        <p className="text-sm font-semibold text-gray-700">Advising Bank</p>
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
          <input type="number" step="0.01" value={totalWeightKg} onChange={(e) => setTotalWeightKg(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-32" />
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
            <input type="number" step="0.01" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-28" />
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm text-gray-600 mb-1">Terms &amp; Conditions</label>
        <textarea value={termsConditions} onChange={(e) => setTermsConditions(e.target.value)} rows={9} className="w-full rounded-lg border px-3 py-2 text-sm font-mono" />
      </div>

      <div className="rounded-lg bg-gray-50 border p-4 space-y-1 text-sm">
        <p>Subtotal: <strong>{currency} {subtotal.toFixed(2)}</strong></p>
        {discountType !== "none" && <p>Discount: <strong>{currency} {discountAmount.toFixed(2)}</strong></p>}
        <p className="text-base">Total: <strong>{currency} {totalAmount.toFixed(2)}</strong></p>
        <p className="text-xs text-gray-500 italic">{amountInWords(totalAmount, currency)}</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "সেভ হচ্ছে..." : "Proforma Invoice তৈরি করুন"}
      </button>
    </form>
  );
}