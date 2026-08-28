"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { amountInWords, currencySymbol } from "@/lib/numberToWords";

type Garment = { id: string; customer_id: string; name: string; address: string | null };
type AdvisingBank = { id: string; name: string; branch: string | null; address: string | null; swift: string | null };

export default function EditProformaForm({
  pi, items, garments = [], advisingBanks = [],
}: {
  pi: any; items: any[]; garments?: Garment[]; advisingBanks?: AdvisingBank[];
}) {
  const [piDate, setPiDate] = useState(pi.pi_date);
  const [currency, setCurrency] = useState(pi.currency);
  const [discountType, setDiscountType] = useState(pi.discount_type);
  const [discountValue, setDiscountValue] = useState(String(pi.discount_value ?? 0));
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
  const [totalWeightKg, setTotalWeightKg] = useState(pi.total_weight_kg ? String(pi.total_weight_kg) : "");
  const [hsCode, setHsCode] = useState(pi.hs_code ?? "3923.21.00");
  const [binNo, setBinNo] = useState(pi.bin_no ?? "000131803-1201");
  const [exchangeRate, setExchangeRate] = useState(pi.exchange_rate_to_bdt ? String(pi.exchange_rate_to_bdt) : "122");

  const [lines, setLines] = useState(items.map((it) => ({
    id: it.id, description: it.description, measurement: it.measurement,
    qtyPcs: String(it.qty_pcs), priceUnit: String(it.price_unit), priceBasis: it.price_basis,
    thickness: it.pi_thickness_mm ? String(it.pi_thickness_mm) : "",
    printCharge: it.print_charge ? String(it.print_charge) : "",
    adhesiveCharge: it.adhesive_charge ? String(it.adhesive_charge) : "",
  })));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const sym = currencySymbol(currency);

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
        pi_thickness_mm: parseFloat(l.thickness) || null,
        print_charge: parseFloat(l.printCharge) || 0,
        adhesive_charge: parseFloat(l.adhesiveCharge) || 0,
      }).eq("id", l.id);
    }

    const { error: updateError } = await supabase.from("proforma_invoices").update({
      pi_date: piDate, currency, discount_type: discountType, discount_value: parseFloat(discountValue) || 0,
      status, terms_conditions: termsConditions, total_amount: totalAmount,
      valid_till: validTill || null,
      garments_id: garmentsId || null, garments_name: garmentsName || null, garments_address: garmentsAddress || null,
      item_description: itemDescription || null,
      merchant_name: merchantName || null,
      advising_bank_id: advisingBankId || null,
      advising_bank_name: advisingBankName || null, advising_bank_branch: advisingBankBranch || null,
      advising_bank_address: advisingBankAddress || null, advising_bank_swift: advisingBankSwift || null,
      total_weight_kg: parseFloat(totalWeightKg) || null, hs_code: hsCode, bin_no: binNo,
      exchange_rate_to_bdt: parseFloat(exchangeRate) || 122,
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
        <div>
          <label className="block text-sm text-gray-600 mb-1">Valid Till</label>
          <input type="date" value={validTill} onChange={(e) => setValidTill(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2">Measurement</th>
              <th className="px-3 py-2 text-right w-24">Qty(Pcs)</th>
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
                <td className="px-3 py-2"><input type="number" step="0.1" placeholder="mm" value={l.thickness} onChange={(e) => updateLine(i, "thickness", e.target.value)} className="w-full rounded border px-1 py-1 text-xs" /></td>
                <td className="px-3 py-2"><input type="number" step="0.01" placeholder="0" value={l.printCharge} onChange={(e) => updateLine(i, "printCharge", e.target.value)} className="w-full rounded border px-1 py-1 text-xs" /></td>
                <td className="px-3 py-2"><input type="number" step="0.01" placeholder="0" value={l.adhesiveCharge} onChange={(e) => updateLine(i, "adhesiveCharge", e.target.value)} className="w-full rounded border px-1 py-1 text-xs" /></td>
                <td className="px-3 py-2">
                  <select value={l.priceBasis} onChange={(e) => updateLine(i, "priceBasis", e.target.value)} className="w-full rounded border px-1 py-1 text-xs">
                    <option value="pcs">Per Pc</option><option value="dzn">Per Dzn</option>
                  </select>
                </td>
                <td className="px-3 py-2"><input type="number" step="0.0001" value={l.priceUnit} onChange={(e) => updateLine(i, "priceUnit", e.target.value)} className="w-full rounded border px-2 py-1 text-sm" /></td>
                <td className="px-3 py-2 text-right">{sym}{calcAmount(l.qtyPcs, l.priceUnit, l.priceBasis).toFixed(2)}</td>
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
        <p>Subtotal: <strong>{sym}{subtotal.toFixed(2)}</strong></p>
        {discountType !== "none" && <p>Discount: <strong>{sym}{discountAmount.toFixed(2)}</strong></p>}
        <p className="text-base">Total: <strong>{sym}{totalAmount.toFixed(2)}</strong></p>
        <p className="text-xs text-gray-500 italic">{amountInWords(totalAmount, currency)}</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "সেভ হচ্ছে..." : "পরিবর্তন সেভ করুন"}
      </button>
    </form>
  );
}
