"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { amountInWords } from "@/lib/numberToWords";

export default function EditProformaForm({ pi, items }: { pi: any; items: any[] }) {
  const [piDate, setPiDate] = useState(pi.pi_date);
  const [currency, setCurrency] = useState(pi.currency);
  const [discountType, setDiscountType] = useState(pi.discount_type);
  const [discountValue, setDiscountValue] = useState(String(pi.discount_value ?? 0));
  const [status, setStatus] = useState(pi.status);
  const [termsConditions, setTermsConditions] = useState(pi.terms_conditions ?? "");
  const [lines, setLines] = useState(items.map((it) => ({
    id: it.id, description: it.description, measurement: it.measurement,
    qtyPcs: String(it.qty_pcs), priceUnit: String(it.price_unit), priceBasis: it.price_basis,
  })));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  function updateLine(i: number, field: string, value: string) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));
  }

  function calcAmount(qtyPcs: string, priceUnit: string, basis: string) {
    const q = parseFloat(qtyPcs) || 0, p = parseFloat(priceUnit) || 0;
    return basis === "dzn" ? (q / 12) * p : q * p;
  }

  const subtotal = lines.reduce((s, l) => s + calcAmount(l.qtyPcs, l.priceUnit, l.priceBasis), 0);
  const discountAmount = discountType === "percentage" ? (subtotal * parseFloat(discountValue || "0")) / 100
    : discountType === "fixed" ? parseFloat(discountValue || "0") : 0;
  const totalAmount = Math.max(subtotal - discountAmount, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    for (const l of lines) {
      await supabase.from("pi_items").update({
        description: l.description, measurement: l.measurement,
        qty_pcs: parseFloat(l.qtyPcs) || 0, price_unit: parseFloat(l.priceUnit) || 0, price_basis: l.priceBasis,
      }).eq("id", l.id);
    }

    const { error: updateError } = await supabase.from("proforma_invoices").update({
      pi_date: piDate, currency, discount_type: discountType, discount_value: parseFloat(discountValue) || 0,
      status, terms_conditions: termsConditions, total_amount: totalAmount,
    }).eq("id", pi.id);

    setLoading(false);
    if (updateError) { setError(updateError.message); return; }
    router.push(`/dashboard/lc-export/proforma/${pi.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4 max-w-5xl">
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
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2">Measurement</th>
              <th className="px-3 py-2 text-right w-24">Qty(Pcs)</th>
              <th className="px-3 py-2 w-20">Basis</th>
              <th className="px-3 py-2 w-28">Price</th>
              <th className="px-3 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.id} className="border-t">
                <td className="px-3 py-2"><input value={l.description} onChange={(e) => updateLine(i, "description", e.target.value)} className="w-full rounded border px-2 py-1 text-sm" /></td>
                <td className="px-3 py-2"><input value={l.measurement} onChange={(e) => updateLine(i, "measurement", e.target.value)} className="w-full rounded border px-2 py-1 text-sm" /></td>
                <td className="px-3 py-2"><input type="number" value={l.qtyPcs} onChange={(e) => updateLine(i, "qtyPcs", e.target.value)} className="w-full rounded border px-2 py-1 text-sm text-right" /></td>
                <td className="px-3 py-2">
                  <select value={l.priceBasis} onChange={(e) => updateLine(i, "priceBasis", e.target.value)} className="w-full rounded border px-1 py-1 text-xs">
                    <option value="pcs">Per Pc</option><option value="dzn">Per Dzn</option>
                  </select>
                </td>
                <td className="px-3 py-2"><input type="number" step="0.0001" value={l.priceUnit} onChange={(e) => updateLine(i, "priceUnit", e.target.value)} className="w-full rounded border px-2 py-1 text-sm" /></td>
                <td className="px-3 py-2 text-right">{calcAmount(l.qtyPcs, l.priceUnit, l.priceBasis).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-4 items-end">
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

      <div>
        <label className="block text-sm text-gray-600 mb-1">Terms &amp; Conditions</label>
        <textarea value={termsConditions} onChange={(e) => setTermsConditions(e.target.value)} rows={9} className="w-full rounded-lg border px-3 py-2 text-sm font-mono" />
      </div>

      <div className="rounded-lg bg-gray-50 border p-4 space-y-1 text-sm">
        <p>Total: <strong>{currency} {totalAmount.toFixed(2)}</strong></p>
        <p className="text-xs text-gray-500 italic">{amountInWords(totalAmount, currency)}</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "সেভ হচ্ছে..." : "পরিবর্তন সেভ করুন"}
      </button>
    </form>
  );
}