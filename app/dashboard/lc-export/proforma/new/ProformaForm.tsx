"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { generateNextDocNo } from "@/lib/docNumber";
import { calcPiUnitPrice, calcPiUnitPriceWithMarkup } from "@/lib/calcTubeCutting";
import { amountInWords } from "@/lib/numberToWords";

type Booking = {
  id: string; booking_no: string; quantity_pcs: number; product_id: string; customer_id: string;
  style: string | null; garments_name: string | null; buyer_id: string | null;
  buyers: { name: string } | null; merchants: { name: string } | null;
  measurement_type: string; measurement_unit: string; length_val: number; width_val: number;
  flap_val: number | null; gusset_val: number | null; pi_thickness_mm: number | null;
  material_type: string; has_print: boolean; print_colors: number | null; rate_per_color: number | null;
  finished_goods: { product_name: string; length_cm: number; width_cm: number; thickness: number } | null;
};
type Customer = { id: string; name: string; price_per_lbs: number | null };
type BuyerMaster = { id: string; customer_id: string; name: string; pricing_rule: string; percentage_value: number; rate_per_lbs_value: number; pi_thickness_mm: number | null; adhesive_rate_per_inch: number | null; print_colors_default: number | null };
type ManualLine = { description: string; measurement: string; qtyPcs: string; priceUnit: string; priceBasis: "pcs" | "dzn" };

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

export default function ProformaForm({
  customers, bookings, buyersMaster, lastUnitPriceByBooking,
}: {
  customers: Customer[]; bookings: Booking[]; buyersMaster: BuyerMaster[];
  lastUnitPriceByBooking: Record<string, number>;
}) {
  const [mode, setMode] = useState<"booking" | "manual">("booking");
  const [customerId, setCustomerId] = useState("");
  const [garmentsFilter, setGarmentsFilter] = useState("");
  const [buyerFilter, setBuyerFilter] = useState("");
  const [styleFilter, setStyleFilter] = useState("");
  const [piDate, setPiDate] = useState(new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState("USD");
  const [exchangeRate, setExchangeRate] = useState("122");
  const [discountType, setDiscountType] = useState<"none" | "percentage" | "fixed">("none");
  const [discountValue, setDiscountValue] = useState("0");
  const [termsConditions, setTermsConditions] = useState(DEFAULT_TERMS);
  const [garmentsAddress, setGarmentsAddress] = useState("");
  const [advisingBankName, setAdvisingBankName] = useState("");
  const [advisingBankBranch, setAdvisingBankBranch] = useState("");
  const [advisingBankAddress, setAdvisingBankAddress] = useState("");
  const [advisingBankSwift, setAdvisingBankSwift] = useState("");
  const [totalWeightKg, setTotalWeightKg] = useState("");
  const [hsCode, setHsCode] = useState("3923.21.00");
  const [binNo, setBinNo] = useState("000131803-1201");

  const [selectedBookings, setSelectedBookings] = useState<Record<string, boolean>>({});
  const [bookingPrice, setBookingPrice] = useState<Record<string, string>>({});
  const [bookingBasis, setBookingBasis] = useState<Record<string, "pcs" | "dzn">>({});

  const [manualLines, setManualLines] = useState<ManualLine[]>([
    { description: "", measurement: "", qtyPcs: "", priceUnit: "", priceBasis: "pcs" },
  ]);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const selectedCustomer = customers.find((c) => c.id === customerId);

  const customerBookings = useMemo(() => {
    return bookings
      .filter((b) => b.customer_id === customerId)
      .filter((b) => !garmentsFilter || b.garments_name === garmentsFilter)
      .filter((b) => !buyerFilter || b.buyer_id === buyerFilter)
      .filter((b) => !styleFilter || b.style === styleFilter);
  }, [bookings, customerId, garmentsFilter, buyerFilter, styleFilter]);

  const availableGarments = useMemo(
    () => Array.from(new Set(bookings.filter((b) => b.customer_id === customerId).map((b) => b.garments_name).filter(Boolean))) as string[],
    [bookings, customerId]
  );
  const availableBuyers = useMemo(
    () => buyersMaster.filter((b) => b.customer_id === customerId),
    [buyersMaster, customerId]
  );
  const availableStyles = useMemo(
    () => Array.from(new Set(bookings.filter((b) => b.customer_id === customerId).map((b) => b.style).filter(Boolean))) as string[],
    [bookings, customerId]
  );

  function getBuyerRule(b: Booking): BuyerMaster | undefined {
    return buyersMaster.find((bm) => bm.id === b.buyer_id);
  }

  function getSuggestedPrice(b: Booking): number {
    const rule = getBuyerRule(b);
    if (!rule || rule.pricing_rule === "manual") return 0;
    if (rule.pricing_rule === "percentage") {
      const lastPrice = lastUnitPriceByBooking[b.id] ?? 0;
      if (!lastPrice) return 0;
      const bdtPrice = lastPrice * (1 + (rule.percentage_value || 0) / 100);
      const rate = parseFloat(exchangeRate) || 122;
      return currency === "USD" ? bdtPrice / rate : bdtPrice;
    }
    if (rule.pricing_rule === "rate_per_lbs") {
      return calcPiUnitPrice(b, rule.rate_per_lbs_value || 0);
    }
    if (rule.pricing_rule === "rate_per_lbs_markup") {
      const bdtPrice = calcPiUnitPriceWithMarkup(b, rule.rate_per_lbs_value || 0, rule.percentage_value || 0, rule.adhesive_rate_per_inch);
      if (!bdtPrice) return 0;
      const rate = parseFloat(exchangeRate) || 122;
      return currency === "USD" ? bdtPrice / rate : bdtPrice;
    }
    return 0;
  }

  function applySuggested(bookingId: string) {
    const b = customerBookings.find((bk) => bk.id === bookingId);
    if (!b) return;
    const suggested = getSuggestedPrice(b);
    if (suggested > 0) setBookingPrice((prev) => ({ ...prev, [bookingId]: suggested.toFixed(4) }));
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
    if (basis === "dzn") return (qtyPcs / 12) * priceUnit;
    return qtyPcs * priceUnit;
  }

  const bookingLineItems = Object.keys(selectedBookings)
    .filter((id) => selectedBookings[id])
    .map((id) => {
      const b = customerBookings.find((bk) => bk.id === id);
      if (!b) return null;
      const priceUnit = parseFloat(bookingPrice[id] || "0");
      const basis = bookingBasis[id] || "pcs";
      const amount = calcLineAmount(b.quantity_pcs, priceUnit, basis);
      return { booking: b, priceUnit, basis, amount };
    })
    .filter((li): li is { booking: Booking; priceUnit: number; basis: "pcs" | "dzn"; amount: number } => li !== null);

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
    ? (subtotal * (parseFloat(discountValue) || 0)) / 100
    : discountType === "fixed"
    ? (parseFloat(discountValue) || 0)
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
        garments_name: firstBooking?.garments_name ?? null,
        garments_address: garmentsAddress || null,
        advising_bank_name: advisingBankName || null,
        advising_bank_branch: advisingBankBranch || null,
        advising_bank_address: advisingBankAddress || null,
        advising_bank_swift: advisingBankSwift || null,
        total_weight_kg: parseFloat(totalWeightKg) || null,
        hs_code: hsCode, bin_no: binNo,
        total_amount: totalAmount,
        currency, discount_type: discountType, discount_value: parseFloat(discountValue) || 0,
        exchange_rate_to_bdt: parseFloat(exchangeRate) || 122,
        terms_conditions: termsConditions, is_manual: mode === "manual", status: "draft",
      })
      .select().single();

    if (piError || !pi) {
      setLoading(false);
      setError(piError?.message ?? "PI তৈরি ব্যর্থ হয়েছে।");
      return;
    }

    if (mode === "booking") {
      const { error: itemsError } = await supabase.from("pi_items").insert(
        bookingLineItems.map((li, i) => ({
          pi_id: pi.id, booking_id: li.booking.id, sl_no: i + 1,
          description: li.booking.style || li.booking.booking_no,
          measurement: formatMeasurement(li.booking),
          qty_pcs: li.booking.quantity_pcs, price_unit: li.priceUnit, price_basis: li.basis,
        }))
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
            onChange={(e) => { setCustomerId(e.target.value); setSelectedBookings({}); setGarmentsFilter(""); setBuyerFilter(""); setStyleFilter(""); }}
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
                {availableBuyers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
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
        {currency === "USD" && (
          <div>
            <label className="block text-sm text-gray-600 mb-1">USD → BDT Rate</label>
            <input type="number" step="0.01" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-28" />
          </div>
        )}
      </div>

      {mode === "booking" && customerId && (
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
                <th className="px-3 py-2 w-32">Price/Unit</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {customerBookings.map((b) => {
                const rule = getBuyerRule(b);
                const suggested = getSuggestedPrice(b);
                const defaults = getBuyerDefaults(b);
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
                      <select value={bookingBasis[b.id] || "pcs"} onChange={(e) => setBookingBasis((prev) => ({ ...prev, [b.id]: e.target.value as "pcs" | "dzn" }))} className="w-full rounded border px-1 py-1 text-xs">
                        <option value="pcs">Per Pc</option>
                        <option value="dzn">Per Dzn</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 items-center">
                        <input
                          type="number" step="0.0001"
                          value={bookingPrice[b.id] || ""}
                          onChange={(e) => setBookingPrice((prev) => ({ ...prev, [b.id]: e.target.value }))}
                          className="w-24 rounded border px-2 py-1 text-sm"
                          placeholder={defaults.thickness ? `${defaults.thickness}` : undefined}
                        />
                        {rule && rule.pricing_rule !== "manual" && suggested > 0 && (
                          <button type="button" onClick={() => applySuggested(b.id)} className="text-xs text-blue-600 hover:underline whitespace-nowrap" title={`Buyer Rule: ${rule.pricing_rule}`}>
                            Use {suggested.toFixed(4)}
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
                    <td className="px-3 py-2 text-right">
                      {calcLineAmount(b.quantity_pcs, parseFloat(bookingPrice[b.id] || "0"), bookingBasis[b.id] || "pcs").toFixed(2)}
                    </td>
                  </tr>
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

      <div className="rounded-lg border p-3 bg-gray-50 space-y-3">
        <p className="text-sm font-semibold text-gray-700">Garments Info (Print-এ &quot;To&quot; সেকশনে দেখাবে)</p>
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
      </div>

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